import axios, { AxiosInstance } from 'axios';

interface OllamaConfig {
    model: string;
    baseUrl: string;
    temperature: number;
}


interface OllamaChatResponse {
    model: string;
    created_at: string;
    message: {
        role: string;
        content: string;
    };
    done: boolean;
    total_duration: number;
    load_duration: number;
    prompt_eval_count: number;
    prompt_eval_duration: number;
    eval_count: number;
    eval_duration: number;
}

class OllamaProvider {
    private client: AxiosInstance;
    private config: OllamaConfig;

    constructor(config: OllamaConfig) {
        console.log('[OllamaProvider] Original baseUrl:', config.baseUrl);
        // Normalize localhost to 127.0.0.1 to force IPv4 connection
        const normalizedBaseUrl = config.baseUrl.replace('localhost', '127.0.0.1');
        console.log('[OllamaProvider] Normalized baseUrl:', normalizedBaseUrl);

        this.config = { ...config, baseUrl: normalizedBaseUrl };
        this.client = axios.create({
            baseURL: normalizedBaseUrl,
            timeout: 120000, // 2 minutes
        });
    }

    async chat(
        messages: { role: string; content: string }[],
        options: { streaming?: boolean } = {}
    ): Promise<AsyncGenerator<string> | { content: string; finishReason: string }> {
        const streaming = options.streaming ?? true;

        try {
            if (streaming) {
                const response = await this.client.post('/api/chat', {
                    model: this.config.model,
                    messages: messages,
                    stream: true,
                    options: {
                        temperature: this.config.temperature,
                    },
                }, {
                    responseType: 'stream',
                });

                return this.streamResponse(response.data);
            } else {
                const response = await this.client.post<OllamaChatResponse>('/api/chat', {
                    model: this.config.model,
                    messages: messages,
                    stream: false,
                    options: {
                        temperature: this.config.temperature,
                    },
                });

                return {
                    content: response.data.message.content,
                    finishReason: 'stop',
                };
            }
        } catch (error) {
            console.error('Ollama API error:', error);

            // Check for network connection issues
            const isNetworkError = error.message?.includes('Failed to fetch') ||
                error.message?.includes('ECONNREFUSED') ||
                error.code === 'ECONNREFUSED';

            if (isNetworkError) {
                throw new Error('Ollama service is not running. Please start Ollama and check your connection settings.');
            }

            // Handle API errors (invalid model, etc.)
            throw new Error(`Ollama API error: ${error.message || error}`);
        }
    }

    private async *streamResponse(stream: any): AsyncGenerator<string> {
        let buffer = '';

        for await (const chunk of stream) {
            buffer += chunk.toString();

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const data = JSON.parse(line);
                        if (data.message && data.message.content) {
                            yield data.message.content;
                        }
                        if (data.done) {
                            return;
                        }
                    } catch (error) {
                        console.warn('Failed to parse Ollama stream chunk:', line);
                    }
                }
            }
        }
    }

    async updateConfig(newConfig: Partial<OllamaConfig>): Promise<void> {
        this.config = { ...this.config, ...newConfig };
        this.client = axios.create({
            baseURL: this.config.baseUrl,
            timeout: 120000,
        });
    }

    async testConnection(): Promise<boolean> {
        try {
            await this.client.get('/api/tags');
            return true;
        } catch (error) {
            console.error('Ollama connection test failed:', error);
            return false;
        }
    }

    async getAvailableModels(): Promise<string[]> {
        try {
            const response = await this.client.get('/api/tags');
            return response.data.models.map((model: any) => model.name);
        } catch (error) {
            console.error('Failed to fetch Ollama models:', error);
            return [];
        }
    }
}

export default OllamaProvider;
