/**
 * Unit tests for LLMProvider
 */

import { LLMProvider, LLMConfig, ChatMessage } from '../LLMProvider';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { EventEmitter } from 'events';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock LangChain providers
const mockChatModel = {
    invoke: jest.fn(),
    stream: jest.fn(),
    bindTools: jest.fn(),
    getNumTokens: jest.fn()
};

jest.mock('@langchain/openai', () => ({
    ChatOpenAI: jest.fn().mockImplementation(() => mockChatModel)
}));

jest.mock('@langchain/ollama', () => ({
    ChatOllama: jest.fn().mockImplementation(() => mockChatModel)
}));

jest.mock('@langchain/anthropic', () => ({
    ChatAnthropic: jest.fn().mockImplementation(() => mockChatModel)
}));

jest.mock('@langchain/google-genai', () => ({
    ChatGoogleGenerativeAI: jest.fn().mockImplementation(() => mockChatModel)
}));

jest.mock('@langchain/cohere', () => ({
    ChatCohere: jest.fn().mockImplementation(() => mockChatModel)
}));

jest.mock('@langchain/groq', () => ({
    ChatGroq: jest.fn().mockImplementation(() => mockChatModel)
}));

describe('LLMProvider', () => {
    let provider: LLMProvider;
    let baseConfig: LLMConfig;

    beforeEach(() => {
        jest.clearAllMocks();

        // Reset environment variables
        delete process.env.OPENAI_API_KEY;

        baseConfig = {
            provider: 'openai',
            openai: {
                model: 'gpt-4',
                apiKey: 'test-openai-key',
                temperature: 0.7,
                maxTokens: 2000
            },
            streaming: true,
            timeout: 30000
        };

        provider = new LLMProvider(baseConfig);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should create LLMProvider with base config', () => {
            expect(provider).toBeInstanceOf(LLMProvider);
            expect(provider).toBeInstanceOf(EventEmitter);
        });

        it('should normalize Ollama baseUrl in config', () => {
            const configWithLocalhost: LLMConfig = {
                provider: 'ollama',
                ollama: {
                    model: 'llama2',
                    baseUrl: 'http://localhost:11435',
                    temperature: 0.7
                },
                streaming: true,
                timeout: 30000
            };

            const normalizedProvider = new LLMProvider(configWithLocalhost);
            const config = normalizedProvider.getConfig();

            expect(config.ollama?.baseUrl).toBe('http://127.0.0.1:11435');
        });
    });

    describe('initialize', () => {
        beforeEach(() => {
            // Mock successful axios response for Ollama
            mockedAxios.get.mockResolvedValue({
                status: 200,
                data: { models: [] }
            });
        });

        it('should initialize successfully with OpenAI config', async () => {
            await provider.initialize();

            expect(provider.getCurrentProvider()).toBe('openai');
            expect(process.env.OPENAI_API_KEY).toBe('test-openai-key');
        });

        it('should not initialize twice', async () => {
            await provider.initialize();
            const firstModel = provider.getChatModel();

            await provider.initialize(); // Second call
            const secondModel = provider.getChatModel();

            expect(firstModel).toBe(secondModel);
        });

        it('should emit initialized event', async () => {
            const eventSpy = jest.fn();
            provider.on('initialized', eventSpy);

            await provider.initialize();

            expect(eventSpy).toHaveBeenCalledWith({
                provider: 'openai',
                connectionStatus: expect.any(Object)
            });
        });

        it('should throw error when no providers available', async () => {
            const emptyProvider = new LLMProvider({
                provider: 'auto',
                streaming: false,
                timeout: 30000
            });

            await expect(emptyProvider.initialize()).rejects.toThrow('No LLM providers are available');
        });
    });

    describe('testConnections', () => {
        it('should detect OpenAI API key', async () => {
            await provider.initialize();

            const status = provider.getConnectionStatus();
            expect(status.openai).toBe(true);
        });

        it('should test Ollama connection via HTTP', async () => {
            mockedAxios.get.mockResolvedValueOnce({
                status: 200,
                data: { models: [] }
            });

            const ollamaProvider = new LLMProvider({
                provider: 'ollama',
                ollama: {
                    model: 'llama2',
                    baseUrl: 'http://127.0.0.1:11435',
                    temperature: 0.7
                },
                streaming: true,
                timeout: 30000
            });

            await ollamaProvider.initialize();
            const status = ollamaProvider.getConnectionStatus();

            expect(mockedAxios.get).toHaveBeenCalledWith(
                'http://127.0.0.1:11435/api/tags',
                expect.objectContaining({
                    timeout: 2000,
                    validateStatus: expect.any(Function)
                })
            );
            expect(status.ollama).toBe(true);
        });

        it('should handle Ollama connection failure', async () => {
            mockedAxios.get.mockRejectedValueOnce(new Error('Connection failed'));

            const ollamaProvider = new LLMProvider({
                provider: 'ollama',
                ollama: {
                    model: 'llama2',
                    baseUrl: 'http://127.0.0.1:11435',
                    temperature: 0.7
                },
                streaming: true,
                timeout: 30000
            });

            await ollamaProvider.initialize();
            const status = ollamaProvider.getConnectionStatus();

            expect(status.ollama).toBe(false);
        });
    });

    describe('createModel', () => {
        it('should create OpenAI model with all parameters', async () => {
            await provider.initialize();

            const { ChatOpenAI } = require('@langchain/openai');
            expect(ChatOpenAI).toHaveBeenCalledWith({
                modelName: 'gpt-4',
                openAIApiKey: 'test-openai-key',
                temperature: 0.7,
                maxTokens: 2000,
                timeout: 30000,
                streaming: true,
                maxRetries: 3
            });
        });

        it('should create model without temperature for specific models', async () => {
            const nanoConfig = { ...baseConfig };
            nanoConfig.openai!.model = 'gpt-5-nano';

            const nanoProvider = new LLMProvider(nanoConfig);
            await nanoProvider.initialize();

            const { ChatOpenAI } = require('@langchain/openai');
            const lastCall = ChatOpenAI.mock.calls[ChatOpenAI.mock.calls.length - 1];
            expect(lastCall[0]).not.toHaveProperty('temperature');
        });

        it('should create Anthropic model', async () => {
            const anthropicConfig: LLMConfig = {
                provider: 'anthropic',
                anthropic: {
                    model: 'claude-3-sonnet-20240229',
                    apiKey: 'test-anthropic-key',
                    temperature: 0.7,
                    maxTokens: 2000
                },
                streaming: true,
                timeout: 30000
            };

            const anthropicProvider = new LLMProvider(anthropicConfig);
            await anthropicProvider.initialize();

            const { ChatAnthropic } = require('@langchain/anthropic');
            expect(ChatAnthropic).toHaveBeenCalledWith({
                modelName: 'claude-3-sonnet-20240229',
                anthropicApiKey: 'test-anthropic-key',
                temperature: 0.7,
                maxTokens: 2000,
                streaming: true,
                maxRetries: 3
            });
        });

        it('should create Ollama model', async () => {
            mockedAxios.get.mockResolvedValue({ status: 200, data: { models: [] } });

            const ollamaConfig: LLMConfig = {
                provider: 'ollama',
                ollama: {
                    model: 'llama2',
                    baseUrl: 'http://127.0.0.1:11435',
                    temperature: 0.7
                },
                streaming: true,
                timeout: 30000
            };

            const ollamaProvider = new LLMProvider(ollamaConfig);
            await ollamaProvider.initialize();

            const { ChatOllama } = require('@langchain/ollama');
            expect(ChatOllama).toHaveBeenCalledWith({
                baseUrl: 'http://127.0.0.1:11435',
                model: 'llama2',
                temperature: 0.7,
                numPredict: -1,
                topK: 40,
                topP: 0.9,
                keepAlive: '5m',
                maxRetries: 3
            });
        });
    });

    describe('determineProvider', () => {
        it('should return specific provider when requested', async () => {
            await provider.initialize();
            expect(provider.getCurrentProvider()).toBe('openai');
        });

        it('should use auto mode priority', async () => {
            const autoConfig: LLMConfig = {
                provider: 'auto',
                openai: {
                    model: 'gpt-4',
                    apiKey: 'test-key',
                    temperature: 0.7,
                    maxTokens: 2000
                },
                streaming: true,
                timeout: 30000
            };

            const autoProvider = new LLMProvider(autoConfig);
            await autoProvider.initialize();

            expect(autoProvider.getCurrentProvider()).toBe('openai');
        });

        it('should return null when requested provider unavailable', async () => {
            const unavailableConfig: LLMConfig = {
                provider: 'anthropic', // No API key provided
                streaming: true,
                timeout: 30000
            };

            const unavailableProvider = new LLMProvider(unavailableConfig);
            await expect(unavailableProvider.initialize()).rejects.toThrow();
        });
    });

    describe('convertToBaseMessages', () => {
        it('should convert ChatMessage array to BaseMessage array', () => {
            const chatMessages: ChatMessage[] = [
                { role: 'system', content: 'You are a helpful assistant' },
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi there!' }
            ];

            const baseMessages = provider.convertToBaseMessages(chatMessages);

            expect(baseMessages).toHaveLength(3);
            expect(baseMessages[0]).toBeInstanceOf(SystemMessage);
            expect(baseMessages[1]).toBeInstanceOf(HumanMessage);
            expect(baseMessages[2]).toBeInstanceOf(AIMessage);
        });

        it('should throw error for unknown role', () => {
            const invalidMessages = [
                { role: 'unknown', content: 'test' }
            ] as any;

            expect(() => provider.convertToBaseMessages(invalidMessages)).toThrow('Unknown message role: unknown');
        });
    });

    describe('invoke', () => {
        beforeEach(async () => {
            await provider.initialize();
            mockChatModel.invoke.mockResolvedValue(new AIMessage('Test response'));
        });

        it('should invoke model successfully with ChatMessage array', async () => {
            const messages: ChatMessage[] = [
                { role: 'user', content: 'Hello' }
            ];

            const response = await provider.invoke(messages);

            expect(mockChatModel.invoke).toHaveBeenCalledWith(
                expect.arrayContaining([expect.any(HumanMessage)]),
                { signal: undefined }
            );
            expect(response).toBeInstanceOf(AIMessage);
        });

        it('should invoke model with BaseMessage array', async () => {
            const messages = [new HumanMessage('Hello')];

            await provider.invoke(messages);

            expect(mockChatModel.invoke).toHaveBeenCalledWith(
                messages,
                { signal: undefined }
            );
        });

        it('should emit invoke events', async () => {
            const startSpy = jest.fn();
            const completeSpy = jest.fn();

            provider.on('invokeStart', startSpy);
            provider.on('invokeComplete', completeSpy);

            await provider.invoke([{ role: 'user', content: 'Hello' }]);

            expect(startSpy).toHaveBeenCalledWith({
                provider: 'openai',
                messageCount: 1
            });
            expect(completeSpy).toHaveBeenCalledWith({
                provider: 'openai'
            });
        });

        it('should handle temperature parameter errors', async () => {
            const tempError = new Error('Model does not support temperature parameter');
            mockChatModel.invoke
                .mockRejectedValueOnce(tempError)
                .mockResolvedValueOnce(new AIMessage('Success without temp'));

            const response = await provider.invoke([{ role: 'user', content: 'Hello' }]);

            expect(response.content).toBe('Success without temp');
            expect(mockChatModel.invoke).toHaveBeenCalledTimes(2);
        });

        it('should try fallback in auto mode', async () => {
            const autoConfig: LLMConfig = {
                provider: 'auto',
                openai: {
                    model: 'gpt-4',
                    apiKey: 'test-key',
                    temperature: 0.7,
                    maxTokens: 2000
                },
                anthropic: {
                    model: 'claude-3-sonnet-20240229',
                    apiKey: 'test-anthropic-key',
                    temperature: 0.7,
                    maxTokens: 2000
                },
                streaming: true,
                timeout: 30000
            };

            const autoProvider = new LLMProvider(autoConfig);
            await autoProvider.initialize();

            // Mock first provider failure, second success
            mockChatModel.invoke
                .mockRejectedValueOnce(new Error('Primary provider failed'))
                .mockResolvedValueOnce(new AIMessage('Fallback success'));

            const response = await autoProvider.invoke([{ role: 'user', content: 'Hello' }]);

            expect(response.content).toBe('Fallback success');
        });

        it('should throw error when no model available', async () => {
            const uninitializedProvider = new LLMProvider(baseConfig);

            await expect(uninitializedProvider.invoke([{ role: 'user', content: 'Hello' }]))
                .rejects.toThrow('No LLM model available');
        });

        it('should handle abort signal', async () => {
            const controller = new AbortController();
            const signal = controller.signal;

            await provider.invoke([{ role: 'user', content: 'Hello' }], { signal });

            expect(mockChatModel.invoke).toHaveBeenCalledWith(
                expect.any(Array),
                { signal }
            );
        });
    });

    describe('stream', () => {
        beforeEach(async () => {
            await provider.initialize();

            // Mock async iterator
            const mockChunks = [
                { content: 'Hello ' },
                { content: 'world!' }
            ];

            async function* mockStreamGenerator() {
                for (const chunk of mockChunks) {
                    yield chunk;
                }
            }

            mockChatModel.stream.mockResolvedValue(mockStreamGenerator());
        });

        it('should stream response successfully', async () => {
            const messages: ChatMessage[] = [
                { role: 'user', content: 'Hello' }
            ];

            const chunks: string[] = [];
            for await (const chunk of provider.stream(messages)) {
                chunks.push(chunk);
            }

            expect(chunks).toEqual(['Hello ', 'world!']);
            expect(mockChatModel.stream).toHaveBeenCalledWith(
                expect.arrayContaining([expect.any(HumanMessage)]),
                { signal: undefined }
            );
        });

        it('should emit stream events', async () => {
            const startSpy = jest.fn();
            const chunkSpy = jest.fn();
            const completeSpy = jest.fn();

            provider.on('streamStart', startSpy);
            provider.on('streamChunk', chunkSpy);
            provider.on('streamComplete', completeSpy);

            const chunks: string[] = [];
            for await (const chunk of provider.stream([{ role: 'user', content: 'Hello' }])) {
                chunks.push(chunk);
            }

            expect(startSpy).toHaveBeenCalledWith({ provider: 'openai' });
            expect(chunkSpy).toHaveBeenCalledTimes(2);
            expect(completeSpy).toHaveBeenCalledWith({ provider: 'openai' });
        });

        it('should handle streaming errors', async () => {
            mockChatModel.stream.mockRejectedValue(new Error('Streaming failed'));

            const streamGen = provider.stream([{ role: 'user', content: 'Hello' }]);

            await expect(streamGen.next()).rejects.toThrow('Streaming failed');
        });

        it('should skip empty chunks', async () => {
            const mockChunksWithEmpty = [
                { content: 'Hello ' },
                { content: '' }, // Empty chunk
                { content: 'world!' }
            ];

            async function* mockStreamWithEmpty() {
                for (const chunk of mockChunksWithEmpty) {
                    yield chunk;
                }
            }

            mockChatModel.stream.mockResolvedValue(mockStreamWithEmpty());

            const chunks: string[] = [];
            for await (const chunk of provider.stream([{ role: 'user', content: 'Hello' }])) {
                chunks.push(chunk);
            }

            expect(chunks).toEqual(['Hello ', 'world!']); // Empty chunk filtered out
        });
    });

    describe('chat (legacy)', () => {
        beforeEach(async () => {
            await provider.initialize();
        });

        it('should return stream when streaming enabled', async () => {
            const mockChunks = [{ content: 'Hello' }];
            async function* mockGen() { yield* mockChunks; }
            mockChatModel.stream.mockResolvedValue(mockGen());

            const result = await provider.chat([{ role: 'user', content: 'Hello' }]);

            // Should return async generator
            expect(result).toBeDefined();
            expect(typeof (result as any)[Symbol.asyncIterator]).toBe('function');
        });

        it('should return single response when streaming disabled', async () => {
            const nonStreamingConfig = { ...baseConfig, streaming: false };
            const nonStreamingProvider = new LLMProvider(nonStreamingConfig);
            await nonStreamingProvider.initialize();

            mockChatModel.invoke.mockResolvedValue(new AIMessage('Response'));

            const result = await nonStreamingProvider.chat([{ role: 'user', content: 'Hello' }]);

            expect(result).toEqual({
                content: 'Response',
                finishReason: 'stop'
            });
        });
    });

    describe('getTokenCount', () => {
        beforeEach(async () => {
            await provider.initialize();
        });

        it('should use model getNumTokens method when available', async () => {
            mockChatModel.getNumTokens.mockResolvedValue(10);

            const count = await provider.getTokenCount([{ role: 'user', content: 'Hello' }]);

            expect(count).toBe(10);
            expect(mockChatModel.getNumTokens).toHaveBeenCalled();
        });

        it('should estimate tokens when getNumTokens unavailable', async () => {
            const modelWithoutTokens = { ...mockChatModel };
            delete (modelWithoutTokens as any).getNumTokens;
            (provider as any).model = modelWithoutTokens;

            const count = await provider.getTokenCount([{ role: 'user', content: 'Hello world test message' }]);

            // Should estimate: 24 chars / 4 = 6 tokens (rounded up)
            expect(count).toBe(6);
        });

        it('should handle getNumTokens errors gracefully', async () => {
            mockChatModel.getNumTokens.mockRejectedValue(new Error('Token counting failed'));

            const count = await provider.getTokenCount([{ role: 'user', content: 'Hello' }]);

            // Should fallback to estimation
            expect(count).toBeGreaterThan(0);
        });
    });

    describe('updateConfig', () => {
        it('should update config and reinitialize', async () => {
            await provider.initialize();
            const originalProvider = provider.getCurrentProvider();

            const eventSpy = jest.fn();
            provider.on('configUpdated', eventSpy);

            await provider.updateConfig({
                openai: {
                    ...baseConfig.openai!,
                    model: 'gpt-3.5-turbo'
                }
            });

            expect(provider.getConfig().openai?.model).toBe('gpt-3.5-turbo');
            expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
                openai: expect.objectContaining({
                    model: 'gpt-3.5-turbo'
                })
            }));
        });
    });

    describe('withTools', () => {
        beforeEach(async () => {
            await provider.initialize();
        });

        it('should bind tools to model', () => {
            const tools = [{ name: 'test_tool' }];
            const boundModel = { ...mockChatModel };
            mockChatModel.bindTools.mockReturnValue(boundModel);

            const result = provider.withTools(tools);

            expect(mockChatModel.bindTools).toHaveBeenCalledWith(tools);
            expect(result).toBe(boundModel);
        });

        it('should return null when model unavailable', () => {
            (provider as any).model = null;

            const result = provider.withTools([]);

            expect(result).toBeNull();
        });

        it('should return null when bindTools unsupported', () => {
            const modelWithoutBindTools = {};
            (provider as any).model = modelWithoutBindTools;

            const result = provider.withTools([]);

            expect(result).toBeNull();
        });

        it('should handle bindTools errors', () => {
            mockChatModel.bindTools.mockImplementation(() => {
                throw new Error('Binding failed');
            });

            const result = provider.withTools([]);

            expect(result).toBeNull();
        });
    });

    describe('withFunctions (legacy)', () => {
        beforeEach(async () => {
            await provider.initialize();
        });

        it('should delegate to withTools', () => {
            const functions = [{ name: 'test_function' }];
            const spy = jest.spyOn(provider, 'withTools');

            provider.withFunctions(functions);

            expect(spy).toHaveBeenCalledWith(functions);
        });
    });

    describe('getAvailableModels', () => {
        it('should return Ollama models from API', async () => {
            mockedAxios.get.mockResolvedValue({
                status: 200,
                data: {
                    models: [
                        { name: 'llama2' },
                        { name: 'codellama' }
                    ]
                }
            });

            const ollamaConfig: LLMConfig = {
                provider: 'ollama',
                ollama: {
                    model: 'llama2',
                    baseUrl: 'http://127.0.0.1:11435',
                    temperature: 0.7
                },
                streaming: true,
                timeout: 30000
            };

            const ollamaProvider = new LLMProvider(ollamaConfig);
            await ollamaProvider.initialize();

            const models = await ollamaProvider.getAvailableModels();

            expect(models).toEqual(['llama2', 'codellama']);
        });

        it('should handle Ollama API errors', async () => {
            mockedAxios.get.mockRejectedValue(new Error('API error'));

            const ollamaConfig: LLMConfig = {
                provider: 'ollama',
                ollama: {
                    model: 'llama2',
                    baseUrl: 'http://127.0.0.1:11435',
                    temperature: 0.7
                },
                streaming: true,
                timeout: 30000
            };

            const ollamaProvider = new LLMProvider(ollamaConfig);
            await ollamaProvider.initialize();

            const models = await ollamaProvider.getAvailableModels();

            expect(models).toEqual([]);
        });

        it('should return Azure models', async () => {
            const azureConfig: LLMConfig = {
                provider: 'azure',
                azure: {
                    deploymentName: 'gpt-4',
                    apiKey: 'test-key',
                    apiVersion: '2023-05-15',
                    instanceName: 'test-instance',
                    temperature: 0.7,
                    maxTokens: 2000
                },
                streaming: true,
                timeout: 30000
            };

            const azureProvider = new LLMProvider(azureConfig);
            await azureProvider.initialize();

            const models = await azureProvider.getAvailableModels();

            expect(models).toEqual(['gpt-4', 'gpt-35-turbo']);
        });
    });

    describe('Ollama-specific methods', () => {
        let ollamaProvider: LLMProvider;

        beforeEach(async () => {
            mockedAxios.get.mockResolvedValue({ status: 200, data: { models: [] } });

            const ollamaConfig: LLMConfig = {
                provider: 'ollama',
                ollama: {
                    model: 'llama2',
                    baseUrl: 'http://127.0.0.1:11435',
                    temperature: 0.7
                },
                streaming: true,
                timeout: 30000
            };

            ollamaProvider = new LLMProvider(ollamaConfig);
            await ollamaProvider.initialize();
        });

        describe('pullOllamaModel', () => {
            it('should pull model successfully', async () => {
                mockedAxios.post.mockResolvedValue({ status: 200 });

                const success = await ollamaProvider.pullOllamaModel('llama2');

                expect(success).toBe(true);
                expect(mockedAxios.post).toHaveBeenCalledWith(
                    'http://127.0.0.1:11435/api/pull',
                    { name: 'llama2' }
                );
            });

            it('should handle pull errors', async () => {
                mockedAxios.post.mockRejectedValue(new Error('Pull failed'));

                const success = await ollamaProvider.pullOllamaModel('llama2');

                expect(success).toBe(false);
            });

            it('should return false for non-Ollama provider', async () => {
                const success = await provider.pullOllamaModel('llama2');

                expect(success).toBe(false);
            });
        });

        describe('listOllamaServerModels', () => {
            it('should list server models', async () => {
                mockedAxios.get.mockResolvedValue({
                    data: {
                        models: [
                            { name: 'llama2' },
                            { name: 'codellama' }
                        ]
                    }
                });

                const models = await ollamaProvider.listOllamaServerModels();

                expect(models).toEqual(['llama2', 'codellama']);
            });

            it('should handle server errors', async () => {
                mockedAxios.get.mockRejectedValue(new Error('Server error'));

                const models = await ollamaProvider.listOllamaServerModels();

                expect(models).toEqual([]);
            });
        });
    });

    describe('utility methods', () => {
        beforeEach(async () => {
            await provider.initialize();
        });

        it('should get chat model', () => {
            const model = provider.getChatModel();
            expect(model).toBe(mockChatModel);
        });

        it('should get current provider', () => {
            const currentProvider = provider.getCurrentProvider();
            expect(currentProvider).toBe('openai');
        });

        it('should get config copy', () => {
            const config = provider.getConfig();
            expect(config).toEqual(baseConfig);
            expect(config).not.toBe(baseConfig); // Should be a copy
        });

        it('should get connection status', () => {
            const status = provider.getConnectionStatus();
            expect(status).toHaveProperty('openai', true);
            expect(status).toHaveProperty('ollama');
        });
    });

    describe('error handling', () => {
        it('should handle initialization failure', async () => {
            const invalidProvider = new LLMProvider({
                provider: 'invalid' as any,
                streaming: true,
                timeout: 30000
            });

            await expect(invalidProvider.initialize()).rejects.toThrow();
        });

        it('should emit error events', async () => {
            await provider.initialize();

            const errorSpy = jest.fn();
            provider.on('invokeError', errorSpy);

            mockChatModel.invoke.mockRejectedValue(new Error('Test error'));

            await expect(provider.invoke([{ role: 'user', content: 'Hello' }]))
                .rejects.toThrow('Test error');

            expect(errorSpy).toHaveBeenCalledWith({
                provider: 'openai',
                error: expect.any(Error)
            });
        });

        it('should handle missing model methods gracefully', async () => {
            await provider.initialize();
            (provider as any).model = {}; // Model without required methods

            await expect(provider.invoke([{ role: 'user', content: 'Hello' }]))
                .rejects.toThrow();
        });
    });

    describe('isBaseMessageArray helper', () => {
        it('should identify BaseMessage arrays correctly', () => {
            const baseMessages = [new HumanMessage('Hello')];
            const chatMessages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];

            // Access private method for testing
            const isBaseMessageArray = (provider as any).isBaseMessageArray;

            expect(isBaseMessageArray(baseMessages)).toBe(true);
            expect(isBaseMessageArray(chatMessages)).toBe(false);
            expect(isBaseMessageArray([])).toBe(false);
        });
    });
});