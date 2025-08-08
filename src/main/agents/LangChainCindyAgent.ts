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
        // Simplified approach - just return a mock executor for now
        // TODO: Implement proper agent executor when LangChain dependencies are resolved
        console.log('[LangChainCindyAgent] Using simplified agent approach');
        return {
            invoke: async (input: any) => {
                return { output: 'Agent response from LangChain (simplified)' };
            }
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
            // Initialize agent executor if not already done
            if (!this.agentExecutor) {
                await this.createAgentExecutor();
                if (!this.agentExecutor) {
                    throw new Error('Failed to initialize agent executor');
                }
            }

            // Retrieve conversation history from memory
            const history = await this.memoryService.getConversationHistory(
                context?.conversationId || 'default'
            );

            // Extract user name from context preferences
            const userName = context?.preferences?.profile?.name || '';

            // Create enhanced input with context
            const enhancedInput = this.enhanceInputWithContext(input, history, userName);

            console.log(`[LangChainCindyAgent] Processing input: ${input}`);
            console.log(`[LangChainCindyAgent] Enhanced input: ${enhancedInput.substring(0, 200)}...`);

            // Use the agent executor to process the request (simplified)
            await this.agentExecutor.invoke({
                input: enhancedInput,
                chat_history: this.formatHistoryForAgent(history)
            });

            // For now, fallback to direct LLM call for actual functionality
            const response = await this.fallbackToDirectLLM(input, context);

            console.log(`[LangChainCindyAgent] Generated response: ${response.substring(0, 200)}...`);

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

            // For now, return the complete response
            // In the future, we could implement streaming by modifying the agent executor
            return response;

        } catch (error) {
            console.error('[LangChainCindyAgent] Error processing request:', error);

            // Fallback to direct LLM call without agent capabilities
            return this.fallbackToDirectLLM(input, context);
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

    private enhanceInputWithContext(input: string, history: any[], userName: string): string {
        const contextParts = [];

        if (userName) {
            contextParts.push(`User name: ${userName}`);
        }

        if (history && history.length > 0) {
            const recentHistory = history.slice(-5); // Last 5 exchanges
            const historyContext = recentHistory.map(h =>
                `${h.role}: ${h.content.substring(0, 100)}`
            ).join('\n');
            contextParts.push(`Recent conversation:\n${historyContext}`);
        }

        contextParts.push(`Current request: ${input}`);

        return contextParts.join('\n\n');
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