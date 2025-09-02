/**
 * DuckDuckGo search tool implementation following official LangChain documentation
 * https://js.langchain.com/docs/integrations/tools/duckduckgo_search/
 */

import { DuckDuckGoSearch } from '@langchain/community/tools/duckduckgo_search';
import { ToolCategory } from '../ToolDefinitions';
import type { ToolSpecification } from '../ToolDefinitions';
import { toolRegistry } from '../ToolRegistry';

/**
 * Enhanced DuckDuckGo search tool wrapper with error handling
 * Uses the official LangChain DuckDuckGoSearch tool with additional retry logic for VQD errors
 */
export class DuckDuckGoSearchTool {
    public name = 'web_search';
    public description = 'Search the web for information using DuckDuckGo. Privacy-focused search with no tracking.';
    private tool: DuckDuckGoSearch;
    private maxRetries: number;
    private retryDelay: number;

    constructor(options: {
        maxResults?: number;
        maxRetries?: number;
        retryDelay?: number;
    } = {}) {
        // Initialize per official LangChain documentation
        this.tool = new DuckDuckGoSearch({ 
            maxResults: options.maxResults || 10 
        });
        
        this.maxRetries = options.maxRetries || 3;
        this.retryDelay = options.retryDelay || 2000;
    }

    /**
     * Invoke the DuckDuckGo search with enhanced error handling
     * Following the official LangChain pattern
     */
    async invoke(input: string): Promise<string> {
        console.log(`[DuckDuckGoSearchTool] Searching for: "${input}"`);
        
        let lastError: Error | null = null;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                // Use the official LangChain invoke method
                const results = await this.tool.invoke(input);
                
                if (results && results.length > 0) {
                    console.log(`[DuckDuckGoSearchTool] Search successful on attempt ${attempt}`);
                    return results;
                }
                
                // If no results, return a message instead of throwing
                const noResultsMessage = `No search results found for "${input}". This may be due to DuckDuckGo's current availability or the search terms used.`;
                console.log(`[DuckDuckGoSearchTool] ${noResultsMessage}`);
                return noResultsMessage;
                
            } catch (error: any) {
                lastError = error;
                console.warn(`[DuckDuckGoSearchTool] Attempt ${attempt} failed:`, error?.message);
                
                // Handle VQD token errors specifically
                if (error?.message?.includes('VQD') || error?.message?.includes('vqd')) {
                    if (attempt < this.maxRetries) {
                        const waitTime = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
                        console.log(`[DuckDuckGoSearchTool] VQD token error, waiting ${waitTime}ms before retry ${attempt + 1}...`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                        continue;
                    }
                }
                
                // Handle rate limiting
                if (error?.message?.includes('Rate limit') || error?.message?.includes('too quickly')) {
                    if (attempt < this.maxRetries) {
                        const waitTime = this.retryDelay * attempt * 2; // Longer wait for rate limits
                        console.log(`[DuckDuckGoSearchTool] Rate limited, waiting ${waitTime}ms before retry ${attempt + 1}...`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                        continue;
                    }
                }
                
                // For other retryable errors
                if (this.isRetryableError(error) && attempt < this.maxRetries) {
                    const waitTime = this.retryDelay * attempt;
                    console.log(`[DuckDuckGoSearchTool] Retryable error, waiting ${waitTime}ms before retry ${attempt + 1}...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    continue;
                }
                
                // If not retryable or max retries exceeded, break
                break;
            }
        }
        
        // All retries exhausted - return a helpful message instead of throwing
        const errorMessage = lastError?.message || 'Unknown error';
        console.error(`[DuckDuckGoSearchTool] All ${this.maxRetries} attempts failed. Last error:`, errorMessage);
        
        return `DuckDuckGo search is currently unavailable due to technical issues (${errorMessage.includes('VQD') ? 'VQD token problem' : 'connection error'}). This is a known issue with DuckDuckGo's anti-bot protection. Please try again later or use alternative search methods.`;
    }

    /**
     * Legacy _call method for compatibility with Tool interface
     */
    async _call(input: string): Promise<string> {
        return this.invoke(input);
    }

    /**
     * Call method for direct invocation
     */
    async call(input: string): Promise<string> {
        return this.invoke(input);
    }

    private isRetryableError(error: any): boolean {
        if (!error) return false;
        
        const message = error.message || '';
        
        // List of retryable error patterns
        const retryablePatterns = [
            'rate limit',
            'too quickly',
            'vqd',
            'timeout',
            'ECONNRESET',
            'ETIMEDOUT',
            'network',
            'fetch failed'
        ];
        
        return retryablePatterns.some(pattern => 
            message.toLowerCase().includes(pattern.toLowerCase())
        );
    }
}

/**
 * Create and register the DuckDuckGo search tool following official LangChain patterns
 */
export function createDuckDuckGoSearchTool(options: {
    maxResults?: number;
    maxRetries?: number;
    retryDelay?: number;
} = {}): ToolSpecification {
    const tool = new DuckDuckGoSearchTool({
        maxResults: options.maxResults || 10,
        maxRetries: options.maxRetries || 3,
        retryDelay: options.retryDelay || 2000
    });
    
    const specification: ToolSpecification = {
        name: 'web_search',
        description: tool.description,
        parameters: {
            type: 'object',
            properties: {
                input: { 
                    type: 'string', 
                    description: 'Search query for web search' 
                }
            },
            required: ['input']
        },
        tool: {
            // Wrap to match Tool interface
            name: tool.name,
            description: tool.description,
            invoke: (input: string) => tool.invoke(input),
            _call: (input: string) => tool._call(input),
            call: (input: string) => tool.call(input)
        } as any,
        metadata: {
            category: ToolCategory.SEARCH,
            version: '2.0.0', // Updated version for official LangChain implementation
            requiresAuth: false,
            tags: ['web', 'search', 'privacy', 'duckduckgo', 'default', 'vqd-enhanced'],
            rateLimit: {
                requestsPerMinute: 15 // Reduced due to VQD issues
            }
        }
    };
    
    return specification;
}

// Auto-register when imported
const duckDuckGoSpec = createDuckDuckGoSearchTool();
toolRegistry.registerTool(duckDuckGoSpec);

export default DuckDuckGoSearchTool;