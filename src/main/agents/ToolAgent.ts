/**
 * Tool Agent - Handles specific tool-based requests without deep research
 * For quick actions like weather, calculations, lookups, etc.
 */

import { LLMProvider } from '../services/LLMProvider';
import { toolRegistry } from './tools/ToolRegistry';
import { HumanMessage } from '@langchain/core/messages';
import { logger } from '../utils/ColorLogger';

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

        logger.success('ToolAgent', 'Initialized for quick tool-based requests');
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
            logger.stage('ToolAgent', 'Processing Tool Request', `Analyzing: "${input.substring(0, 50)}..."`);

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
                const startTime = Date.now();
                
                logger.toolStatus('ToolAgent', toolCall.tool, 'starting');
                
                try {
                    const result = await toolRegistry.executeTool(toolCall.tool, toolCall.params);
                    const duration = Date.now() - startTime;
                    
                    // Log detailed tool call with input/output
                    logger.toolCall('ToolAgent', toolCall.tool, toolCall.params, result, duration);
                    
                    toolResults.push({
                        tool: toolCall.tool,
                        params: toolCall.params,
                        result: result
                    });

                    // Check if this is weather data for side view
                    if (toolCall.tool === 'weather' && result) {
                        sideViewData = this.formatWeatherForSideView(result, toolCall.params);
                        logger.info('ToolAgent', 'Weather data formatted for side view');
                    }

                    // Check if this is maps data for side view
                    if (toolCall.tool === 'display_map' && result) {
                        sideViewData = this.formatMapsForSideView(result, toolCall.params);
                        logger.info('ToolAgent', 'Maps data formatted for side view');
                    }
                    
                    logger.toolStatus('ToolAgent', toolCall.tool, 'success', `Completed in ${duration}ms`);

                } catch (toolError) {
                    const duration = Date.now() - startTime;
                    logger.toolStatus('ToolAgent', toolCall.tool, 'error', toolError.message);
                    logger.toolCall('ToolAgent', toolCall.tool, toolCall.params, `ERROR: ${toolError.message}`, duration);
                    
                    toolResults.push({
                        tool: toolCall.tool,
                        params: toolCall.params,
                        error: toolError.message
                    });
                }
            }

            // Generate tool execution summary
            const summary = toolResults.map(tr => ({
                tool: tr.tool,
                success: !tr.error,
                duration: undefined, // Duration was logged but not stored in results
                error: tr.error
            }));
            
            logger.toolSummary('ToolAgent', summary);

            // Generate final response based on tool results
            logger.step('ToolAgent', 'Synthesizing tool results into response...', 'running');
            const finalResponse = await this.synthesizeToolResults(input, toolResults);
            
            logger.complete('ToolAgent', 'Tool processing completed successfully');

            return {
                result: finalResponse,
                toolResults: toolResults,
                sideViewData: sideViewData
            };

        } catch (error: any) {
            logger.error('ToolAgent', 'Processing error', error);
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
            logger.stage('ToolAgent', 'Streaming Tool Execution', `Processing: "${input.substring(0, 50)}..."`);
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
                const startTime = Date.now();
                
                logger.toolStatus('ToolAgent', toolCall.tool, 'starting');
                yield { type: 'progress', content: `Using ${toolCall.tool}...` };

                try {
                    const result = await toolRegistry.executeTool(toolCall.tool, toolCall.params);
                    const duration = Date.now() - startTime;
                    
                    // Log detailed tool call (but don't stream the full output to avoid UI clutter)
                    logger.toolCall('ToolAgent', toolCall.tool, toolCall.params, result, duration);
                    
                    toolResults.push({
                        tool: toolCall.tool,
                        params: toolCall.params,
                        result: result
                    });

                    // Check if this is weather data for side view
                    if (toolCall.tool === 'weather' && result) {
                        sideViewData = this.formatWeatherForSideView(result, toolCall.params);
                        logger.info('ToolAgent', 'Weather data formatted for side view');
                        yield {
                            type: 'side_view',
                            content: 'Weather information',
                            data: sideViewData
                        };
                    }

                    // Check if this is maps data for side view
                    if (toolCall.tool === 'display_map' && result) {
                        sideViewData = this.formatMapsForSideView(result, toolCall.params);
                        logger.info('ToolAgent', 'Maps data formatted for side view');
                        yield {
                            type: 'side_view',
                            content: 'Map location',
                            data: sideViewData
                        };
                    }

                    logger.toolStatus('ToolAgent', toolCall.tool, 'success', `Completed in ${duration}ms`);
                    yield {
                        type: 'tool_result',
                        content: `${toolCall.tool} completed`,
                        data: { tool: toolCall.tool, result: result }
                    };

                } catch (toolError) {
                    const duration = Date.now() - startTime;
                    logger.toolStatus('ToolAgent', toolCall.tool, 'error', toolError.message);
                    logger.toolCall('ToolAgent', toolCall.tool, toolCall.params, `ERROR: ${toolError.message}`, duration);
                    
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
            logger.error('ToolAgent', 'Streaming error', error);
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
- display_map: Display locations on an interactive map (params: { input: JSON string with locations array, e.g., '{"locations": [{"name": "Paris", "latitude": 48.8566, "longitude": 2.3522}]}' })

IMPORTANT: For location-related questions that ask "where is", "show me where", or request visual location information, ALWAYS use display_map as the PRIMARY tool. Use wikipedia_search or web_search as SECONDARY tools only if additional information is needed.

For display_map tool, you MUST provide the input as a JSON string containing a locations array with name, latitude, and longitude. Use your knowledge of major world locations to provide approximate coordinates. If you don't know exact coordinates, use reasonable approximations for well-known places.

Examples:
- "Please show me where Paris is" → use display_map with { "input": '{"locations": [{"name": "Paris", "latitude": 48.8566, "longitude": 2.3522}]}' }
- "Where is Tokyo located?" → use display_map with { "input": '{"locations": [{"name": "Tokyo", "latitude": 35.6762, "longitude": 139.6503}]}' }
- "Show me the location of London" → use display_map with { "input": '{"locations": [{"name": "London", "latitude": 51.5074, "longitude": -0.1278}]}' }
- "What's the weather in Paris?" → use weather with { "location": "Paris, France" }

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

                logger.info('ToolAgent', 'Tool execution plan generated', plan);
                return plan;

            } catch (parseError) {
                logger.error('ToolAgent', 'Failed to parse tool plan', parseError);
                return { tools: [], reasoning: 'Failed to parse tool execution plan' };
            }

        } catch (error) {
            logger.error('ToolAgent', 'Error planning tool execution', error);
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

            // Extract sources and citations from search results
            const sources = this.extractSourcesFromResults(toolResults);
            
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

Provide a natural, helpful response that addresses the user's request using the tool results. Be conversational and focus on the information the user needs. If there were errors, explain them helpfully.

IMPORTANT: If the tool results include web search results, you MUST include proper citations at the end of your response. Format citations as:

**Sources:**
1. [Title](URL) - Brief description
2. [Title](URL) - Brief description

Only include citations for web search, wikipedia, or research tools that provide URLs.`;

            const result = await this.llmProvider.invoke([
                new HumanMessage({ content: synthesisPrompt })
            ]);

            let response = (result.content as string).trim();

            // If we have sources but the LLM didn't include them, append them
            if (sources.length > 0 && !response.includes('**Sources:**') && !response.includes('Sources:')) {
                response += '\n\n' + this.formatCitations(sources);
            }

            return response;

        } catch (error) {
            logger.error('ToolAgent', 'Error synthesizing results', error);
            return 'I gathered some information but had trouble putting it together. Please try again.';
        }
    }

    /**
     * Extract source URLs and titles from search tool results
     */
    private extractSourcesFromResults(toolResults: any[]): Array<{ title: string; url: string; description?: string }> {
        const sources: Array<{ title: string; url: string; description?: string }> = [];

        for (const toolResult of toolResults) {
            // Skip non-search tools and failed results
            if (toolResult.error || !['web_search', 'wikipedia_search', 'tavily_search', 'brave_search', 'serp_search'].includes(toolResult.tool)) {
                continue;
            }

            try {
                let resultText = '';
                
                // Handle different result formats
                if (toolResult.result?.success && toolResult.result?.result) {
                    resultText = toolResult.result.result;
                } else if (typeof toolResult.result === 'string') {
                    resultText = toolResult.result;
                } else if (toolResult.result?.content) {
                    resultText = toolResult.result.content;
                }

                // Extract URLs and titles from the result text
                const urlRegex = /https?:\/\/[^\s\)]+/g;
                const urls = resultText.match(urlRegex) || [];
                
                // Try to find title-URL pairs in common formats
                const titleUrlRegex = /([^:\n]+):\s*(https?:\/\/[^\s\)]+)/g;
                let match;
                
                while ((match = titleUrlRegex.exec(resultText)) !== null) {
                    const title = match[1].trim();
                    const url = match[2].trim();
                    
                    if (title && url && !sources.find(s => s.url === url)) {
                        sources.push({ title, url });
                    }
                }

                // If no title-URL pairs found, extract standalone URLs and try to infer titles
                if (sources.length === 0) {
                    urls.forEach((url, index) => {
                        if (!sources.find(s => s.url === url)) {
                            // Try to extract domain as title
                            const domain = url.match(/https?:\/\/([^\/]+)/)?.[1] || 'Source';
                            const title = `${domain.replace('www.', '')} - Result ${index + 1}`;
                            sources.push({ title, url });
                        }
                    });
                }

            } catch (error) {
                console.warn('[ToolAgent] Failed to extract sources from result:', error);
            }
        }

        // Limit to maximum 5 sources
        return sources.slice(0, 5);
    }

    /**
     * Format citations in a user-friendly way
     */
    private formatCitations(sources: Array<{ title: string; url: string; description?: string }>): string {
        if (sources.length === 0) return '';

        const citations = sources.map((source, index) => {
            const description = source.description ? ` - ${source.description}` : '';
            return `${index + 1}. [${source.title}](${source.url})${description}`;
        }).join('\n');

        return `**Sources:**\n${citations}`;
    }

    /**
     * Format weather data for side view display
     */
    private formatWeatherForSideView(weatherResult: any, params: any): any {
        try {
            logger.debug('ToolAgent', 'Formatting weather for side view', { 
                rawResult: typeof weatherResult === 'object' ? 'OBJECT' : weatherResult?.toString?.() || weatherResult,
                params 
            });
            
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
     * Format maps data for side view display
     */
    private formatMapsForSideView(mapsResult: any, params: any): any {
        try {
            console.log('[ToolAgent] formatMapsForSideView - raw result:', mapsResult);
            console.log('[ToolAgent] formatMapsForSideView - params:', params);
            
            let mapsData = null;
            
            // Handle ToolRegistry result format: { success: true, result: "TEXT_RESPONSE", duration: ... }
            if (mapsResult.success && mapsResult.result) {
                const resultText = mapsResult.result;
                
                // Look for the stream marker in the text response: 📊 {JSON_DATA}
                const streamMarkerMatch = resultText.match(/📊\s*(\{.*\})/);
                
                if (streamMarkerMatch && streamMarkerMatch[1]) {
                    try {
                        mapsData = JSON.parse(streamMarkerMatch[1]);
                        console.log('[ToolAgent] Extracted maps data from stream marker:', mapsData);
                    } catch (parseError) {
                        console.error('[ToolAgent] Failed to parse stream marker JSON:', parseError);
                    }
                }
                
                // If no stream marker found, try to extract data from params
                if (!mapsData && params.input) {
                    try {
                        const inputData = JSON.parse(params.input);
                        mapsData = inputData;
                        console.log('[ToolAgent] Using input data as fallback:', mapsData);
                    } catch (parseError) {
                        console.error('[ToolAgent] Failed to parse input params:', parseError);
                    }
                }
                
                // Final fallback: create basic structure from response
                if (!mapsData) {
                    // Extract location name from input if available
                    let locationName = 'Unknown Location';
                    if (params.input) {
                        try {
                            const inputData = JSON.parse(params.input);
                            if (inputData.locations && inputData.locations[0] && inputData.locations[0].name) {
                                locationName = inputData.locations[0].name;
                            }
                        } catch {
                            // Ignore parsing errors for fallback
                        }
                    }
                    
                    mapsData = {
                        locations: [{
                            name: locationName,
                            latitude: 0,
                            longitude: 0,
                            description: 'Location data not available'
                        }],
                        center: { latitude: 0, longitude: 0 },
                        zoom: 2
                    };
                }
            }

            // Determine location name for title
            let locationName = 'Location';
            if (mapsData && mapsData.locations && mapsData.locations[0] && mapsData.locations[0].name) {
                locationName = mapsData.locations[0].name;
            }

            return {
                type: 'map',
                title: `Map of ${locationName}`,
                data: mapsData,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('[ToolAgent] Error formatting maps for side view:', error);
            return {
                type: 'map',
                title: 'Map Location',
                data: { 
                    error: 'Failed to format maps data',
                    locations: [{
                        name: 'Error',
                        latitude: 0,
                        longitude: 0,
                        description: 'Unable to load map data'
                    }]
                },
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