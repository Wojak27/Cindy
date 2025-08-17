/**
 * DuckDuckGo search tool implementation
 */

import { Tool } from '@langchain/core/tools';
import { DuckDuckGoSearch } from '@langchain/community/tools/duckduckgo_search';
import { ToolCategory } from '../ToolDefinitions';
import type { ToolSpecification } from '../ToolDefinitions';
import { toolRegistry } from '../ToolRegistry';

/**
 * DuckDuckGo search tool with retry logic
 */
export class DuckDuckGoSearchTool extends Tool {
    name = 'web_search';
    description = 'Search the web for information. This is the default web search tool triggered by a #web hashtag';
    private baseSearch: DuckDuckGoSearch;
    private maxRetries: number;
    private retryDelay: number;

    constructor(maxRetries: number = 3, retryDelay: number = 2000) {
        super();
        this.baseSearch = new DuckDuckGoSearch({ maxResults: 10 });
        this.maxRetries = maxRetries;
        this.retryDelay = retryDelay;
    }

    async _call(input: string): Promise<string> {
        console.log(`[DuckDuckGoSearchTool] Searching for: "${input}"`);
        
        let lastError: Error | null = null;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                // Call the base DuckDuckGoSearch
                const results = await this.baseSearch._call(input);
                
                if (results && results.length > 0) {
                    console.log(`[DuckDuckGoSearchTool] Search successful on attempt ${attempt}`);
                    return results;
                }
                
                // If no results, return a message
                return `No results found for "${input}"`;
                
            } catch (error: any) {
                lastError = error;
                console.warn(`[DuckDuckGoSearchTool] Attempt ${attempt} failed:`, error?.message);
                
                // Check for specific error types
                if (error?.message?.includes('Rate limit') || error?.message?.includes('too quickly')) {
                    // Rate limit error - wait longer before retry
                    if (attempt < this.maxRetries) {
                        const waitTime = this.retryDelay * attempt;
                        console.log(`[DuckDuckGoSearchTool] Rate limited, waiting ${waitTime}ms before retry...`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                        continue;
                    }
                } else if (error?.message?.includes('vqd')) {
                    // VQD token error - retry with delay
                    if (attempt < this.maxRetries) {
                        console.log(`[DuckDuckGoSearchTool] VQD token error, waiting ${this.retryDelay}ms before retry...`);
                        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                        continue;
                    }
                }
                
                // For other errors, fail immediately if it's not retryable
                if (!this.isRetryableError(error)) {
                    throw error;
                }
                
                // Wait before retry for retryable errors
                if (attempt < this.maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                }
            }
        }
        
        // All retries exhausted
        const errorMessage = lastError?.message || 'Unknown error';
        console.error(`[DuckDuckGoSearchTool] All retries exhausted. Last error:`, errorMessage);
        throw lastError || new Error('Unexpected error in retry logic');
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
 * Create and register the DuckDuckGo search tool
 */
export function createDuckDuckGoSearchTool(): ToolSpecification {
    const tool = new DuckDuckGoSearchTool();
    
    const specification: ToolSpecification = {
        name: 'web_search',
        description: tool.description,
        parameters: {
            type: 'object',
            properties: {
                input: { 
                    type: 'string', 
                    description: 'Search query' 
                }
            },
            required: ['input']
        },
        tool,
        metadata: {
            category: ToolCategory.SEARCH,
            version: '1.0.0',
            requiresAuth: false,
            tags: ['web', 'search', 'free', 'default'],
            rateLimit: {
                requestsPerMinute: 20
            }
        }
    };
    
    return specification;
}

// Auto-register when imported
const duckDuckGoSpec = createDuckDuckGoSearchTool();
toolRegistry.registerTool(duckDuckGoSpec);

export default DuckDuckGoSearchTool;