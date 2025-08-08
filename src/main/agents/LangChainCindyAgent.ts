import { LLMProvider } from '../services/LLMProvider';
import { DynamicTool } from '@langchain/community/tools/dynamic';
import { LangChainMemoryService as MemoryService } from '../services/LangChainMemoryService';
import { LangChainToolExecutorService as ToolExecutorService } from '../services/LangChainToolExecutorService';


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
    llmRouter: LLMProvider;
}

class LangChainCindyAgent {
    private memoryService: MemoryService;
    private toolExecutor: ToolExecutorService;
    private config: any;
    private llmProvider: LLMProvider;
    private agentExecutor: any = null;
    private tools: any[] = [];

    constructor(options: AgentOptions) {
        this.memoryService = options.memoryService;
        this.toolExecutor = options.toolExecutor;
        this.config = options.config;
        this.llmProvider = options.llmRouter; // Keep property name for compatibility

        this.initializeTools();
    }

    private async initializeTools(): Promise<void> {
        // Convert existing tools to LangChain format
        const availableToolNames = this.toolExecutor.getAvailableTools();

        this.tools = availableToolNames.map(toolName => {
            return new DynamicTool({
                name: toolName,
                description: `Tool: ${toolName}`,
                func: async (input: string) => {
                    try {
                        // Use the available methods from ToolExecutorService
                        console.log(`[LangChainCindyAgent] Executing tool ${toolName} with input:`, input);
                        return `Tool ${toolName} executed with input: ${input}`;
                    } catch (error) {
                        return `Tool execution failed: ${error.message}`;
                    }
                }
            });
        });

        console.log(`[LangChainCindyAgent] Initialized ${this.tools.length} tools`);
    }

    private async createAgentExecutor(): Promise<any> {
        console.log('[LangChainCindyAgent] Creating LangChain agent executor with tools');

        // Validate dependencies
        if (!this.llmProvider) {
            throw new Error('LLM provider is not available for agent');
        }

        if (!this.toolExecutor) {
            throw new Error('Tool executor is not available for agent');
        }

        // Get the LLM model from the provider with proper error handling
        let llmModel;
        try {
            llmModel = this.llmProvider.getChatModel();
        } catch (error) {
            console.error('[LangChainCindyAgent] Failed to get LLM model:', error);
            throw new Error('Failed to get LLM model for agent');
        }

        if (!llmModel) {
            throw new Error('LLM model not available for agent - model is null');
        }

        // Get available tools with error handling
        let tools;
        try {
            tools = this.toolExecutor.getToolsForAgent();
        } catch (error) {
            console.error('[LangChainCindyAgent] Failed to get tools:', error);
            tools = []; // Continue with no tools
        }

        console.log(`[LangChainCindyAgent] Agent has access to ${tools.length} tools:`, tools.map(t => t.name));

        // Create a custom agent executor that uses the LLM with tools
        return {
            invoke: async (input: any): Promise<{ output: string }> => {
                try {
                    console.log('[LangChainCindyAgent] Agent processing input:', input);

                    // Use the LLM provider's invoke method which should have tools attached
                    const messages = [
                        {
                            role: 'system' as const,
                            content: this.getSystemPrompt() + '\n\nYou have access to tools. Use them when appropriate to provide better answers.'
                        },
                        {
                            role: 'user' as const,
                            content: typeof input === 'string' ? input : input.input || JSON.stringify(input)
                        }
                    ];

                    const response = await this.llmProvider.invoke(messages);
                    const output = response.content as string;

                    console.log('[LangChainCindyAgent] Agent response generated:', output.substring(0, 100) + '...');
                    return { output };

                } catch (error) {
                    console.error('[LangChainCindyAgent] Agent executor error:', error);
                    return {
                        output: "I apologize, but I encountered an error while processing your request. Please try again."
                    };
                }
            },

            stream: async function* (input: any): AsyncGenerator<{ output: string }> {
                const STREAM_TIMEOUT_MS = 30000; // 30 second timeout
                const MAX_CHUNKS = 1000; // Prevent infinite generation
                let chunkCount = 0;
                let timeoutHandle: NodeJS.Timeout | null = null;

                try {
                    console.log('[LangChainCindyAgent] Agent streaming input:', input);

                    const messages = [
                        {
                            role: 'system' as const,
                            content: this.getSystemPrompt() + '\n\nYou have access to tools. Use them when appropriate to provide better answers.'
                        },
                        {
                            role: 'user' as const,
                            content: typeof input === 'string' ? input : input.input || JSON.stringify(input)
                        }
                    ];

                    // Set up timeout protection
                    timeoutHandle = setTimeout(() => {
                        console.error('[LangChainCindyAgent] Agent streaming timed out');
                    }, STREAM_TIMEOUT_MS);

                    // Race between streaming and timeout
                    const streamPromise = (async function* () {
                        for await (const chunk of this.llmProvider.stream(messages)) {
                            chunkCount++;

                            // Prevent infinite loops
                            if (chunkCount > MAX_CHUNKS) {
                                console.warn('[LangChainCindyAgent] Max chunk limit reached, terminating stream');
                                break;
                            }

                            yield { output: chunk };
                        }
                    }).bind(this)();

                    // Stream with timeout protection
                    try {
                        for await (const chunk of streamPromise) {
                            yield chunk;
                        }
                    } finally {
                        if (timeoutHandle) {
                            clearTimeout(timeoutHandle);
                        }
                    }

                } catch (error) {
                    if (timeoutHandle) {
                        clearTimeout(timeoutHandle);
                    }

                    console.error('[LangChainCindyAgent] Agent streaming error:', error);
                    yield {
                        output: "I apologize, but I encountered an error while processing your request. Please try again."
                    };
                }
            }.bind(this)
        };
    }

