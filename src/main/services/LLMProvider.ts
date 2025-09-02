import { EventEmitter } from 'events';
import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/ollama';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatCohere } from '@langchain/cohere';
import { ChatGroq } from '@langchain/groq';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { wrapSDK } from "langsmith/wrappers";
import axios from 'axios';

interface LLMConfig {
    provider: 'openai' | 'ollama' | 'anthropic' | 'google' | 'cohere' | 'azure' | 'huggingface' | 'openrouter' | 'groq' | 'auto';
    openai?: {
        model: string;
        apiKey: string;
        organizationId?: string;
        temperature: number;
        maxTokens: number;
    };
    ollama?: {
        model: string;
        baseUrl: string;
        temperature: number;
    };
    anthropic?: {
        model: string;
        apiKey: string;
        temperature: number;
        maxTokens: number;
    };
    google?: {
        model: string;
        apiKey: string;
        temperature: number;
        maxOutputTokens: number;
    };
    cohere?: {
        model: string;
        apiKey: string;
        temperature: number;
    };
    azure?: {
        deploymentName: string;
        apiKey: string;
        apiVersion: string;
        instanceName: string;
        temperature: number;
        maxTokens: number;
    };
    huggingface?: {
        model: string;
        apiKey: string;
        temperature: number;
        maxTokens: number;
        endpoint?: string;
    };
    openrouter?: {
        model: string;
        apiKey: string;
        temperature: number;
        maxTokens: number;
        siteUrl?: string;
        appName?: string;
    };
    groq?: {
        model: string;
        apiKey: string;
        temperature: number;
        maxTokens: number;
    };
    streaming: boolean;
    timeout: number;
}

interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
    name?: string;
}

interface InvokeOptions {
    streaming?: boolean;
    signal?: AbortSignal;
}

/**
 * Unified LLM Provider Service
 * 
 * This service provides a single interface for interacting with multiple LLM providers
 * using LangChain's standardized invoke pattern. It supports OpenAI, Ollama, Anthropic,
 * Google Gemini, Cohere, Azure OpenAI, HuggingFace, OpenRouter, and Groq, with automatic fallback capabilities.
 * 
 * Key features:
 * - Unified invoke() and stream() methods for all providers
 * - Automatic provider selection and fallback
 * - Consistent message format using LangChain's BaseMessage types
 * - Built-in connection testing and error handling
 * 
 * Supported providers:
 * - OpenAI (GPT-4, GPT-3.5)
 * - Anthropic (Claude 3)
 * - Google (Gemini Pro)
 * - Cohere (Command)
 * - Ollama (Local models)
 * - Azure OpenAI
 * - HuggingFace Inference API
 * - OpenRouter (Access to 100+ models)
 * - Groq (Ultra-fast inference)
 */
export class LLMProvider extends EventEmitter {
    private config: LLMConfig;
    private model: BaseChatModel | null = null;
    private currentProvider: string | null = null;
    private connectionStatus: Record<string, boolean> = {};
    private isInitialized: boolean = false;

    constructor(config: LLMConfig) {
        super();
        this.config = this.normalizeConfig(config);
    }

