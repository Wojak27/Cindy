/**
 * Tavily AI search tool implementation
 */

import { Tool } from '@langchain/core/tools';
import { ToolCategory } from '../ToolDefinitions';
import type { ToolSpecification } from '../ToolDefinitions';
import { toolRegistry } from '../ToolRegistry';
import { logger } from '../../../utils/ColorLogger';

// Dynamic import to handle optional dependency
let TavilySearchResults: any = null;

try {
    const { TavilySearchResults: TavilySearch } = require('@langchain/community/tools/tavily_search');
    TavilySearchResults = TavilySearch;
} catch (e) {
    console.log('[TavilySearchTool] Tavily search not available - @langchain/community not installed');
}

/**
 * Tavily AI search tool wrapper
 */
export class TavilySearchTool extends Tool {
    name = 'tavily_search';
    description = 'High-quality web search using Tavily AI Search API (best for research). Provides comprehensive and accurate search results.';
    private tavilySearch: any;
    private apiKey: string;
    private maxResults: number;

    constructor(options: {
        apiKey?: string;
        maxResults?: number;
    } = {}) {
        super();
        this.apiKey = options.apiKey || '';
        this.maxResults = options.maxResults || 5;

        if (TavilySearchResults && this.apiKey) {
            this.tavilySearch = new TavilySearchResults({
                maxResults: this.maxResults,
                apiKey: this.apiKey
            });
        }
    }

    async _call(input: string): Promise<string> {
        if (!TavilySearchResults) {
            return 'Tavily search is not available. Please install @langchain/community to use this feature.';
        }

        if (!this.apiKey || this.apiKey.trim().length === 0) {
            return 'Tavily search requires an API key. Please configure your Tavily API key in settings to use this search provider.';
        }

        if (!this.tavilySearch) {
            // Try to initialize the tool if not already done
            this.tavilySearch = new TavilySearchResults({
                maxResults: this.maxResults,
                apiKey: this.apiKey
            });
        }

        try {
            // console.log(`[TavilySearchTool] Searching with Tavily for: "${input}"`);
            logger.info('TavilySearchTool', `Searching with Tavily for: "${input}"`);

            if (!input || input.trim().length === 0) {
                return 'Please provide a search query for Tavily.';
            }

            // Validate query length
            const sanitizedQuery = input.trim();
            if (sanitizedQuery.length > 1000) {
                return 'Search query is too long. Please use a shorter search term (maximum 1000 characters).';
            }

            // Use the underlying Tavily tool
            const result = await this.tavilySearch._call(sanitizedQuery);

            if (!result || result.length === 0) {
                return `No search results found for "${sanitizedQuery}" using Tavily AI Search.`;
            }

            console.log(`[TavilySearchTool] Successfully retrieved Tavily results`);
            return result;

        } catch (error: any) {
            console.error('[TavilySearchTool] Search error:', error);

            // Handle common Tavily API errors
            if (error.message.includes('API key') || error.message.includes('401')) {
                return `Tavily API authentication failed. Please check your API key configuration.`;
            }

            if (error.message.includes('credits') || error.message.includes('quota') || error.message.includes('limit')) {
                return `Tavily API quota exceeded. Please check your account limits or upgrade your plan.`;
            }

            if (error.message.includes('rate limit') || error.message.includes('429')) {
                return `Tavily API rate limit exceeded. Please try again in a moment.`;
            }

            if (error.message.includes('400')) {
                return `Invalid search query for Tavily: "${input}". Please try a different search term.`;
            }

            if (error.message.includes('timeout') || error.message.includes('network')) {
                return `Network error with Tavily API. Please check your internet connection and try again.`;
            }

            return `Tavily search failed: ${error.message}`;
        }
    }

    /**
     * Check if Tavily search is available
     */
    static isAvailable(): boolean {
        return TavilySearchResults !== null;
    }

    /**
     * Update API key and configuration
     */
    updateConfig(options: {
        apiKey?: string;
        maxResults?: number;
    }): void {
        if (options.apiKey !== undefined) {
            this.apiKey = options.apiKey;
        }

        if (options.maxResults !== undefined) {
            this.maxResults = Math.max(1, Math.min(20, options.maxResults));
        }

        // Recreate the Tavily tool with new settings
        if (TavilySearchResults && this.apiKey) {
            this.tavilySearch = new TavilySearchResults({
                maxResults: this.maxResults,
                apiKey: this.apiKey
            });
            console.log(`[TavilySearchTool] Updated config: maxResults=${this.maxResults}, API key updated`);
        }
    }

    /**
     * Update API key
     */
    updateApiKey(apiKey: string): void {
        this.updateConfig({ apiKey });
    }

    /**
     * Set maximum results
     */
    setMaxResults(maxResults: number): void {
        this.updateConfig({ maxResults });
    }

    /**
     * Check if the tool is properly configured
     */
    isConfigured(): boolean {
        return !!(this.apiKey && this.apiKey.trim().length > 0 && TavilySearchResults);
    }
}

/**
 * Create and register the Tavily search tool
 */
export function createTavilySearchTool(options?: {
    apiKey?: string;
    maxResults?: number;
}): ToolSpecification | null {
    if (!TavilySearchTool.isAvailable()) {
        console.log('[TavilySearchTool] Cannot create tool - Tavily search not available');
        return null;
    }

    const tool = new TavilySearchTool(options);

    const specification: ToolSpecification = {
        name: 'tavily_search',
        description: tool.description,
        parameters: {
            type: 'object',
            properties: {
                input: {
                    type: 'string',
                    description: 'Search query for Tavily'
                }
            },
            required: ['input']
        },
        tool,
        metadata: {
            category: ToolCategory.SEARCH,
            version: '1.0.0',
            requiresAuth: true,
            tags: ['tavily', 'ai', 'research', 'premium', 'high-quality'],
            rateLimit: {
                requestsPerMinute: 100,
                requestsPerDay: 1000  // Typical Tavily free tier limit
            }
        },
        config: {
            apiKey: options?.apiKey,
            maxResults: options?.maxResults
        }
    };

    return specification;
}

// Conditional auto-registration when imported (only if API key is available)
const tavilyApiKey = process.env.TAVILY_API_KEY;
if (TavilySearchTool.isAvailable() && tavilyApiKey) {
    const tavilySpec = createTavilySearchTool({ apiKey: tavilyApiKey });
    if (tavilySpec) {
        toolRegistry.registerTool(tavilySpec);
        console.log('[TavilySearchTool] Auto-registered with ToolRegistry (API key found)');
    }
} else if (TavilySearchTool.isAvailable()) {
    console.log('[TavilySearchTool] Available but not auto-registering (no API key found)');
} else {
    console.log('[TavilySearchTool] Not registering - Tavily search unavailable');
}

export default TavilySearchTool;