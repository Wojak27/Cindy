/**
 * SerpAPI search tool implementation
 */

import { Tool } from '@langchain/core/tools';
import { ToolCategory } from '../ToolDefinitions';
import type { ToolSpecification } from '../ToolDefinitions';
import { toolRegistry } from '../ToolRegistry';

// Dynamic import to handle optional dependency
let SerpAPI: any = null;

try {
    const { SerpAPI: SerpAPISearch } = require('@langchain/community/tools/serpapi');
    SerpAPI = SerpAPISearch;
} catch (e) {
    console.log('[SerpAPISearchTool] SerpAPI not available - @langchain/community not installed');
}

/**
 * SerpAPI search tool wrapper
 */
export class SerpAPISearchTool extends Tool {
    name = 'serp_search';
    description = 'Advanced web search using SerpAPI (Google results). Provides high-quality search results with rich metadata.';
    private serpApiTool: any;
    private apiKey: string;

    constructor(apiKey?: string) {
        super();
        this.apiKey = apiKey || '';
        
        if (SerpAPI && this.apiKey) {
            // SerpAPI expects the API key in environment variable
            process.env.SERPAPI_API_KEY = this.apiKey;
            this.serpApiTool = new SerpAPI();
        }
    }

    async _call(input: string): Promise<string> {
        if (!SerpAPI) {
            return 'SerpAPI search is not available. Please install @langchain/community to use this feature.';
        }

        if (!this.apiKey || this.apiKey.trim().length === 0) {
            return 'SerpAPI requires an API key. Please configure your SerpAPI key in settings to use this search provider.';
        }

        if (!this.serpApiTool) {
            // Try to initialize the tool if not already done
            process.env.SERPAPI_API_KEY = this.apiKey;
            this.serpApiTool = new SerpAPI();
        }

        try {
            console.log(`[SerpAPISearchTool] Searching with SerpAPI for: "${input}"`);
            
            if (!input || input.trim().length === 0) {
                return 'Please provide a search query for SerpAPI.';
            }

            const sanitizedQuery = input.trim();
            
            // Use the underlying SerpAPI tool
            const result = await this.serpApiTool._call(sanitizedQuery);
            
            if (!result || result.length === 0) {
                return `No search results found for "${sanitizedQuery}" using SerpAPI.`;
            }

            console.log(`[SerpAPISearchTool] Successfully retrieved SerpAPI results`);
            return result;
            
        } catch (error: any) {
            console.error('[SerpAPISearchTool] Search error:', error);
            
            // Handle common SerpAPI errors
            if (error.message.includes('API key')) {
                return `SerpAPI authentication failed. Please check your API key configuration.`;
            }
            
            if (error.message.includes('credits') || error.message.includes('quota')) {
                return `SerpAPI quota exceeded. Please check your account limits or upgrade your plan.`;
            }
            
            if (error.message.includes('rate limit') || error.message.includes('429')) {
                return `SerpAPI rate limit exceeded. Please try again in a moment.`;
            }
            
            if (error.message.includes('400')) {
                return `Invalid search query for SerpAPI: "${input}". Please try a different search term.`;
            }
            
            return `SerpAPI search failed: ${error.message}`;
        }
    }

    /**
     * Check if SerpAPI is available
     */
    static isAvailable(): boolean {
        return SerpAPI !== null;
    }

    /**
     * Update API key
     */
    updateApiKey(apiKey: string): void {
        this.apiKey = apiKey;
        
        if (SerpAPI && this.apiKey) {
            process.env.SERPAPI_API_KEY = this.apiKey;
            this.serpApiTool = new SerpAPI();
            console.log('[SerpAPISearchTool] API key updated and tool reinitialized');
        }
    }

    /**
     * Check if the tool is properly configured
     */
    isConfigured(): boolean {
        return !!(this.apiKey && this.apiKey.trim().length > 0 && SerpAPI);
    }
}

/**
 * Create and register the SerpAPI search tool
 */
export function createSerpAPISearchTool(apiKey?: string): ToolSpecification | null {
    if (!SerpAPISearchTool.isAvailable()) {
        console.log('[SerpAPISearchTool] Cannot create tool - SerpAPI not available');
        return null;
    }

    const tool = new SerpAPISearchTool(apiKey);
    
    const specification: ToolSpecification = {
        name: 'serp_search',
        description: tool.description,
        parameters: {
            type: 'object',
            properties: {
                input: { 
                    type: 'string', 
                    description: 'Search query for SerpAPI' 
                }
            },
            required: ['input']
        },
        tool,
        metadata: {
            category: ToolCategory.SEARCH,
            version: '1.0.0',
            requiresAuth: true,
            tags: ['google', 'search', 'premium', 'api', 'serp'],
            rateLimit: {
                requestsPerMinute: 60,
                requestsPerDay: 5000  // Typical SerpAPI free tier limit
            }
        },
        config: {
            apiKey
        }
    };
    
    return specification;
}

// Conditional auto-registration when imported (only if API key is available)
const serpApiKey = process.env.SERP_API_KEY || process.env.SERPAPI_API_KEY;
if (SerpAPISearchTool.isAvailable() && serpApiKey) {
    const serpApiSpec = createSerpAPISearchTool(serpApiKey);
    if (serpApiSpec) {
        toolRegistry.registerTool(serpApiSpec);
        console.log('[SerpAPISearchTool] Auto-registered with ToolRegistry (API key found)');
    }
} else if (SerpAPISearchTool.isAvailable()) {
    console.log('[SerpAPISearchTool] Available but not auto-registering (no API key found)');
} else {
    console.log('[SerpAPISearchTool] Not registering - SerpAPI unavailable');
}

export default SerpAPISearchTool;