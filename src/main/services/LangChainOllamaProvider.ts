import { ChatOllama } from '@langchain/ollama';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import axios from 'axios';

interface OllamaConfig {
    model: string;
    baseUrl: string;
    temperature: number;
}

interface OllamaMessage {
    role: string;
    content: string;
}

class LangChainOllamaProvider {
    private chatModel: ChatOllama | null = null;
    private config: OllamaConfig;

    constructor(config: OllamaConfig) {
        console.log('[LangChainOllamaProvider] Original baseUrl:', config.baseUrl);
        // Normalize localhost to 127.0.0.1 to force IPv4 connection
        const normalizedBaseUrl = config.baseUrl.replace('localhost', '127.0.0.1');
        console.log('[LangChainOllamaProvider] Normalized baseUrl:', normalizedBaseUrl);

        this.config = { ...config, baseUrl: normalizedBaseUrl };
        this.initializeClient();
    }

    private initializeClient(): void {
        try {
            this.chatModel = new ChatOllama({
                baseUrl: this.config.baseUrl,
                model: this.config.model,
                temperature: this.config.temperature,
                // Ollama-specific options
                numPredict: -1, // Let Ollama decide when to stop
                topK: 40,
                topP: 0.9,
                keepAlive: '5m', // Keep model loaded for 5 minutes
                maxRetries: 3, // Built-in retry logic
            });

            console.log('[LangChainOllamaProvider] Initialized with config:', {
                baseUrl: this.config.baseUrl,
                model: this.config.model,
                temperature: this.config.temperature
            });
        } catch (error) {
            console.error('Failed to initialize LangChain Ollama client:', error);
            this.chatModel = null;
        }
    }

    private convertMessages(messages: OllamaMessage[]): BaseMessage[] {
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

    async chat(
        messages: OllamaMessage[],
        options: { streaming?: boolean } = {}
    ): Promise<AsyncGenerator<string> | { content: string; finishReason: string }> {
        if (!this.chatModel) {
            throw new Error('LangChain Ollama client not initialized');
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
                    finishReason: 'stop', // LangChain doesn't expose finish reason directly for Ollama
                };
            }
        } catch (error) {
            console.error('LangChain Ollama API error:', error);
            
            // Enhanced error handling for common Ollama issues
            if (error.message?.includes('ECONNREFUSED') || error.message?.includes('connect')) {
                throw new Error(`Cannot connect to Ollama server at ${this.config.baseUrl}. Make sure Ollama is running.`);
            } else if (error.message?.includes('model not found')) {
                throw new Error(`Model '${this.config.model}' not found. Please pull the model using: ollama pull ${this.config.model}`);
            } else if (error.message?.includes('timeout')) {
                throw new Error(`Ollama request timed out. The model might be too large or the server is overloaded.`);
            }
            
            throw new Error(`LangChain Ollama API error: ${error.message || error}`);
        }
    }

    private async *streamResponse(messages: BaseMessage[]): AsyncGenerator<string> {
        if (!this.chatModel) {
            throw new Error('LangChain Ollama client not initialized');
        }

        try {
            console.log('[LangChainOllamaProvider] Starting stream with messages:', messages.length);
            const stream = await this.chatModel.stream(messages);
            
            for await (const chunk of stream) {
                if (chunk.content) {
                    yield chunk.content as string;
                }
            }
        } catch (error) {
            console.error('LangChain Ollama streaming error:', error);
            throw new Error(`LangChain Ollama streaming error: ${error.message || error}`);
        }
    }

    async updateConfig(newConfig: Partial<OllamaConfig>): Promise<void> {
        this.config = { ...this.config, ...newConfig };
        
        // Handle baseUrl normalization
        if (newConfig.baseUrl) {
            this.config.baseUrl = newConfig.baseUrl.replace('localhost', '127.0.0.1');
        }
        
        this.initializeClient();
    }

    async testConnection(): Promise<boolean> {
        if (!this.chatModel) {
            return false;
        }

        try {
            console.log('[LangChainOllamaProvider] Testing connection to:', this.config.baseUrl);
            
            // Use a simple HTTP request to check if Ollama is running
            // This is much faster than invoking the model
            const response = await axios.get(`${this.config.baseUrl}/api/tags`, {
                timeout: 2000, // 2 second timeout
                validateStatus: () => true // Don't throw on any status code
            });
            
            if (response.status === 200) {
                console.log('[LangChainOllamaProvider] Connection test successful');
                return true;
            } else {
                console.log('[LangChainOllamaProvider] Connection test failed with status:', response.status);
                return false;
            }
        } catch (error) {
            console.log('[LangChainOllamaProvider] Connection test failed (Ollama may not be running)');
            return false;
        }
    }

    async getAvailableModels(): Promise<string[]> {
        // Common Ollama models - we could potentially call the Ollama API directly here
        // But for now, return a curated list of popular models
        return [
            'llama3:8b',
            'llama3:70b', 
            'llama2:7b',
            'llama2:13b',
            'llama2:70b',
            'qwen:4b',
            'qwen:7b',
            'qwen:14b',
            'qwen:72b',
            'mistral:7b',
            'mixtral:8x7b',
            'codellama:7b',
            'codellama:13b',
            'gemma:2b',
            'gemma:7b',
        ];
    }

    // Additional LangChain specific methods
    
    /**
     * Get the underlying LangChain ChatOllama instance for advanced usage
     */
    getChatModel(): ChatOllama | null {
        return this.chatModel;
    }

    /**
     * Pull a model from Ollama repository
     * Note: This would require calling Ollama's API directly since LangChain doesn't expose this
     */
    async pullModel(modelName: string): Promise<boolean> {
        try {
            const axios = require('axios');
            const response = await axios.post(`${this.config.baseUrl}/api/pull`, {
                name: modelName
            });
            return response.status === 200;
        } catch (error) {
            console.error('Failed to pull model:', error);
            return false;
        }
    }

    /**
     * List models available on the Ollama server
     */
    async listServerModels(): Promise<string[]> {
        try {
            const axios = require('axios');
            const response = await axios.get(`${this.config.baseUrl}/api/tags`);
            return response.data.models?.map((model: any) => model.name) || [];
        } catch (error) {
            console.error('Failed to list server models:', error);
            return [];
        }
    }

    /**
     * Get model information from Ollama server
     */
    async getModelInfo(modelName: string): Promise<any> {
        try {
            const axios = require('axios');
            const response = await axios.post(`${this.config.baseUrl}/api/show`, {
                name: modelName
            });
            return response.data;
        } catch (error) {
            console.error('Failed to get model info:', error);
            return null;
        }
    }
}

export { LangChainOllamaProvider, OllamaConfig };