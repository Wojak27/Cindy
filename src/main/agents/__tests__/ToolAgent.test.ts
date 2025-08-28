/**
 * Unit tests for ToolAgent
 */

import { ToolAgent, ToolAgentOptions } from '../ToolAgent';
import { LLMProvider } from '../../services/LLMProvider';
import { HumanMessage } from '@langchain/core/messages';

// Mock dependencies
const mockLLMProvider = {
    getCurrentProvider: jest.fn().mockReturnValue('openai'),
    invoke: jest.fn(),
    stream: jest.fn()
};

const mockToolRegistry = {
    getAvailableTools: jest.fn().mockReturnValue(['weather', 'web_search', 'wikipedia_search', 'display_map']),
    executeTool: jest.fn()
};

// Mock the tool registry
jest.mock('../tools/ToolRegistry', () => ({
    toolRegistry: mockToolRegistry
}));

// Mock HumanMessage
jest.mock('@langchain/core/messages', () => ({
    HumanMessage: jest.fn().mockImplementation((config) => ({ content: config.content }))
}));

describe('ToolAgent', () => {
    let agent: ToolAgent;
    let agentOptions: ToolAgentOptions;

    beforeEach(() => {
        jest.clearAllMocks();

        agentOptions = {
            llmProvider: mockLLMProvider as any,
            config: { enableLogging: true }
        };

        agent = new ToolAgent(agentOptions);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should create ToolAgent instance', () => {
            expect(agent).toBeInstanceOf(ToolAgent);
        });

        it('should store LLM provider', () => {
            expect((agent as any).llmProvider).toBe(mockLLMProvider);
        });

        it('should log initialization message', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            new ToolAgent(agentOptions);

            expect(consoleSpy).toHaveBeenCalledWith(
                '[ToolAgent] Initialized for quick tool-based requests'
            );

            consoleSpy.mockRestore();
        });
    });

    describe('process', () => {
        beforeEach(() => {
            // Mock successful tool planning
            mockLLMProvider.invoke.mockResolvedValue({
                content: JSON.stringify({
                    tools: [
                        { tool: 'weather', params: { location: 'New York, NY' } }
                    ],
                    reasoning: 'User asked for weather information'
                })
            });

            // Mock successful tool execution
            mockToolRegistry.executeTool.mockResolvedValue({
                success: true,
                result: JSON.stringify({
                    location: 'New York, NY',
                    temperature: '72°F',
                    condition: 'sunny'
                }),
                duration: 500
            });

            // Mock synthesis
            mockLLMProvider.invoke.mockResolvedValueOnce({
                content: JSON.stringify({
                    tools: [{ tool: 'weather', params: { location: 'New York, NY' } }],
                    reasoning: 'User asked for weather'
                })
            }).mockResolvedValueOnce({
                content: 'The current weather in New York is 72°F and sunny.'
            });
        });

        it('should process weather request successfully', async () => {
            const input = 'What\'s the weather in New York?';
            
            const result = await agent.process(input);

            expect(result).toMatchObject({
                result: expect.stringContaining('weather'),
                toolResults: expect.arrayContaining([
                    expect.objectContaining({
                        tool: 'weather',
                        params: { location: 'New York, NY' }
                    })
                ])
            });
        });

        it('should format weather data for side view', async () => {
            const input = 'Weather in Paris';
            
            const result = await agent.process(input);

            expect(result.sideViewData).toMatchObject({
                type: 'weather',
                title: expect.stringContaining('Weather for'),
                data: expect.any(Object),
                timestamp: expect.any(String)
            });
        });

        it('should handle map display requests', async () => {
            mockLLMProvider.invoke.mockReset();
            mockLLMProvider.invoke.mockResolvedValueOnce({
                content: JSON.stringify({
                    tools: [
                        { tool: 'display_map', params: { input: '{"locations": [{"name": "Paris", "latitude": 48.8566, "longitude": 2.3522}]}' } }
                    ],
                    reasoning: 'User asked for location on map'
                })
            }).mockResolvedValueOnce({
                content: 'Here is the location of Paris on the map.'
            });

            mockToolRegistry.executeTool.mockResolvedValue({
                success: true,
                result: 'Map displayed for Paris. 📊 {"locations": [{"name": "Paris", "latitude": 48.8566, "longitude": 2.3522}]}',
                duration: 300
            });

            const input = 'Show me where Paris is on a map';
            const result = await agent.process(input);

            expect(result.sideViewData).toMatchObject({
                type: 'map',
                title: expect.stringContaining('Map of'),
                data: expect.objectContaining({
                    locations: expect.arrayContaining([
                        expect.objectContaining({
                            name: 'Paris',
                            latitude: 48.8566,
                            longitude: 2.3522
                        })
                    ])
                })
            });
        });

        it('should handle no tools needed', async () => {
            mockLLMProvider.invoke.mockResolvedValueOnce({
                content: JSON.stringify({
                    tools: [],
                    reasoning: 'No tools needed for this request'
                })
            });

            const input = 'Hello, how are you?';
            const result = await agent.process(input);

            expect(result.result).toContain('don\'t have the right tools');
        });

        it('should handle tool execution errors', async () => {
            mockToolRegistry.executeTool.mockRejectedValue(new Error('Weather API unavailable'));

            const input = 'What\'s the weather?';
            const result = await agent.process(input);

            expect(result.toolResults).toEqual([
                expect.objectContaining({
                    tool: 'weather',
                    error: 'Weather API unavailable'
                })
            ]);
        });

        it('should handle multiple tools in sequence', async () => {
            mockLLMProvider.invoke.mockReset();
            mockLLMProvider.invoke.mockResolvedValueOnce({
                content: JSON.stringify({
                    tools: [
                        { tool: 'web_search', params: { input: 'Paris weather' } },
                        { tool: 'weather', params: { location: 'Paris, France' } }
                    ],
                    reasoning: 'Search and get weather for Paris'
                })
            }).mockResolvedValueOnce({
                content: 'Combined information about Paris weather'
            });

            mockToolRegistry.executeTool
                .mockResolvedValueOnce({ success: true, result: 'Search results about Paris weather', duration: 200 })
                .mockResolvedValueOnce({ success: true, result: '{"temperature": "68°F", "condition": "cloudy"}', duration: 300 });

            const input = 'Search for and get the weather in Paris';
            const result = await agent.process(input);

            expect(result.toolResults).toHaveLength(2);
            expect(mockToolRegistry.executeTool).toHaveBeenCalledTimes(2);
        });

        it('should handle processing errors gracefully', async () => {
            mockLLMProvider.invoke.mockRejectedValue(new Error('LLM unavailable'));

            const input = 'What\'s the weather?';
            const result = await agent.process(input);

            expect(result.result).toContain('encountered an error');
            expect(result.result).toContain('LLM unavailable');
        });

        it('should log tool execution details', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            const input = 'Weather in New York';
            await agent.process(input);

            expect(consoleSpy).toHaveBeenCalledWith('[ToolAgent] Processing tool request:', input);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ToolAgent] Executing tool: weather'),
                expect.objectContaining({ location: 'New York, NY' })
            );

            consoleSpy.mockRestore();
        });
    });

    describe('processStreaming', () => {
        beforeEach(() => {
            // Mock tool planning
            mockLLMProvider.invoke.mockResolvedValue({
                content: JSON.stringify({
                    tools: [
                        { tool: 'weather', params: { location: 'Boston, MA' } }
                    ],
                    reasoning: 'User requested weather information'
                })
            });

            // Mock tool execution
            mockToolRegistry.executeTool.mockResolvedValue({
                success: true,
                result: JSON.stringify({
                    location: 'Boston, MA',
                    temperature: '65°F',
                    condition: 'partly cloudy'
                }),
                duration: 400
            });

            // Mock synthesis
            mockLLMProvider.invoke.mockResolvedValueOnce({
                content: JSON.stringify({
                    tools: [{ tool: 'weather', params: { location: 'Boston, MA' } }],
                    reasoning: 'Weather request'
                })
            }).mockResolvedValueOnce({
                content: 'The weather in Boston is 65°F and partly cloudy.'
            });
        });

        it('should stream progress updates and results', async () => {
            const input = 'Weather in Boston';
            
            const updates: any[] = [];
            for await (const update of agent.processStreaming(input)) {
                updates.push(update);
            }

            expect(updates).toEqual([
                { type: 'progress', content: 'Analyzing your request...' },
                { type: 'progress', content: 'Executing 1 tool(s)...' },
                { type: 'progress', content: 'Using weather...' },
                {
                    type: 'side_view',
                    content: 'Weather information',
                    data: expect.objectContaining({
                        type: 'weather',
                        title: expect.stringContaining('Weather for')
                    })
                },
                {
                    type: 'tool_result',
                    content: 'weather completed',
                    data: expect.objectContaining({ tool: 'weather' })
                },
                { type: 'progress', content: 'Generating response...' },
                {
                    type: 'result',
                    content: expect.stringContaining('weather')
                }
            ]);
        });

        it('should handle map display in streaming mode', async () => {
            mockLLMProvider.invoke.mockReset();
            mockLLMProvider.invoke.mockResolvedValueOnce({
                content: JSON.stringify({
                    tools: [
                        { tool: 'display_map', params: { input: '{"locations": [{"name": "Tokyo", "latitude": 35.6762, "longitude": 139.6503}]}' } }
                    ],
                    reasoning: 'Display Tokyo on map'
                })
            }).mockResolvedValueOnce({
                content: 'Tokyo location displayed on map.'
            });

            mockToolRegistry.executeTool.mockResolvedValue({
                success: true,
                result: 'Map displayed. 📊 {"locations": [{"name": "Tokyo", "latitude": 35.6762, "longitude": 139.6503}]}',
                duration: 250
            });

            const input = 'Show me Tokyo on a map';
            const updates: any[] = [];
            
            for await (const update of agent.processStreaming(input)) {
                updates.push(update);
            }

            const sideViewUpdate = updates.find(u => u.type === 'side_view');
            expect(sideViewUpdate).toMatchObject({
                type: 'side_view',
                content: 'Map location',
                data: expect.objectContaining({
                    type: 'map',
                    data: expect.objectContaining({
                        locations: expect.arrayContaining([
                            expect.objectContaining({
                                name: 'Tokyo',
                                latitude: 35.6762,
                                longitude: 139.6503
                            })
                        ])
                    })
                })
            });
        });

        it('should handle no tools needed in streaming', async () => {
            mockLLMProvider.invoke.mockResolvedValueOnce({
                content: JSON.stringify({
                    tools: [],
                    reasoning: 'No tools required'
                })
            });

            const input = 'Hello there';
            const updates: any[] = [];
            
            for await (const update of agent.processStreaming(input)) {
                updates.push(update);
            }

            expect(updates).toEqual([
                { type: 'progress', content: 'Analyzing your request...' },
                {
                    type: 'result',
                    content: 'I don\'t have the right tools to help with that request. Could you please rephrase or try a different approach?'
                }
            ]);
        });

        it('should handle tool execution errors in streaming', async () => {
            mockToolRegistry.executeTool.mockRejectedValue(new Error('Tool unavailable'));

            const input = 'Weather check';
            const updates: any[] = [];
            
            for await (const update of agent.processStreaming(input)) {
                updates.push(update);
            }

            const errorUpdate = updates.find(u => u.type === 'tool_result' && u.content.includes('failed'));
            expect(errorUpdate).toMatchObject({
                type: 'tool_result',
                content: 'weather failed: Tool unavailable'
            });
        });

        it('should handle streaming errors gracefully', async () => {
            mockLLMProvider.invoke.mockRejectedValue(new Error('Streaming error'));

            const input = 'Test query';
            const updates: any[] = [];
            
            for await (const update of agent.processStreaming(input)) {
                updates.push(update);
            }

            expect(updates).toEqual([
                { type: 'progress', content: 'Analyzing your request...' },
                { type: 'result', content: 'Error: Streaming error' }
            ]);
        });

        it('should clean think tags from input', async () => {
            const input = '<think>Let me think about this</think>What\'s the weather?';
            
            const updates: any[] = [];
            for await (const update of agent.processStreaming(input)) {
                updates.push(update);
            }

            // Should have processed the cleaned input without think tags
            expect(mockLLMProvider.invoke).toHaveBeenCalled();
            const callArgs = mockLLMProvider.invoke.mock.calls[0][0];
            expect(callArgs[0].content).not.toContain('<think>');
        });
    });

    describe('planToolExecution', () => {
        it('should create proper tool execution plan', async () => {
            const planResponse = {
                tools: [
                    { tool: 'weather', params: { location: 'Seattle, WA' } }
                ],
                reasoning: 'User requested weather information for Seattle'
            };

            mockLLMProvider.invoke.mockResolvedValue({
                content: JSON.stringify(planResponse)
            });

            const plan = await (agent as any).planToolExecution('Weather in Seattle');

            expect(plan).toEqual(planResponse);
            expect(mockLLMProvider.invoke).toHaveBeenCalledWith([
                expect.objectContaining({
                    content: expect.stringContaining('tool execution planner')
                })
            ]);
        });

        it('should handle planning with markdown code blocks', async () => {
            const planResponse = {
                tools: [
                    { tool: 'web_search', params: { input: 'artificial intelligence' } }
                ],
                reasoning: 'Search for AI information'
            };

            mockLLMProvider.invoke.mockResolvedValue({
                content: `\`\`\`json\n${JSON.stringify(planResponse)}\n\`\`\``
            });

            const plan = await (agent as any).planToolExecution('Tell me about AI');

            expect(plan).toEqual(planResponse);
        });

        it('should handle planning with think tags', async () => {
            const planResponse = {
                tools: [
                    { tool: 'weather', params: { location: 'Miami, FL' } }
                ],
                reasoning: 'Weather request for Miami'
            };

            mockLLMProvider.invoke.mockResolvedValue({
                content: `<think>The user wants weather info</think>${JSON.stringify(planResponse)}`
            });

            const plan = await (agent as any).planToolExecution('Miami weather');

            expect(plan).toEqual(planResponse);
        });

        it('should handle JSON parsing errors', async () => {
            mockLLMProvider.invoke.mockResolvedValue({
                content: 'Invalid JSON response'
            });

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            const plan = await (agent as any).planToolExecution('Test query');

            expect(plan).toEqual({
                tools: [],
                reasoning: 'Failed to parse tool execution plan'
            });
            expect(consoleSpy).toHaveBeenCalledWith(
                '[ToolAgent] Failed to parse tool plan:',
                expect.any(Error)
            );

            consoleSpy.mockRestore();
        });

        it('should handle LLM invocation errors', async () => {
            mockLLMProvider.invoke.mockRejectedValue(new Error('LLM error'));

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            const plan = await (agent as any).planToolExecution('Test query');

            expect(plan).toEqual({
                tools: [],
                reasoning: 'Error in tool planning'
            });
            expect(consoleSpy).toHaveBeenCalledWith(
                '[ToolAgent] Error planning tool execution:',
                expect.any(Error)
            );

            consoleSpy.mockRestore();
        });

        it('should include available tools in planning prompt', async () => {
            mockToolRegistry.getAvailableTools.mockReturnValue(['weather', 'web_search']);
            mockLLMProvider.invoke.mockResolvedValue({
                content: JSON.stringify({ tools: [], reasoning: 'test' })
            });

            await (agent as any).planToolExecution('Test query');

            const callArgs = mockLLMProvider.invoke.mock.calls[0][0];
            expect(callArgs[0].content).toContain('Available tools: weather, web_search');
        });
    });

    describe('synthesizeToolResults', () => {
        it('should synthesize successful tool results', async () => {
            const toolResults = [
                {
                    tool: 'weather',
                    params: { location: 'Chicago, IL' },
                    result: { temperature: '70°F', condition: 'clear' }
                }
            ];

            mockLLMProvider.invoke.mockResolvedValue({
                content: 'The weather in Chicago is 70°F with clear skies.'
            });

            const result = await (agent as any).synthesizeToolResults('Weather in Chicago', toolResults);

            expect(result).toBe('The weather in Chicago is 70°F with clear skies.');
        });

        it('should handle tool results with errors', async () => {
            const toolResults = [
                {
                    tool: 'weather',
                    params: { location: 'Invalid' },
                    error: 'Location not found'
                }
            ];

            mockLLMProvider.invoke.mockResolvedValue({
                content: 'I couldn\'t find weather information for that location.'
            });

            const result = await (agent as any).synthesizeToolResults('Weather query', toolResults);

            expect(result).toContain('couldn\'t find weather');
        });

        it('should handle empty tool results', async () => {
            const result = await (agent as any).synthesizeToolResults('Query', []);

            expect(result).toBe('No tool results to process.');
        });

        it('should handle synthesis errors', async () => {
            const toolResults = [
                { tool: 'weather', result: { temperature: '75°F' } }
            ];

            mockLLMProvider.invoke.mockRejectedValue(new Error('Synthesis failed'));

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            const result = await (agent as any).synthesizeToolResults('Query', toolResults);

            expect(result).toBe('I gathered some information but had trouble putting it together. Please try again.');
            expect(consoleSpy).toHaveBeenCalledWith(
                '[ToolAgent] Error synthesizing results:',
                expect.any(Error)
            );

            consoleSpy.mockRestore();
        });
    });

    describe('formatWeatherForSideView', () => {
        it('should format ToolRegistry weather result', () => {
            const weatherResult = {
                success: true,
                result: JSON.stringify({
                    location: 'Denver, CO',
                    temperature: '68°F',
                    condition: 'sunny'
                }),
                duration: 300
            };

            const params = { location: 'Denver, CO' };

            const formatted = (agent as any).formatWeatherForSideView(weatherResult, params);

            expect(formatted).toMatchObject({
                type: 'weather',
                title: 'Weather for Denver, CO',
                data: {
                    location: 'Denver, CO',
                    temperature: '68°F',
                    condition: 'sunny'
                },
                timestamp: expect.any(String)
            });
        });

        it('should handle string weather results', () => {
            const weatherResult = 'Temperature is 72°F with sunny conditions';
            const params = { location: 'Phoenix, AZ' };

            const formatted = (agent as any).formatWeatherForSideView(weatherResult, params);

            expect(formatted).toMatchObject({
                type: 'weather',
                title: 'Weather for Phoenix, AZ',
                data: {
                    location: 'Phoenix, AZ',
                    description: 'Temperature is 72°F with sunny conditions',
                    timestamp: expect.any(String)
                }
            });
        });

        it('should handle formatting errors', () => {
            const weatherResult = null;
            const params = { location: 'Test Location' };

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            const formatted = (agent as any).formatWeatherForSideView(weatherResult, params);

            expect(formatted).toMatchObject({
                type: 'weather',
                title: 'Weather Information',
                data: { error: 'Failed to format weather data' }
            });

            consoleSpy.mockRestore();
        });
    });

    describe('formatMapsForSideView', () => {
        it('should format maps result with stream marker', () => {
            const mapsResult = {
                success: true,
                result: 'Map displayed for London. 📊 {"locations": [{"name": "London", "latitude": 51.5074, "longitude": -0.1278}]}',
                duration: 200
            };

            const params = { input: '{"locations": [{"name": "London", "latitude": 51.5074, "longitude": -0.1278}]}' };

            const formatted = (agent as any).formatMapsForSideView(mapsResult, params);

            expect(formatted).toMatchObject({
                type: 'map',
                title: 'Map of London',
                data: {
                    locations: [
                        {
                            name: 'London',
                            latitude: 51.5074,
                            longitude: -0.1278
                        }
                    ]
                }
            });
        });

        it('should fallback to input params when no stream marker', () => {
            const mapsResult = {
                success: true,
                result: 'Map displayed for Tokyo.',
                duration: 150
            };

            const params = { input: '{"locations": [{"name": "Tokyo", "latitude": 35.6762, "longitude": 139.6503}]}' };

            const formatted = (agent as any).formatMapsForSideView(mapsResult, params);

            expect(formatted.data.locations[0].name).toBe('Tokyo');
        });

        it('should handle formatting errors', () => {
            const mapsResult = { success: false };
            const params = {};

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            const formatted = (agent as any).formatMapsForSideView(mapsResult, params);

            expect(formatted).toMatchObject({
                type: 'map',
                title: 'Map Location',
                data: {
                    error: 'Failed to format maps data',
                    locations: expect.arrayContaining([
                        expect.objectContaining({
                            name: 'Error',
                            description: 'Unable to load map data'
                        })
                    ])
                }
            });

            consoleSpy.mockRestore();
        });
    });

    describe('getAvailableTools', () => {
        it('should return tools from registry', () => {
            const tools = agent.getAvailableTools();

            expect(tools).toEqual(['weather', 'web_search', 'wikipedia_search', 'display_map']);
            expect(mockToolRegistry.getAvailableTools).toHaveBeenCalled();
        });

        it('should handle empty tool registry', () => {
            mockToolRegistry.getAvailableTools.mockReturnValueOnce([]);

            const tools = agent.getAvailableTools();

            expect(tools).toEqual([]);
        });
    });

    describe('getStatus', () => {
        it('should return agent status', () => {
            const status = agent.getStatus();

            expect(status).toEqual({
                availableTools: ['weather', 'web_search', 'wikipedia_search', 'display_map'],
                provider: 'openai'
            });
        });

        it('should handle different providers', () => {
            mockLLMProvider.getCurrentProvider.mockReturnValueOnce('ollama');

            const status = agent.getStatus();

            expect(status.provider).toBe('ollama');
        });
    });

    describe('edge cases and error handling', () => {
        it('should handle null/undefined input in process', async () => {
            mockLLMProvider.invoke.mockResolvedValue({
                content: JSON.stringify({ tools: [], reasoning: 'No tools for null input' })
            });

            const result = await agent.process(null as any);

            expect(result.result).toContain('don\'t have the right tools');
        });

        it('should handle very long input strings', async () => {
            const longInput = 'weather '.repeat(1000);

            mockLLMProvider.invoke.mockResolvedValue({
                content: JSON.stringify({
                    tools: [{ tool: 'weather', params: { location: 'default' } }],
                    reasoning: 'Weather request'
                })
            });

            mockToolRegistry.executeTool.mockResolvedValue({
                success: true,
                result: '{"temperature": "70°F"}',
                duration: 100
            });

            mockLLMProvider.invoke.mockResolvedValueOnce({
                content: JSON.stringify({ tools: [], reasoning: '' })
            }).mockResolvedValueOnce({
                content: 'Weather information processed'
            });

            const result = await agent.process(longInput);

            expect(result.result).toBeDefined();
        });

        it('should handle special characters in input', async () => {
            const specialInput = '🌤️ Weather in "New York" & temperature?';

            mockLLMProvider.invoke.mockResolvedValue({
                content: JSON.stringify({
                    tools: [{ tool: 'weather', params: { location: 'New York' } }],
                    reasoning: 'Weather query with special characters'
                })
            });

            const result = await agent.process(specialInput);

            expect(result).toBeDefined();
        });

        it('should handle concurrent processing operations', async () => {
            mockLLMProvider.invoke.mockResolvedValue({
                content: JSON.stringify({
                    tools: [{ tool: 'weather', params: { location: 'Test' } }],
                    reasoning: 'Test'
                })
            });

            mockToolRegistry.executeTool.mockResolvedValue({
                success: true,
                result: '{"temperature": "70°F"}',
                duration: 100
            });

            const promises = [
                agent.process('Weather 1'),
                agent.process('Weather 2'),
                agent.process('Weather 3')
            ];

            const results = await Promise.all(promises);

            expect(results).toHaveLength(3);
            results.forEach(result => {
                expect(result.result).toBeDefined();
            });
        });
    });

    describe('logging and debugging', () => {
        it('should log detailed processing information', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            mockLLMProvider.invoke.mockResolvedValue({
                content: JSON.stringify({
                    tools: [{ tool: 'weather', params: { location: 'Test' } }],
                    reasoning: 'Test reasoning'
                })
            });

            mockToolRegistry.executeTool.mockResolvedValue({
                success: true,
                result: 'Test result',
                duration: 100
            });

            await agent.process('Test weather');

            expect(consoleSpy).toHaveBeenCalledWith('[ToolAgent] Processing tool request:', 'Test weather');
            expect(consoleSpy).toHaveBeenCalledWith('[ToolAgent] Tool execution plan:', expect.any(Object));
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[ToolAgent] Executing tool: weather'),
                expect.any(Object)
            );

            consoleSpy.mockRestore();
        });

        it('should log tool execution errors', async () => {
            mockLLMProvider.invoke.mockResolvedValue({
                content: JSON.stringify({
                    tools: [{ tool: 'weather', params: { location: 'Test' } }],
                    reasoning: 'Test'
                })
            });

            mockToolRegistry.executeTool.mockRejectedValue(new Error('Tool failed'));

            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            await agent.process('Test weather');

            expect(consoleSpy).toHaveBeenCalledWith(
                '[ToolAgent] Tool execution failed for weather:',
                expect.any(Error)
            );

            consoleSpy.mockRestore();
        });
    });
});