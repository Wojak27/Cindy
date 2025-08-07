import { LLMRouterService } from '../services/LLMRouterService';
import { MemoryService } from '../services/MemoryService';
import { ToolExecutorService } from '../services/ToolExecutorService';
import { toolTokenHandler, ToolCall } from '../services/ToolTokenHandler';

interface AgentContext {
    conversationId: string;
    userId?: string;
    sessionId: string;
    timestamp: Date;
    preferences: any;
}

interface AgentOptions {
    store: any;
    memoryService: MemoryService;
    toolExecutor: ToolExecutorService;
    config: any;
    llmRouter: LLMRouterService;
}

class CindyAgent {
    private memoryService: MemoryService;
    private toolExecutor: ToolExecutorService;
    private config: any;
    private llmRouter: LLMRouterService;

    constructor(options: AgentOptions) {
        this.memoryService = options.memoryService;
        this.toolExecutor = options.toolExecutor;
        this.config = options.config;
        this.llmRouter = options.llmRouter;
    }

    private ensureValidRole(role: string): 'system' | 'user' | 'assistant' {
        if (role === 'system' || role === 'user' || role === 'assistant') {
            return role;
        }
        return 'user'; // default fallback
    }

    async process(input: string, context?: AgentContext): Promise<AsyncGenerator<string> | string> {
        // Retrieve conversation history from memory
        const history = await this.memoryService.getConversationHistory(
            context?.conversationId || 'default'
        );

        // Extract user name from context preferences
        const userName = context?.preferences?.profile?.name || '';

        // Prepare messages for LLM
        const messages = [
            {
                role: 'system' as const,
                content: this.getSystemPrompt(userName)
            },
            ...history.map(msg => ({
                role: this.ensureValidRole(msg.role),
                content: msg.content
            })),
            {
                role: 'user' as const,
                content: input
            }
        ];

        // Process with LLM
        if (this.config.enableStreaming) {
            const stream = await this.llmRouter.chat(messages, { streaming: true }) as AsyncGenerator<string>;

            // Handle streaming response with tool calling
            return this.handleStreamingResponse(stream, context);
        } else {
            const response = await this.llmRouter.chat(messages, { streaming: false }) as any;

            // Handle non-streaming response with tool calling
            return this.handleResponse(response.content, context);
        }
    }

    private async *handleStreamingResponse(
        stream: AsyncGenerator<string>,
        context?: AgentContext
    ): AsyncGenerator<string> {
        const conversationId = context?.conversationId || 'default';
        let accumulatedTools: ToolCall[] = [];
        let fullContent = '';

        // Reset the tool handler for new streaming session
        toolTokenHandler.reset();

        for await (const chunk of stream) {
            // Process chunk through tool token handler
            const processed = toolTokenHandler.processChunk(chunk, conversationId);
            fullContent += chunk;

            // Yield display content immediately (non-tool content)
            if (processed.displayContent) {
                yield processed.displayContent;
            }

            // Handle any complete tool calls found in this chunk
            if (processed.toolCalls.length > 0) {
                for (const toolCall of processed.toolCalls) {
                    console.log(`🤖 CindyAgent: Executing tool during streaming: ${toolCall.name}`);
                    
                    // Execute the tool call with retry configuration
                    const executedTool = await toolTokenHandler.executeToolCall(
                        toolCall,
                        this.toolExecutor.execute.bind(this.toolExecutor),
                        {
                            maxRetries: 3,
                            baseDelay: 1000,
                            exponentialBackoff: true,
                            retryableErrors: ['timeout', 'network', 'rate limit', 'temporary', 'connection', 'ECONNRESET', 'ETIMEDOUT']
                        }
                    );

                    accumulatedTools.push(executedTool);

                    // Add tool execution to memory
                    await this.memoryService.addMessage({
                        conversationId,
                        role: 'tool',
                        content: JSON.stringify({
                            name: executedTool.name,
                            parameters: executedTool.parameters,
                            result: executedTool.result,
                            error: executedTool.error,
                            status: executedTool.status,
                            duration: executedTool.duration
                        }),
                        toolName: executedTool.name,
                        timestamp: new Date()
                    });

                    // Generate and yield follow-up response for this tool
                    const toolResultText = toolTokenHandler.formatToolResults([executedTool]);
                    
                    // Get follow-up from LLM about the tool result
                    const followUpMessages = [
                        {
                            role: 'system' as const,
                            content: this.getSystemPrompt(context?.preferences?.profile?.name || '')
                        },
                        {
                            role: 'user' as const,
                            content: `${toolResultText}\n\nPlease provide a response based on the tool execution result.`
                        }
                    ];

                    const followUpResponse = await this.llmRouter.chat(followUpMessages, { streaming: false }) as any;
                    yield '\n\n' + followUpResponse.content;
                }
            }
        }

        // Handle any incomplete tool blocks (error recovery)
        if (toolTokenHandler.isProcessingTool()) {
            const pending = toolTokenHandler.finalize();
            if (pending) {
                console.warn('🤖 CindyAgent: Incomplete tool block detected:', pending);
                yield '\n\n[Note: An incomplete tool call was detected and could not be executed]';
            }
        }
    }

