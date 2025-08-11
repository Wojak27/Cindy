import { EventEmitter } from 'events';
import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/ollama';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatCohere } from '@langchain/cohere';
import { ChatGroq } from '@langchain/groq';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
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
            this.model = await this.createModel();

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

    private async createModel(): Promise<BaseChatModel | null> {
        const provider = this.determineProvider();

        if (!provider) {
            return null;
        }

        this.currentProvider = provider;

        switch (provider) {
            case 'openai':
                if (!this.config.openai) return null;
                console.log('[LLMProvider] Creating OpenAI model:', this.config.openai.model);
                return new ChatOpenAI({
                    modelName: this.config.openai.model,
                    openAIApiKey: this.config.openai.apiKey,
                    temperature: this.config.openai.temperature,
                    maxTokens: this.config.openai.maxTokens,
                    timeout: this.config.timeout,
                    streaming: true,
                    maxRetries: 3,
                });

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
                    'gpt-4-turbo-preview',
                    'gpt-4',
                    'gpt-4-32k',
                    'gpt-4o',
                    'gpt-4o-mini',
                    'gpt-3.5-turbo',
                    'gpt-3.5-turbo-16k',
                ];

            case 'anthropic':
                return [
                    'claude-3-opus-20240229',
                    'claude-3-sonnet-20240229',
                    'claude-3-haiku-20240307',
                    'claude-2.1',
                    'claude-2.0',
                ];

            case 'google':
                return [
                    'gemini-pro',
                    'gemini-pro-vision',
                    'gemini-1.5-pro-latest',
                    'gemini-1.5-flash-latest',
                ];

            case 'cohere':
                return [
                    'command',
                    'command-light',
                    'command-nightly',
                    'command-light-nightly',
                ];

            case 'ollama':
                try {
                    const response = await axios.get(`${this.config.ollama?.baseUrl}/api/tags`);
                    return response.data.models?.map((model: any) => model.name) || [];
                } catch (error) {
                    console.error('[LLMProvider] Failed to list Ollama models:', error);
                    return [
                        'llama3:8b',
                        'llama3:70b',
                        'llama2:7b',
                        'mistral:7b',
                        'mixtral:8x7b',
                        'qwen3:1.7b',
                        'dengcao/Qwen3-Embedding-0.6B:Q8_0',
                        'gemma:7b',
                        'phi:3.8b',
                    ];
                }

            case 'azure':
                // Azure models depend on deployment
                return ['gpt-4', 'gpt-35-turbo'];

            case 'openrouter':
                return [
                    'openai/gpt-4-turbo',
                    'openai/gpt-4',
                    'openai/gpt-3.5-turbo',
                    'anthropic/claude-3-opus',
                    'anthropic/claude-3-sonnet',
                    'anthropic/claude-3-haiku',
                    'google/gemini-pro',
                    'meta-llama/llama-2-70b-chat',
                    'mistralai/mixtral-8x7b-instruct',
                    'cohere/command',
                ];

            case 'groq':
                return [
                    'llama3-8b-8192',
                    'llama3-70b-8192',
                    'mixtral-8x7b-32768',
                    'gemma-7b-it',
                    'llama2-70b-4096',
                ];

            case 'huggingface':
                // Popular HF models
                return [
                    'meta-llama/Llama-2-70b-chat-hf',
                    'mistralai/Mixtral-8x7B-Instruct-v0.1',
                    'google/flan-t5-xxl',
                    'bigscience/bloom',
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
}

// Export types for external use
export type { LLMConfig, ChatMessage, InvokeOptions };