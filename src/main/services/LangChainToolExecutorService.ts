import { EventEmitter } from 'events';
import { DynamicStructuredTool } from '@langchain/community/tools/dynamic';
import { Tool } from '@langchain/core/tools';
// import { Calculator } from '@langchain/community/tools/calculator';
// import { SerpAPI } from '@langchain/community/tools/serpapi';
import { z } from 'zod';
import { LangChainVectorStoreService } from './LangChainVectorStoreService';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

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
    private vectorStore?: LangChainVectorStoreService;

    constructor(vectorStore?: LangChainVectorStoreService) {
        super();
        this.vectorStore = vectorStore;
        // Don't call async initialization in constructor
        console.log('[LangChainToolExecutorService] Created, awaiting initialization');
    }

    async initialize(): Promise<void> {
        await this.initializeBuiltInTools();
        console.log('[LangChainToolExecutorService] Initialized with LangChain tools');
    }

    private async initializeBuiltInTools(): Promise<void> {
        try {
            // Calculator tool - temporarily disabled to fix memory issue
            // this.registerTool({
            //     name: 'calculator',
            //     description: 'Perform mathematical calculations and evaluate expressions',
            //     parameters: {
            //         type: 'object',
            //         properties: {
            //             expression: { type: 'string', description: 'Mathematical expression to evaluate' }
            //         },
            //         required: ['expression']
            //     },
            //     tool: new Calculator() as any // Type assertion to bypass complex schema issues
            // });

            // Web search tool using a simple web search approach
            this.registerTool({
                name: 'web_search',
                description: 'Search the web for current information',
                parameters: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'Search query' },
                        num_results: { type: 'number', description: 'Number of results to return (max 5)', default: 3 }
                    },
                    required: ['query']
                },
                tool: this.createWebSearchTool()
            });

            // File reader tool
            this.registerTool({
                name: 'read_file',
                description: 'Read contents of a text file',
                parameters: {
                    type: 'object',
                    properties: {
                        file_path: { type: 'string', description: 'Path to the file to read' },
                        encoding: { type: 'string', description: 'File encoding', default: 'utf8' }
                    },
                    required: ['file_path']
                },
                tool: new DynamicStructuredTool({
                    name: 'read_file',
                    description: 'Read contents of a text file',
                    schema: z.object({
                        file_path: z.string().describe('Path to the file to read'),
                        encoding: z.string().default('utf8').describe('File encoding')
                    }),
                    func: async ({ file_path, encoding }: any) => {
                        try {
                            if (!fs.existsSync(file_path)) {
                                return `Error: File not found: ${file_path}`;
                            }
                            const content = fs.readFileSync(file_path, encoding as BufferEncoding);
                            return `File content (${content.length} characters):\n${content}`;
                        } catch (error) {
                            return `Error reading file: ${error.message}`;
                        }
                    }
                }) as any
            });

            // File writer tool
            this.registerTool({
                name: 'write_file',
                description: 'Write content to a text file',
                parameters: {
                    type: 'object',
                    properties: {
                        file_path: { type: 'string', description: 'Path to the file to write' },
                        content: { type: 'string', description: 'Content to write to the file' },
                        encoding: { type: 'string', description: 'File encoding', default: 'utf8' }
                    },
                    required: ['file_path', 'content']
                },
                tool: new DynamicStructuredTool({
                    name: 'write_file',
                    description: 'Write content to a text file',
                    schema: z.object({
                        file_path: z.string().describe('Path to the file to write'),
                        content: z.string().describe('Content to write to the file'),
                        encoding: z.string().default('utf8').describe('File encoding')
                    }),
                    func: async ({ file_path, content, encoding }: any) => {
                        try {
                            // Ensure directory exists
                            const dir = path.dirname(file_path);
                            if (!fs.existsSync(dir)) {
                                fs.mkdirSync(dir, { recursive: true });
                            }
                            fs.writeFileSync(file_path, content, encoding as BufferEncoding);
                            return `Successfully wrote ${content.length} characters to ${file_path}`;
                        } catch (error) {
                            return `Error writing file: ${error.message}`;
                        }
                    }
                }) as any
            });

            // Vector store search tool (RAG)
            if (this.vectorStore) {
                this.registerTool({
                    name: 'search_documents',
                    description: 'Search through indexed documents using semantic similarity',
                    parameters: {
                        type: 'object',
                        properties: {
                            query: { type: 'string', description: 'Search query' },
                            limit: { type: 'number', description: 'Maximum number of results', default: 5 },
                            score_threshold: { type: 'number', description: 'Minimum similarity score', default: 0.7 }
                        },
                        required: ['query']
                    },
                    tool: new DynamicStructuredTool({
                        name: 'search_documents',
                        description: 'Search through indexed documents using semantic similarity',
                        schema: z.object({
                            query: z.string().describe('Search query'),
                            limit: z.number().default(5).describe('Maximum number of results'),
                            score_threshold: z.number().default(0.7).describe('Minimum similarity score')
                        }),
                        func: async ({ query, limit, score_threshold }: any) => {
                            try {
                                const results = await this.vectorStore!.search(query, {
                                    k: limit,
                                    scoreThreshold: score_threshold
                                });
                                
                                if (results.length === 0) {
                                    return 'No relevant documents found for the query.';
                                }
                                
                                return results.map((result, index) => 
                                    `Result ${index + 1} (Score: ${result.score.toFixed(3)}):\n` +
                                    `Source: ${result.source}\n` +
                                    `Content: ${result.content.substring(0, 300)}${result.content.length > 300 ? '...' : ''}\n`
                                ).join('\n---\n');
                            } catch (error) {
                                return `Error searching documents: ${error.message}`;
                            }
                        }
                    }) as any
                });
            }

            // HTTP request tool
            this.registerTool({
                name: 'http_request',
                description: 'Make HTTP requests to web APIs',
                parameters: {
                    type: 'object',
                    properties: {
                        url: { type: 'string', description: 'URL to make request to' },
                        method: { type: 'string', description: 'HTTP method', default: 'GET' },
                        headers: { type: 'object', description: 'HTTP headers' },
                        data: { type: 'object', description: 'Request body data' }
                    },
                    required: ['url']
                },
                tool: new DynamicStructuredTool({
                    name: 'http_request',
                    description: 'Make HTTP requests to web APIs',
                    schema: z.object({
                        url: z.string().describe('URL to make request to'),
                        method: z.string().default('GET').describe('HTTP method'),
                        headers: z.record(z.string()).optional().describe('HTTP headers'),
                        data: z.record(z.any()).optional().describe('Request body data')
                    }),
                    func: async ({ url, method, headers, data }: any) => {
                        try {
                            const response = await axios({
                                url,
                                method: method as any,
                                headers,
                                data,
                                timeout: 10000,
                                maxRedirects: 5
                            });
                            
                            return {
                                status: response.status,
                                statusText: response.statusText,
                                headers: response.headers,
                                data: response.data
                            };
                        } catch (error) {
                            return `HTTP request failed: ${error.message}`;
                        }
                    }
                }) as any
            });

            // Directory listing tool
            this.registerTool({
                name: 'list_directory',
                description: 'List contents of a directory',
                parameters: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'Directory path to list' },
                        show_hidden: { type: 'boolean', description: 'Show hidden files', default: false }
                    },
                    required: ['path']
                },
                tool: new DynamicStructuredTool({
                    name: 'list_directory',
                    description: 'List contents of a directory',
                    schema: z.object({
                        path: z.string().describe('Directory path to list'),
                        show_hidden: z.boolean().default(false).describe('Show hidden files')
                    }),
                    func: async ({ path: dirPath, show_hidden }: any) => {
                        try {
                            if (!fs.existsSync(dirPath)) {
                                return `Error: Directory not found: ${dirPath}`;
                            }
                            
                            const stat = fs.statSync(dirPath);
                            if (!stat.isDirectory()) {
                                return `Error: Path is not a directory: ${dirPath}`;
                            }
                            
                            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                            const items = entries
                                .filter(entry => show_hidden || !entry.name.startsWith('.'))
                                .map(entry => {
                                    const fullPath = path.join(dirPath, entry.name);
                                    const stat = fs.statSync(fullPath);
                                    return {
                                        name: entry.name,
                                        type: entry.isDirectory() ? 'directory' : 'file',
                                        size: entry.isFile() ? stat.size : undefined,
                                        modified: stat.mtime.toISOString()
                                    };
                                });
                            
                            return `Directory: ${dirPath}\n` +
                                   `Items: ${items.length}\n\n` +
                                   items.map(item => 
                                       `${item.type === 'directory' ? '📁' : '📄'} ${item.name}` +
                                       (item.size ? ` (${item.size} bytes)` : '') +
                                       ` - Modified: ${item.modified}`
                                   ).join('\n');
                        } catch (error) {
                            return `Error listing directory: ${error.message}`;
                        }
                    }
                }) as any
            });

            console.log(`[LangChainToolExecutorService] Registered ${this.tools.size} built-in tools`);
        } catch (error) {
            console.error('[LangChainToolExecutorService] Error initializing tools:', error);
        }
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

            // Execute the tool
            const result = await toolDef.tool.call(parameters);
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
        } catch (error) {
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
        } catch (error) {
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
        // Note: This is a simplified version. In a real implementation,
        // you'd track execution counts per tool
        return {
            totalTools: this.tools.size,
            toolNames: this.getAvailableTools(),
            executionCount: 0 // Would need to track this
        };
    }

    /**
     * Create a custom tool dynamically
     */
    createCustomTool(options: {
        name: string;
        description: string;
        schema: z.ZodSchema;
        func: (args: any) => Promise<string>;
    }): void {
        const tool = new DynamicStructuredTool({
            name: options.name,
            description: options.description,
            schema: options.schema,
            func: options.func
        });

        this.registerTool({
            name: options.name,
            description: options.description,
            parameters: {
                type: 'object',
                properties: {}, // Schema details would be extracted from zod schema
                required: []
            },
            tool: tool as any
        });
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
        // Tools are already initialized in the constructor
        console.log('[LangChainToolExecutorService] Tools already initialized');
    }

    /**
     * Execute a tool (alias for backward compatibility)
     */
    async execute(toolName: string, parameters: any): Promise<ToolResult> {
        return await this.executeTool(toolName, parameters);
    }

    /**
     * Get RAG tool (for backward compatibility)
     */
    get ragTool() {
        return {
            name: 'search_documents',
            description: 'Search through indexed documents using semantic similarity',
            execute: (query: string, options?: any) => this.executeTool('search_documents', { query, ...options })
        };
    }

    private createWebSearchTool(): any {
        return new DynamicStructuredTool({
            name: 'web_search',
            description: 'Search the web for current information',
            schema: z.object({
                query: z.string().describe('Search query'),
                num_results: z.number().optional().describe('Number of results to return (max 5)')
            }),
            func: async (params: any) => {
                const { query, num_results = 3 } = params;
                try {
                    console.log(`[WebSearchTool] Searching for: ${query}`);
                    
                    // Use DuckDuckGo search API (no API key required)
                    const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
                    const response = await axios.get(searchUrl, { timeout: 10000 });
                    
                    if (response.data && response.data.AbstractText) {
                        const result = {
                            query: query,
                            answer: response.data.AbstractText,
                            source: response.data.AbstractURL || 'DuckDuckGo',
                            related_topics: response.data.RelatedTopics?.slice(0, num_results).map((topic: any) => ({
                                text: topic.Text,
                                url: topic.FirstURL
                            })) || []
                        };
                        
                        console.log(`[WebSearchTool] Found answer for "${query}"`);
                        return JSON.stringify(result, null, 2);
                    }
                    
                    // Fallback to explaining search limitations
                    return `I searched for "${query}" but couldn't find specific current information. Here's what I can tell you based on my training data up to April 2024, and I recommend checking recent sources for the most up-to-date information.`;
                    
                } catch (error) {
                    console.error(`[WebSearchTool] Error searching for "${query}":`, error);
                    return `I encountered an error while searching for "${query}". I can provide information based on my training data up to April 2024, but for the most current information, I recommend checking recent online sources directly.`;
                }
            }
        });
    }
}

export { ToolResult, ToolDefinition };