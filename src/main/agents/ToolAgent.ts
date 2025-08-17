/**
 * Tool Agent - Handles specific tool-based requests without deep research
 * For quick actions like weather, calculations, lookups, etc.
 */

import { LLMProvider } from '../services/LLMProvider';
import { toolRegistry } from './tools/ToolRegistry';
import { HumanMessage } from '@langchain/core/messages';

/**
 * Configuration options for the Tool Agent
 */
export interface ToolAgentOptions {
    llmProvider: LLMProvider;
    config?: any;
}

/**
 * Tool Agent for handling quick tool-based requests
 */
export class ToolAgent {
    private llmProvider: LLMProvider;

    constructor(options: ToolAgentOptions) {
        this.llmProvider = options.llmProvider;

        console.log('[ToolAgent] Initialized for quick tool-based requests');
    }

    /**
     * Process a tool-based request
     */
    async process(input: string): Promise<{
        result: string;
        toolResults?: any[];
        sideViewData?: any;
    }> {
        try {
            console.log('[ToolAgent] Processing tool request:', input);

            // Analyze the request and determine which tools to use
            const toolPlan = await this.planToolExecution(input);

            if (!toolPlan.tools || toolPlan.tools.length === 0) {
                return {
                    result: 'I don\'t have the right tools to help with that request. Could you please rephrase or try a different approach?'
                };
            }

            const toolResults: any[] = [];
            let sideViewData: any = null;

            // Execute tools in sequence
            for (const toolCall of toolPlan.tools) {
                console.log(`[ToolAgent] Executing tool: ${toolCall.tool} with params:`, toolCall.params);

                try {
                    const result = await toolRegistry.executeTool(toolCall.tool, toolCall.params);
                    toolResults.push({
                        tool: toolCall.tool,
                        params: toolCall.params,
                        result: result
                    });

                    // Check if this is weather data for side view
                    if (toolCall.tool === 'weather' && result) {
                        sideViewData = this.formatWeatherForSideView(result, toolCall.params);
                    }

                } catch (toolError) {
                    console.error(`[ToolAgent] Tool execution failed for ${toolCall.tool}:`, toolError);
                    toolResults.push({
                        tool: toolCall.tool,
                        params: toolCall.params,
                        error: toolError.message
                    });
                }
            }

            // Generate final response based on tool results
            const finalResponse = await this.synthesizeToolResults(input, toolResults);

            return {
                result: finalResponse,
                toolResults: toolResults,
                sideViewData: sideViewData
            };

        } catch (error: any) {
            console.error('[ToolAgent] Processing error:', error);
            return {
                result: `I encountered an error while processing your request: ${error.message}`
            };
        }
    }

    /**
     * Stream tool-based processing
     */
    async *processStreaming(input: string): AsyncGenerator<{
        type: 'progress' | 'result' | 'tool_result' | 'side_view';
        content: string;
        data?: any;
    }> {
        try {
            yield { type: 'progress', content: 'Analyzing your request...' };

            const thinkTagRegex = /<think[^>]*>([\s\S]*?)<\/think>/g;
            input = input.replace(thinkTagRegex, '').trim();
            const toolPlan = await this.planToolExecution(input);

            if (!toolPlan.tools || toolPlan.tools.length === 0) {
                yield {
                    type: 'result',
                    content: 'I don\'t have the right tools to help with that request. Could you please rephrase or try a different approach?'
                };
                return;
            }

            yield { type: 'progress', content: `Executing ${toolPlan.tools.length} tool(s)...` };

            const toolResults: any[] = [];
            let sideViewData: any = null;

            for (const toolCall of toolPlan.tools) {
                yield { type: 'progress', content: `Using ${toolCall.tool}...` };

                try {
                    const result = await toolRegistry.executeTool(toolCall.tool, toolCall.params);
                    toolResults.push({
                        tool: toolCall.tool,
                        params: toolCall.params,
                        result: result
                    });

                    // Check if this is weather data for side view
                    if (toolCall.tool === 'weather' && result) {
                        sideViewData = this.formatWeatherForSideView(result, toolCall.params);
                        yield {
                            type: 'side_view',
                            content: 'Weather information',
                            data: sideViewData
                        };
                    }

                    yield {
                        type: 'tool_result',
                        content: `${toolCall.tool} completed`,
                        data: { tool: toolCall.tool, result: result }
                    };

                } catch (toolError) {
                    console.error(`[ToolAgent] Tool execution failed for ${toolCall.tool}:`, toolError);
                    yield {
                        type: 'tool_result',
                        content: `${toolCall.tool} failed: ${toolError.message}`
                    };
                }
            }

            yield { type: 'progress', content: 'Generating response...' };

            const finalResponse = await this.synthesizeToolResults(input, toolResults);
            yield { type: 'result', content: finalResponse };

        } catch (error: any) {
            console.error('[ToolAgent] Streaming error:', error);
            yield { type: 'result', content: `Error: ${error.message}` };
        }
    }