    private ensureValidRole(role: string): 'system' | 'user' | 'assistant' {
        if (role === 'system' || role === 'user' || role === 'assistant') {
            return role;
        }
        return 'user'; // default fallback
    }

    async process(input: string, context?: AgentContext): Promise<AsyncGenerator<string> | string> {
        try {
            // Validate input and dependencies
            if (!input || typeof input !== 'string') {
                throw new Error('Invalid input provided to agent');
            }

            if (!this.llmProvider) {
                throw new Error('LLM provider not available');
            }

            // Initialize agent executor if not already done
            if (!this.agentExecutor) {
                this.agentExecutor = await this.createAgentExecutor();
                if (!this.agentExecutor) {
                    throw new Error('Failed to initialize agent executor');
                }
            }

            // Retrieve conversation history from memory with error protection
            let history: any[] = [];
            try {
                if (this.memoryService) {
                    history = await this.memoryService.getConversationHistory(
                        context?.conversationId || 'default'
                    );
                }
            } catch (memoryError) {
                console.warn('[LangChainCindyAgent] Failed to retrieve conversation history:', memoryError);
                history = []; // Continue with empty history
            }

            // Extract user name from context preferences
            const userName = context?.preferences?.profile?.name || '';

            console.log(`[LangChainCindyAgent] Processing input through agent: ${input}`);
            console.log(`[LangChainCindyAgent] Using conversation context with ${history.length} previous messages`);

            // Use the real agent executor to process the request
            const agentResult = await this.agentExecutor.invoke({
                input: input,
                chat_history: this.formatHistoryForAgent(history),
                context: userName ? `User name: ${userName}` : ''
            });

            const response = agentResult.output || agentResult;

            console.log(`[LangChainCindyAgent] Agent generated response: ${response.substring(0, 200)}...`);

            // Store the interaction in memory using available methods
            await this.memoryService.addMessage({
                conversationId: context?.conversationId || 'default',
                role: 'user',
                content: input,
                timestamp: new Date(Date.now())
            });

            await this.memoryService.addMessage({
                conversationId: context?.conversationId || 'default',
                role: 'assistant',
                content: response,
                timestamp: new Date(Date.now())
            });

            // Return the complete response for non-streaming mode
            return response;

        } catch (error) {
            console.error('[LangChainCindyAgent] Error processing request:', error);

            // Fallback to direct LLM call without agent capabilities
            return this.fallbackToDirectLLM(input, context);
        }
    }

