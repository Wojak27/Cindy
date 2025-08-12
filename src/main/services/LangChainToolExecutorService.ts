import { EventEmitter } from 'events';
import { Tool } from '@langchain/core/tools';
import { DuckDuckGoSearch } from '@langchain/community/tools/duckduckgo_search';

// Try to import web search tools if available (with dependencies)

let WikipediaQueryRun: any = null;
let SerpAPI: any = null;
let TavilySearchResults: any = null;


try {
    const { WikipediaQueryRun: WikiSearch } = require('@langchain/community/tools/wikipedia_query_run');
    WikipediaQueryRun = WikiSearch;
} catch (e) {
    console.log('[LangChainToolExecutorService] Wikipedia search not available');
}

try {
    const { SerpAPI: SerpAPISearch } = require('@langchain/community/tools/serpapi');
    SerpAPI = SerpAPISearch;
} catch (e) {
    console.log('[LangChainToolExecutorService] SerpAPI not available');
}

try {
    const { TavilySearchResults: TavilySearch } = require('@langchain/community/tools/tavily_search');
    TavilySearchResults = TavilySearch;
} catch (e) {
    console.log('[LangChainToolExecutorService] Tavily search not available');
}

// Custom Brave Search Tool
class BraveSearchTool extends Tool {
    name = 'brave_search';
    description = 'Search the web using Brave Search API';
    private apiKey: string;

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
        // Validate query length (minimum 2 characters)
        if (!query || query.trim().length < 2) {
            return { valid: false, error: 'Search query must be at least 2 characters long' };
        }

        // Check for excessively long queries (Brave API limit is typically 400 chars)
        if (query.length > 400) {
            return { valid: false, error: 'Search query is too long (maximum 400 characters)' };
        }

