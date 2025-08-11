import { EventEmitter } from 'events';
import { DynamicStructuredTool } from '@langchain/community/tools/dynamic';
import { Tool } from '@langchain/core/tools';
// import { Calculator } from '@langchain/community/tools/calculator';
// import { SerpAPI } from '@langchain/community/tools/serpapi';
import { z } from 'zod';
// import { LangChainVectorStoreService } from './LangChainVectorStoreService'; // Removed - using DuckDBVectorStore instead
import * as fs from 'fs';
import * as path from 'path';
// import axios from 'axios'; // Removed - unused

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
        // vectorStore parameter kept for compatibility but not used in this implementation
        // Don't call async initialization in constructor
        console.log('[LangChainToolExecutorService] Created, awaiting initialization');
    }

    async initialize(): Promise<void> {
        await this.initializeBuiltInTools();
        console.log('[LangChainToolExecutorService] Initialized with LangChain tools');
    }

    private async initializeBuiltInTools(): Promise<void> {
        try {
            console.log('[LangChainToolExecutorService] Starting tool initialization with minimal set...');
            
            // Temporarily disable web search tool as it might be causing hanging
            // this.registerTool({
            //     name: 'web_search',
            //     description: 'Search the web for current information',
            //     parameters: {
            //         type: 'object',
            //         properties: {
            //             query: { type: 'string', description: 'Search query' },
            //             num_results: { type: 'number', description: 'Number of results to return (max 5)', default: 3 }
            //         },
            //         required: ['query']
            //     },
            //     tool: this.createWebSearchTool()
            // });

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

            // Temporarily disable all complex tools to isolate hanging issue
            // Vector store search tool (RAG) - DISABLED
            // HTTP request tool - DISABLED  
            // Directory listing tool - DISABLED

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

}

export { ToolResult, ToolDefinition };