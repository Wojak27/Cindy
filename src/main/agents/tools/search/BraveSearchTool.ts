/**
 * Brave Search API tool implementation
 */

import { Tool } from '@langchain/core/tools';
import { ToolCategory } from '../ToolDefinitions';
import type { ToolSpecification } from '../ToolDefinitions';

/**
 * Brave Search API tool for web searching
 */
export class BraveSearchTool extends Tool {
    name = 'brave_search';
    description = 'Search the web using Brave Search API';
    private apiKey: string;
    private baseUrl: string = 'https://api.search.brave.com/res/v1/web/search';
    private maxResults: number = 5;

    constructor(apiKey?: string) {
        super();
        this.apiKey = apiKey || '';
        console.log('[BraveSearchTool] Constructor called with API key:', {
            provided: !!apiKey,
            length: apiKey ? apiKey.length : 0,
            stored: !!this.apiKey,
            storedLength: this.apiKey.length
        });
    }

    private validateQuery(query: string): { valid: boolean; error?: string } {
        if (!query || typeof query !== 'string') {
            return { valid: false, error: 'Query must be a non-empty string' };
        }

        const trimmedQuery = query.trim();
        
        if (trimmedQuery.length === 0) {
            return { valid: false, error: 'Query cannot be empty or just whitespace' };
        }

        if (trimmedQuery.length > 2000) {
            return { valid: false, error: 'Query is too long (maximum 2000 characters)' };
        }

        // Check for any control characters that might cause issues
        if (/[\x00-\x1F\x7F]/.test(trimmedQuery)) {
            return { valid: false, error: 'Query contains invalid control characters' };
        }

        return { valid: true };
    }

    private buildRequestURL(query: string): string {
        const params = new URLSearchParams({
            q: query,
            count: this.maxResults.toString()
        });
        return `${this.baseUrl}?${params.toString()}`;
    }

    private buildHeaders(): Record<string, string> {
        return {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': this.apiKey
        };
    }

    private async parseErrorResponse(response: Response): Promise<string> {
        try {
            const errorData = await response.json();
            if (errorData.message) {
                return errorData.message;
            }
            if (errorData.error) {
                if (typeof errorData.error === 'string') {
                    return errorData.error;
                }
                if (errorData.error.message) {
                    return errorData.error.message;
                }
            }
            if (errorData.detail) {
                if (Array.isArray(errorData.detail)) {
                    return errorData.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
                }
                return errorData.detail;
            }
            return JSON.stringify(errorData);
        } catch (e) {
            try {
                const textError = await response.text();
                return textError || response.statusText;
            } catch {
                return response.statusText || 'Unknown error';
            }
        }
    }