        return { valid: true };
    }

    private buildRequestURL(query: string): string {
        const baseURL = 'https://api.search.brave.com/res/v1/web/search';
        const params = new URLSearchParams({
            q: query,
            count: '5',
            search_lang: 'en',
            country: 'us',
            spellcheck: '1',
            safesearch: 'moderate'
        });

        return `${baseURL}?${params.toString()}`;
    }

    private buildHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip',
            'User-Agent': 'CindyAssistant/1.0 (Voice Assistant)',
            'Content-Type': 'application/json'
        };

        // Add API key header if available
        if (this.apiKey && this.apiKey.trim()) {
            headers['X-Subscription-Token'] = this.apiKey.trim();
        }

        return headers;
    }

    private async parseErrorResponse(response: Response): Promise<string> {
        try {
            const errorText = await response.text();
            let errorData: any;

            try {
                errorData = JSON.parse(errorText);
            } catch {
                // If it's not JSON, return the raw text
                return `API Error: ${errorText || response.statusText}`;
            }

            console.log('[BraveSearch] Full error response:', errorData);

            // Handle various error response formats
            if (errorData.error) {
                if (typeof errorData.error === 'string') {
                    return `API Error: ${errorData.error}`;
                } else if (errorData.error.message) {
                    return `API Error: ${errorData.error.message}`;
                } else {
                    return `API Error: ${JSON.stringify(errorData.error)}`;
                }
            }

            if (errorData.message) {
                return `API Error: ${errorData.message}`;
            }

            if (errorData.detail) {
                return `API Error: ${errorData.detail}`;
            }

            if (errorData.errors && Array.isArray(errorData.errors)) {
                const errorMessages = errorData.errors.map((err: any) =>
                    typeof err === 'string' ? err : err.message || JSON.stringify(err)
                ).join('; ');
                return `API Error: ${errorMessages}`;
            }

            // If we have error data but can't parse the specific message
            return `API Error: ${JSON.stringify(errorData)}`;
        } catch (parseError) {
            // If we can't parse the error response at all, return a generic message
            console.error('[BraveSearch] Failed to parse error response:', parseError);
            return `API returned ${response.status} ${response.statusText} (unable to parse error details)`;
        }
    }

    async _call(input: string): Promise<string> {
        try {
            console.log(`[BraveSearch] Searching for: "${input}"`);
            console.log(`[BraveSearch] API key status:`, {
                hasApiKey: !!this.apiKey,
                keyLength: this.apiKey.length,
                keyPreview: this.apiKey ? `${this.apiKey.substring(0, 8)}...` : 'none'
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
                const results = data.web.results.slice(0, 5).map((result: any) => ({
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
            console.error(`[BraveSearch] Error details:`, {
                message: error.message,
                stack: error.stack,
                query: input
            });

            // Provide more specific error messages
            if (error.message.includes('422')) {
                return `Brave Search encountered a validation error. This may be due to an invalid query format or API configuration issue. Try rephrasing your search or check the API key settings.`;
            } else if (error.message.includes('fetch')) {
                return `Unable to connect to Brave Search API. Please check your internet connection and try again.`;
            } else if (error.message.includes('API key')) {
                return `Brave Search API authentication issue. Please verify your API key in settings.`;
            } else {
                return `Brave Search failed: ${error.message}. The service may be temporarily unavailable.`;
            }
        }
    }
}

interface ToolResult {
    success: boolean;
    result?: any;
    error?: string;
    duration?: number;
}

interface ToolDefinition {
    name: string;
    description: string;
    parameters: any;
    tool: Tool;
}

export class LangChainToolExecutorService extends EventEmitter {
    private tools: Map<string, ToolDefinition> = new Map();
    private lastWebSearchTime: number = 0;
    private settingsService: any;
    private vectorStore: any;

    constructor(vectorStore?: any, settingsService?: any) {
        super();
        this.vectorStore = vectorStore;
        this.settingsService = settingsService;
        console.log('[LangChainToolExecutorService] Created with web search tools and vector store');
        console.log('[LangChainToolExecutorService] Vector store provided:', !!vectorStore);
        console.log('[LangChainToolExecutorService] Vector store type:', vectorStore?.constructor?.name);
        console.log('[LangChainToolExecutorService] Vector store initialized:', vectorStore?.isInitialized);
        console.log('[LangChainToolExecutorService] Settings service provided:', !!settingsService);
        
        if (!vectorStore) {
            console.warn('[LangChainToolExecutorService] ⚠️ WARNING: No vector store provided to constructor!');
            console.warn('[LangChainToolExecutorService] ⚠️ This means search_documents tool will not be available');
        } else {
            console.log('[LangChainToolExecutorService] ✅ Vector store available in constructor');
        }
    }

    async initialize(): Promise<void> {
        console.log('[LangChainToolExecutorService] Starting initialization...');
        await this.initializeWebSearchTools();
        console.log(`[LangChainToolExecutorService] After web search tools: ${this.tools.size} tools`);
        await this.initializeVectorStoreTools();
        console.log(`[LangChainToolExecutorService] Initialized with ${this.tools.size} tools (web search + vector store)`);
        console.log('[LangChainToolExecutorService] Final tool list:', Array.from(this.tools.keys()));
        
        // Debug tool registration status
        this.debugToolStatus();
    }

    private async initializeWebSearchTools(): Promise<void> {
        console.log('[LangChainToolExecutorService] Loading web search tools...');

        // Get search settings
        let searchSettings: any = null;
        if (this.settingsService) {
            try {
                searchSettings = await this.settingsService.get('search');
                const braveApiKey = searchSettings["braveApiKey"] || "";
                const tavilyApiKey = searchSettings["tavilyApiKey"] || "";
                const serpApiKey = searchSettings["serpApiKey"] || "";

                // Add API keys to search settings
                searchSettings.braveApiKey = braveApiKey;
                searchSettings.tavilyApiKey = tavilyApiKey;
                searchSettings.serpApiKey = serpApiKey;

                console.log('[LangChainToolExecutorService] Loaded search settings:', {
                    preferredProvider: searchSettings.preferredProvider,
                    hasBraveKey: !!braveApiKey,
                    hasTavilyKey: !!tavilyApiKey,
                    hasSerpKey: !!serpApiKey
                });
            } catch (error) {
                console.warn('[LangChainToolExecutorService] Failed to load search settings:', error);
            }
        }

        // DuckDuckGo Search (free, no API key required) - if available
        try {
            const duckDuckGoSearch = new DuckDuckGoSearch({
                maxResults: 5,
            });
            this.registerTool({
                name: 'web_search',
                description: 'Search the web for information, This is the default web search tool triggered by a #web hashtag',
                parameters: {
                    type: 'object',
                    properties: {
                        input: { type: 'string', description: 'Search query' }
                    },
                    required: ['input']
                },
                tool: duckDuckGoSearch
            });
            console.log('[LangChainToolExecutorService] DuckDuckGo search tool registered');
        } catch (error: any) {
            console.warn('[LangChainToolExecutorService] DuckDuckGo search configuration error:', error?.message);
        }

        // Wikipedia Search (free, no API key required) - if available
        if (WikipediaQueryRun) {
            try {
                const wikipediaSearch = new WikipediaQueryRun({
                    topKResults: 3,
                    maxDocContentLength: 4000,
                });
                this.registerTool({
                    name: 'wikipedia_search',
                    description: 'Search Wikipedia for information',
                    parameters: {
                        type: 'object',
                        properties: {
                            input: { type: 'string', description: 'Wikipedia search query' }
                        },
                        required: ['input']
                    },
                    tool: wikipediaSearch
                });
                console.log('[LangChainToolExecutorService] Wikipedia search tool registered');
            } catch (error: any) {
                console.warn('[LangChainToolExecutorService] Wikipedia search configuration error:', error?.message);
            }
        } else {
            console.log('[LangChainToolExecutorService] Wikipedia search unavailable');
        }

        // SerpAPI Search (requires API key - optional)
        if (SerpAPI) {
            try {
                const serpApiKey = searchSettings?.serpApiKey || process.env.SERP_API_KEY;
                if (serpApiKey) {
                    // SerpAPI expects the API key in environment variable
                    process.env.SERPAPI_API_KEY = serpApiKey;
                    const serpApiTool = new SerpAPI();
                    this.registerTool({
                        name: 'serp_search',
                        description: 'Advanced web search using SerpAPI (Google results)',
                        parameters: {
                            type: 'object',
                            properties: {
                                input: { type: 'string', description: 'Search query for SerpAPI' }
                            },
                            required: ['input']
                        },
                        tool: serpApiTool
                    });
                    console.log('[LangChainToolExecutorService] SerpAPI search tool registered (with API key)');
                } else {
                    console.log('[LangChainToolExecutorService] SerpAPI available but API key not set');
                }
            } catch (error: any) {
                console.warn('[LangChainToolExecutorService] SerpAPI search configuration error:', error?.message);
            }
        } else {
            console.log('[LangChainToolExecutorService] SerpAPI not available (install @langchain/community)');
        }

        // Brave Search (optionally with API key for premium features)
        try {
            const braveApiKey = searchSettings?.braveApiKey;

            console.log('[LangChainToolExecutorService] Brave API key debug:', {
                hasSearchSettings: !!searchSettings,
                hasApiKey: !!braveApiKey,
                apiKeyLength: braveApiKey ? braveApiKey.length : 0,
                apiKeyType: typeof braveApiKey,
                apiKeyTrimmed: braveApiKey ? braveApiKey.trim().length : 0
            });

            // Validate API key format if provided
            if (braveApiKey && braveApiKey.trim()) {
                const keyValidation = this.validateBraveApiKey(braveApiKey);
                if (!keyValidation.valid) {
                    console.warn('[LangChainToolExecutorService] Brave API key validation failed:', keyValidation.error);
                    console.warn('[LangChainToolExecutorService] Continuing with limited Brave Search capabilities');
                } else {
                    console.log('[LangChainToolExecutorService] Brave API key validation passed');
                }
            } else {
                console.log('[LangChainToolExecutorService] No Brave API key provided - registering Brave tool with limited functionality');
            }

            const braveSearchTool = new BraveSearchTool(braveApiKey);
            console.log('[LangChainToolExecutorService] Created BraveSearchTool with API key:', !!braveApiKey);

            // Perform a health check for Brave Search API (only if we have API key)
            try {
                await this.healthCheckBraveSearch(braveSearchTool);
            } catch (healthError: any) {
                console.warn('[LangChainToolExecutorService] Brave Search health check failed:', healthError.message);
                console.warn('[LangChainToolExecutorService] Brave Search may not work properly');
            }

            this.registerTool({
                name: 'brave_search',
                description: 'Search the web using Brave Search API (requires API key)',
                parameters: {
                    type: 'object',
                    properties: {
                        input: { type: 'string', description: 'Search query for Brave Search' }
                    },
                    required: ['input']
                },
                tool: braveSearchTool
            });
            console.log(`[LangChainToolExecutorService] Brave Search tool registered ${braveApiKey ? 'with API key' : 'without API key (limited functionality)'}`);
        } catch (error: any) {
            console.warn('[LangChainToolExecutorService] Brave Search configuration error:', error?.message);
        }

        // Tavily Search (requires API key but provides high quality results)
        if (TavilySearchResults) {
            try {
                // Check if API key is available from settings or environment
                const tavilyApiKey = searchSettings?.tavilyApiKey || process.env.TAVILY_API_KEY;
                if (tavilyApiKey) {
                    const tavilySearch = new TavilySearchResults({
                        maxResults: 5,
                        apiKey: tavilyApiKey
                    });
                    this.registerTool({
                        name: 'tavily_search',
                        description: 'High-quality web search using Tavily AI Search API (best for research)',
                        parameters: {
                            type: 'object',
                            properties: {
                                input: { type: 'string', description: 'Search query for Tavily' }
                            },
                            required: ['input']
                        },
                        tool: tavilySearch
                    });
                    console.log('[LangChainToolExecutorService] Tavily search tool registered (with API key)');
                } else {
                    console.log('[LangChainToolExecutorService] Tavily search available but API key not set');
                }
            } catch (error: any) {
                console.warn('[LangChainToolExecutorService] Tavily search configuration error:', error?.message);
            }
        } else {
            console.log('[LangChainToolExecutorService] Tavily search not available (install @langchain/community)');
        }

        console.log('[LangChainToolExecutorService] Web search tools loaded');
    }

    private async initializeVectorStoreTools(): Promise<void> {
        console.log('[LangChainToolExecutorService] Loading vector store tools...');
        console.log('[LangChainToolExecutorService] Vector store check:', {
            hasVectorStore: !!this.vectorStore,
            vectorStoreType: this.vectorStore?.constructor?.name,
            vectorStoreInitialized: this.vectorStore?.isInitialized
        });

        if (!this.vectorStore) {
            console.error('[LangChainToolExecutorService] ❌ No vector store provided - skipping vector store tools');
            console.error('[LangChainToolExecutorService] ❌ This means search_documents tool will NOT be registered');
            return;
        }

        console.log('[LangChainToolExecutorService] ✅ Vector store is available, proceeding with tool registration...');

        try {
            // Create vector store search tool by extending Tool class
            class VectorSearchTool extends Tool {
                name = 'search_documents';
                description = 'Search through indexed documents and notes using semantic similarity. Use this when users ask about stored documents, notes, or need to find specific information from their knowledge base. Triggered by #search or #find hashtags.';
                
                constructor(private vectorStore: any) {
                    super();
                }

                async invoke(input: any): Promise<string> {
                    console.log('[VectorSearchTool] invoke called with:', input);
                    console.log('[VectorSearchTool] input type:', typeof input);
                    return this._call(input);
                }

                async _call(input: any): Promise<string> {
                    try {
                        console.log('[VectorSearchTool] _call method called with:', input);
                        console.log('[VectorSearchTool] input type in _call:', typeof input);
                        
                        // Handle both string input and object input
                        const query = typeof input === 'string' ? input : (input?.query || input);
                        const limit = typeof input === 'object' && input.limit ? input.limit : 5;

                        if (!query || query.trim().length === 0) {
                            return 'Please provide a search query to find relevant documents.';
                        }

                        // Ensure vector store is initialized
                        if (!this.vectorStore.isInitialized) {
                            await this.vectorStore.initialize();
                        }

                        // Perform similarity search
                        const results = await this.vectorStore.similaritySearch(query.trim(), limit);
                        
                        if (!results || results.length === 0) {
                            return `I searched through the indexed documents but could not find any information related to "${query.trim()}". This could mean:
1. The information is not in the indexed documents
2. Try rephrasing your search with different keywords
3. The documents may need to be re-indexed if recently added

Please try a different search term or check if the relevant documents have been indexed.`;
                        }

                        // Format results with clear instructions for the LLM
                        const formattedResults = results.map((doc: any, index: number) => {
                            const metadata = doc.metadata || {};
                            const source = metadata.source || metadata.fileName || 'Unknown source';
                            const content = doc.pageContent || '';
                            const pageNumber = metadata.pdf?.page || metadata.page || 'N/A';
                            
                            // Create clickable file path for links
                            const fileName = source.split('/').pop() || source;
                            const fileLink = `[${fileName}](file://${source})`;
                            
                            return `**Document ${index + 1}** - ${fileLink} (Page: ${pageNumber})\n${content.substring(0, 800)}${content.length > 800 ? '...' : ''}`;
                        }).join('\n\n---\n\n');

                        // Provide clear instruction to the LLM about how to use this information
                        return `I found ${results.length} relevant document${results.length === 1 ? '' : 's'} that contain information to answer your question about "${query.trim()}". Use the following retrieved information to provide a comprehensive answer:

${formattedResults}

Based on the above retrieved documents, please provide a detailed answer to the user's question. Include specific information from the documents and cite the sources with file links when referencing specific details.`;

                    } catch (error: any) {
                        console.error('[VectorSearchTool] Error during search:', error);
                        return `Search failed: ${error.message}. Please try again or check if the vector database is properly configured.`;
                    }
                }
            }

            console.log('[LangChainToolExecutorService] Creating VectorSearchTool instance...');
            const vectorSearchTool = new VectorSearchTool(this.vectorStore);
            console.log('[LangChainToolExecutorService] VectorSearchTool created successfully');

            console.log('[LangChainToolExecutorService] Attempting to register search_documents tool...');
            // Register the tool
            this.registerTool({
                name: 'search_documents',
                description: 'Search through indexed documents and notes using semantic similarity. Triggered by #search or #find hashtags.',
                parameters: {
                    type: 'object',
                    properties: {
                        query: { 
                            type: 'string', 
                            description: 'The search query to find relevant documents' 
                        },
                        limit: { 
                            type: 'number', 
                            description: 'Maximum number of results to return (default: 5)',
                            default: 5
                        }
                    },
                    required: ['query']
                },
                tool: vectorSearchTool
            });

            console.log('[LangChainToolExecutorService] ✅ Vector store search tool registered successfully');
            console.log('[LangChainToolExecutorService] ✅ Available tools after registration:', Array.from(this.tools.keys()));
            console.log('[LangChainToolExecutorService] ✅ Tools map size:', this.tools.size);
            
            // Verify the tool was actually registered
            if (this.tools.has('search_documents')) {
                console.log('[LangChainToolExecutorService] ✅ CONFIRMED: search_documents tool is in the tools map');
            } else {
                console.error('[LangChainToolExecutorService] ❌ ERROR: search_documents tool was NOT added to tools map');
            }
        } catch (error: any) {
            console.error('[LangChainToolExecutorService] Failed to initialize vector store tools:', error);
            console.error('[LangChainToolExecutorService] Error stack:', error.stack);
        }

        console.log('[LangChainToolExecutorService] Vector store tools loaded');
    }

    /**
     * Register a new tool
     */
    registerTool(definition: ToolDefinition): void {
        console.log(`[LangChainToolExecutorService] registerTool() called for: ${definition.name}`);
        console.log(`[LangChainToolExecutorService] Tool definition:`, {
            name: definition.name,
            hasDescription: !!definition.description,
            hasParameters: !!definition.parameters,
            hasTool: !!definition.tool,
            toolType: definition.tool?.constructor?.name
        });
        
        this.tools.set(definition.name, definition);
        console.log(`[LangChainToolExecutorService] ✅ Tool ${definition.name} added to map. Map size now: ${this.tools.size}`);
        
        // Verify it was actually added
        if (this.tools.has(definition.name)) {
            console.log(`[LangChainToolExecutorService] ✅ Verified: ${definition.name} is in tools map`);
        } else {
            console.error(`[LangChainToolExecutorService] ❌ ERROR: ${definition.name} was not added to tools map`);
        }
        
        this.emit('toolRegistered', definition.name);
    }

    /**
     * Unregister a tool
     */
    unregisterTool(name: string): boolean {
        const existed = this.tools.has(name);
        if (existed) {
            this.tools.delete(name);
            console.log(`[LangChainToolExecutorService] Unregistered tool: ${name}`);
            this.emit('toolUnregistered', name);
        }
        return existed;
    }

    /**
     * Execute Brave Search with specific retry logic for 422 errors
     */
    private async executeBraveSearchWithRetry(tool: Tool, query: string, maxRetries: number = 3): Promise<any> {
        let lastError: Error = new Error('Max retries exceeded');

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[LangChainToolExecutorService] Brave Search attempt ${attempt}/${maxRetries}`);

                // Rate limiting for Brave Search (minimum 2 seconds between requests)
                const now = Date.now();
                const timeSinceLastSearch = now - this.lastWebSearchTime;
                const minDelay = 2000; // 2 seconds minimum for Brave

                if (timeSinceLastSearch < minDelay) {
                    const waitTime = minDelay - timeSinceLastSearch;
                    console.log(`[LangChainToolExecutorService] Waiting ${waitTime}ms before Brave search...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }

                this.lastWebSearchTime = Date.now();
                return await tool.invoke(query);

            } catch (error: any) {
                lastError = error;
                console.error(`[LangChainToolExecutorService] Brave Search attempt ${attempt} failed:`, error.message);

                // Check if it's a 422 error that might be retryable
                if (error.message?.includes('422') && attempt < maxRetries) {
                    // For 422 errors, try with a modified query or wait longer
                    const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                    console.log(`[LangChainToolExecutorService] 422 error, waiting ${delay}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // Check if it's a rate limiting error
                if (error.message?.includes('429') && attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 3000; // 6s, 12s, 24s
                    console.log(`[LangChainToolExecutorService] Rate limited by Brave, waiting ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // Check if it's a server error that might be temporary
                if ((error.message?.includes('500') || error.message?.includes('503')) && attempt < maxRetries) {
                    const delay = Math.pow(2, attempt) * 2000; // 4s, 8s, 16s
                    console.log(`[LangChainToolExecutorService] Brave server error, waiting ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // For authentication or permission errors, don't retry
                if (error.message?.includes('401') || error.message?.includes('403')) {
                    console.error(`[LangChainToolExecutorService] Brave Search authentication/permission error, not retrying`);
                    break;
                }

                // If it's not a retryable error, or we've exhausted retries, break
                if (attempt === maxRetries) {
                    console.error(`[LangChainToolExecutorService] Brave Search failed after ${maxRetries} attempts`);
                    break;
                }
            }
        }

        // If all Brave Search attempts failed, try fallback to other search providers
        console.log(`[LangChainToolExecutorService] Brave Search exhausted, trying fallback search providers...`);

        // Try Tavily first if available
        const tavilySearchTool = this.tools.get('tavily_search');
        if (tavilySearchTool) {
            try {
                console.log(`[LangChainToolExecutorService] Trying Tavily Search fallback...`);
                const tavilyResult = await tavilySearchTool.tool.invoke({ input: query });
                console.log(`[LangChainToolExecutorService] Tavily Search fallback succeeded`);
                return tavilyResult;
            } catch (tavilyError: any) {
                console.log(`[LangChainToolExecutorService] Tavily Search fallback failed:`, tavilyError.message);
            }
        }

        // Try DuckDuckGo as final fallback
        const duckDuckGoTool = this.tools.get('web_search');
        if (duckDuckGoTool) {
            try {
                console.log(`[LangChainToolExecutorService] Trying DuckDuckGo Search fallback...`);
                const ddgResult = await duckDuckGoTool.tool.invoke({ input: query });
                console.log(`[LangChainToolExecutorService] DuckDuckGo Search fallback succeeded`);
                return ddgResult;
            } catch (ddgError: any) {
                console.log(`[LangChainToolExecutorService] DuckDuckGo Search fallback also failed:`, ddgError.message);
            }
        }

        // If all fallbacks failed, return informative error message
        return `I'm unable to search the web right now. Brave Search encountered an error (${lastError.message}), and backup search providers are also unavailable. Please try again later or search for "${query}" manually.`;
    }

    /**
     * Execute a tool with retry logic for rate limiting
     */
    private async executeWithRetry(tool: Tool, parameters: any, maxRetries: number = 3): Promise<any> {
        let lastError: Error = new Error('Max retries exceeded');

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[LangChainToolExecutorService] Web search attempt ${attempt}/${maxRetries}`);
                return await tool.invoke(parameters);
            } catch (error: any) {
                lastError = error;

                // Check if it's a rate limiting error
                if (error.message?.includes('DDG detected an anomaly') ||
                    error.message?.includes('making requests too quickly')) {

                    if (attempt < maxRetries) {
                        // Longer exponential backoff: 5s, 10s, 20s
                        const delay = Math.pow(2, attempt) * 2500;
                        console.log(`[LangChainToolExecutorService] Rate limited, waiting ${delay}ms before retry...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    } else {
                        // After all DuckDuckGo retries failed, try fallbacks
                        console.log(`[LangChainToolExecutorService] DuckDuckGo exhausted, trying fallback search tools...`);

                        // Try Tavily first if available (premium option)
                        const tavilySearchTool = this.tools.get('tavily_search');
                        if (tavilySearchTool) {
                            try {
                                console.log(`[LangChainToolExecutorService] Trying Tavily Search fallback...`);
                                const tavilyResult = await tavilySearchTool.tool.invoke(parameters);
                                console.log(`[LangChainToolExecutorService] Tavily Search fallback succeeded`);
                                return tavilyResult;
                            } catch (tavilyError: any) {
                                console.log(`[LangChainToolExecutorService] Tavily Search fallback failed:`, tavilyError.message);
                            }
                        }

                        // Try Brave Search as second fallback
                        const braveSearchTool = this.tools.get('brave_search');
                        if (braveSearchTool) {
                            try {
                                console.log(`[LangChainToolExecutorService] Trying Brave Search fallback...`);
                                // Brave Search expects string input, not object
                                const braveResult = await braveSearchTool.tool.invoke(parameters.input || parameters);
                                console.log(`[LangChainToolExecutorService] Brave Search fallback succeeded`);
                                return braveResult;
                            } catch (braveError: any) {
                                console.log(`[LangChainToolExecutorService] Brave Search fallback also failed:`, braveError.message);
                                return `I'm unable to search the web right now. All search providers (DuckDuckGo, Tavily, and Brave) are temporarily unavailable. The search query was: "${parameters.input}". Please try again later.`;
                            }
                        } else {
                            return `I'm unable to search the web right now due to rate limiting. The search query was: "${parameters.input}". You might want to try again in a few minutes or search for this information manually.`;
                        }
                    }
                }

                // If it's not a rate limit error, or we've exhausted retries, throw immediately
                throw error;
            }
        }

        throw lastError;
    }

    /**
     * Validate Brave API key format
     */
    private validateBraveApiKey(apiKey: string): { valid: boolean; error?: string } {
        if (!apiKey || apiKey.trim().length === 0) {
            return { valid: false, error: 'API key is empty' };
        }

        const trimmedKey = apiKey.trim();

        // Basic format validation (Brave API keys are typically alphanumeric)
        if (trimmedKey.length < 10) {
            return { valid: false, error: 'API key appears to be too short' };
        }

        if (trimmedKey.length > 200) {
            return { valid: false, error: 'API key appears to be too long' };
        }

        // Check for suspicious characters that might indicate malformed key
        if (!/^[A-Za-z0-9_-]+$/.test(trimmedKey)) {
            return { valid: false, error: 'API key contains invalid characters' };
        }

        return { valid: true };
    }

    /**
     * Perform health check for Brave Search API
     */
    private async healthCheckBraveSearch(braveSearchTool: BraveSearchTool, timeout: number = 5000): Promise<void> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            // Use a simple, non-controversial search term for health check
            console.log('[LangChainToolExecutorService] Performing Brave Search health check...');
            const testResult = await Promise.race([
                braveSearchTool.invoke('test'),
                new Promise((_, reject) => {
                    controller.signal.addEventListener('abort', () => {
                        reject(new Error('Health check timeout'));
                    });
                })
            ]);

            clearTimeout(timeoutId);

            if (typeof testResult === 'string' &&
                (testResult.includes('Search results') || testResult.includes('No search results'))) {
                console.log('[LangChainToolExecutorService] Brave Search health check passed');
            } else {
                console.warn('[LangChainToolExecutorService] Brave Search health check returned unexpected result');
            }
        } catch (error: any) {
            clearTimeout(timeoutId);
            // Don't throw the error, just log it - we'll still allow the tool to be registered
            console.warn('[LangChainToolExecutorService] Brave Search health check failed:', error.message);

            // Provide specific guidance based on error type
            if (error.message?.includes('422')) {
                console.warn('[LangChainToolExecutorService] Brave Search 422 error during health check - this may be due to API configuration issues');
            } else if (error.message?.includes('401')) {
                console.warn('[LangChainToolExecutorService] Brave Search authentication failed - check API key');
            } else if (error.message?.includes('403')) {
                console.warn('[LangChainToolExecutorService] Brave Search access forbidden - check API key permissions');
            } else if (error.message?.includes('timeout')) {
                console.warn('[LangChainToolExecutorService] Brave Search health check timed out - service may be slow');
            }
        }
    }

    /**
     * Get the preferred search provider based on settings
     */
    private async getPreferredSearchProvider(): Promise<string> {
        console.log('[LangChainToolExecutorService] 🔍 Getting preferred search provider...');

        if (!this.settingsService) {
            console.log('[LangChainToolExecutorService] ❌ No settings service available, defaulting to web_search');
            return 'web_search'; // Default to DuckDuckGo
        }

        try {
            const searchSettings = await this.settingsService.get('search');
            const preferredProvider = searchSettings?.preferredProvider;

            console.log('[LangChainToolExecutorService] 📋 Search settings:', {
                hasSearchSettings: !!searchSettings,
                preferredProvider: preferredProvider,
                availableTools: Array.from(this.tools.keys())
            });

            // If auto mode, select based on available API keys
            if (preferredProvider === 'auto') {
                console.log('[LangChainToolExecutorService] 🔄 Auto mode detected, checking API keys...');

                // Check for API keys in order of preference (quality)
                const tavilyKey = await this.settingsService.getTavilyApiKey();
                if (tavilyKey && this.tools.has('tavily_search')) {
                    console.log('[LangChainToolExecutorService] ✅ Auto mode selecting tavily_search (has API key)');
                    return 'tavily_search';
                }

                const serpKey = await this.settingsService.getSerpApiKey();
                if (serpKey && this.tools.has('serp_search')) {
                    console.log('[LangChainToolExecutorService] ✅ Auto mode selecting serp_search (has API key)');
                    return 'serp_search';
                }

                const braveKey = await this.settingsService.getBraveApiKey();
                if (braveKey && this.tools.has('brave_search')) {
                    console.log('[LangChainToolExecutorService] ✅ Auto mode selecting brave_search (has API key)');
                    return 'brave_search';
                }

                console.log('[LangChainToolExecutorService] ⚠️ Auto mode: no API keys found, defaulting to web_search');
                return 'web_search';
            }

            // Map provider names to tool names
            const providerMap: Record<string, string> = {
                'duckduckgo': 'web_search',
                'brave': 'brave_search',
                'tavily': 'tavily_search',
                'serp': 'serp_search'
            };

            const toolName = providerMap[preferredProvider];

            console.log('[LangChainToolExecutorService] 🎯 Provider mapping:', {
                preferredProvider: preferredProvider,
                mappedToolName: toolName,
                toolExists: toolName ? this.tools.has(toolName) : false
            });

            // Check if the preferred tool is available
            if (toolName && this.tools.has(toolName)) {
                console.log(`[LangChainToolExecutorService] ✅ Using preferred provider: ${toolName}`);
                return toolName;
            }

            console.log(`[LangChainToolExecutorService] ❌ Preferred tool not available (${toolName}), falling back to web_search`);
            // Fallback to DuckDuckGo
            return 'web_search';
        } catch (error) {
            console.warn('[LangChainToolExecutorService] Failed to get preferred search provider:', error);
            return 'web_search';
        }
    }

    /**
     * Execute a tool by name
     */
    async executeTool(toolName: string, parameters: any): Promise<ToolResult> {
        const startTime = Date.now();

        try {
            // If web_search is requested, route to preferred provider
            if (toolName === 'web_search') {
                const preferredProvider = await this.getPreferredSearchProvider();
                if (preferredProvider !== 'web_search') {
                    console.log(`[LangChainToolExecutorService] Routing web_search to preferred provider: ${preferredProvider}`);
                    toolName = preferredProvider;
                }
            }

            const toolDef = this.tools.get(toolName);
            if (!toolDef) {
                console.error(`[LangChainToolExecutorService] Tool not found: ${toolName}`);
                console.error(`[LangChainToolExecutorService] Available tools:`, Array.from(this.tools.keys()));
                console.error(`[LangChainToolExecutorService] Total tools registered:`, this.tools.size);
                throw new Error(`Tool not found: ${toolName}`);
            }

            console.log(`[LangChainToolExecutorService] Executing tool: ${toolName}`, parameters);

            // Execute the tool with retry logic for web search
            let result: any;
            if (toolName === 'web_search' || toolName === 'tavily_search' || toolName === 'serp_search') {
                // Enforce minimum delay between web searches to prevent rate limiting
                const now = Date.now();
                const timeSinceLastSearch = now - this.lastWebSearchTime;
                const minDelay = 3000; // 3 seconds minimum between searches

                if (timeSinceLastSearch < minDelay) {
                    const waitTime = minDelay - timeSinceLastSearch;
                    console.log(`[LangChainToolExecutorService] Waiting ${waitTime}ms to prevent rate limiting...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }

                this.lastWebSearchTime = Date.now();
                result = await this.executeWithRetry(toolDef.tool, parameters, 3);
            } else if (toolName === 'brave_search') {
                // Brave Search with enhanced error handling and retry logic
                result = await this.executeBraveSearchWithRetry(toolDef.tool, parameters.input || parameters);
            } else if (toolName === 'tavily_search') {
                // Tavily Search with rate limiting protection
                const now = Date.now();
                const timeSinceLastSearch = now - this.lastWebSearchTime;
                const minDelay = 1000; // 1 second minimum for Tavily

                if (timeSinceLastSearch < minDelay) {
                    const waitTime = minDelay - timeSinceLastSearch;
                    console.log(`[LangChainToolExecutorService] Waiting ${waitTime}ms before Tavily search...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }

                this.lastWebSearchTime = Date.now();
                result = await toolDef.tool.invoke(parameters);
            } else if (toolName === 'search_documents') {
                // Handle search_documents tool specifically
                console.log(`[LangChainToolExecutorService] Executing search_documents with parameters:`, parameters);
                result = await toolDef.tool.invoke(parameters);
            } else if (toolName === 'wikipedia_search') {
                // Handle Wikipedia search
                result = await toolDef.tool.invoke(parameters.input || parameters.query || parameters);
            } else {
                // Generic tool execution
                result = await toolDef.tool.invoke(parameters);
            }

            const duration = Date.now() - startTime;

            console.log(`[LangChainToolExecutorService] Tool ${toolName} completed in ${duration}ms`);

            this.emit('toolExecuted', {
                toolName,
                parameters,
                result,
                duration,
                success: true
            });

            return {
                success: true,
                result,
                duration
            };
        } catch (error: any) {
            const duration = Date.now() - startTime;
            console.error(`[LangChainToolExecutorService] Tool ${toolName} failed:`, error);

            this.emit('toolError', {
                toolName,
                parameters,
                error: error.message,
                duration,
                success: false
            });

            return {
                success: false,
                error: error.message,
                duration
            };
        }
    }

    /**
     * Get available tools
     */
    getAvailableTools(): string[] {
        return Array.from(this.tools.keys());
    }

    /**
     * Debug method to check tool registration status
     */
    debugToolStatus(): void {
        console.log(`[LangChainToolExecutorService] Tool registration status:`);
        console.log(`  Total tools: ${this.tools.size}`);
        console.log(`  Available tools:`, Array.from(this.tools.keys()));
        console.log(`  Vector store available: ${!!this.vectorStore}`);
        console.log(`  Vector store initialized: ${this.vectorStore?.isInitialized}`);
        
        if (this.tools.has('search_documents')) {
            console.log(`  ✅ search_documents tool is registered`);
        } else {
            console.log(`  ❌ search_documents tool is NOT registered`);
        }
    }

    /**
     * Get tool definitions for agent use
     */
    getToolsForAgent(): Tool[] {
        return Array.from(this.tools.values()).map(def => def.tool);
    }

    /**
     * Get tool definition by name
     */
    getToolDefinition(name: string): ToolDefinition | undefined {
        return this.tools.get(name);
    }

    /**
     * Get all tool definitions
     */
    getAllToolDefinitions(): ToolDefinition[] {
        return Array.from(this.tools.values());
    }

    /**
     * Validate tool parameters against schema
     */
    validateParameters(toolName: string, parameters: any): { valid: boolean; errors?: string[] } {
        const toolDef = this.tools.get(toolName);
        if (!toolDef) {
            return { valid: false, errors: [`Tool not found: ${toolName}`] };
        }

        try {
            // Basic validation - LangChain tools handle their own schema validation
            const required = toolDef.parameters.required || [];
            const missing = required.filter((param: string) => !(param in parameters));

            if (missing.length > 0) {
                return {
                    valid: false,
                    errors: [`Missing required parameters: ${missing.join(', ')}`]
                };
            }

            return { valid: true };
        } catch (error: any) {
            return {
                valid: false,
                errors: [`Parameter validation error: ${error.message}`]
            };
        }
    }

    /**
     * Get execution statistics
     */
    getStats(): {
        totalTools: number;
        toolNames: string[];
        executionCount: number;
    } {
        return {
            totalTools: this.tools.size,
            toolNames: this.getAvailableTools(),
            executionCount: 0 // Would need to track this
        };
    }

    /**
     * Batch execute multiple tools
     */
    async executeTools(executions: Array<{
        toolName: string;
        parameters: any;
    }>): Promise<ToolResult[]> {
        const results = await Promise.allSettled(
            executions.map(exec => this.executeTool(exec.toolName, exec.parameters))
        );

        return results.map(result =>
            result.status === 'fulfilled'
                ? result.value
                : { success: false, error: result.reason?.message || 'Unknown error' }
        );
    }

    // Backward compatibility methods for ToolExecutorService interface

    /**
     * Initialize tools (for compatibility - already done in constructor)
     */
    async initializeTools(): Promise<void> {
        // Tools are already initialized in the initialize() method
        console.log('[LangChainToolExecutorService] Tools already initialized');
    }

    /**
     * Execute a tool (alias for backward compatibility)
     */
    async execute(toolName: string, parameters: any): Promise<ToolResult> {
        return this.executeTool(toolName, parameters);
    }

    /**
     * Get tools (alias for backward compatibility)
     */
    getTools(): string[] {
        return this.getAvailableTools();
    }
}