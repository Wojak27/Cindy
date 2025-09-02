/**
 * Unit tests for LangGraphAgent
 */

import { RouterLangGraphAgent, RouterLangGraphAgentOptions } from '../RouterLangGraphAgent';
import { LLMProvider } from '../../services/LLMProvider';
import { LangChainMemoryService } from '../../services/LangChainMemoryService';

// Mock dependencies
const mockLLMProvider = {
    getCurrentProvider: jest.fn().mockReturnValue('openai'),
    invoke: jest.fn(),
    stream: jest.fn(),
    initialize: jest.fn().mockResolvedValue(undefined)
};

const mockMemoryService = {
    initialize: jest.fn().mockResolvedValue(undefined),
    addMemory: jest.fn().mockResolvedValue(undefined),
    searchMemories: jest.fn().mockResolvedValue([])
};

const mockDeepResearchIntegration = {
    processMessage: jest.fn(),
    streamMessage: jest.fn(),
    updateSettings: jest.fn().mockResolvedValue(undefined),
    getStatus: jest.fn().mockReturnValue({
        enabled: true,
        fallbackEnabled: true,
        configuration: { searchAPI: 'duckduckgo' }
    }),
    setEnabled: jest.fn(),
    setFallbackEnabled: jest.fn(),
    getDeepResearchAgent: jest.fn().mockReturnValue({
        getMainGraph: jest.fn().mockReturnValue({
            get_graph: jest.fn().mockReturnValue({
                draw_mermaid: jest.fn().mockReturnValue('graph TD; A --> B;')
            })
        })
    })
};

const mockToolRegistry = {
    getAvailableTools: jest.fn().mockReturnValue(['web_search', 'weather', 'calculator'])
};

// Mock the DeepResearchIntegration
jest.mock('../research/DeepResearchIntegration', () => ({
    DeepResearchIntegration: jest.fn().mockImplementation(() => mockDeepResearchIntegration)
}));

// Mock the tool registry
jest.mock('../tools/ToolRegistry', () => ({
    toolRegistry: mockToolRegistry
}));

// Mock SettingsService
jest.mock('../../services/SettingsService');

