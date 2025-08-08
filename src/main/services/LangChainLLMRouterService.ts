import { EventEmitter } from 'events';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { LangChainOpenAIProvider, OpenAIConfig } from './LangChainOpenAIProvider';
import { LangChainOllamaProvider, OllamaConfig } from './LangChainOllamaProvider';

interface LLMConfig {
    provider: 'openai' | 'ollama' | 'auto';
    openai: OpenAIConfig;
    ollama: OllamaConfig;
    streaming: boolean;
    timeout: number; // in milliseconds
}

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
    name?: string;
}

interface ChatResponse {
    content: string;
    finishReason: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

class LangChainLLMRouterService extends EventEmitter {
    private openaiProvider: LangChainOpenAIProvider;
    private ollamaProvider: LangChainOllamaProvider;
    private config: LLMConfig;
    private isInitialized: boolean = false;
    private connectionStatus: { openai: boolean; ollama: boolean } = { openai: false, ollama: false };

    constructor(config: LLMConfig) {
        super();
        this.config = config;
        this.openaiProvider = new LangChainOpenAIProvider(this.config.openai);
        this.ollamaProvider = new LangChainOllamaProvider(this.config.ollama);
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            // Test connections to both providers
            await this.testConnections();
            this.isInitialized = true;
            
            console.log('[LangChainLLMRouterService] Initialized with connection status:', this.connectionStatus);
            this.emit('initialized', this.connectionStatus);
        } catch (error) {
            console.error('[LangChainLLMRouterService] Failed to initialize:', error);
            throw error;
        }
    }

    async testConnections(): Promise<{ openai: boolean; ollama: boolean }> {
        console.log('[LangChainLLMRouterService] Testing provider connections...');
        
        // Test connections in parallel
        const [openaiStatus, ollamaStatus] = await Promise.allSettled([
            this.openaiProvider.testConnection(),
            this.ollamaProvider.testConnection()
        ]);

        this.connectionStatus = {
            openai: openaiStatus.status === 'fulfilled' && openaiStatus.value === true,
            ollama: ollamaStatus.status === 'fulfilled' && ollamaStatus.value === true
        };

        console.log('[LangChainLLMRouterService] Connection test results:', this.connectionStatus);
        return this.connectionStatus;
    }

    private convertToProviderFormat(messages: ChatMessage[]): any[] {
        return messages.map(msg => ({
            role: msg.role,
            content: msg.content
        }));
    }

    private determineProvider(): 'openai' | 'ollama' {
        if (this.config.provider === 'openai') {
            if (!this.connectionStatus.openai) {
                throw new Error('OpenAI provider requested but not available');
            }
            return 'openai';
        }
        
        if (this.config.provider === 'ollama') {
            if (!this.connectionStatus.ollama) {
                throw new Error('Ollama provider requested but not available');
            }
            return 'ollama';
        }
        
        // Auto mode - prefer OpenAI if available, fallback to Ollama
        if (this.config.provider === 'auto') {
            if (this.connectionStatus.openai) {
                console.log('[LangChainLLMRouterService] Auto mode: using OpenAI (preferred)');
                return 'openai';
            } else if (this.connectionStatus.ollama) {
                console.log('[LangChainLLMRouterService] Auto mode: falling back to Ollama');
                return 'ollama';
            } else {
                throw new Error('No LLM providers are available');
            }
        }
        
        throw new Error(`Unknown provider configuration: ${this.config.provider}`);
    }

    async chat(messages: ChatMessage[]): Promise<AsyncGenerator<string> | ChatResponse> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const provider = this.determineProvider();
        const convertedMessages = this.convertToProviderFormat(messages);
        const options = { streaming: this.config.streaming };