    async _call(input: string): Promise<string> {
        try {
            console.log('[BraveSearchTool] Starting search with input:', {
                inputType: typeof input,
                inputLength: input?.length,
                inputPreview: input?.substring(0, 50)
            });

            // Check if API key is required (Brave Search API always requires it)
            if (!this.apiKey || this.apiKey.trim().length === 0) {
                const errorMessage = 'Brave Search API requires an API key. Please configure your Brave API key in settings to use this search provider.';
                console.error(`[BraveSearch] ${errorMessage}`);
                return errorMessage;
            }

            // Validate the query
            const validation = this.validateQuery(input);
            if (!validation.valid) {
                console.warn(`[BraveSearch] Query validation failed: ${validation.error}`);
                return `Search query error: ${validation.error}`;
            }

            const sanitizedQuery = input.trim();
            const url = this.buildRequestURL(sanitizedQuery);
            const headers = this.buildHeaders();

            console.log(`[BraveSearch] Request URL: ${url}`);
            console.log(`[BraveSearch] Request headers:`, headers);

            const response = await fetch(url, {
                method: 'GET',
                headers
            });

            console.log(`[BraveSearch] Response status: ${response.status} ${response.statusText}`);

            // Handle different HTTP status codes
            if (!response.ok) {
                let errorMessage: string;

                if (response.status === 422) {
                    const detailedError = await this.parseErrorResponse(response);
                    errorMessage = `Brave Search API validation error (422): ${detailedError}`;
                    console.error(`[BraveSearch] 422 Error Details:`, detailedError);

                    // Log additional debugging info for 422 errors
                    console.error(`[BraveSearch] Request details for debugging:`);
                    console.error(`  - Query: "${sanitizedQuery}"`);
                    console.error(`  - Query length: ${sanitizedQuery.length}`);
                    console.error(`  - Headers:`, JSON.stringify(headers, null, 2));
                    console.error(`  - URL:`, url);

                } else if (response.status === 401) {
                    errorMessage = `Brave Search API authentication failed (401). Check your API key.`;
                } else if (response.status === 403) {
                    errorMessage = `Brave Search API access forbidden (403). Check API key permissions or usage limits.`;
                } else if (response.status === 429) {
                    errorMessage = `Brave Search API rate limit exceeded (429). Please try again later.`;
                } else if (response.status >= 500) {
                    errorMessage = `Brave Search API server error (${response.status}). Service may be temporarily unavailable.`;
                } else {
                    const detailedError = await this.parseErrorResponse(response);
                    errorMessage = `Brave Search API returned ${response.status}: ${detailedError}`;
                }

                throw new Error(errorMessage);
            }

            const data = await response.json();
            console.log(`[BraveSearch] Response structure:`, Object.keys(data));

            // Handle empty or invalid response structure
            if (!data) {
                throw new Error('Brave Search API returned empty response');
            }

            if (data.web && data.web.results && data.web.results.length > 0) {
                const results = data.web.results.slice(0, this.maxResults).map((result: any) => ({
                    title: result.title || 'No title',
                    url: result.url || 'No URL',
                    description: result.description || 'No description available'
                }));

                const formattedResults = results.map((result: any, index: number) =>
                    `${index + 1}. **${result.title}**\n   ${result.description}\n   URL: ${result.url}`
                ).join('\n\n');

                console.log(`[BraveSearch] Successfully found ${results.length} results`);
                return `Search results for "${sanitizedQuery}":\n\n${formattedResults}`;
            } else {
                // Check for other result types or suggestions
                let alternativeResults = '';

                if (data.query && data.query.spellcheck_off) {
                    alternativeResults += `\nNote: Spellcheck suggestions available.`;
                }

                if (data.mixed && data.mixed.main && data.mixed.main.length > 0) {
                    alternativeResults += `\nFound ${data.mixed.main.length} mixed results.`;
                }

                const message = `No web search results found for "${sanitizedQuery}" using Brave Search.${alternativeResults}`;
                console.log(`[BraveSearch] ${message}`);
                return message;
            }
        } catch (error: any) {
            console.error('[BraveSearch] Search error:', error);
            
            // Provide user-friendly error messages
            if (error.message.includes('fetch')) {
                return `Network error: Unable to connect to Brave Search API. Please check your internet connection.`;
            }
            
            return `Search failed: ${error.message}`;
        }
    }

    /**
     * Update API key
     */
    updateApiKey(apiKey: string): void {
        this.apiKey = apiKey;
        console.log('[BraveSearchTool] API key updated');
    }

    /**
     * Set maximum results
     */
    setMaxResults(maxResults: number): void {
        this.maxResults = Math.max(1, Math.min(20, maxResults));
        console.log(`[BraveSearchTool] Max results set to ${this.maxResults}`);
    }
}

/**
 * Create and register the Brave search tool
 */
export function createBraveSearchTool(apiKey?: string): ToolSpecification {
    const tool = new BraveSearchTool(apiKey);
    
    const specification: ToolSpecification = {
        name: 'brave_search',
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
            requiresAuth: true,
            tags: ['web', 'search', 'brave', 'api'],
            rateLimit: {
                requestsPerMinute: 60,
                requestsPerDay: 2000
            }
        },
        config: {
            apiKey
        }
    };
    
    return specification;
}

export default BraveSearchTool;