describe('LangGraphAgent', () => {
    let agent: RouterLangGraphAgent;
    let agentOptions: RouterLangGraphAgentOptions;

    beforeEach(() => {
        jest.clearAllMocks();

        agentOptions = {
            llmProvider: mockLLMProvider as any,
            memoryService: mockMemoryService as any,
            config: { enableStreaming: true }
        };

        agent = new RouterLangGraphAgent(agentOptions);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should create LangGraphAgent instance', () => {
            expect(agent).toBeInstanceOf(RouterLangGraphAgent);
        });

        it('should initialize DeepResearchIntegration with correct options', () => {
            const { DeepResearchIntegration } = require('../research/DeepResearchIntegration');
            expect(DeepResearchIntegration).toHaveBeenCalledWith({
                llmProvider: mockLLMProvider,
                settingsService: expect.any(Object),
                enableDeepResearch: true,
                fallbackToOriginal: true
            });
        });

        it('should create compatibility settings service', () => {
            const compatibilityService = (agent as any).settingsService;
            expect(compatibilityService).toBeDefined();
            expect(typeof compatibilityService.getCurrentProvider).toBe('function');
        });

        it('should log initialization details', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            new RouterLangGraphAgent(agentOptions);

            expect(consoleSpy).toHaveBeenCalledWith(
                '[RouterLangGraphAgent] Initialized with Deep Research architecture'
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                '[RouterLangGraphAgent] Using provider:', 'openai'
            );

            consoleSpy.mockRestore();
        });
    });

    describe('process', () => {
        it('should process input through Deep Research integration', async () => {
            const input = 'Test research query';
            const expectedResult = 'Deep research result';

            mockDeepResearchIntegration.processMessage.mockResolvedValue({
                usedDeepResearch: true,
                result: expectedResult,
                processingTime: 1500
            });

            const result = await agent.process(input);

            expect(mockDeepResearchIntegration.processMessage).toHaveBeenCalledWith(input);
            expect(result).toBe(expectedResult);
        });

        it('should handle Tool Agent processing', async () => {
            const input = 'Weather in New York';
            const expectedResult = 'Tool agent result';

            mockDeepResearchIntegration.processMessage.mockResolvedValue({
                usedDeepResearch: false,
                usedToolAgent: true,
                result: expectedResult,
                processingTime: 800
            });

            const result = await agent.process(input);

            expect(result).toBe(expectedResult);
        });

        it('should handle direct response processing', async () => {
            const input = 'Simple query';
            const expectedResult = 'Direct response';

            mockDeepResearchIntegration.processMessage.mockResolvedValue({
                usedDeepResearch: false,
                usedToolAgent: false,
                result: expectedResult,
                processingTime: 300
            });

            const result = await agent.process(input);

            expect(result).toBe(expectedResult);
        });

        it('should handle fallback responses', async () => {
            const input = 'Complex query';

            mockDeepResearchIntegration.processMessage.mockResolvedValue({
                usedDeepResearch: true,
                result: 'FALLBACK_TO_ORIGINAL',
                processingTime: 2000
            });

            const result = await agent.process(input);

            expect(result).toBe('FALLBACK_TO_ORIGINAL');
        });

        it('should handle processing errors gracefully', async () => {
            const input = 'Error query';
            const errorMessage = 'Processing failed';

            mockDeepResearchIntegration.processMessage.mockRejectedValue(new Error(errorMessage));

            const result = await agent.process(input);

            expect(result).toBe(`I encountered an error: ${errorMessage}`);
        });

        it('should log processing details for each mode', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            // Test Deep Research mode
            mockDeepResearchIntegration.processMessage.mockResolvedValue({
                usedDeepResearch: true,
                result: 'Deep research result',
                processingTime: 1500
            });

            await agent.process('Research query');

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Deep Research completed in 1500ms')
            );

            consoleSpy.mockRestore();
        });
    });

    describe('processStreaming', () => {
        it('should stream Deep Research processing with progress updates', async () => {
            const input = 'Streaming research query';

            async function* mockStreamGenerator() {
                yield {
                    usedDeepResearch: true,
                    type: 'progress',
                    content: 'Starting research...'
                };
                yield {
                    usedDeepResearch: true,
                    type: 'progress',
                    content: 'Analyzing sources...'
                };
                yield {
                    usedDeepResearch: true,
                    type: 'result',
                    content: 'Final research result'
                };
            }

            mockDeepResearchIntegration.streamMessage.mockReturnValue(mockStreamGenerator());

            const responses: string[] = [];
            for await (const response of agent.processStreaming(input)) {
                responses.push(response);
            }

            expect(mockDeepResearchIntegration.streamMessage).toHaveBeenCalledWith(input);
            expect(responses).toEqual([
                '📋 Starting research...\n\n',
                '📋 Analyzing sources...\n\n',
                'Final research result'
            ]);
        });

        it('should stream Tool Agent processing with tool results', async () => {
            const input = 'Tool query';

            async function* mockStreamGenerator() {
                yield {
                    usedDeepResearch: false,
                    usedToolAgent: true,
                    type: 'progress',
                    content: 'Executing weather tool...'
                };
                yield {
                    usedDeepResearch: false,
                    usedToolAgent: true,
                    type: 'tool_result',
                    content: 'Temperature: 72°F'
                };
                yield {
                    usedDeepResearch: false,
                    usedToolAgent: true,
                    type: 'result',
                    content: 'Weather information retrieved'
                };
            }

            mockDeepResearchIntegration.streamMessage.mockReturnValue(mockStreamGenerator());

            const responses: string[] = [];
            for await (const response of agent.processStreaming(input)) {
                responses.push(response);
            }

            expect(responses).toEqual([
                '🔧 Executing weather tool...\n\n',
                '⚡ Temperature: 72°F\n\n',
                'Weather information retrieved'
            ]);
        });

        it('should handle side view data for weather', async () => {
            const input = 'Weather query';
            const weatherData = {
                temperature: 72,
                condition: 'sunny',
                location: 'New York'
            };

            async function* mockStreamGenerator() {
                yield {
                    usedDeepResearch: false,
                    usedToolAgent: true,
                    type: 'side_view',
                    content: 'Weather data available',
                    data: {
                        type: 'weather',
                        data: weatherData
                    }
                };
            }

            mockDeepResearchIntegration.streamMessage.mockReturnValue(mockStreamGenerator());

            const responses: string[] = [];
            for await (const response of agent.processStreaming(input)) {
                responses.push(response);
            }

            expect(responses).toEqual([
                `📊 ${JSON.stringify(weatherData)}\n\n`
            ]);
        });

        it('should handle side view data for maps', async () => {
            const input = 'Map query';
            const mapData = {
                latitude: 40.7128,
                longitude: -74.0060,
                location: 'New York City'
            };

            async function* mockStreamGenerator() {
                yield {
                    usedDeepResearch: false,
                    usedToolAgent: true,
                    type: 'side_view',
                    content: 'Map data available',
                    data: {
                        type: 'map',
                        data: mapData
                    }
                };
            }

            mockDeepResearchIntegration.streamMessage.mockReturnValue(mockStreamGenerator());

            const responses: string[] = [];
            for await (const response of agent.processStreaming(input)) {
                responses.push(response);
            }

            expect(responses).toEqual([
                `📊 ${JSON.stringify(mapData)}\n\n`
            ]);
        });

        it('should handle direct LLM responses', async () => {
            const input = 'Direct query';

            async function* mockStreamGenerator() {
                yield {
                    usedDeepResearch: false,
                    usedToolAgent: false,
                    content: 'Direct response part 1'
                };
                yield {
                    usedDeepResearch: false,
                    usedToolAgent: false,
                    content: 'Direct response part 2'
                };
            }

            mockDeepResearchIntegration.streamMessage.mockReturnValue(mockStreamGenerator());

            const responses: string[] = [];
            for await (const response of agent.processStreaming(input)) {
                responses.push(response);
            }

            expect(responses).toEqual([
                'Direct response part 1',
                'Direct response part 2'
            ]);
        });

        it('should handle streaming errors gracefully', async () => {
            const input = 'Error query';

            async function* mockErrorGenerator() {
                yield {
                    usedDeepResearch: true,
                    type: 'progress',
                    content: 'Starting...'
                };
                throw new Error('Streaming failed');
            }

            mockDeepResearchIntegration.streamMessage.mockReturnValue(mockErrorGenerator());

            const responses: string[] = [];
            for await (const response of agent.processStreaming(input)) {
                responses.push(response);
            }

            expect(responses).toHaveLength(2);
            expect(responses[0]).toBe('📋 Starting...\n\n');
            expect(responses[1]).toContain('❌ **Error:**');
            expect(responses[1]).toContain('Streaming failed');
        });

        it('should pass context to Deep Research integration', async () => {
            const input = 'Context query';
            const context = {
                conversationId: 'conv-123',
                userId: 'user-456',
                sessionId: 'session-789'
            };

            async function* mockStreamGenerator() {
                yield {
                    usedDeepResearch: false,
                    usedToolAgent: false,
                    content: 'Response with context'
                };
            }

            mockDeepResearchIntegration.streamMessage.mockReturnValue(mockStreamGenerator());

            const responses: string[] = [];
            for await (const response of agent.processStreaming(input, context)) {
                responses.push(response);
            }

            expect(mockDeepResearchIntegration.streamMessage).toHaveBeenCalledWith(input);
            expect(responses).toEqual(['Response with context']);
        });
    });

    describe('getCurrentProvider', () => {
        it('should return current provider from LLM provider', () => {
            const provider = agent.getCurrentProvider();
            expect(provider).toBe('openai');
            expect(mockLLMProvider.getCurrentProvider).toHaveBeenCalled();
        });

        it('should handle provider retrieval errors', () => {
            mockLLMProvider.getCurrentProvider.mockImplementationOnce(() => {
                throw new Error('Provider unavailable');
            });

            expect(() => agent.getCurrentProvider()).toThrow('Provider unavailable');
        });
    });

    describe('getAvailableTools', () => {
        it('should return available tools from registry', () => {
            const tools = agent.getAvailableTools();
            expect(tools).toEqual(['web_search', 'weather', 'calculator']);
            expect(mockToolRegistry.getAvailableTools).toHaveBeenCalled();
        });

        it('should handle empty tool registry', () => {
            mockToolRegistry.getAvailableTools.mockReturnValueOnce([]);

            const tools = agent.getAvailableTools();
            expect(tools).toEqual([]);
        });
    });

    describe('updateSettings', () => {
        it('should update settings through Deep Research integration', async () => {
            await agent.updateSettings();

            expect(mockDeepResearchIntegration.updateSettings).toHaveBeenCalled();
        });

        it('should handle settings update errors', async () => {
            const errorMessage = 'Settings update failed';
            mockDeepResearchIntegration.updateSettings.mockRejectedValueOnce(new Error(errorMessage));

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            await agent.updateSettings();

            expect(consoleSpy).toHaveBeenCalledWith(
                '[RouterLangGraphAgent] Error updating settings:',
                expect.any(Error)
            );

            consoleSpy.mockRestore();
        });

        it('should log successful settings update', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            await agent.updateSettings();

            expect(consoleSpy).toHaveBeenCalledWith(
                '[RouterLangGraphAgent] Settings updated successfully'
            );

            consoleSpy.mockRestore();
        });
    });

    describe('getStatus', () => {
        it('should return comprehensive status information', () => {
            const status = agent.getStatus();

            expect(status).toEqual({
                provider: 'openai',
                availableTools: ['web_search', 'weather', 'calculator'],
                deepResearchStatus: {
                    enabled: true,
                    fallbackEnabled: true,
                    configuration: { searchAPI: 'duckduckgo' }
                }
            });
        });

        it('should handle status retrieval with different providers', () => {
            mockLLMProvider.getCurrentProvider.mockReturnValueOnce('ollama');

            const status = agent.getStatus();

            expect(status.provider).toBe('ollama');
        });
    });

    describe('Deep Research configuration', () => {
        it('should enable Deep Research', () => {
            agent.setDeepResearchEnabled(true);

            expect(mockDeepResearchIntegration.setEnabled).toHaveBeenCalledWith(true);
        });

        it('should disable Deep Research', () => {
            agent.setDeepResearchEnabled(false);

            expect(mockDeepResearchIntegration.setEnabled).toHaveBeenCalledWith(false);
        });

        it('should log Deep Research state changes', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            agent.setDeepResearchEnabled(true);
            expect(consoleSpy).toHaveBeenCalledWith('[RouterLangGraphAgent] Deep Research enabled');

            agent.setDeepResearchEnabled(false);
            expect(consoleSpy).toHaveBeenCalledWith('[RouterLangGraphAgent] Deep Research disabled');

            consoleSpy.mockRestore();
        });

        it('should enable fallback behavior', () => {
            agent.setFallbackEnabled(true);

            expect(mockDeepResearchIntegration.setFallbackEnabled).toHaveBeenCalledWith(true);
        });

        it('should disable fallback behavior', () => {
            agent.setFallbackEnabled(false);

            expect(mockDeepResearchIntegration.setFallbackEnabled).toHaveBeenCalledWith(false);
        });

        it('should log fallback state changes', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            agent.setFallbackEnabled(true);
            expect(consoleSpy).toHaveBeenCalledWith(
                '[RouterLangGraphAgent] Fallback to standard processing enabled'
            );

            agent.setFallbackEnabled(false);
            expect(consoleSpy).toHaveBeenCalledWith(
                '[RouterLangGraphAgent] Fallback to standard processing disabled'
            );

            consoleSpy.mockRestore();
        });
    });

    describe('getDeepResearchIntegration', () => {
        it('should return Deep Research integration instance', () => {
            const integration = agent.getDeepResearchIntegration();
            expect(integration).toBe(mockDeepResearchIntegration);
        });
    });

    describe('graph visualization', () => {
        beforeEach(() => {
            // Mock file system operations
            const mockFs = {
                promises: {
                    writeFile: jest.fn().mockResolvedValue(undefined)
                }
            };

            const mockPath = {
                resolve: jest.fn().mockImplementation((path) => path)
            };

            const mockSpawn = jest.fn();

            jest.doMock('fs', () => mockFs);
            jest.doMock('path', () => mockPath);
            jest.doMock('child_process', () => ({ spawn: mockSpawn }));
        });

        afterEach(() => {
            jest.dontMock('fs');
            jest.dontMock('path');
            jest.dontMock('child_process');
        });

        it('should export graph as PNG with default options', async () => {
            const result = await agent.exportGraphAsPNG();

            expect(result).toContain('agent-graph');
            expect(mockDeepResearchIntegration.getDeepResearchAgent).toHaveBeenCalled();
        });

        it('should export graph with custom options', async () => {
            const options = {
                outputPath: './custom-graph.png',
                enableLangSmith: true,
                projectName: 'custom-project'
            };

            const result = await agent.exportGraphAsPNG(options);

            expect(result).toContain('custom-graph');
        });

        it('should setup LangSmith tracing when enabled', async () => {
            const options = {
                enableLangSmith: true,
                projectName: 'test-project'
            };

            await agent.exportGraphAsPNG(options);

            expect(process.env.LANGCHAIN_TRACING_V2).toBe('true');
            expect(process.env.LANGCHAIN_PROJECT).toBe('test-project');
        });

        it('should handle graph export errors', async () => {
            mockDeepResearchIntegration.getDeepResearchAgent.mockImplementationOnce(() => {
                throw new Error('Graph access failed');
            });

            await expect(agent.exportGraphAsPNG()).rejects.toThrow('Graph access failed');
        });

        it('should generate fallback mermaid code', () => {
            const mermaidCode = (agent as any).generateFallbackMermaidCode();

            expect(mermaidCode).toContain('graph TD');
            expect(mermaidCode).toContain('ClarificationNode');
            expect(mermaidCode).toContain('ResearcherGraph');
            expect(mermaidCode).toContain('SynthesisNode');
        });
    });

    describe('getDebugInfo', () => {
        it('should return comprehensive debug information', () => {
            const debugInfo = agent.getDebugInfo();

            expect(debugInfo).toMatchObject({
                timestamp: expect.any(String),
                architecture: 'Deep Research Enhanced LangGraph Agent',
                provider: 'openai',
                tools: {
                    available: ['web_search', 'weather', 'calculator'],
                    count: 3
                },
                deepResearch: {
                    enabled: true,
                    fallbackEnabled: true,
                    configuration: { searchAPI: 'duckduckgo' }
                },
                graphs: {
                    main: 'ClarificationNode → ResearchProcess → SynthesisNode',
                    supervisor: 'SupervisorNode ↔ DelegateResearch',
                    researcher: 'ResearcherNode (tool execution)'
                },
                langsmith: {
                    enabled: false,
                    project: 'not-set',
                    apiKeyConfigured: false
                }
            });
        });

        it('should include LangSmith configuration when available', () => {
            process.env.LANGCHAIN_TRACING_V2 = 'true';
            process.env.LANGCHAIN_PROJECT = 'test-project';
            process.env.LANGCHAIN_API_KEY = 'test-key';

            const debugInfo = agent.getDebugInfo();

            expect(debugInfo.langsmith).toEqual({
                enabled: true,
                project: 'test-project',
                apiKeyConfigured: true
            });

            // Cleanup
            delete process.env.LANGCHAIN_TRACING_V2;
            delete process.env.LANGCHAIN_PROJECT;
            delete process.env.LANGCHAIN_API_KEY;
        });
    });

    describe('compatibility settings service', () => {
        it('should create minimal settings service for compatibility', () => {
            const compatibilityService = (agent as any).createCompatibilitySettingsService();

            expect(compatibilityService).toBeDefined();
            expect(typeof compatibilityService.getCurrentProvider).toBe('function');
            expect(compatibilityService.getCurrentProvider()).toBe('openai');
        });
    });

    describe('concurrent operations', () => {
        it('should handle multiple concurrent processing operations', async () => {
            mockDeepResearchIntegration.processMessage
                .mockResolvedValueOnce({
                    usedDeepResearch: true,
                    result: 'Research result 1',
                    processingTime: 1000
                })
                .mockResolvedValueOnce({
                    usedDeepResearch: true,
                    result: 'Research result 2',
                    processingTime: 1200
                });

            const promise1 = agent.process('Query 1');
            const promise2 = agent.process('Query 2');

            const [result1, result2] = await Promise.all([promise1, promise2]);

            expect(result1).toBe('Research result 1');
            expect(result2).toBe('Research result 2');
        });

        it('should handle multiple concurrent streaming operations', async () => {
            async function* mockGenerator1() {
                yield { usedDeepResearch: false, usedToolAgent: false, content: 'Stream 1' };
            }

            async function* mockGenerator2() {
                yield { usedDeepResearch: false, usedToolAgent: false, content: 'Stream 2' };
            }

            mockDeepResearchIntegration.streamMessage
                .mockReturnValueOnce(mockGenerator1())
                .mockReturnValueOnce(mockGenerator2());

            const promise1 = (async () => {
                const responses: string[] = [];
                for await (const response of agent.processStreaming('Stream Query 1')) {
                    responses.push(response);
                }
                return responses;
            })();

            const promise2 = (async () => {
                const responses: string[] = [];
                for await (const response of agent.processStreaming('Stream Query 2')) {
                    responses.push(response);
                }
                return responses;
            })();

            const [responses1, responses2] = await Promise.all([promise1, promise2]);

            expect(responses1).toEqual(['Stream 1']);
            expect(responses2).toEqual(['Stream 2']);
        });
    });

    describe('edge cases', () => {
        it('should handle null/undefined inputs in process', async () => {
            mockDeepResearchIntegration.processMessage.mockResolvedValue({
                usedDeepResearch: false,
                usedToolAgent: false,
                result: 'Handled null input',
                processingTime: 100
            });

            const result = await agent.process(null as any);

            expect(mockDeepResearchIntegration.processMessage).toHaveBeenCalledWith(null);
            expect(result).toBe('Handled null input');
        });

        it('should handle very long input strings', async () => {
            const longInput = 'x'.repeat(10000);

            mockDeepResearchIntegration.processMessage.mockResolvedValue({
                usedDeepResearch: false,
                usedToolAgent: false,
                result: 'Processed long input',
                processingTime: 500
            });

            const result = await agent.process(longInput);

            expect(mockDeepResearchIntegration.processMessage).toHaveBeenCalledWith(longInput);
            expect(result).toBe('Processed long input');
        });

        it('should handle special characters in input', async () => {
            const specialInput = '🤖 Research "AI systems" & <machine learning> {json: "data"}';

            mockDeepResearchIntegration.processMessage.mockResolvedValue({
                usedDeepResearch: true,
                result: 'Processed special characters',
                processingTime: 800
            });

            const result = await agent.process(specialInput);

            expect(result).toBe('Processed special characters');
        });

        it('should handle empty generator responses', async () => {
            async function* mockEmptyGenerator() {
                // Yield nothing
            }

            mockDeepResearchIntegration.streamMessage.mockReturnValue(mockEmptyGenerator());

            const responses: string[] = [];
            for await (const response of agent.processStreaming('Empty test')) {
                responses.push(response);
            }

            expect(responses).toEqual([]);
        });
    });

    describe('integration with tool registry', () => {
        it('should properly integrate with tool registry for tool availability', () => {
            const tools = agent.getAvailableTools();

            expect(mockToolRegistry.getAvailableTools).toHaveBeenCalled();
            expect(tools).toEqual(expect.arrayContaining(['web_search', 'weather', 'calculator']));
        });

        it('should handle tool registry updates', () => {
            mockToolRegistry.getAvailableTools
                .mockReturnValueOnce(['web_search'])
                .mockReturnValueOnce(['web_search', 'weather', 'calculator', 'new_tool']);

            expect(agent.getAvailableTools()).toEqual(['web_search']);
            expect(agent.getAvailableTools()).toEqual(['web_search', 'weather', 'calculator', 'new_tool']);
        });
    });
});