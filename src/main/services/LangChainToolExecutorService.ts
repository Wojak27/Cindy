import { EventEmitter } from 'events';
import { Tool } from '@langchain/core/tools';
import { DuckDuckGoSearch } from '@langchain/community/tools/duckduckgo_search';

// Try to import web search tools if available (with dependencies)

let WikipediaQueryRun: any = null;
let SerpAPI: any = null;


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

// Custom Brave Search Tool
class BraveSearchTool extends Tool {
    name = 'brave_search';
    description = 'Search the web using Brave Search API';

    async _call(input: string): Promise<string> {
        try {
            console.log(`[BraveSearch] Searching for: ${input}`);

            const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(input)}&count=5`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (compatible; CindyAssistant/1.0)'
                }
            });

            if (!response.ok) {
                throw new Error(`Brave Search API returned ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.web && data.web.results && data.web.results.length > 0) {
                const results = data.web.results.slice(0, 5).map((result: any) => ({
                    title: result.title,
                    url: result.url,
                    description: result.description
                }));

                const formattedResults = results.map((result: any, index: number) =>
                    `${index + 1}. **${result.title}**\n   ${result.description}\n   URL: ${result.url}`
                ).join('\n\n');

                console.log(`[BraveSearch] Found ${results.length} results`);
                return `Search results for "${input}":\n\n${formattedResults}`;
            } else {
                return `No search results found for "${input}" using Brave Search.`;
            }
        } catch (error: any) {
            console.error(`[BraveSearch] Error:`, error);
            throw new Error(`Brave Search failed: ${error.message}`);
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

    constructor(_vectorStore?: any) {
        super();
        console.log('[LangChainToolExecutorService] Created with web search tools only');
    }

    async initialize(): Promise<void> {
        await this.initializeWebSearchTools();
        console.log(`[LangChainToolExecutorService] Initialized with ${this.tools.size} web search tools`);
    }

    private async initializeWebSearchTools(): Promise<void> {
        console.log('[LangChainToolExecutorService] Loading web search tools...');

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
                const serpApiTool = new SerpAPI();
                this.registerTool({
                    name: 'serp_search',
                    description: 'Advanced web search using SerpAPI (requires API key)',
                    parameters: {
                        type: 'object',
                        properties: {
                            input: { type: 'string', description: 'Search query for SerpAPI' }
                        },
                        required: ['input']
                    },
                    tool: serpApiTool
                });
                console.log('[LangChainToolExecutorService] SerpAPI search tool registered');
            } catch (error: any) {
                console.warn('[LangChainToolExecutorService] SerpAPI search configuration error:', error?.message);
            }
        } else {
            console.log('[LangChainToolExecutorService] SerpAPI not available (requires API key)');
        }

        // Brave Search (free, no API key required)
        try {
            const braveSearchTool = new BraveSearchTool();
            this.registerTool({
                name: 'brave_search',
                description: 'Search the web using Brave Search (fallback when other searches fail)',
                parameters: {
                    type: 'object',
                    properties: {
                        input: { type: 'string', description: 'Search query for Brave Search' }
                    },
                    required: ['input']
                },
                tool: braveSearchTool
            });
            console.log('[LangChainToolExecutorService] Brave Search tool registered');
        } catch (error: any) {
            console.warn('[LangChainToolExecutorService] Brave Search configuration error:', error?.message);
        }

        console.log('[LangChainToolExecutorService] Web search tools loaded');
    }

    /**
     * Register a new tool
     */
    registerTool(definition: ToolDefinition): void {
        this.tools.set(definition.name, definition);
        console.log(`[LangChainToolExecutorService] Registered tool: ${definition.name}`);
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
                        // After all DuckDuckGo retries failed, try Brave Search as fallback
                        console.log(`[LangChainToolExecutorService] DuckDuckGo exhausted, trying Brave Search fallback...`);
                        const braveSearchTool = this.tools.get('brave_search');
                        if (braveSearchTool) {
                            try {
                                // Brave Search expects string input, not object
                                const braveResult = await braveSearchTool.tool.invoke(parameters.input || parameters);
                                console.log(`[LangChainToolExecutorService] Brave Search fallback succeeded`);
                                return braveResult;
                            } catch (braveError: any) {
                                console.log(`[LangChainToolExecutorService] Brave Search fallback also failed:`, braveError.message);
                                return `I'm unable to search the web right now. Both DuckDuckGo and Brave Search are temporarily unavailable. The search query was: "${parameters.input}". Please try again later.`;
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
     * Execute a tool by name
     */
    async executeTool(toolName: string, parameters: any): Promise<ToolResult> {
        const startTime = Date.now();

        try {
            const toolDef = this.tools.get(toolName);
            if (!toolDef) {
                throw new Error(`Tool not found: ${toolName}`);
            }

            console.log(`[LangChainToolExecutorService] Executing tool: ${toolName}`, parameters);

            // Execute the tool with retry logic for web search
            let result: any;
            if (toolName === 'web_search') {
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
                // Brave Search expects string input
                result = await toolDef.tool.invoke(parameters.input || parameters);
            } else {
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