    private normalizeConfig(config: LLMConfig): LLMConfig {
        // Normalize Ollama baseUrl to use 127.0.0.1 instead of localhost for IPv4
        if (config.ollama?.baseUrl) {
            config.ollama.baseUrl = config.ollama.baseUrl.replace('localhost', '127.0.0.1');
        }
        return config;
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            // Test connections to determine available providers
            await this.testConnections();

            // Create the model based on available providers
            this.model = wrapSDK(this.createModel());

            if (!this.model) {
                throw new Error('No LLM providers are available');
            }

            this.isInitialized = true;
            console.log('[LLMProvider] Initialized with provider:', this.currentProvider);
            this.emit('initialized', { provider: this.currentProvider, connectionStatus: this.connectionStatus });
        } catch (error) {
            console.error('[LLMProvider] Failed to initialize:', error);
            throw error;
        }
    }

    private async testConnections(): Promise<void> {
        console.log('[LLMProvider] Testing provider connections...');

        // Test OpenAI connection
        if (this.config.openai?.apiKey && this.config.openai.apiKey.trim() !== '') {
            this.connectionStatus.openai = true;
            console.log('[LLMProvider] OpenAI API key is configured');
        }

        // Test Anthropic connection
        if (this.config.anthropic?.apiKey && this.config.anthropic.apiKey.trim() !== '') {
            this.connectionStatus.anthropic = true;
            console.log('[LLMProvider] Anthropic API key is configured');
        }

        // Test Google connection
        if (this.config.google?.apiKey && this.config.google.apiKey.trim() !== '') {
            this.connectionStatus.google = true;
            console.log('[LLMProvider] Google API key is configured');
        }

        // Test Cohere connection
        if (this.config.cohere?.apiKey && this.config.cohere.apiKey.trim() !== '') {
            this.connectionStatus.cohere = true;
            console.log('[LLMProvider] Cohere API key is configured');
        }

        // Test Azure connection
        if (this.config.azure?.apiKey && this.config.azure.apiKey.trim() !== '') {
            this.connectionStatus.azure = true;
            console.log('[LLMProvider] Azure API key is configured');
        }

        // Test HuggingFace connection
        if (this.config.huggingface?.apiKey && this.config.huggingface.apiKey.trim() !== '') {
            this.connectionStatus.huggingface = true;
            console.log('[LLMProvider] HuggingFace API key is configured');
        }

        // Test OpenRouter connection
        if (this.config.openrouter?.apiKey && this.config.openrouter.apiKey.trim() !== '') {
            this.connectionStatus.openrouter = true;
            console.log('[LLMProvider] OpenRouter API key is configured');
        }

        // Test Groq connection
        if (this.config.groq?.apiKey && this.config.groq.apiKey.trim() !== '') {
            this.connectionStatus.groq = true;
            console.log('[LLMProvider] Groq API key is configured');
        }

        // Test Ollama connection
        if (this.config.ollama?.baseUrl) {
            try {
                const response = await axios.get(`${this.config.ollama.baseUrl}/api/tags`, {
                    timeout: 2000,
                    validateStatus: () => true
                });
                this.connectionStatus.ollama = response.status === 200;
                console.log('[LLMProvider] Ollama connection:', this.connectionStatus.ollama ? 'available' : 'unavailable');
            } catch (error) {
                this.connectionStatus.ollama = false;
                console.log('[LLMProvider] Ollama connection test failed');
            }
        }

        console.log('[LLMProvider] Connection test results:', this.connectionStatus);
    }

    private createModel(): BaseChatModel | null {
        const provider = this.determineProvider();

        if (!provider) {
            return null;
        }

        this.currentProvider = provider;

        switch (provider) {
            case 'openai':
                if (!this.config.openai) return null;
                console.log('[LLMProvider] Creating OpenAI model:', this.config.openai.model);
                console.log('[LLMProvider] API key available:', this.config.openai.apiKey ? 'Yes (' + this.config.openai.apiKey.length + ' chars)' : 'No');

                // Set environment variable as fallback for LangChain compatibility
                if (this.config.openai.apiKey) {
                    process.env.OPENAI_API_KEY = this.config.openai.apiKey;
                    console.log('[LLMProvider] Set OPENAI_API_KEY environment variable');
                }

                // Handle temperature parameter based on model
                let temperature = this.config.openai.temperature;
                const modelName = this.config.openai.model;

                // Some models (like gpt-5-nano) only support default temperature
                const modelsWithFixedTemp = ['gpt-5-nano', 'gpt-5-nano-2025'];
                const requiresDefaultTemp = modelsWithFixedTemp.some(model => modelName.includes(model));

                if (requiresDefaultTemp) {
                    temperature = 1.0; // Use default temperature
                    console.log('[LLMProvider] Model', modelName, 'requires default temperature (1.0)');
                }

                const chatOpenAIConfig = {
                    modelName: this.config.openai.model,
                    openAIApiKey: this.config.openai.apiKey,
                    temperature: temperature,
                    maxTokens: this.config.openai.maxTokens,
                    timeout: this.config.timeout,
                    streaming: true,
                    maxRetries: 3,
                };

                // Remove temperature parameter entirely for models that don't support it
                if (requiresDefaultTemp) {
                    delete (chatOpenAIConfig as any).temperature;
                    console.log('[LLMProvider] Removed temperature parameter for model compatibility');
                }

                return new ChatOpenAI(chatOpenAIConfig);

            case 'anthropic':
                if (!this.config.anthropic) return null;
                console.log('[LLMProvider] Creating Anthropic model:', this.config.anthropic.model);
                return new ChatAnthropic({
                    modelName: this.config.anthropic.model,
                    anthropicApiKey: this.config.anthropic.apiKey,
                    temperature: this.config.anthropic.temperature,
                    maxTokens: this.config.anthropic.maxTokens,
                    streaming: true,
                    maxRetries: 3,
                });

            case 'google':
                if (!this.config.google) return null;
                console.log('[LLMProvider] Creating Google model:', this.config.google.model);
                return new ChatGoogleGenerativeAI({
                    model: this.config.google.model,
                    apiKey: this.config.google.apiKey,
                    temperature: this.config.google.temperature,
                    maxOutputTokens: this.config.google.maxOutputTokens,
                    streaming: true,
                });

            case 'cohere':
                if (!this.config.cohere) return null;
                console.log('[LLMProvider] Creating Cohere model:', this.config.cohere.model);
                return new ChatCohere({
                    model: this.config.cohere.model,
                    apiKey: this.config.cohere.apiKey,
                    temperature: this.config.cohere.temperature,
                });

            case 'azure':
                if (!this.config.azure) return null;
                console.log('[LLMProvider] Creating Azure OpenAI model:', this.config.azure.deploymentName);
                return new ChatOpenAI({
                    modelName: this.config.azure.deploymentName,
                    openAIApiKey: this.config.azure.apiKey,
                    configuration: {
                        baseURL: `https://${this.config.azure.instanceName}.openai.azure.com/openai/deployments/${this.config.azure.deploymentName}`,
                        defaultQuery: { 'api-version': this.config.azure.apiVersion },
                        defaultHeaders: {
                            'api-key': this.config.azure.apiKey,
                        },
                    },
                    temperature: this.config.azure.temperature,
                    maxTokens: this.config.azure.maxTokens,
                    timeout: this.config.timeout,
                    streaming: true,
                    maxRetries: 3,
                });

            case 'huggingface':
                if (!this.config.huggingface) return null;
                // HuggingFace requires a different approach - use the community provider
                console.log('[LLMProvider] Creating HuggingFace model:', this.config.huggingface.model);
                // For HuggingFace, we'll use the OpenAI-compatible endpoint if available
                // Many HF models support OpenAI-compatible APIs
                return new ChatOpenAI({
                    modelName: this.config.huggingface.model,
                    openAIApiKey: this.config.huggingface.apiKey,
                    configuration: {
                        baseURL: this.config.huggingface.endpoint || 'https://api-inference.huggingface.co/models',
                    },
                    temperature: this.config.huggingface.temperature,
                    maxTokens: this.config.huggingface.maxTokens,
                    timeout: this.config.timeout,
                    streaming: true,
                });

            case 'openrouter':
                if (!this.config.openrouter) return null;
                console.log('[LLMProvider] Creating OpenRouter model:', this.config.openrouter.model);
                return new ChatOpenAI({
                    modelName: this.config.openrouter.model,
                    openAIApiKey: this.config.openrouter.apiKey,
                    configuration: {
                        baseURL: 'https://openrouter.ai/api/v1',
                        defaultHeaders: {
                            'HTTP-Referer': this.config.openrouter.siteUrl || 'https://localhost:3000',
                            'X-Title': this.config.openrouter.appName || 'Cindy Voice Assistant',
                        },
                    },
                    temperature: this.config.openrouter.temperature,
                    maxTokens: this.config.openrouter.maxTokens,
                    timeout: this.config.timeout,
                    streaming: true,
                    maxRetries: 3,
                });

            case 'groq':
                if (!this.config.groq) return null;
                console.log('[LLMProvider] Creating Groq model:', this.config.groq.model);
                return new ChatGroq({
                    model: this.config.groq.model,
                    apiKey: this.config.groq.apiKey,
                    temperature: this.config.groq.temperature,
                    maxTokens: this.config.groq.maxTokens,
                    streaming: true,
                    maxRetries: 3,
                });

            case 'ollama':
                if (!this.config.ollama) return null;
                console.log('[LLMProvider] Creating Ollama model:', this.config.ollama.model);
                console.log('[LLMProvider] Ollama base URL being used for ChatOllama:', this.config.ollama.baseUrl);
                return new ChatOllama({
                    baseUrl: this.config.ollama.baseUrl,
                    model: this.config.ollama.model,
                    temperature: this.config.ollama.temperature,
                    numPredict: -1,
                    topK: 40,
                    topP: 0.9,
                    keepAlive: '5m',
                    maxRetries: 3,
                });

            default:
                return null;
        }
    }

    private determineProvider(): string | null {
        // If specific provider is requested, try to use it
        if (this.config.provider !== 'auto') {
            if (this.connectionStatus[this.config.provider]) {
                return this.config.provider;
            }
            console.error(`[LLMProvider] ${this.config.provider} provider requested but not available`);
            return null;
        }

        // Auto mode - try providers in order of preference
        const providerPriority = ['openai', 'anthropic', 'openrouter', 'groq', 'google', 'cohere', 'azure', 'ollama', 'huggingface'];

        for (const provider of providerPriority) {
            if (this.connectionStatus[provider]) {
                console.log(`[LLMProvider] Auto mode: using ${provider}`);
                return provider;
            }
        }

        console.error('[LLMProvider] Auto mode: no providers available');
        return null;
    }

    /**
     * Convert simple chat messages to LangChain BaseMessage format
     */
    convertToBaseMessages(messages: ChatMessage[]): BaseMessage[] {
        return messages.map(msg => {
            switch (msg.role) {
                case 'system':
                    return new SystemMessage(msg.content);
                case 'user':
                    return new HumanMessage(msg.content);
                case 'assistant':
                    return new AIMessage(msg.content);
                default:
                    throw new Error(`Unknown message role: ${msg.role}`);
            }
        });
    }

    /**
     * Main invoke method using LangChain's standard pattern
     * @param messages - Array of messages (can be ChatMessage or BaseMessage)
     * @param options - Optional invoke options
     * @returns AI response message
     */
    async invoke(
        messages: ChatMessage[] | BaseMessage[],
        options: InvokeOptions = {}
    ): Promise<AIMessage> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!this.model) {
            throw new Error('No LLM model available');
        }

        // Convert messages to BaseMessage format if needed
        const baseMessages = this.isBaseMessageArray(messages)
            ? messages as BaseMessage[]
            : this.convertToBaseMessages(messages as ChatMessage[]);

        try {
            console.log(`[LLMProvider] Invoking ${this.currentProvider} with ${baseMessages.length} messages`);
            this.emit('invokeStart', { provider: this.currentProvider, messageCount: baseMessages.length });

            const response = await this.model.invoke(baseMessages, {
                signal: options.signal
            });

            this.emit('invokeComplete', { provider: this.currentProvider });
            return response;
        } catch (error) {
            console.error(`[LLMProvider] Error invoking ${this.currentProvider}:`, error);
            this.emit('invokeError', { provider: this.currentProvider, error });

            // Handle specific temperature parameter errors
            if (error.message && error.message.includes('temperature') && error.message.includes('does not support')) {
                console.log('[LLMProvider] Temperature parameter error detected, retrying without temperature');
                try {
                    // Recreate model without temperature parameter
                    if (this.currentProvider === 'openai' && this.config.openai) {
                        const configWithoutTemp = {
                            modelName: this.config.openai.model,
                            openAIApiKey: this.config.openai.apiKey,
                            maxTokens: this.config.openai.maxTokens,
                            timeout: this.config.timeout,
                            streaming: true,
                            maxRetries: 3,
                        };

                        this.model = new ChatOpenAI(configWithoutTemp);
                        console.log('[LLMProvider] Recreated model without temperature parameter');

                        // Retry the request
                        const response = await this.model.invoke(baseMessages, {
                            signal: options.signal
                        });

                        this.emit('invokeComplete', { provider: this.currentProvider });
                        return response;
                    }
                } catch (retryError) {
                    console.error('[LLMProvider] Retry without temperature failed:', retryError);
                    // Fall through to original error handling
                }
            }

            // Try fallback in auto mode
            if (this.config.provider === 'auto') {
                return await this.tryFallback(baseMessages, options);
            }

            throw error;
        }
    }

    /**
     * Try fallback providers in auto mode
     */
    private async tryFallback(messages: BaseMessage[], options: InvokeOptions): Promise<AIMessage> {
        const providerPriority = ['openai', 'anthropic', 'openrouter', 'groq', 'google', 'cohere', 'azure', 'ollama', 'huggingface'];
        const currentIndex = providerPriority.indexOf(this.currentProvider as string);

        for (let i = currentIndex + 1; i < providerPriority.length; i++) {
            const provider = providerPriority[i];
            if (this.connectionStatus[provider]) {
                console.log(`[LLMProvider] Attempting fallback to ${provider}...`);
                this.currentProvider = provider;
                this.model = await this.createModel();

                if (this.model) {
                    try {
                        return await this.model.invoke(messages, { signal: options.signal });
                    } catch (error) {
                        console.error(`[LLMProvider] Fallback to ${provider} failed:`, error);
                        // Continue to next provider
                    }
                }
            }
        }

        throw new Error('All fallback providers failed');
    }

    /**
     * Stream responses using LangChain's streaming pattern
     * @param messages - Array of messages
     * @param options - Optional streaming options
     * @returns Async generator of response chunks
     */
    async *stream(
        messages: ChatMessage[] | BaseMessage[],
        options: InvokeOptions = {}
    ): AsyncGenerator<string> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!this.model) {
            throw new Error('No LLM model available');
        }

        // Convert messages to BaseMessage format if needed
        const baseMessages = this.isBaseMessageArray(messages)
            ? messages as BaseMessage[]
            : this.convertToBaseMessages(messages as ChatMessage[]);

        try {
            console.log(`[LLMProvider] Streaming from ${this.currentProvider} with ${baseMessages.length} messages`);
            this.emit('streamStart', { provider: this.currentProvider });

            const stream = await this.model.stream(baseMessages, {
                signal: options.signal
            });

            for await (const chunk of stream) {
                const content = chunk.content as string;
                if (content) {
                    this.emit('streamChunk', { provider: this.currentProvider, chunk: content });
                    yield content;
                }
            }

            this.emit('streamComplete', { provider: this.currentProvider });
        } catch (error) {
            console.error(`[LLMProvider] Streaming error with ${this.currentProvider}:`, error);
            this.emit('streamError', { provider: this.currentProvider, error });

            // Handle specific temperature parameter errors
            if (error.message && error.message.includes('temperature') && error.message.includes('does not support')) {
                console.log('[LLMProvider] Temperature parameter error detected in streaming, retrying without temperature');
                try {
                    // Recreate model without temperature parameter
                    if (this.currentProvider === 'openai' && this.config.openai) {
                        const configWithoutTemp = {
                            modelName: this.config.openai.model,
                            openAIApiKey: this.config.openai.apiKey,
                            maxTokens: this.config.openai.maxTokens,
                            timeout: this.config.timeout,
                            streaming: true,
                            maxRetries: 3,
                        };

                        this.model = new ChatOpenAI(configWithoutTemp);
                        console.log('[LLMProvider] Recreated streaming model without temperature parameter');

                        // Retry the stream request
                        const retryStream = await this.model.stream(baseMessages, {
                            signal: options.signal
                        });

                        for await (const chunk of retryStream) {
                            const content = chunk.content as string;
                            if (content) {
                                this.emit('streamChunk', { provider: this.currentProvider, chunk: content });
                                yield content;
                            }
                        }

                        this.emit('streamComplete', { provider: this.currentProvider });
                        return; // Successfully completed retry
                    }
                } catch (retryError) {
                    console.error('[LLMProvider] Retry streaming without temperature failed:', retryError);
                    // Fall through to original error handling
                }
            }

            throw error;
        }
    }

    /**
     * Legacy chat method for backward compatibility
     * Redirects to invoke or stream based on configuration
     */
    async chat(messages: ChatMessage[]): Promise<AsyncGenerator<string> | { content: string; finishReason: string }> {
        if (this.config.streaming) {
            return this.stream(messages);
        } else {
            const response = await this.invoke(messages);
            return {
                content: response.content as string,
                finishReason: 'stop'
            };
        }
    }

    /**
     * Get the underlying LangChain model for advanced operations
     */
    getChatModel(): BaseChatModel | null {
        return this.model;
    }

    /**
     * Get token count for messages
     */
    async getTokenCount(messages: ChatMessage[] | BaseMessage[]): Promise<number> {
        if (!this.model) {
            throw new Error('No LLM model available');
        }

        const baseMessages = this.isBaseMessageArray(messages)
            ? messages as BaseMessage[]
            : this.convertToBaseMessages(messages as ChatMessage[]);

        try {
            // Some models have getNumTokens method
            if ('getNumTokens' in this.model) {
                return await (this.model as any).getNumTokens(baseMessages);
            }

            // Fallback to estimation
            const totalChars = baseMessages.reduce((sum, msg) => sum + msg.content.toString().length, 0);
            return Math.ceil(totalChars / 4);
        } catch (error) {
            console.warn('[LLMProvider] Failed to count tokens, using estimation:', error);
            const totalChars = baseMessages.reduce((sum, msg) => sum + msg.content.toString().length, 0);
            return Math.ceil(totalChars / 4);
        }
    }

    /**
     * Update configuration and reinitialize
     */
    async updateConfig(newConfig: Partial<LLMConfig>): Promise<void> {
        this.config = this.normalizeConfig({ ...this.config, ...newConfig });
        this.isInitialized = false;
        this.model = null;
        await this.initialize();
        this.emit('configUpdated', this.config);
    }

    /**
     * Get available models for current provider
     */
    async getAvailableModels(): Promise<string[]> {
        switch (this.currentProvider) {
            case 'openai':
                return [

                ];

            case 'anthropic':
                return [

                ];

            case 'google':
                return [

                ];

            case 'cohere':
                return [

                ];

            case 'ollama':
                try {
                    const response = await axios.get(`${this.config.ollama?.baseUrl}/api/tags`);
                    return response.data.models?.map((model: any) => model.name) || [];
                } catch (error) {
                    console.error('[LLMProvider] Failed to list Ollama models:', error);
                    return [

                    ];
                }

            case 'azure':
                // Azure models depend on deployment
                return ['gpt-4', 'gpt-35-turbo'];

            case 'openrouter':
                return [

                ];

            case 'groq':
                return [

                ];

            case 'huggingface':
                // Popular HF models
                return [
                ];

            default:
                return [];
        }
    }

    /**
     * Get current connection status
     */
    getConnectionStatus(): Record<string, boolean> {
        // Maintain backward compatibility
        return {
            openai: this.connectionStatus.openai || false,
            ollama: this.connectionStatus.ollama || false,
            ...this.connectionStatus
        };
    }

    /**
     * Get current configuration
     */
    getConfig(): LLMConfig {
        return { ...this.config };
    }

    /**
     * Get current active provider
     */
    getCurrentProvider(): string | null {
        return this.currentProvider;
    }

    /**
     * Bind tools to the model for function calling
     * Note: This returns a new model instance with tools bound
     */
    withTools(tools: any[]): BaseChatModel | null {
        if (!this.model) {
            console.warn('[LLMProvider] No model available for tool binding');
            return null;
        }

        // Check if the model supports tool binding
        if (!('bindTools' in this.model)) {
            console.warn(`[LLMProvider] ${this.currentProvider} provider does not support tool binding`);
            return null;
        }

        // Use bindTools method which is the modern LangChain API
        // bindTools() returns a new model instance with tools bound
        try {
            const modelWithTools = (this.model as any).bindTools(tools);
            console.log(`[LLMProvider] Successfully bound ${tools.length} tools to ${this.currentProvider} model`);

            // Update our internal model reference to the bound model
            this.model = modelWithTools;
            return modelWithTools;
        } catch (error) {
            console.error('[LLMProvider] Failed to bind tools:', error);
            return null;
        }
    }

    /**
     * Legacy method for backward compatibility
     * @deprecated Use withTools instead
     */
    withFunctions(functions: any[]): BaseChatModel | null {
        return this.withTools(functions);
    }

    /**
     * Helper to check if array contains BaseMessages
     */
    private isBaseMessageArray(messages: any[]): boolean {
        return messages.length > 0 && messages[0] instanceof BaseMessage;
    }

    // Provider-specific methods

    /**
     * Pull a model from Ollama repository
     */
    async pullOllamaModel(modelName: string): Promise<boolean> {
        if (this.currentProvider !== 'ollama' || !this.config.ollama) {
            console.warn('[LLMProvider] Pull model requires Ollama provider');
            return false;
        }

        try {
            const response = await axios.post(`${this.config.ollama.baseUrl}/api/pull`, {
                name: modelName
            });
            return response.status === 200;
        } catch (error) {
            console.error('[LLMProvider] Failed to pull model:', error);
            return false;
        }
    }

    /**
     * List models available on the Ollama server
     */
    async listOllamaServerModels(): Promise<string[]> {
        if (!this.config.ollama) return [];

        try {
            const response = await axios.get(`${this.config.ollama.baseUrl}/api/tags`);
            return response.data.models?.map((model: any) => model.name) || [];
        } catch (error) {
            console.error('[LLMProvider] Failed to list Ollama models:', error);
            return [];
        }
    }

    /**
     * Structured output with Zod validation and retry logic
     * @param messages - Array of messages
     * @param schema - Zod schema for validation
     * @param options - Optional invoke options with retry config
     */
    async invokeStructured<T>(
        messages: ChatMessage[] | BaseMessage[],
        schema: { safeParse: (data: unknown) => { success: boolean; data?: T; error?: any } },
        options: InvokeOptions & { 
            maxRetries?: number;
            retryDelay?: number;
            fallback?: T;
        } = {}
    ): Promise<{
        success: true;
        data: T;
        attempts: number;
    } | {
        success: false;
        error: string;
        attempts: number;
        fallback?: T;
    }> {
        const { maxRetries = 3, retryDelay = 1000, fallback, ...invokeOptions } = options;
        let lastError = '';
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[LLMProvider] Structured output attempt ${attempt}/${maxRetries}`);
                
                const result = await this.invoke(messages, invokeOptions);
                const content = result.content as string;
                
                // Remove <think> tags if present
                const thinkTagRegex = /<think[^>]*>([\s\S]*?)<\/think>/g;
                const cleanedContent = content.replace(thinkTagRegex, '').trim();
                
                // Try to parse as JSON first
                let parsedData: unknown;
                try {
                    parsedData = JSON.parse(cleanedContent);
                } catch (jsonError) {
                    // If JSON parsing fails, try the raw content
                    parsedData = cleanedContent;
                }
                
                // Validate with schema
                const validation = schema.safeParse(parsedData);
                
                if (validation.success) {
                    return {
                        success: true,
                        data: validation.data!,
                        attempts: attempt
                    };
                }
                
                // Log validation error for retry
                lastError = `Schema validation failed: ${validation.error ? JSON.stringify(validation.error) : 'Unknown validation error'}`;
                console.warn(`[LLMProvider] Attempt ${attempt} validation failed:`, lastError);
                
                if (attempt < maxRetries) {
                    console.log(`[LLMProvider] Retrying in ${retryDelay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
                
            } catch (error) {
                lastError = `Invocation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
                console.error(`[LLMProvider] Attempt ${attempt} failed:`, lastError);
                
                if (attempt < maxRetries) {
                    console.log(`[LLMProvider] Retrying in ${retryDelay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
        }
        
        // All attempts failed
        return {
            success: false,
            error: lastError,
            attempts: maxRetries,
            fallback
        };
    }

    /**
     * Streaming structured output with validation
     * @param messages - Array of messages
     * @param schema - Zod schema for validation
     * @param options - Optional streaming options
     */
    async *streamStructured<T>(
        messages: ChatMessage[] | BaseMessage[],
        schema: { safeParse: (data: unknown) => { success: boolean; data?: T; error?: any } },
        options: InvokeOptions & { 
            validateChunks?: boolean;
            finalValidation?: boolean;
        } = {}
    ): AsyncGenerator<{
        type: 'chunk';
        content: string;
    } | {
        type: 'validation';
        success: boolean;
        data?: T;
        error?: string;
    }> {
        const { validateChunks = false, finalValidation = true, ...streamOptions } = options;
        
        let fullContent = '';
        
        try {
            for await (const chunk of this.stream(messages, streamOptions)) {
                fullContent += chunk;
                
                yield {
                    type: 'chunk',
                    content: chunk
                };
                
                // Optional: validate each chunk if requested
                if (validateChunks) {
                    try {
                        const cleanedContent = fullContent.replace(/<think[^>]*>([\s\S]*?)<\/think>/g, '').trim();
                        const parsedData = JSON.parse(cleanedContent);
                        const validation = schema.safeParse(parsedData);
                        
                        if (validation.success) {
                            yield {
                                type: 'validation',
                                success: true,
                                data: validation.data
                            };
                        }
                    } catch (error) {
                        // Ignore parsing errors during streaming
                    }
                }
            }
            
            // Final validation
            if (finalValidation) {
                const cleanedContent = fullContent.replace(/<think[^>]*>([\s\S]*?)<\/think>/g, '').trim();
                
                try {
                    const parsedData = JSON.parse(cleanedContent);
                    const validation = schema.safeParse(parsedData);
                    
                    yield {
                        type: 'validation',
                        success: validation.success,
                        data: validation.success ? validation.data : undefined,
                        error: validation.success ? undefined : 'Schema validation failed'
                    };
                } catch (error) {
                    yield {
                        type: 'validation',
                        success: false,
                        error: 'JSON parsing failed'
                    };
                }
            }
            
        } catch (error) {
            yield {
                type: 'validation',
                success: false,
                error: error instanceof Error ? error.message : 'Streaming failed'
            };
        }
    }
}

// Export types for external use
export type { LLMConfig, ChatMessage, InvokeOptions };