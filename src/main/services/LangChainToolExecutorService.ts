import { EventEmitter } from 'events';
import { Tool } from '@langchain/core/tools';

// Try to import web search tools if available (with dependencies)
let DuckDuckGoSearch: any = null;
let WikipediaQueryRun: any = null;
let SerpAPI: any = null;

try {
    const { DuckDuckGoSearch: DDGSearch } = require('@langchain/community/tools/duckduckgo_search');
    DuckDuckGoSearch = DDGSearch;
} catch (e) {
    console.log('[LangChainToolExecutorService] DuckDuckGo search not available - missing duck-duck-scrape dependency');
}

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
        if (DuckDuckGoSearch) {
            try {
                const duckDuckGoSearch = new DuckDuckGoSearch({ maxResults: 5 });
                this.registerTool({
                    name: 'web_search',
                    description: 'Search the web using DuckDuckGo',
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
        } else {
            console.log('[LangChainToolExecutorService] DuckDuckGo search unavailable (missing duck-duck-scrape dependency)');
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

            // Execute the tool using LangChain's invoke method
            const result = await toolDef.tool.invoke(parameters);
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