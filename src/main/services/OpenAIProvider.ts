import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

interface OpenAIConfig {
    model: string;
    apiKey: string;
    organizationId?: string;
    temperature: number;
    maxTokens: number;
}

class OpenAIProvider {
    private client: OpenAI | null = null;
    private config: OpenAIConfig;

    constructor(config: OpenAIConfig) {
        this.config = config;
        this.initializeClient();
    }

    private initializeClient(): void {
        if (!this.config.apiKey) {
            throw new Error('OpenAI API key is required');
        }

        this.client = new OpenAI({
            apiKey: this.config.apiKey,
            organization: this.config.organizationId,
            timeout: 60000, // 60 seconds
        });
    }

    async chat(
        messages: ChatCompletionMessageParam[],
        options: { streaming?: boolean } = {}
    ): Promise<AsyncGenerator<string> | { content: string; finishReason: string; usage?: any }> {
        if (!this.client) {
            throw new Error('OpenAI client not initialized');
        }

        const streaming = options.streaming ?? true;

        try {
            if (streaming) {
                const stream = await this.client.chat.completions.create({
                    model: this.config.model,
                    messages: messages,
                    temperature: this.config.temperature,
                    max_tokens: this.config.maxTokens,
                    stream: true,
                });

                return this.streamResponse(stream);
            } else {
                const response = await this.client.chat.completions.create({
                    model: this.config.model,
                    messages: messages,
                    temperature: this.config.temperature,
                    max_tokens: this.config.maxTokens,
                    stream: false,
                });

                return {
                    content: response.choices[0]?.message?.content || '',
                    finishReason: response.choices[0]?.finish_reason || 'stop',
                    usage: response.usage,
                };
            }
        } catch (error) {
            console.error('OpenAI API error:', error);
            throw new Error(`OpenAI API error: ${error}`);
        }
    }

    private async *streamResponse(stream: AsyncIterable<OpenAI.ChatCompletionChunk>): AsyncGenerator<string> {
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
                yield content;
            }
        }
    }

    async updateConfig(newConfig: Partial<OpenAIConfig>): Promise<void> {
        this.config = { ...this.config, ...newConfig };
        this.initializeClient();
    }

    async testConnection(): Promise<boolean> {
        if (!this.client) {
            return false;
        }

        try {
            await this.client.models.list();
            return true;
        } catch (error) {
            console.error('OpenAI connection test failed:', error);
            return false;
        }
    }

    async getAvailableModels(): Promise<string[]> {
        // Common OpenAI models
        return [
            'gpt-4',
            'gpt-4-0613',
            'gpt-4-32k',
            'gpt-3.5-turbo',
            'gpt-3.5-turbo-0613',
            'gpt-3.5-turbo-16k',
        ];
    }
}

export default OpenAIProvider;