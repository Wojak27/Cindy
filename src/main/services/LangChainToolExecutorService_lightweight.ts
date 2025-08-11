import { EventEmitter } from 'events';
// Completely removed ALL LangChain imports to eliminate hanging
import * as fs from 'fs';
import * as path from 'path';

interface ToolResult {
    success: boolean;
    result?: any;
    error?: string;
    duration?: number;
}

interface SimpleTool {
    name: string;
    description: string;
    parameters: any;
    func: (params: any) => Promise<string>;
}

export class LangChainToolExecutorService extends EventEmitter {
    private tools: Map<string, SimpleTool> = new Map();
    private vectorStore?: any; // DuckDBVectorStore instance passed from main

    constructor(vectorStore?: any) {
        super();
        this.vectorStore = vectorStore;
        console.log('[LangChainToolExecutorService] Created lightweight version without LangChain');
    }

    async initialize(): Promise<void> {
        console.log('[LangChainToolExecutorService] Initializing lightweight version...');
        await this.initializeBuiltInTools();
        console.log('[LangChainToolExecutorService] Lightweight version initialized successfully');
    }

    private async initializeBuiltInTools(): Promise<void> {
        try {
            console.log('[LangChainToolExecutorService] Registering lightweight tools...');
            
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
            });

            // Simple file writer tool
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
                func: async ({ file_path, content, encoding = 'utf8' }: any) => {
                    try {
                        // Ensure directory exists
                        const dir = path.dirname(file_path);
                        if (!fs.existsSync(dir)) {
                            fs.mkdirSync(dir, { recursive: true });
                        }
                        fs.writeFileSync(file_path, content, encoding as BufferEncoding);
                        return `Successfully wrote ${content.length} characters to ${file_path}`;
                    } catch (error) {
                        return `Error writing file: ${(error as Error).message}`;
                    }
                }
            });

            // Simple directory listing tool
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
                func: async ({ path: dirPath, show_hidden = false }: any) => {
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
                        return `Error listing directory: ${(error as Error).message}`;
                    }
                }
            });

            // Simple web search tool (mock implementation for now)
            this.registerTool({
                name: 'web_search',
                description: 'Search the web for information',
                parameters: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: 'Search query' },
                        num_results: { type: 'number', description: 'Number of results', default: 3 }
                    },
                    required: ['query']
                },
                func: async ({ query, num_results = 3 }: any) => {
                    // Mock web search - in a real implementation, you'd call a search API
                    return `Web search results for "${query}":\n\n` +
                           `1. Search Result 1 - This is a mock search result\n` +
                           `2. Search Result 2 - Another mock result\n` +
                           `3. Search Result 3 - Third mock result\n\n` +
                           `Note: This is a placeholder implementation. Real web search would require an API.`;
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
                });
            }

            console.log(`[LangChainToolExecutorService] Registered ${this.tools.size} lightweight tools`);
        } catch (error) {
            console.error('[LangChainToolExecutorService] Error initializing lightweight tools:', error);
        }
    }

    private registerTool(toolDef: SimpleTool): void {
        this.tools.set(toolDef.name, toolDef);
        console.log(`[LangChainToolExecutorService] Registered lightweight tool: ${toolDef.name}`);
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

            console.log(`[LangChainToolExecutorService] Executing lightweight tool: ${toolName}`);
            const result = await toolDef.func(parameters);
            
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

    getToolDefinition(toolName: string): SimpleTool | undefined {
        return this.tools.get(toolName);
    }

    // Compatibility methods for LangChain agent integration
    async invoke(params: { tools: any[], input: string }): Promise<any> {
        // Simple implementation - just return available tools info
        return {
            output: `Available tools: ${this.getAvailableTools().join(', ')}`,
            tools: this.getAvailableTools()
        };
    }

    async stream(params: { tools: any[], input: string }): Promise<any> {
        // Simple implementation for streaming compatibility
        return this.invoke(params);
    }
}