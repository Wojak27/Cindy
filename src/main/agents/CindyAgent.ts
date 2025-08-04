import { LLMRouterService } from '../services/LLMRouterService';
import { MemoryService } from '../services/MemoryService';
import { ToolExecutorService } from '../services/ToolExecutorService';

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

        // Prepare messages for LLM
        const messages = [
            {
                role: 'system' as const,
                content: this.getSystemPrompt()
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
        let buffer = '';

        for await (const chunk of stream) {
            buffer += chunk;

            // Check for tool calls in buffer
            const toolCalls = this.extractToolCalls(buffer);

            if (toolCalls.length > 0) {
                // Execute tools and get results
                for (const toolCall of toolCalls) {
                    try {
                        const result = await this.toolExecutor.execute(
                            toolCall.name,
                            toolCall.parameters
                        );

                        // Add tool result to conversation
                        await this.memoryService.addMessage({
                            conversationId: context?.conversationId || 'default',
                            role: 'tool',
                            content: JSON.stringify(result),
                            toolName: toolCall.name,
                            timestamp: new Date()
                        });
                    } catch (error) {
                        console.error(`Tool execution failed: ${toolCall.name}`, error);
                    }
                }

                // Continue processing with tool results
                const followUp = await this.processToolResults(toolCalls, context);
                yield followUp;
            } else {
                yield chunk;
            }
        }
    }

    private async handleResponse(
        response: string,
        context?: AgentContext
    ): Promise<string> {
        // Check for tool calls in response
        const toolCalls = this.extractToolCalls(response);

        if (toolCalls.length > 0) {
            // Execute tools and get results
            const results = [];

            for (const toolCall of toolCalls) {
                try {
                    const result = await this.toolExecutor.execute(
                        toolCall.name,
                        toolCall.parameters
                    );
                    results.push({ tool: toolCall.name, result });
                } catch (error) {
                    console.error(`Tool execution failed: ${toolCall.name}`, error);
                    let errorMessage = 'Unknown error';
                    if (error instanceof Error) {
                        errorMessage = error.message;
                    } else if (typeof error === 'string') {
                        errorMessage = error;
                    }
                    results.push({ tool: toolCall.name, error: errorMessage });
                }
            }

            // Continue processing with tool results
            return await this.processToolResults(results, context);
        } else {
            // Save response to memory
            await this.memoryService.addMessage({
                conversationId: context?.conversationId || 'default',
                role: 'assistant',
                content: response,
                timestamp: new Date()
            });

            return response;
        }
    }

    private extractToolCalls(text: string): Array<{ name: string, parameters: any }> {
        // Extract tool calls from text using regex or JSON parsing
        // This is a simplified implementation

        const toolCallRegex = /<tool>(.*?)<\/tool>/g;
        const matches = [];
        let match;

        while ((match = toolCallRegex.exec(text)) !== null) {
            try {
                const toolCall = JSON.parse(match[1]);
                matches.push(toolCall);
            } catch (error) {
                console.warn('Failed to parse tool call:', match[1]);
            }
        }

        return matches;
    }

    private async processToolResults(
        results: any[],
        context?: AgentContext
    ): Promise<string> {
        // Process tool results and generate follow-up response
        const toolResults = results.map(r =>
            `Tool: ${r.tool}\nResult: ${JSON.stringify(r.result || r.error)}`
        ).join('\n\n');

        // Get follow-up from LLM
        const messages: { role: 'system' | 'user' | 'assistant', content: string }[] = [
            {
                role: 'system' as const,
                content: this.getSystemPrompt()
            },
            {
                role: 'user' as const,
                content: `Here are the results from the tools I executed:\n\n${toolResults}\n\nPlease provide a final response.`
            }
        ];

        const response = await this.llmRouter.chat(messages, { streaming: false }) as any;

        // Save final response to memory
        await this.memoryService.addMessage({
            conversationId: context?.conversationId || 'default',
            role: 'assistant',
            content: response.content,
            timestamp: new Date()
        });

        return response.content;
    }

    private getSystemPrompt(): string {
        return `You are Cindy, an intelligent voice research assistant. 
Your capabilities include:
1. Voice conversation with users
2. Creating and editing Markdown notes in a vault
3. Performing web research and generating reports with citations
4. Managing schedules and reminders

When you need to use tools, format your response like this:
<tool>{"name": "tool_name", "parameters": {"param1": "value1"}}</tool>

Available tools:
- create_note: Create a new Markdown note
- edit_note: Edit an existing Markdown note
- search_notes: Search for notes in the vault
- web_search: Search the web for information
- web_crawl: Crawl a specific website
- schedule_task: Schedule a research task

Always be helpful, concise, and accurate. When creating research reports, 
include proper citations for your sources.`;
    }

    async updateConfig(newConfig: any): Promise<void> {
        this.config = { ...this.config, ...newConfig };
    }
}

export { CindyAgent };
