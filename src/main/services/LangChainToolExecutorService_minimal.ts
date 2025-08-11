import { EventEmitter } from 'events';
// import { DynamicStructuredTool } from '@langchain/community/tools/dynamic'; // REMOVED - might be causing hanging
// import { Tool } from '@langchain/core/tools'; // REMOVED - might be causing hanging
import * as fs from 'fs';
// Removed unused imports: z, path, axios

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
    tool: any; // Generic tool interface
}

export class LangChainToolExecutorService extends EventEmitter {
    private tools: Map<string, ToolDefinition> = new Map();
    private vectorStore?: any; // DuckDBVectorStore instance passed from main

    constructor(vectorStore?: any) {
        super();
        this.vectorStore = vectorStore;
        console.log('[LangChainToolExecutorService] Created (minimal version), awaiting initialization');
    }

    async initialize(): Promise<void> {
        console.log('[LangChainToolExecutorService] Initializing minimal version without heavy LangChain tools...');
        await this.initializeBuiltInTools();
        console.log('[LangChainToolExecutorService] Minimal version initialized successfully');
    }

    private async initializeBuiltInTools(): Promise<void> {
        try {
            console.log('[LangChainToolExecutorService] Registering minimal tools without LangChain dependencies...');
            
            // Simple file reader tool (no LangChain dependencies)
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
                tool: {
                    name: 'read_file',
                    description: 'Read contents of a text file',
                    func: async ({ file_path, encoding = 'utf8' }: any) => {
                        try {
                            if (!fs.existsSync(file_path)) {
                                return `Error: File not found: ${file_path}`;
                            }
                            const content = fs.readFileSync(file_path, encoding as BufferEncoding);
                            return `File content (${content.length} characters):\n${content}`;
                        } catch (error) {
                            return `Error reading file: ${(error as Error).message}`;
                        }
                    }
                }
            });

            // Simple vector search tool (if vector store available)
            if (this.vectorStore) {
                this.registerTool({
                    name: 'search_documents',
                    description: 'Search through indexed documents using semantic similarity',
                    parameters: {
                        type: 'object',
                        properties: {
                            query: { type: 'string', description: 'Search query' },
                            limit: { type: 'number', description: 'Maximum number of results', default: 5 }
                        },
                        required: ['query']
                    },
                    tool: {
                        name: 'search_documents',
                        description: 'Search through indexed documents using semantic similarity',
                        func: async ({ query, limit = 5 }: any) => {
                            try {
                                const results = await this.vectorStore!.search(query, {
                                    k: limit,
                                    scoreThreshold: 0.7
                                });
                                
                                if (results.length === 0) {
                                    return 'No relevant documents found for the query.';
                                }
                                
                                return results.map((result: any, index: number) => 
                                    `Result ${index + 1} (Score: ${result.score?.toFixed(3) || 'N/A'}):\n` +
                                    `Source: ${result.source}\n` +
                                    `Content: ${result.content.substring(0, 300)}${result.content.length > 300 ? '...' : ''}\n`
                                ).join('\n---\n');
                            } catch (error) {
                                return `Error searching documents: ${(error as Error).message}`;
                            }
                        }
                    }
                });
            }

            console.log(`[LangChainToolExecutorService] Registered ${this.tools.size} minimal tools`);
        } catch (error) {
            console.error('[LangChainToolExecutorService] Error initializing minimal tools:', error);
        }
    }

    private registerTool(toolDef: ToolDefinition): void {
        this.tools.set(toolDef.name, toolDef);
        console.log(`[LangChainToolExecutorService] Registered tool: ${toolDef.name}`);
    }

    async executeTool(toolName: string, parameters: any): Promise<ToolResult> {
        const startTime = Date.now();
        
        try {
            const toolDef = this.tools.get(toolName);
            if (!toolDef) {
                return {
                    success: false,
                    error: `Tool '${toolName}' not found. Available tools: ${Array.from(this.tools.keys()).join(', ')}`,
                    duration: Date.now() - startTime
                };
            }

            console.log(`[LangChainToolExecutorService] Executing tool: ${toolName}`);
            const result = await toolDef.tool.func(parameters);
            
            return {
                success: true,
                result,
                duration: Date.now() - startTime
            };
        } catch (error) {
            console.error(`[LangChainToolExecutorService] Tool execution error for '${toolName}':`, error);
            return {
                success: false,
                error: (error as Error).message,
                duration: Date.now() - startTime
            };
        }
    }

    getAvailableTools(): string[] {
        return Array.from(this.tools.keys());
    }

    getToolDefinition(toolName: string): ToolDefinition | undefined {
        return this.tools.get(toolName);
    }
}