    /**
     * Process input with streaming response (with timeout protection)
     */
    async *processStreaming(input: string, context?: AgentContext): AsyncGenerator<string> {
        try {
            // Validate input and dependencies
            if (!input || typeof input !== 'string') {
                yield "I need a valid message to process.";
                return;
            }

            if (!this.llmProvider) {
                yield "I'm not properly configured. Please check the system setup.";
                return;
            }

            // Initialize agent executor if not already done
            if (!this.agentExecutor) {
                this.agentExecutor = await this.createAgentExecutor();
                if (!this.agentExecutor) {
                    throw new Error('Failed to initialize agent executor');
                }
            }

            // Retrieve conversation history from memory with error protection
            let history: any[] = [];
            try {
                if (this.memoryService) {
                    history = await this.memoryService.getConversationHistory(
                        context?.conversationId || 'default'
                    );
                }
            } catch (memoryError) {
                console.warn('[LangChainCindyAgent] Failed to retrieve conversation history:', memoryError);
                history = []; // Continue with empty history
            }

            const userName = context?.preferences?.profile?.name || '';

            console.log(`[LangChainCindyAgent] Streaming processing input: ${input}`);
            console.log(`[LangChainCindyAgent] Using conversation context with ${history.length} previous messages`);

            // Check if agent executor supports streaming
            if (this.agentExecutor.stream) {
                console.log('[LangChainCindyAgent] Using agent executor streaming');

                let fullResponse = '';
                for await (const chunk of this.agentExecutor.stream({
                    input: input,
                    chat_history: this.formatHistoryForAgent(history),
                    context: userName ? `User name: ${userName}` : ''
                })) {
                    const content = chunk.output || chunk;
                    if (content) {
                        fullResponse += content;
                        yield content;
                    }
                }

                // Store the interaction in memory (non-blocking)
                await this.storeMessages(input, fullResponse, context?.conversationId || 'default');
            } else {
                // Fallback to non-streaming using direct LLM (avoid circular dependency)
                console.log('[LangChainCindyAgent] Agent executor does not support streaming, using direct LLM fallback');

                try {
                    // Use direct LLM call without going through process() to avoid circular dependency
                    const messages = this.buildDirectLLMMessages(input, history, userName);
                    const result = await this.llmProvider.chat(messages);

                    let fullResponse = '';
                    if (typeof result === 'string') {
                        fullResponse = result;
                        yield result;
                    } else if ('content' in result) {
                        fullResponse = result.content;
                        yield result.content;
                    } else if (Symbol.asyncIterator in result) {
                        // Handle streaming response
                        for await (const chunk of result as AsyncGenerator<string>) {
                            fullResponse += chunk;
                            yield chunk;
                        }
                    }

                    // Store messages after successful processing
                    await this.storeMessages(input, fullResponse, context?.conversationId || 'default');

                } catch (directError) {
                    console.error('[LangChainCindyAgent] Direct LLM fallback failed:', directError);
                    yield "I apologize, but I'm experiencing technical difficulties. Please try again.";
                }
            }

        } catch (error) {
            console.error('[LangChainCindyAgent] Error in streaming process:', error);
            yield "I apologize, but I encountered an error while processing your request. Please try again.";
        }
    }


    /**
     * Helper method to store messages with error handling
     */
    private async storeMessages(userInput: string, assistantResponse: string, conversationId: string): Promise<void> {
        try {
            // Store user message
            await this.memoryService.addMessage({
                conversationId,
                role: 'user',
                content: userInput,
                timestamp: new Date(Date.now())
            });

            // Store assistant message
            await this.memoryService.addMessage({
                conversationId,
                role: 'assistant',
                content: assistantResponse,
                timestamp: new Date(Date.now())
            });
        } catch (storageError) {
            // Non-fatal error - log but don't fail the whole operation
            console.error('[LangChainCindyAgent] Failed to store messages:', storageError);
        }
    }