        try {
            console.log(`[LangChainLLMRouterService] Using ${provider} provider for chat`);
            this.emit('providerSelected', provider);
            
            let result: AsyncGenerator<string> | { content: string; finishReason: string; usage?: any };
            
            if (provider === 'openai') {
                result = await this.openaiProvider.chat(convertedMessages, options);
            } else {
                result = await this.ollamaProvider.chat(convertedMessages, options);
            }

            // If streaming, wrap the generator to emit events
            if (this.config.streaming && Symbol.asyncIterator in (result as any)) {
                return this.wrapStreamingResponse(result as AsyncGenerator<string>, provider);
            } else {
                // Non-streaming response
                const response = result as { content: string; finishReason: string; usage?: any };
                return {
                    content: response.content,
                    finishReason: response.finishReason,
                    usage: response.usage
                };
            }
        } catch (error) {
            console.error(`[LangChainLLMRouterService] Error with ${provider} provider:`, error);
            this.emit('providerError', { provider, error });
            
            // Implement fallback logic for auto mode
            if (this.config.provider === 'auto' && provider === 'openai' && this.connectionStatus.ollama) {
                console.log('[LangChainLLMRouterService] Auto mode: falling back to Ollama after OpenAI error');
                try {
                    const fallbackResult = await this.ollamaProvider.chat(convertedMessages, options);
                    
                    if (this.config.streaming && Symbol.asyncIterator in (fallbackResult as any)) {
                        return this.wrapStreamingResponse(fallbackResult as AsyncGenerator<string>, 'ollama');
                    } else {
                        const response = fallbackResult as { content: string; finishReason: string; usage?: any };
                        return {
                            content: response.content,
                            finishReason: response.finishReason,
                            usage: response.usage
                        };
                    }
                } catch (fallbackError) {
                    console.error('[LangChainLLMRouterService] Fallback to Ollama also failed:', fallbackError);
                    throw new Error(`Both providers failed. OpenAI: ${error.message}, Ollama: ${fallbackError.message}`);
                }
            }
            
            throw error;
        }
    }

    private async *wrapStreamingResponse(stream: AsyncGenerator<string>, provider: string): AsyncGenerator<string> {
        try {
            for await (const chunk of stream) {
                this.emit('streamChunk', { chunk, provider });
                yield chunk;
            }
            this.emit('streamComplete', { provider });
        } catch (error) {
            this.emit('streamError', { error, provider });
            throw error;
        }
    }

    async updateConfig(newConfig: Partial<LLMConfig>): Promise<void> {
        this.config = { ...this.config, ...newConfig };
        
        // Update provider configurations
        if (newConfig.openai) {
            await this.openaiProvider.updateConfig(newConfig.openai);
        }
        
        if (newConfig.ollama) {
            await this.ollamaProvider.updateConfig(newConfig.ollama);
        }
        
        // Re-test connections if providers changed
        if (newConfig.openai || newConfig.ollama) {
            await this.testConnections();
        }
        
        this.emit('configUpdated', this.config);
    }

    async getAvailableModels(): Promise<{ openai: string[]; ollama: string[] }> {
        const [openaiModels, ollamaModels] = await Promise.allSettled([
            this.openaiProvider.getAvailableModels(),
            this.ollamaProvider.getAvailableModels()
        ]);

        return {
            openai: openaiModels.status === 'fulfilled' ? openaiModels.value : [],
            ollama: ollamaModels.status === 'fulfilled' ? ollamaModels.value : []
        };
    }

    getConnectionStatus(): { openai: boolean; ollama: boolean } {
        return { ...this.connectionStatus };
    }

    getConfig(): LLMConfig {
        return { ...this.config };
    }

    // LangChain-specific methods
    
    /**
     * Get token count for messages using the appropriate provider
     */
    async getTokenCount(messages: ChatMessage[]): Promise<number> {
        const provider = this.determineProvider();
        const convertedMessages = this.convertToProviderFormat(messages);
        
        if (provider === 'openai') {
            return await this.openaiProvider.getNumTokens(convertedMessages);
        } else {
            // Ollama doesn't have built-in token counting in LangChain
            // Use a simple estimation (4 characters per token)
            const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
            return Math.ceil(totalChars / 4);
        }
    }

    /**
     * Get the underlying chat model for advanced LangChain operations
     */
    getChatModel(): BaseChatModel | null {
        try {
            const provider = this.determineProvider();
            
            if (provider === 'openai') {
                return this.openaiProvider.getChatModel();
            } else {
                return this.ollamaProvider.getChatModel();
            }
        } catch (error) {
            console.error('Failed to get chat model:', error);
            return null;
        }
    }

    /**
     * Get the current provider instance (for backward compatibility)
     */
    async getCurrentProvider(): Promise<LangChainOpenAIProvider | LangChainOllamaProvider> {
        const providerName = this.determineProvider();
        
        if (providerName === 'openai') {
            return this.openaiProvider;
        } else {
            return this.ollamaProvider;
        }
    }

    /**
     * Create a chat model with function calling capabilities (OpenAI only)
     */
    withFunctions(functions: any[]): BaseChatModel | null {
        if (!this.connectionStatus.openai) {
            console.warn('Function calling requires OpenAI provider');
            return null;
        }
        
        return this.openaiProvider.withFunctions(functions);
    }

    // Ollama-specific methods
    
    /**
     * Pull a model from Ollama repository
     */
    async pullOllamaModel(modelName: string): Promise<boolean> {
        return await this.ollamaProvider.pullModel(modelName);
    }

    /**
     * List models available on the Ollama server
     */
    async listOllamaServerModels(): Promise<string[]> {
        return await this.ollamaProvider.listServerModels();
    }
}

export { LangChainLLMRouterService, LLMConfig, ChatMessage, ChatResponse };