/**
 * Wikipedia search tool implementation
 */

import { Tool } from '@langchain/core/tools';
import { ToolCategory } from '../ToolDefinitions';
import type { ToolSpecification } from '../ToolDefinitions';
import { toolRegistry } from '../ToolRegistry';

// Dynamic import to handle optional dependency
let WikipediaQueryRun: any = null;

try {
    const { WikipediaQueryRun: WikiSearch } = require('@langchain/community/tools/wikipedia_query_run');
    WikipediaQueryRun = WikiSearch;
} catch (e) {
    console.log('[WikipediaSearchTool] Wikipedia search not available - @langchain/community not installed');
}

/**
 * Wikipedia search tool wrapper
 */
export class WikipediaSearchTool extends Tool {
    name = 'wikipedia_search';
    description = 'Search Wikipedia for information. Free tool, no API key required.';
    private wikipediaSearch: any;
    private maxResults: number;
    private maxContentLength: number;

    constructor(options: {
        maxResults?: number;
        maxContentLength?: number;
    } = {}) {
        super();
        this.maxResults = options.maxResults || 3;
        this.maxContentLength = options.maxContentLength || 4000;
        
        if (WikipediaQueryRun) {
            this.wikipediaSearch = new WikipediaQueryRun({
                topKResults: this.maxResults,
                maxDocContentLength: this.maxContentLength,
            });
        }
    }

    async _call(input: string): Promise<string> {
        if (!WikipediaQueryRun || !this.wikipediaSearch) {
            return 'Wikipedia search is not available. Please install @langchain/community to use this feature.';
        }

        try {
            console.log(`[WikipediaSearchTool] Searching Wikipedia for: "${input}"`);
            
            if (!input || input.trim().length === 0) {
                return 'Please provide a search query for Wikipedia.';
            }

            const sanitizedQuery = input.trim();
            
            // Use the underlying Wikipedia tool
            const result = await this.wikipediaSearch._call(sanitizedQuery);
            
            if (!result || result.length === 0) {
                return `No Wikipedia articles found for "${sanitizedQuery}". Try using different keywords or checking the spelling.`;
            }

            console.log(`[WikipediaSearchTool] Successfully retrieved Wikipedia information`);
            return result;
            
        } catch (error: any) {
            console.error('[WikipediaSearchTool] Search error:', error);
            
            // Handle common Wikipedia API errors
            if (error.message.includes('disambiguation')) {
                return `The search term "${input}" is ambiguous. Please be more specific in your search query.`;
            }
            
            if (error.message.includes('not found') || error.message.includes('404')) {
                return `No Wikipedia article found for "${input}". Please try a different search term.`;
            }
            
            if (error.message.includes('rate limit') || error.message.includes('too many requests')) {
                return `Wikipedia search is temporarily rate limited. Please try again in a moment.`;
            }
            
            return `Wikipedia search failed: ${error.message}`;
        }
    }

    /**
     * Check if Wikipedia search is available
     */
    static isAvailable(): boolean {
        return WikipediaQueryRun !== null;
    }

    /**
     * Update search configuration
     */
    updateConfig(options: {
        maxResults?: number;
        maxContentLength?: number;
    }): void {
        if (options.maxResults !== undefined) {
            this.maxResults = Math.max(1, Math.min(10, options.maxResults));
        }
        
        if (options.maxContentLength !== undefined) {
            this.maxContentLength = Math.max(500, Math.min(10000, options.maxContentLength));
        }
        
        // Recreate the underlying Wikipedia tool with new settings
        if (WikipediaQueryRun) {
            this.wikipediaSearch = new WikipediaQueryRun({
                topKResults: this.maxResults,
                maxDocContentLength: this.maxContentLength,
            });
        }
        
        console.log(`[WikipediaSearchTool] Updated config: maxResults=${this.maxResults}, maxContentLength=${this.maxContentLength}`);
    }
}

/**
 * Create and register the Wikipedia search tool
 */
export function createWikipediaSearchTool(options?: {
    maxResults?: number;
    maxContentLength?: number;
}): ToolSpecification | null {
    if (!WikipediaSearchTool.isAvailable()) {
        console.log('[WikipediaSearchTool] Cannot create tool - Wikipedia search not available');
        return null;
    }

    const tool = new WikipediaSearchTool(options);
    
    const specification: ToolSpecification = {
        name: 'wikipedia_search',
        description: tool.description,
        parameters: {
            type: 'object',
            properties: {
                input: { 
                    type: 'string', 
                    description: 'Wikipedia search query' 
                }
            },
            required: ['input']
        },
        tool,
        metadata: {
            category: ToolCategory.SEARCH,
            version: '1.0.0',
            requiresAuth: false,
            tags: ['wikipedia', 'encyclopedia', 'free', 'knowledge'],
            rateLimit: {
                requestsPerMinute: 60  // Wikipedia is generally permissive
            }
        }
    };
    
    return specification;
}

// Auto-register when imported (if available)
if (WikipediaSearchTool.isAvailable()) {
    const wikipediaSpec = createWikipediaSearchTool();
    if (wikipediaSpec) {
        toolRegistry.registerTool(wikipediaSpec);
        console.log('[WikipediaSearchTool] Auto-registered with ToolRegistry');
    }
} else {
    console.log('[WikipediaSearchTool] Not registering - Wikipedia search unavailable');
}

export default WikipediaSearchTool;