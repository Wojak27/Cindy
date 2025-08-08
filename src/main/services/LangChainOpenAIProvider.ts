import { ChatOpenAI } from '@langchain/openai';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

interface OpenAIConfig {
    model: string;
    apiKey: string;
    organizationId?: string;
    temperature: number;
    maxTokens: number;
}

class LangChainOpenAIProvider {
    private chatModel: ChatOpenAI | null = null;
    private config: OpenAIConfig;

    constructor(config: OpenAIConfig) {
        this.config = config;
        this.initializeClient();
    }

    private initializeClient(): void {
        if (!this.config.apiKey) {
            console.warn('OpenAI API key not provided. OpenAI functionality will be disabled.');
            this.chatModel = null;
            return;
        }

        try {
            this.chatModel = new ChatOpenAI({
                modelName: this.config.model,
                openAIApiKey: this.config.apiKey,
                temperature: this.config.temperature,
                maxTokens: this.config.maxTokens,
                timeout: 60000,
                streaming: true, // Enable streaming by default
                maxRetries: 3, // Built-in retry logic
            });
        } catch (error) {
            console.error('Failed to initialize LangChain OpenAI client:', error);
            this.chatModel = null;
        }
    }

    private convertMessages(messages: ChatCompletionMessageParam[]): BaseMessage[] {
        return messages.map(msg => {
            switch (msg.role) {
                case 'system':
                    return new SystemMessage(msg.content as string);
                case 'user':
                    return new HumanMessage(msg.content as string);
                case 'assistant':
                    return new AIMessage(msg.content as string);
                default:
                    throw new Error(`Unknown message role: ${msg.role}`);
            }
        });
    }

    async chat(
        messages: ChatCompletionMessageParam[],
        options: { streaming?: boolean } = {}
    ): Promise<AsyncGenerator<string> | { content: string; finishReason: string; usage?: any }> {
        if (!this.chatModel) {
            throw new Error('LangChain OpenAI client not initialized');
        }

        const streaming = options.streaming ?? true;
        const langchainMessages = this.convertMessages(messages);

        try {
            if (streaming) {
                return this.streamResponse(langchainMessages);
            } else {
                const response = await this.chatModel.invoke(langchainMessages);
                
                return {
                    content: response.content as string,
                    finishReason: 'stop', // LangChain doesn't expose finish reason directly
                    usage: response.response_metadata?.usage || undefined,
                };
            }
        } catch (error) {
            console.error('LangChain OpenAI API error:', error);
            throw new Error(`LangChain OpenAI API error: ${error}`);
        }
    }

    private async *streamResponse(messages: BaseMessage[]): AsyncGenerator<string> {
        if (!this.chatModel) {
            throw new Error('LangChain OpenAI client not initialized');
        }

        try {
            const stream = await this.chatModel.stream(messages);
            
            for await (const chunk of stream) {
                if (chunk.content) {
                    yield chunk.content as string;
                }
            }
        } catch (error) {
            console.error('LangChain OpenAI streaming error:', error);
            throw new Error(`LangChain OpenAI streaming error: ${error}`);
        }
    }

    async updateConfig(newConfig: Partial<OpenAIConfig>): Promise<void> {
        this.config = { ...this.config, ...newConfig };
        this.initializeClient();
    }

    async testConnection(): Promise<boolean> {
        if (!this.chatModel) {
            return false;
        }

        try {
            // For OpenAI, we'll just check if the API key is set
            // Actually invoking the model is too expensive and slow
            if (!this.config.apiKey || this.config.apiKey.trim() === '') {
                console.log('[LangChainOpenAIProvider] No API key configured');
                return false;
            }
            
            console.log('[LangChainOpenAIProvider] API key is configured, assuming connection is available');
            return true;
        } catch (error) {
            console.error('LangChain OpenAI connection test failed:', error);
            return false;
        }
    }

    async getAvailableModels(): Promise<string[]> {
        // Common OpenAI models - LangChain doesn't provide a direct way to list models
        return [
            'gpt-4',
            'gpt-4-turbo',
            'gpt-4o',
            'gpt-4o-mini',
            'gpt-3.5-turbo',
            'gpt-3.5-turbo-16k',
        ];
    }

    // Additional LangChain specific methods
    
    /**
     * Get token count for messages using LangChain's built-in token counting
     */
    async getNumTokens(messages: ChatCompletionMessageParam[]): Promise<number> {
        if (!this.chatModel) {
            throw new Error('LangChain OpenAI client not initialized');
        }

        try {
            const langchainMessages = this.convertMessages(messages);
            return await this.chatModel.getNumTokens(langchainMessages);
        } catch (error) {
            console.warn('Failed to count tokens, falling back to estimation:', error);
            // Fallback to rough estimation (4 characters per token)
            const totalChars = messages.reduce((sum, msg) => sum + (msg.content as string).length, 0);
            return Math.ceil(totalChars / 4);
        }
    }

    /**
     * Get the underlying LangChain ChatOpenAI instance for advanced usage
     */
    getChatModel(): ChatOpenAI | null {
        return this.chatModel;
    }

    /**
     * Create a new instance with function calling capabilities
     */
    withFunctions(functions: any[]): any {
        if (!this.chatModel) {
            return null;
        }

        return this.chatModel.bind({
            tools: functions
        });
    }
}

export { LangChainOpenAIProvider, OpenAIConfig };