    private async handleResponse(
        response: string,
        context?: AgentContext
    ): Promise<string> {
        const conversationId = context?.conversationId || 'default';
        
        // Reset tool handler for new response
        toolTokenHandler.reset();
        
        // Process the entire response at once
        const processed = toolTokenHandler.processChunk(response, conversationId);
        
        // If there are tool calls, execute them
        if (processed.toolCalls.length > 0) {
            const executedTools: ToolCall[] = [];
            
            for (const toolCall of processed.toolCalls) {
                console.log(`🤖 CindyAgent: Executing tool: ${toolCall.name}`);
                
                // Execute the tool call with retry configuration
                const executedTool = await toolTokenHandler.executeToolCall(
                    toolCall,
                    this.toolExecutor.execute.bind(this.toolExecutor),
                    {
                        maxRetries: 3,
                        baseDelay: 1000,
                        exponentialBackoff: true,
                        retryableErrors: ['timeout', 'network', 'rate limit', 'temporary', 'connection', 'ECONNRESET', 'ETIMEDOUT']
                    }
                );
                
                executedTools.push(executedTool);
                
                // Add tool execution to memory
                await this.memoryService.addMessage({
                    conversationId,
                    role: 'tool',
                    content: JSON.stringify({
                        name: executedTool.name,
                        parameters: executedTool.parameters,
                        result: executedTool.result,
                        error: executedTool.error,
                        status: executedTool.status,
                        duration: executedTool.duration
                    }),
                    toolName: executedTool.name,
                    timestamp: new Date()
                });
            }
            
            // Format tool results for LLM
            const toolResultText = toolTokenHandler.formatToolResults(executedTools);
            
            // Get follow-up response from LLM
            const followUpMessages = [
                {
                    role: 'system' as const,
                    content: this.getSystemPrompt(context?.userId)
                },
                {
                    role: 'user' as const,
                    content: `${toolResultText}\n\nPlease provide a final response based on the tool execution results.`
                }
            ];
            
            const followUpResponse = await this.llmRouter.chat(followUpMessages, { streaming: false }) as any;
            
            // Save final response to memory
            await this.memoryService.addMessage({
                conversationId,
                role: 'assistant',
                content: followUpResponse.content,
                timestamp: new Date()
            });
            
            // Return display content + follow-up response
            return processed.displayContent + '\n\n' + followUpResponse.content;
        } else {
            // No tool calls, just save and return the response
            await this.memoryService.addMessage({
                conversationId,
                role: 'assistant',
                content: processed.displayContent,
                timestamp: new Date()
            });
            
            return processed.displayContent;
        }
    }

    // Legacy methods removed - now using ToolTokenHandler

    private getSystemPrompt(userName?: string): string {
        const nameIntro = userName ? `You are Cindy, ${userName}'s intelligent voice research assistant with advanced capabilities.` : 'You are Cindy, an intelligent voice research assistant with advanced capabilities.';
        
        return `${nameIntro}

Your tools include:

**Note Management:**
- create_note: Create new Markdown notes in the vault
- edit_note: Edit existing Markdown notes
- search_notes: Search for notes in the vault

**Web Research:**
- web_search: Search the web for information
- web_crawl: Crawl specific websites for content
- browser_open: Open URLs in browser (headless or visible)
- browser_extract: Extract content from web pages
- browser_search: Search for specific terms within web pages

**Citations & Bibliography:**
- cite_article: Extract citation metadata from articles/papers
- create_bibliography: Generate bibliographies from multiple sources

**Calculations & Conversions:**
- calculate: Perform mathematical calculations (supports expressions like "2+2", "sin(pi/2)", etc.)
- unit_convert: Convert between units (length, weight, temperature)

**Knowledge Base & RAG:**
- rag_query: Query the knowledge base for relevant information
- rag_index_document: Index a local document into the knowledge base
- rag_index_webpage: Index a web page into the knowledge base
- rag_index_directory: Index all documents in a directory

**Scheduling:**
- schedule_task: Schedule research tasks and reminders

When you need to use tools, format your response EXACTLY like this:
<tool>{"name": "tool_name", "parameters": {"param1": "value1"}}</tool>

IMPORTANT TOOL FORMATTING RULES:
1. Always use exactly one tool per tool block
2. Ensure the JSON is properly formatted with no trailing characters
3. Do not add backslashes, newlines, or extra text after the closing </tool> tag
4. The JSON must be valid and parseable

Examples:
- <tool>{"name": "calculate", "parameters": {"expression": "25 * 1.08"}}</tool>
- <tool>{"name": "unit_convert", "parameters": {"value": 100, "fromUnit": "fahrenheit", "toUnit": "celsius"}}</tool>
- <tool>{"name": "browser_extract", "parameters": {"url": "https://example.com", "options": {"screenshot": true}}}</tool>
- <tool>{"name": "cite_article", "parameters": {"url": "https://example.com/article", "options": {"format": "apa"}}}</tool>
- <tool>{"name": "rag_query", "parameters": {"query": "What is machine learning?", "options": {"maxResults": 5}}}</tool>
- <tool>{"name": "rag_index_webpage", "parameters": {"url": "https://example.com/article", "options": {"tags": ["AI", "research"]}}}</tool>

Always be helpful, accurate, and provide properly cited sources for research. When performing calculations, show your work. When citing sources, use proper academic formatting. Use the RAG system to enhance your responses with relevant context from the knowledge base.`;
    }

    async updateConfig(newConfig: any): Promise<void> {
        this.config = { ...this.config, ...newConfig };
    }
}

export { CindyAgent };
