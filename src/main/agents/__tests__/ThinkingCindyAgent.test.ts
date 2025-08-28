/**
 * Unit tests for ThinkingCindyAgent
 */

import { ThinkingCindyAgent } from '../ThinkingCindyAgent';

// Mock dependencies
const mockLLMProvider = {
    getCurrentProvider: jest.fn().mockReturnValue('openai'),
    invoke: jest.fn(),
    stream: jest.fn()
};

const mockMemoryService = {
    initialize: jest.fn().mockResolvedValue(undefined),
    addMemory: jest.fn().mockResolvedValue(undefined),
    searchMemories: jest.fn().mockResolvedValue([])
};

const mockLangGraphAgent = {
    processStreaming: jest.fn()
};

// Mock LangGraphAgent
jest.mock('../LangGraphAgent', () => ({
    LangGraphAgent: jest.fn().mockImplementation(() => mockLangGraphAgent)
}));

describe('ThinkingCindyAgent', () => {
    let agent: ThinkingCindyAgent;
    let agentOptions: any;

    beforeEach(() => {
        jest.clearAllMocks();

        agentOptions = {
            store: { get: jest.fn(), set: jest.fn() },
            memoryService: mockMemoryService,
            config: { enableStreaming: true },
            llmRouter: mockLLMProvider
        };

        agent = new ThinkingCindyAgent(agentOptions);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should create ThinkingCindyAgent instance', () => {
            expect(agent).toBeInstanceOf(ThinkingCindyAgent);
        });

        it('should create LangGraphAgent with correct options', () => {
            const { LangGraphAgent } = require('../LangGraphAgent');
            expect(LangGraphAgent).toHaveBeenCalledWith({
                llmProvider: mockLLMProvider,
                memoryService: mockMemoryService,
                config: { enableStreaming: true }
            });
        });

        it('should initialize thinking steps array', () => {
            const steps = agent.getThinkingSteps();
            expect(steps).toEqual([]);
            expect(Array.isArray(steps)).toBe(true);
        });
    });

    describe('processStreaming', () => {
        it('should delegate to LangGraphAgent processStreaming', async () => {
            const input = 'Test query';
            const context = {
                conversationId: 'conv-123',
                userId: 'user-456',
                sessionId: 'session-789',
                timestamp: new Date(),
                preferences: { theme: 'dark' }
            };

            // Mock async generator
            async function* mockGenerator() {
                yield 'Response part 1';
                yield 'Response part 2';
            }

            mockLangGraphAgent.processStreaming.mockReturnValue(mockGenerator());

            const responses: string[] = [];
            for await (const response of agent.processStreaming(input, context)) {
                responses.push(response);
            }

            expect(mockLangGraphAgent.processStreaming).toHaveBeenCalledWith(input, context);
            expect(responses).toEqual(['Response part 1', 'Response part 2']);
        });

        it('should handle streaming without context', async () => {
            const input = 'Test query without context';

            async function* mockGenerator() {
                yield 'Single response';
            }

            mockLangGraphAgent.processStreaming.mockReturnValue(mockGenerator());

            const responses: string[] = [];
            for await (const response of agent.processStreaming(input)) {
                responses.push(response);
            }

            expect(mockLangGraphAgent.processStreaming).toHaveBeenCalledWith(input, undefined);
            expect(responses).toEqual(['Single response']);
        });

        it('should handle empty responses from LangGraphAgent', async () => {
            const input = 'Empty test';

            async function* mockEmptyGenerator() {
                // Yield nothing
            }

            mockLangGraphAgent.processStreaming.mockReturnValue(mockEmptyGenerator());

            const responses: string[] = [];
            for await (const response of agent.processStreaming(input)) {
                responses.push(response);
            }

            expect(responses).toEqual([]);
        });

        it('should handle errors from LangGraphAgent', async () => {
            const input = 'Error test';

            async function* mockErrorGenerator() {
                yield 'Start response';
                throw new Error('Processing failed');
            }

            mockLangGraphAgent.processStreaming.mockReturnValue(mockErrorGenerator());

            const responses: string[] = [];
            
            try {
                for await (const response of agent.processStreaming(input)) {
                    responses.push(response);
                }
            } catch (error) {
                expect(error.message).toBe('Processing failed');
            }

            expect(responses).toEqual(['Start response']);
        });

        it('should preserve async generator behavior', async () => {
            const input = 'Async test';

            async function* mockDelayedGenerator() {
                yield 'Immediate response';
                await new Promise(resolve => setTimeout(resolve, 10));
                yield 'Delayed response';
            }

            mockLangGraphAgent.processStreaming.mockReturnValue(mockDelayedGenerator());

            const responses: string[] = [];
            for await (const response of agent.processStreaming(input)) {
                responses.push(response);
            }

            expect(responses).toEqual(['Immediate response', 'Delayed response']);
        });
    });

    describe('getThinkingSteps', () => {
        it('should return copy of thinking steps array', () => {
            const steps1 = agent.getThinkingSteps();
            const steps2 = agent.getThinkingSteps();

            expect(steps1).toEqual(steps2);
            expect(steps1).not.toBe(steps2); // Different array instances
        });

        it('should return empty array initially', () => {
            const steps = agent.getThinkingSteps();

            expect(steps).toEqual([]);
            expect(Array.isArray(steps)).toBe(true);
        });

        it('should be safe to modify returned array', () => {
            const steps = agent.getThinkingSteps();
            steps.push({
                step: 'analyze',
                content: 'Test step',
                timestamp: new Date()
            });

            const freshSteps = agent.getThinkingSteps();
            expect(freshSteps).toEqual([]); // Original should be unchanged
        });
    });

    describe('integration with LangGraphAgent', () => {
        it('should pass all constructor options to LangGraphAgent', () => {
            const customOptions = {
                store: { customStore: true },
                memoryService: { customMemory: true },
                config: { customConfig: 'value', streaming: false },
                llmRouter: { customLLM: true }
            };

            new ThinkingCindyAgent(customOptions);

            const { LangGraphAgent } = require('../LangGraphAgent');
            expect(LangGraphAgent).toHaveBeenCalledWith({
                llmProvider: customOptions.llmRouter,
                memoryService: customOptions.memoryService,
                config: customOptions.config
            });
        });

        it('should handle LangGraphAgent creation errors', () => {
            const { LangGraphAgent } = require('../LangGraphAgent');
            LangGraphAgent.mockImplementationOnce(() => {
                throw new Error('LangGraphAgent creation failed');
            });

            expect(() => {
                new ThinkingCindyAgent(agentOptions);
            }).toThrow('LangGraphAgent creation failed');
        });
    });

    describe('backward compatibility', () => {
        it('should maintain interface compatibility with legacy code', () => {
            // Test that all expected methods exist
            expect(typeof agent.processStreaming).toBe('function');
            expect(typeof agent.getThinkingSteps).toBe('function');
        });

        it('should handle legacy context formats', async () => {
            const legacyContext = {
                conversationId: 'legacy-conv',
                sessionId: 'legacy-session',
                timestamp: new Date()
                // Missing userId, preferences
            };

            async function* mockGenerator() {
                yield 'Legacy response';
            }

            mockLangGraphAgent.processStreaming.mockReturnValue(mockGenerator());

            const responses: string[] = [];
            for await (const response of agent.processStreaming('Legacy input', legacyContext)) {
                responses.push(response);
            }

            expect(mockLangGraphAgent.processStreaming).toHaveBeenCalledWith('Legacy input', legacyContext);
            expect(responses).toEqual(['Legacy response']);
        });
    });

    describe('logging and debugging', () => {
        it('should log initialization details', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            new ThinkingCindyAgent(agentOptions);

            expect(consoleSpy).toHaveBeenCalledWith(
                '[ThinkingCindyAgent] Initialized with LangGraph architecture'
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                '[ThinkingCindyAgent] Using provider:', 'openai'
            );

            consoleSpy.mockRestore();
        });

        it('should handle provider info errors gracefully', () => {
            mockLLMProvider.getCurrentProvider.mockImplementation(() => {
                throw new Error('Provider info unavailable');
            });

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            expect(() => {
                new ThinkingCindyAgent(agentOptions);
            }).not.toThrow();

            consoleSpy.mockRestore();
        });
    });

    describe('concurrent operations', () => {
        it('should handle multiple concurrent streaming operations', async () => {
            async function* mockGenerator1() {
                yield 'Stream 1 - Part 1';
                yield 'Stream 1 - Part 2';
            }

            async function* mockGenerator2() {
                yield 'Stream 2 - Part 1';
                yield 'Stream 2 - Part 2';
            }

            mockLangGraphAgent.processStreaming
                .mockReturnValueOnce(mockGenerator1())
                .mockReturnValueOnce(mockGenerator2());

            const promise1 = (async () => {
                const responses: string[] = [];
                for await (const response of agent.processStreaming('Query 1')) {
                    responses.push(response);
                }
                return responses;
            })();

            const promise2 = (async () => {
                const responses: string[] = [];
                for await (const response of agent.processStreaming('Query 2')) {
                    responses.push(response);
                }
                return responses;
            })();

            const [responses1, responses2] = await Promise.all([promise1, promise2]);

            expect(responses1).toEqual(['Stream 1 - Part 1', 'Stream 1 - Part 2']);
            expect(responses2).toEqual(['Stream 2 - Part 1', 'Stream 2 - Part 2']);
        });
    });

    describe('memory management', () => {
        it('should not accumulate thinking steps by default', () => {
            // Since the implementation delegates to LangGraphAgent,
            // thinking steps should remain empty in this wrapper
            const stepsInitial = agent.getThinkingSteps();
            expect(stepsInitial).toEqual([]);

            // Even after processing, thinking steps should remain empty
            // (actual thinking happens in LangGraphAgent)
            const stepsAfter = agent.getThinkingSteps();
            expect(stepsAfter).toEqual([]);
        });
    });

    describe('edge cases', () => {
        it('should handle null/undefined inputs', async () => {
            async function* mockGenerator() {
                yield 'Handled null input';
            }

            mockLangGraphAgent.processStreaming.mockReturnValue(mockGenerator());

            const responses: string[] = [];
            for await (const response of agent.processStreaming(null as any)) {
                responses.push(response);
            }

            expect(mockLangGraphAgent.processStreaming).toHaveBeenCalledWith(null, undefined);
            expect(responses).toEqual(['Handled null input']);
        });

        it('should handle very long input strings', async () => {
            const longInput = 'x'.repeat(10000);

            async function* mockGenerator() {
                yield 'Processed long input';
            }

            mockLangGraphAgent.processStreaming.mockReturnValue(mockGenerator());

            const responses: string[] = [];
            for await (const response of agent.processStreaming(longInput)) {
                responses.push(response);
            }

            expect(mockLangGraphAgent.processStreaming).toHaveBeenCalledWith(longInput, undefined);
            expect(responses).toEqual(['Processed long input']);
        });

        it('should handle special characters in input', async () => {
            const specialInput = '🤖 Hello "world" & <test> {json: "value"}';

            async function* mockGenerator() {
                yield 'Processed special characters';
            }

            mockLangGraphAgent.processStreaming.mockReturnValue(mockGenerator());

            const responses: string[] = [];
            for await (const response of agent.processStreaming(specialInput)) {
                responses.push(response);
            }

            expect(mockLangGraphAgent.processStreaming).toHaveBeenCalledWith(specialInput, undefined);
            expect(responses).toEqual(['Processed special characters']);
        });
    });
});