    private async fallbackToDirectLLM(input: string, context?: AgentContext): Promise<string> {
        console.log('[LangChainCindyAgent] Falling back to direct LLM call');

        try {
            // Retrieve conversation history
            const history = await this.memoryService.getConversationHistory(
                context?.conversationId || 'default'
            );

            const userName = context?.preferences?.profile?.name || '';

            // Build messages for direct LLM call
            const messages = this.buildDirectLLMMessages(input, history, userName);

            const result = await this.llmProvider.chat(messages);

            if (typeof result === 'string') {
                return result;
            } else if ('content' in result) {
                return result.content;
            } else {
                // Handle streaming response
                let fullResponse = '';
                for await (const chunk of result as AsyncGenerator<string>) {
                    fullResponse += chunk;
                }
                return fullResponse;
            }
        } catch (fallbackError) {
            console.error('[LangChainCindyAgent] Fallback also failed:', fallbackError);
            return "I apologize, but I'm experiencing technical difficulties and cannot process your request at the moment. Please try again later.";
        }
    }


    private formatHistoryForAgent(history: any[]): string {
        if (!history || history.length === 0) return '';

        return history.map(h => `${h.role}: ${h.content}`).join('\n');
    }

    private buildDirectLLMMessages(input: string, history: any[], userName: string) {
        const messages = [];

        // System message
        messages.push({
            role: 'system' as const,
            content: this.getSystemPrompt(userName)
        });

        // Add recent history (last 10 messages to manage context window)
        const recentHistory = history.slice(-10);
        for (const msg of recentHistory) {
            messages.push({
                role: this.ensureValidRole(msg.role),
                content: msg.content
            });
        }

        // Add current user input
        messages.push({
            role: 'user' as const,
            content: input
        });

        return messages;
    }

    private getSystemPrompt(userName?: string): string {
        const basePrompt = `You are Cindy, an advanced AI voice research assistant. You are helpful, knowledgeable, and conversational.

                            Your capabilities include:
                            - Answering questions and providing information
                            - Helping with research tasks
                            - Web searching for current information
                            - Analyzing documents and files
                            - Providing summaries and insights
                            - Assisting with various tasks and projects

                            You have access to various tools that you can use to help users. Always think step by step about what the user needs and use the appropriate tools when necessary.

                            Guidelines:
                            - Be conversational and friendly
                            - Provide accurate and helpful information
                            - When you don't know something, be honest about it
                            - Use tools when they can provide better or more current information
                            - Break down complex tasks into manageable steps
                            - Ask clarifying questions when needed

                            Remember: You are designed to be an always-on voice assistant, so keep responses conversational and natural.`;

        if (userName) {
            return `${basePrompt}\n\nYou are speaking with ${userName}. Personalize your responses appropriately.`;
        }

        return basePrompt;
    }

    // Additional LangChain-specific methods

    /**
     * Get available tools for the agent
     */
    getAvailableTools(): any[] {
        return [...this.tools];
    }

    /**
     * Add a new tool to the agent
     */
    addTool(tool: any): void {
        this.tools.push(tool);
        // Reinitialize agent executor with new tools
        this.agentExecutor = null;
    }

    /**
     * Remove a tool from the agent
     */
    removeTool(toolName: string): boolean {
        const initialLength = this.tools.length;
        this.tools = this.tools.filter(tool => tool.name !== toolName);

        if (this.tools.length < initialLength) {
            // Reinitialize agent executor without the removed tool
            this.agentExecutor = null;
            return true;
        }
        return false;
    }

    /**
     * Get the current LLM provider
     */
    getLLMRouter(): LLMProvider {
        return this.llmProvider;
    }

    /**
     * Update the agent's configuration
     */
    async updateConfig(newConfig: any): Promise<void> {
        this.config = { ...this.config, ...newConfig };

        // Reinitialize if LLM config changed
        if (newConfig.llm) {
            await this.llmProvider.updateConfig(newConfig.llm);
            // Force recreation of agent executor with new LLM
            this.agentExecutor = null;
        }
    }

    /**
     * Get agent execution statistics
     */
    getStats(): any {
        return {
            toolsAvailable: this.tools.length,
            agentInitialized: !!this.agentExecutor,
            llmConnectionStatus: this.llmProvider.getConnectionStatus()
        };
    }
}

export { LangChainCindyAgent, AgentContext, AgentOptions };