    /**
     * Plan which tools to execute based on the user request
     */
    private async planToolExecution(input: string): Promise<{
        tools: Array<{ tool: string; params: any }>;
        reasoning: string;
    }> {
        try {
            const availableTools = toolRegistry.getAvailableTools();

            const planningPrompt = `You are a tool execution planner. Analyze the user request and determine which tools to use and in what order.

Available tools: ${availableTools.join(', ')}

User request: "${input}"

Tool descriptions:
- weather: Get current weather information for a location (params: { location: "city, country" })
- web_search: Search the web for information (params: { input: "search query" })
- wikipedia_search: Search Wikipedia (params: { input: "search query" })

Based on the user request, determine which tools to use. Respond in JSON format:
{
  "tools": [
    { "tool": "tool_name", "params": { "param": "value" } }
  ],
  "reasoning": "explanation of tool selection"
}

If no tools are needed or available tools don't match the request, return empty tools array.`;

            const result = await this.llmProvider.invoke([
                new HumanMessage({ content: planningPrompt })
            ]);

            const response = result.content as string;

            try {
                // Remove potential markdown code blocks
                const thinkTagRegex = /<think[^>]*>([\s\S]*?)<\/think>/g;
                const cleanedResponse = response.replace(thinkTagRegex, '').replace(/```json\n?|```\n?/g, '').trim();
                const plan = JSON.parse(cleanedResponse);

                console.log('[ToolAgent] Tool execution plan:', plan);
                return plan;

            } catch (parseError) {
                console.error('[ToolAgent] Failed to parse tool plan:', parseError);
                return { tools: [], reasoning: 'Failed to parse tool execution plan' };
            }

        } catch (error) {
            console.error('[ToolAgent] Error planning tool execution:', error);
            return { tools: [], reasoning: 'Error in tool planning' };
        }
    }

    /**
     * Synthesize tool results into a coherent response
     */
    private async synthesizeToolResults(userRequest: string, toolResults: any[]): Promise<string> {
        try {
            if (toolResults.length === 0) {
                return 'No tool results to process.';
            }

            const resultsText = toolResults.map(tr => {
                if (tr.error) {
                    return `${tr.tool} failed: ${tr.error}`;
                } else {
                    return `${tr.tool} result: ${JSON.stringify(tr.result)}`;
                }
            }).join('\n\n');

            const synthesisPrompt = `Based on the user request and tool results, provide a helpful, conversational response.

User request: "${userRequest}"

Tool results:
${resultsText}

Provide a natural, helpful response that addresses the user's request using the tool results. Be conversational and focus on the information the user needs. If there were errors, explain them helpfully.`;

            const result = await this.llmProvider.invoke([
                new HumanMessage({ content: synthesisPrompt })
            ]);

            return (result.content as string).trim();

        } catch (error) {
            console.error('[ToolAgent] Error synthesizing results:', error);
            return 'I gathered some information but had trouble putting it together. Please try again.';
        }
    }

    /**
     * Format weather data for side view display
     */
    private formatWeatherForSideView(weatherResult: any, params: any): any {
        try {
            console.log('[ToolAgent] formatWeatherForSideView - raw result:', weatherResult);
            console.log('[ToolAgent] formatWeatherForSideView - params:', params);
            
            // Handle ToolRegistry result format: { success: true, result: "JSON_STRING", duration: ... }
            let weatherData = weatherResult;
            
            if (weatherResult.success && weatherResult.result) {
                // Extract the actual weather data from ToolRegistry response
                try {
                    weatherData = JSON.parse(weatherResult.result);
                    console.log('[ToolAgent] Parsed weather data from ToolRegistry result:', weatherData);
                } catch (parseError) {
                    console.error('[ToolAgent] Failed to parse weather result:', parseError);
                    weatherData = weatherResult.result;
                }
            } else if (typeof weatherResult === 'string') {
                try {
                    weatherData = JSON.parse(weatherResult);
                } catch {
                    // If not JSON, create a simple structure
                    weatherData = {
                        location: params.location || 'Unknown',
                        description: weatherResult,
                        timestamp: new Date().toISOString()
                    };
                }
            }

            return {
                type: 'weather',
                title: `Weather for ${params.location || 'Location'}`,
                data: weatherData,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('[ToolAgent] Error formatting weather for side view:', error);
            return {
                type: 'weather',
                title: 'Weather Information',
                data: { error: 'Failed to format weather data' },
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get available tools
     */
    getAvailableTools(): string[] {
        return toolRegistry.getAvailableTools();
    }

    /**
     * Get agent status
     */
    getStatus(): {
        availableTools: string[];
        provider: string;
    } {
        return {
            availableTools: this.getAvailableTools(),
            provider: this.llmProvider.getCurrentProvider()
        };
    }
}