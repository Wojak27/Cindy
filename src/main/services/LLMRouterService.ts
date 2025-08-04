import { EventEmitter } from 'events';
import OpenAIProvider from './OpenAIProvider';
import OllamaProvider from './OllamaProvider';
import { TokenCounter } from '../utils/TokenCounter';

interface LLMConfig {
    provider: 'openai' | 'ollama' | 'auto';
    openai: {
        model: string;
        apiKey: string;
        organizationId?: string;
        temperature: number;
        maxTokens: number;
    };
    ollama: {
        model: string;
        baseUrl: string;
        temperature: number;
    };
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

class LLMRouterService extends EventEmitter {
    private openaiProvider!: OpenAIProvider;
    private ollamaProvider!: OllamaProvider;
    private config: LLMConfig;
    private tokenCounter: TokenCounter;
    private isInitialized: boolean = false;

    constructor(config: LLMConfig) {
        super();
        this.config = config;
        this.tokenCounter = new TokenCounter();
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            this.openaiProvider = new OpenAIProvider(this.config.openai);
            this.ollamaProvider = new OllamaProvider(this.config.ollama);
            this.isInitialized = true;

            this.emit('initialized', {
                provider: this.config.provider,
                openaiAvailable: await this.openaiProvider.testConnection(),
                ollamaAvailable: await this.ollamaProvider.testConnection()
            });
        } catch (error) {
            this.emit('initializationError', error);
            throw error;
        }
    }

    async chat(
        messages: ChatMessage[],
        options?: { streaming?: boolean }
    ): Promise<AsyncGenerator<string> | ChatResponse> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const streaming = options?.streaming ?? this.config.streaming;
        const startTime = Date.now();

        try {
            // Try primary provider first
            if (this.config.provider === 'openai') {
                return await this.chatWithProvider(this.openaiProvider, messages, streaming);
            } else if (this.config.provider === 'ollama') {
                return await this.chatWithProvider(this.ollamaProvider, messages, streaming);
            } else {
                // Auto mode - try online first, fallback to local
                try {
                    return await this.chatWithProvider(this.openaiProvider, messages, streaming);
                } catch (onlineError) {
                    console.warn('OpenAI failed, falling back to Ollama:', onlineError);
                    return await this.chatWithProvider(this.ollamaProvider, messages, streaming);
                }
            }
        } catch (error) {
            const duration = Date.now() - startTime;
            this.emit('chatError', { error, duration });
            throw error;
        }
    }

    private async chatWithProvider(
        provider: OpenAIProvider | OllamaProvider,
        messages: ChatMessage[],
        streaming: boolean
    ): Promise<AsyncGenerator<string> | ChatResponse> {
        const providerName = provider.constructor.name.replace('Provider', '').toLowerCase();
        const startTime = Date.now();

        this.emit('chatStarted', {
            provider: providerName,
            messages,
            timestamp: startTime
        });

        try {
            const result = await provider.chat(messages, { streaming });

            if ('next' in result) {
                // Streaming response
                const streamingWrapper = async function* (this: LLMRouterService) {
                    try {
                        for await (const chunk of result as AsyncGenerator<string>) {
                            yield chunk;
                        }
                    } finally {
                        const duration = Date.now() - startTime;
                        this.emit('chatCompleted', {
                            provider: providerName,
                            duration,
                            tokens: this.tokenCounter.countMessages(messages)
                        });
                    }
                }.bind(this);

                this.emit('chatStreamingStarted', {
                    provider: providerName,
                    timestamp: Date.now()
                });

                return streamingWrapper();
            } else {
                // Non-streaming response
                const duration = Date.now() - startTime;
                this.emit('chatCompleted', {
                    provider: providerName,
                    duration,
                    tokens: this.tokenCounter.countMessages(messages),
                    usage: (result as ChatResponse).usage
                });

                return result;
            }
        } catch (error) {
            const duration = Date.now() - startTime;
            this.emit('chatProviderError', {
                provider: providerName,
                error,
                duration
            });
            throw error;
        }
    }

    async updateConfig(newConfig: Partial<LLMConfig>): Promise<void> {
        this.config = {
            ...this.config,
            ...newConfig,
            openai: { ...this.config.openai, ...(newConfig.openai || {}) },
            ollama: { ...this.config.ollama, ...(newConfig.ollama || {}) }
        };

        if (this.isInitialized) {
            await this.openaiProvider.updateConfig(this.config.openai);
            await this.ollamaProvider.updateConfig(this.config.ollama);
        }

        this.emit('configUpdated', this.config);
    }

    getConfig(): LLMConfig {
        return { ...this.config };
    }

    async getAvailableModels(): Promise<{ openai: string[], ollama: string[] }> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        return {
            openai: await this.openaiProvider.getAvailableModels(),
            ollama: await this.ollamaProvider.getAvailableModels()
        };
    }
}

export { LLMRouterService, LLMConfig, ChatMessage, ChatResponse };