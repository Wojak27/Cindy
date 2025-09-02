/**
 * Integration layer for Deep Research Agent with existing tool system
 * Provides backward compatibility and seamless integration
 */

import { LLMProvider } from '../../services/LLMProvider';
import { toolRegistry } from '../tools/ToolRegistry';
import { toolLoader } from '../tools/ToolLoader';
import { SettingsService } from '../../services/SettingsService';
import { DeepResearchAgent } from './DeepResearchAgent'; // LangGraph implementation with enhanced logging
// import { DeepAgentsResearchAgent as DeepResearchAgent } from './DeepAgentsResearchAgent'; // DeepAgents has initialization issues
import { DeepResearchConfiguration, DeepResearchConfigManager } from './DeepResearchConfig';
import { ToolAgent } from '../ToolAgent';
import { generateStepDescription, extractResearchContext, AGENT_STEP_TEMPLATES } from '../../../shared/AgentFlowStandard';
import { HumanMessage } from '@langchain/core/messages';
import { parseRoutingResponse } from '../schemas/routing';

/**
 * Integration options for Deep Research
 */
export interface DeepResearchIntegrationOptions {
    llmProvider: LLMProvider;
    settingsService: SettingsService;
    enableDeepResearch?: boolean;
    fallbackToOriginal?: boolean;
}

/**
 * Multi-Agent Router and Integration Manager
 * Routes user requests to Deep Research, Tool Agent, or Direct Response
 */
export class DeepResearchIntegration {
    private deepResearchAgent: DeepResearchAgent;
    private toolAgent: ToolAgent;
    private llmProvider: LLMProvider;
    private settingsService: SettingsService;
    private configManager: DeepResearchConfigManager;
    private enabled: boolean;
    private fallbackToOriginal: boolean;

    constructor(options: DeepResearchIntegrationOptions) {
        this.llmProvider = options.llmProvider;
        this.settingsService = options.settingsService;
        this.enabled = options.enableDeepResearch !== false; // Default to enabled
        this.fallbackToOriginal = options.fallbackToOriginal !== false; // Default to enabled

        // Initialize configuration from settings
        this.configManager = this.createConfigFromSettings();

        // Create Deep Research agent (using LangGraph architecture with enhanced logging)
        this.deepResearchAgent = new DeepResearchAgent({
            llmProvider: this.llmProvider,
            config: this.configManager.getConfig()
        });

        // Create Tool agent
        this.toolAgent = new ToolAgent({
            llmProvider: this.llmProvider
        });

        // Initialize tools
        this.initializeTools();

        console.log('[DeepResearchIntegration] Initialized with settings:', {
            enabled: this.enabled,
            fallback: this.fallbackToOriginal,
            searchAPI: this.configManager.getConfig().search_api
        });
    }

    /**
     * Create configuration from settings service
     */
    private createConfigFromSettings(): DeepResearchConfigManager {
        try {
            const settings = {
                // Map settings to Deep Research configuration
                search_api: this.getSearchAPIFromSettings(),
                allow_clarification: true, // Default values for now
                max_researcher_iterations: 6,
                max_react_tool_calls: 10,
                max_concurrent_research_units: 3,

                // Model configuration - use the same model as the LLM provider
                research_model: this.llmProvider,
                summarization_model: this.llmProvider,
                compression_model: this.llmProvider,
                final_report_model: this.llmProvider
            };

            return DeepResearchConfigManager.fromEnvironmentAndSettings(settings);

        } catch (error) {
            console.error('[DeepResearchIntegration] Error creating config from settings:', error);
            return new DeepResearchConfigManager();
        }
    }

    /**
     * Get search API preference from settings
     */
    private getSearchAPIFromSettings(): string {
        try {
            // Check for API keys in settings to determine which search APIs are available
            const settings = this.settingsService as any;

            // Check for search API keys
            const hasBraveKey = settings?.get?.('braveApiKey') || process.env.BRAVE_API_KEY;
            const hasTavilyKey = settings?.get?.('tavilyApiKey') || process.env.TAVILY_API_KEY;
            const hasSerpApiKey = settings?.get?.('serpApiKey') || process.env.SERP_API_KEY;

            // Prefer APIs with available keys
            if (hasTavilyKey) {
                return 'tavily';
            } else if (hasBraveKey) {
                return 'brave';
            } else if (hasSerpApiKey) {
                return 'serpapi';
            } else {
                return 'duckduckgo'; // Free fallback - no API key required
            }
        } catch (error) {
            console.warn('[DeepResearchIntegration] Could not check API keys from settings, using DuckDuckGo fallback');
            return 'duckduckgo';
        }
    }


    /**
     * Check if vector store has user files indexed
     */
    private async checkVectorStoreHasFiles(): Promise<boolean> {
        try {
            // Check if toolExecutor has vector store functionality
            const availableTools = toolRegistry.getAvailableTools();

            // If search_documents tool is not even available, return false
            if (!availableTools.includes('search_documents')) {
                return false;
            }

            // For now, return false to disable vector store until proper file detection is implemented
            // TODO: Implement proper vector store file count check
            console.log('[DeepResearchIntegration] Vector store file check: disabled pending proper implementation');
            return false;

        } catch (error) {
            console.warn('[DeepResearchIntegration] Error checking vector store files:', error);
            return false;
        }
    }

    /**
     * Initialize tools for Deep Research
     */
    private async initializeTools(): Promise<void> {
        try {
            // Check if vector store has user files before enabling
            const hasVectorStoreFiles = await this.checkVectorStoreHasFiles();

            // Load tools with current settings (simplified for compatibility)
            const toolConfig = {
                // braveApiKey: undefined, // Simplified for compatibility
                // serpApiKey: undefined,
                // tavilyApiKey: undefined,
                // vectorStore: undefined, // Use existing vector store
                enabledTools: {
                    duckduckgo: true,
                    brave: false,
                    wikipedia: true,
                    serpapi: false,
                    tavily: false,
                    vector: hasVectorStoreFiles, // Only enable if there are user files
                    weather: true // Always enable weather tool (works with mock data)
                }
            };

            await toolLoader.loadAllTools(toolConfig);

            console.log('[DeepResearchIntegration] Tools initialized:', toolRegistry.getStats());

        } catch (error) {
            console.error('[DeepResearchIntegration] Error initializing tools:', error);
        }
    }

    /**
     * Intelligent routing using LLM to decide between Deep Research, Tool Agent, or Direct Response  
     * Now uses Zod schemas for structured output validation
     */
    async routeMessage(message: string, maxRetries: number = 3): Promise<{
        route: 'deep_research' | 'tool_agent' | 'direct_response';
        response?: string;
    }> {

        const routingPrompt = `Route this message to one of three options. Respond with ONLY one of these exact phrases:

            ROUTE_DEEP_RESEARCH - for research requests
            ROUTE_TOOL_AGENT - for weather, maps, searches  
            ROUTE_DIRECT [your response] - for simple questions

            Message: "${message}"

            Your routing decision:`;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[DeepResearchIntegration] Routing attempt ${attempt}/${maxRetries} for message: "${message.substring(0, 50)}..."`);

                const result = await this.llmProvider.invoke([
                    new HumanMessage({ content: routingPrompt })
                ]);

                // Clean response text and remove thinking tags
                const thinkTagRegex = /<think[^>]*>([\s\S]*?)<\/think>/g;
                const cleanResponse = (result.content as string).replace(thinkTagRegex, '').trim();

                console.log(`[DeepResearchIntegration] Routing response (attempt ${attempt}): "${cleanResponse}"`);

                // Parse using the Zod-based routing parser
                const routingDecision = parseRoutingResponse(cleanResponse);

                if (routingDecision) {
                    console.log(`[DeepResearchIntegration] ✅ Valid routing decision: ${routingDecision.route}`);
                    return {
                        route: routingDecision.route,
                        response: routingDecision.response
                    };
                } else {
                    console.warn(`[DeepResearchIntegration] ⚠️ Invalid routing format on attempt ${attempt}:`);
                    console.warn(`[DeepResearchIntegration]   Response: "${cleanResponse}"`);
                }

                // If we got here, the response format was invalid
                if (attempt < maxRetries) {
                    console.log(`[DeepResearchIntegration] Retrying routing decision (attempt ${attempt + 1}/${maxRetries})`);
                    // Add a small delay before retry
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

            } catch (error) {
                console.error(`[DeepResearchIntegration] Error in routing attempt ${attempt}:`, error);

                if (attempt < maxRetries) {
                    console.log(`[DeepResearchIntegration] Retrying after error (attempt ${attempt + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    console.error('[DeepResearchIntegration] All routing attempts failed due to errors');
                }
            }
        }

        // All retries exhausted - use intelligent fallback
        console.error('[DeepResearchIntegration] ❌ All routing attempts failed, using intelligent fallback');
        const fallbackRoute = this.getIntelligentFallback(message);
        console.log(`[DeepResearchIntegration] Using intelligent fallback route: ${fallbackRoute}`);

        if (fallbackRoute === 'direct_response') {
            return {
                route: fallbackRoute,
                response: 'I\'m experiencing technical difficulties with my routing system. I can still help you, but some advanced features may be temporarily unavailable. Please try rephrasing your request or try again in a moment.'
            };
        } else {
            return {
                route: fallbackRoute
            };
        }
    }


    /**
     * Check if required tools are available for a given message type
     */
    private checkRequiredTools(message: string, route: 'deep_research' | 'tool_agent' | 'direct_response'): {
        available: boolean;
        missingTools: string[];
        errorMessage?: string;
    } {
        const lowerMessage = message.toLowerCase().trim();
        const availableTools = toolRegistry.getAvailableTools();
        const missingTools: string[] = [];

        if (route === 'deep_research') {
            // Research requires web search capabilities
            const hasWebSearch = availableTools.some(tool =>
                tool.includes('search') && !tool.includes('vector') && !tool.includes('documents')
            );

            if (!hasWebSearch) {
                missingTools.push('web_search');
                return {
                    available: false,
                    missingTools,
                    errorMessage: 'I cannot conduct research without access to web search tools. Please activate the web search tool (DuckDuckGo, Brave, or SerpAPI) in the settings to enable research capabilities. You can also try asking for information I might already know from my training data.'
                };
            }
        }

        if (route === 'tool_agent') {
            // Check for specific tool requirements based on message content
            if (lowerMessage.includes('weather') || lowerMessage.includes('temperature') || lowerMessage.includes('forecast')) {
                if (!availableTools.includes('weather')) {
                    missingTools.push('weather');
                    return {
                        available: false,
                        missingTools,
                        errorMessage: 'I cannot provide weather information without the weather tool. Please activate the weather service (AccuWeather API) in the settings to get current weather data and forecasts.'
                    };
                }
            }

            if (lowerMessage.includes('map') || lowerMessage.includes('location') || lowerMessage.includes('directions')) {
                // Maps don't require external tools, but check anyway
                if (!availableTools.includes('maps') && !availableTools.some(tool => tool.includes('search'))) {
                    missingTools.push('maps_or_search');
                    return {
                        available: false,
                        missingTools,
                        errorMessage: 'I cannot provide location or mapping information without search tools. Please activate web search tools in the settings to enable location-based queries.'
                    };
                }
            }

            if ((lowerMessage.includes('search') || lowerMessage.includes('find') || lowerMessage.includes('look up')) &&
                !lowerMessage.includes('weather') && !lowerMessage.includes('map')) {
                // General search requests
                const hasAnySearch = availableTools.some(tool => tool.includes('search'));
                if (!hasAnySearch) {
                    missingTools.push('search');
                    return {
                        available: false,
                        missingTools,
                        errorMessage: 'I cannot perform web searches without search tools. Please activate web search tools (DuckDuckGo, Brave, or SerpAPI) in the settings to enable search capabilities.'
                    };
                }
            }
        }

        return { available: true, missingTools: [] };
    }

    /**
     * Get intelligent fallback based on message characteristics
     */
    private getIntelligentFallback(message: string): 'deep_research' | 'tool_agent' | 'direct_response' {
        const lowerMessage = message.toLowerCase().trim();

        // Default to tool agent for specific domains
        if (lowerMessage.includes('weather') || lowerMessage.includes('map') ||
            lowerMessage.includes('search') || lowerMessage.includes('find')) {
            return 'tool_agent';
        }

        // Default to research for academic/analysis requests
        if (lowerMessage.includes('explain') || lowerMessage.includes('analyze') ||
            lowerMessage.includes('compare') || lowerMessage.includes('research') ||
            lowerMessage.length > 80) {
            return 'deep_research';
        }

        // Default to direct response for everything else
        return 'direct_response';
    }


    /**
     * Legacy method for backward compatibility
     */
    async shouldUseDeepResearch(message: string): Promise<boolean | string> {
        const routing = await this.routeMessage(message);
        if (routing.route === 'deep_research') {
            return true;
        } else {
            return routing.response || 'I can help you with that.';
        }
    }

    /**
     * Process a message using the appropriate agent (Deep Research, Tool Agent, or Direct Response)
     */
    async processMessage(message: string, context?: any): Promise<{
        result: string;
        usedDeepResearch: boolean;
        usedToolAgent?: boolean;
        processingTime: number;
        sideViewData?: any;
    }> {
        const startTime = Date.now();

        try {
            const routing = await this.routeMessage(message);

            // Check if required tools are available before proceeding
            const toolCheck = this.checkRequiredTools(message, routing.route);
            if (!toolCheck.available && toolCheck.errorMessage) {
                console.warn(`[DeepResearchIntegration] Missing required tools for ${routing.route}:`, toolCheck.missingTools);
                return {
                    result: toolCheck.errorMessage,
                    usedDeepResearch: false,
                    usedToolAgent: false,
                    processingTime: Date.now() - startTime
                };
            }

            switch (routing.route) {
                case 'deep_research':
                    console.log('[DeepResearchIntegration] Using Deep Research for message');
                    const researchResult = await this.deepResearchAgent.processResearch(message);
                    return {
                        result: researchResult,
                        usedDeepResearch: true,
                        usedToolAgent: false,
                        processingTime: Date.now() - startTime
                    };

                case 'tool_agent':
                    console.log('[DeepResearchIntegration] Using Tool Agent for message');

                    // Check tool availability before processing
                    const availableTools = this.toolAgent.getAvailableTools();
                    console.log(`[DeepResearchIntegration] Available tools: ${availableTools.join(', ')}`);

                    if (availableTools.length === 0) {
                        console.warn('[DeepResearchIntegration] No tools available, returning helpful message');
                        return {
                            result: 'I understand you need help with that request, but my tool services are currently unavailable. I can still provide general information or assistance through conversation. Could you try asking in a different way, or would you like me to help with something else?',
                            usedDeepResearch: false,
                            usedToolAgent: false,
                            processingTime: Date.now() - startTime
                        };
                    }

                    try {
                        const toolResult = await this.toolAgent.process(message);

                        // Validate tool result to prevent hallucination
                        if (!toolResult || !toolResult.result) {
                            console.warn('[DeepResearchIntegration] Tool agent returned empty result');
                            return {
                                result: 'I tried to help with your request using my tools, but didn\'t get a proper response. This might be due to service availability or network issues. Please try again in a moment, or rephrase your request.',
                                usedDeepResearch: false,
                                usedToolAgent: false,
                                processingTime: Date.now() - startTime
                            };
                        }

                        // Check if the result indicates tool failure
                        const result = toolResult.result.toLowerCase();
                        if (result.includes('error') || result.includes('failed') || result.includes('unavailable') || result.includes('don\'t have the right tools')) {
                            console.warn('[DeepResearchIntegration] Tool execution failed or tools unavailable');
                            return {
                                result: 'I attempted to use my tools to help with your request, but they\'re currently experiencing issues. I can still provide general information and assistance through conversation. Would you like me to try a different approach to help you?',
                                usedDeepResearch: false,
                                usedToolAgent: false,
                                processingTime: Date.now() - startTime
                            };
                        }

                        return {
                            result: toolResult.result,
                            usedDeepResearch: false,
                            usedToolAgent: true,
                            processingTime: Date.now() - startTime,
                            sideViewData: toolResult.sideViewData
                        };

                    } catch (toolError: any) {
                        console.error('[DeepResearchIntegration] Tool Agent error:', toolError);
                        return {
                            result: 'I encountered an issue while trying to use my tools to help with your request. My tool services may be temporarily unavailable. I can still assist you through conversation - would you like to try asking in a different way?',
                            usedDeepResearch: false,
                            usedToolAgent: false,
                            processingTime: Date.now() - startTime
                        };
                    }

                case 'direct_response':
                default:
                    console.log('[DeepResearchIntegration] Using direct response with memory context');
                    try {
                        const directResult = await this.processDirectResponse(message, context);
                        return {
                            result: directResult,
                            usedDeepResearch: false,
                            usedToolAgent: false,
                            processingTime: Date.now() - startTime
                        };
                    } catch (directError: any) {
                        console.error('[DeepResearchIntegration] Direct response error:', directError);
                        return {
                            result: routing.response || 'I can help you with that based on my knowledge.',
                            usedDeepResearch: false,
                            usedToolAgent: false,
                            processingTime: Date.now() - startTime
                        };
                    }
            }

        } catch (error: any) {
            console.error('[DeepResearchIntegration] Error processing message:', error);

            if (this.fallbackToOriginal) {
                console.log('[DeepResearchIntegration] Falling back to original system');
                return {
                    result: 'FALLBACK_TO_ORIGINAL',
                    usedDeepResearch: false,
                    processingTime: Date.now() - startTime
                };
            } else {
                return {
                    result: `Research processing failed: ${error.message}`,
                    usedDeepResearch: true,
                    processingTime: Date.now() - startTime
                };
            }
        }
    }

    /**
     * Stream processing with support for all three agent types
     */
    async *streamMessage(message: string, context?: any): AsyncGenerator<{
        type: 'progress' | 'result' | 'tool_result' | 'side_view';
        content: string;
        usedDeepResearch: boolean;
        usedToolAgent?: boolean;
        status?: string;
        data?: any;
    }> {
        try {
            const routing = await this.routeMessage(message);

            // Check if required tools are available before proceeding
            const toolCheck = this.checkRequiredTools(message, routing.route);
            if (!toolCheck.available && toolCheck.errorMessage) {
                console.warn(`[DeepResearchIntegration] Missing required tools for ${routing.route}:`, toolCheck.missingTools);
                yield {
                    type: 'result',
                    content: toolCheck.errorMessage,
                    usedDeepResearch: false,
                    usedToolAgent: false
                };
                return;
            }

            switch (routing.route) {
                case 'deep_research':
                    console.log('[DeepResearchIntegration] Streaming Deep Research');

                    // Emit flow events for research workflow
                    const emitFlowEvent = (global as any).emitFlowEvent;
                    if (emitFlowEvent) {
                        emitFlowEvent('step-update', {
                            stepId: 'agent-processing',
                            status: 'completed',
                            title: 'AI Agent processing...',
                            details: 'Routing to Deep Research workflow'
                        });

                        emitFlowEvent('step-add', {
                            stepId: 'deep-research',
                            title: 'Deep Research workflow',
                            details: 'Conducting comprehensive research analysis'
                        });
                    }

                    for await (const update of this.deepResearchAgent.streamResearch(message)) {
                        // Convert progress messages to flow events
                        if (update.type === 'progress' && emitFlowEvent) {
                            const researchContext = extractResearchContext(message);

                            // Map research status to standardized steps
                            const statusMap: Record<string, keyof typeof AGENT_STEP_TEMPLATES> = {
                                'Starting research process...': 'STARTING_RESEARCH',
                                'Analyzing research requirements...': 'ANALYZING_REQUIREMENTS',
                                'Conducting comprehensive research...': 'CONDUCTING_RESEARCH',
                                'Research completed, generating final report...': 'GENERATING_REPORT'
                            };

                            const templateKey = statusMap[update.content];
                            const stepInfo = templateKey
                                ? generateStepDescription(templateKey, researchContext)
                                : { title: update.content, description: `Status: ${update.status || 'Processing'}` };

                            emitFlowEvent('step-add', {
                                stepId: `research-${Date.now()}`,
                                title: stepInfo.title,
                                details: stepInfo.description
                            });

                            // Don't yield progress updates as content
                            continue;
                        }

                        // Only yield actual results, not progress updates
                        if (update.type === 'result') {
                            yield {
                                ...update,
                                usedDeepResearch: true,
                                usedToolAgent: false
                            };

                            // Mark workflow as complete
                            if (emitFlowEvent) {
                                emitFlowEvent('step-update', {
                                    stepId: 'deep-research',
                                    status: 'completed',
                                    title: 'Deep Research workflow',
                                    details: 'Research analysis completed'
                                });
                            }
                        }
                    }
                    break;

                case 'tool_agent':
                    console.log('[DeepResearchIntegration] Streaming Tool Agent');

                    // Check tool availability before streaming
                    const availableTools = this.toolAgent.getAvailableTools();
                    console.log(`[DeepResearchIntegration] Available tools for streaming: ${availableTools.join(', ')}`);

                    if (availableTools.length === 0) {
                        console.warn('[DeepResearchIntegration] No tools available for streaming');
                        yield {
                            type: 'result',
                            content: 'I understand you need help with that request, but my tool services are currently unavailable. I can still provide general information or assistance through conversation. Could you try asking in a different way, or would you like me to help with something else?',
                            usedDeepResearch: false,
                            usedToolAgent: false
                        };
                        break;
                    }

                    try {
                        let hasValidResult = false;
                        for await (const update of this.toolAgent.processStreaming(message)) {
                            // Check for tool failure indicators in streaming
                            const content = update.content?.toLowerCase() || '';
                            if (content.includes('don\'t have the right tools') ||
                                content.includes('tool execution failed') ||
                                content.includes('tools are currently unavailable')) {
                                console.warn('[DeepResearchIntegration] Tool failure detected in streaming');
                                yield {
                                    type: 'result',
                                    content: 'I attempted to use my tools to help with your request, but they\'re currently experiencing issues. I can still provide general information and assistance through conversation. Would you like me to try a different approach to help you?',
                                    usedDeepResearch: false,
                                    usedToolAgent: false
                                };
                                return;
                            }

                            if (update.type === 'result' && update.content?.trim()) {
                                hasValidResult = true;
                            }

                            yield {
                                type: update.type as any,
                                content: update.content,
                                usedDeepResearch: false,
                                usedToolAgent: true,
                                data: update.data
                            };
                        }

                        // If no valid result was generated, provide fallback
                        if (!hasValidResult) {
                            console.warn('[DeepResearchIntegration] No valid result from tool agent streaming');
                            yield {
                                type: 'result',
                                content: 'I tried to help with your request using my tools, but didn\'t get a proper response. This might be due to service availability or network issues. Please try again in a moment, or rephrase your request.',
                                usedDeepResearch: false,
                                usedToolAgent: false
                            };
                        }

                    } catch (streamError: any) {
                        console.error('[DeepResearchIntegration] Tool Agent streaming error:', streamError);
                        yield {
                            type: 'result',
                            content: 'I encountered an issue while trying to use my tools to help with your request. My tool services may be temporarily unavailable. I can still assist you through conversation - would you like to try asking in a different way?',
                            usedDeepResearch: false,
                            usedToolAgent: false
                        };
                    }
                    break;

                case 'direct_response':
                default:
                    console.log('[DeepResearchIntegration] Streaming direct response with memory context');
                    try {
                        yield* this.streamDirectResponse(message, context);
                    } catch (directError: any) {
                        console.error('[DeepResearchIntegration] Direct response streaming error:', directError);
                        yield {
                            type: 'result',
                            content: routing.response || 'I can help you with that based on my knowledge.',
                            usedDeepResearch: false,
                            usedToolAgent: false
                        };
                    }
                    break;
            }
        } catch (error: any) {
            console.error('[DeepResearchIntegration] Error in streaming:', error);
            yield {
                type: 'result',
                content: `Error: ${error.message}`,
                usedDeepResearch: false,
                usedToolAgent: false
            };
        }
    }

    /**
     * Process direct response with memory context
     */
    private async processDirectResponse(message: string, context?: any): Promise<string> {
        try {
            const { HumanMessage, SystemMessage } = await import('@langchain/core/messages');

            // Build context-aware prompt
            let systemPrompt = `You are Cindy, a helpful AI assistant with persistent memory capabilities. You can remember information across conversations and save new information for future reference.

MEMORY CAPABILITIES:
- You have access to a persistent memory system that saves information across all conversations
- You can remember facts, preferences, and important details mentioned by users
- When users ask you to remember something, you WILL save it to persistent memory
- You can recall information from previous conversations and sessions

Answer the user's question directly and conversationally based on your knowledge and any relevant memories.`;

            if (context?.conversationHistory && context.conversationHistory.length > 0) {
                const recentMessages = context.conversationHistory.slice(-6).map((msg: any) =>
                    `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
                ).join('\n');
                systemPrompt += `\n\nRecent conversation context:\n${recentMessages}`;
            }

            if (context?.memoryContext && context.memoryContext.trim()) {
                systemPrompt += `\n\nRelevant memories from previous conversations:\n${context.memoryContext}`;
            }

            const messages = [
                new SystemMessage({ content: systemPrompt }),
                new HumanMessage({ content: message })
            ];

            const result = await this.llmProvider.invoke(messages);
            return result.content as string;
        } catch (error) {
            console.error('[DeepResearchIntegration] Error in processDirectResponse:', error);
            throw error;
        }
    }

    /**
     * Stream direct response with memory context
     */
    private async *streamDirectResponse(message: string, context?: any): AsyncGenerator<{
        type: 'progress' | 'result' | 'tool_result' | 'side_view';
        content: string;
        usedDeepResearch: boolean;
        usedToolAgent?: boolean;
        status?: string;
        data?: any;
    }> {
        try {
            const { HumanMessage, SystemMessage } = await import('@langchain/core/messages');

            // Build context-aware prompt (same as processDirectResponse)
            let systemPrompt = `You are Cindy, a helpful AI assistant with persistent memory capabilities. You can remember information across conversations and save new information for future reference.

MEMORY CAPABILITIES:
- You have access to a persistent memory system that saves information across all conversations
- You can remember facts, preferences, and important details mentioned by users
- When users ask you to remember something, you WILL save it to persistent memory
- You can recall information from previous conversations and sessions

Answer the user's question directly and conversationally based on your knowledge and any relevant memories.`;

            if (context?.conversationHistory && context.conversationHistory.length > 0) {
                const recentMessages = context.conversationHistory.slice(-6).map((msg: any) =>
                    `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
                ).join('\n');
                systemPrompt += `\n\nRecent conversation context:\n${recentMessages}`;
            }

            if (context?.memoryContext && context.memoryContext.trim()) {
                systemPrompt += `\n\nRelevant memories from previous conversations:\n${context.memoryContext}`;
            }

            const messages = [
                new SystemMessage({ content: systemPrompt }),
                new HumanMessage({ content: message })
            ];

            // Use streaming if available
            if (typeof this.llmProvider.stream === 'function') {
                let accumulatedContent = '';

                for await (const chunk of this.llmProvider.stream(messages)) {
                    const content = chunk as string;
                    if (content) {
                        accumulatedContent += content;

                        yield {
                            type: 'result',
                            content: content,
                            usedDeepResearch: false,
                            usedToolAgent: false
                        };
                    }
                }
            } else {
                // Fallback to non-streaming
                const result = await this.llmProvider.invoke(messages);
                yield {
                    type: 'result',
                    content: result.content as string,
                    usedDeepResearch: false,
                    usedToolAgent: false
                };
            }
        } catch (error) {
            console.error('[DeepResearchIntegration] Error in streamDirectResponse:', error);
            throw error;
        }
    }

    /**
     * Update settings and reconfigure
     */
    async updateSettings(): Promise<void> {
        console.log('[DeepResearchIntegration] Updating configuration from settings');

        try {
            // Recreate configuration
            this.configManager = this.createConfigFromSettings();

            // Update Deep Research agent
            this.deepResearchAgent.updateConfig(this.configManager.getConfig());

            // Reinitialize tools
            await this.initializeTools();

            console.log('[DeepResearchIntegration] Settings updated successfully');

        } catch (error) {
            console.error('[DeepResearchIntegration] Error updating settings:', error);
        }
    }

    /**
     * Enable or disable Deep Research
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        console.log(`[DeepResearchIntegration] Deep Research ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Set fallback behavior
     */
    setFallbackEnabled(enabled: boolean): void {
        this.fallbackToOriginal = enabled;
        console.log(`[DeepResearchIntegration] Fallback to original ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Get current status
     */
    getStatus(): {
        enabled: boolean;
        fallbackEnabled: boolean;
        availableTools: string[];
        configuration: DeepResearchConfiguration;
    } {
        return {
            enabled: this.enabled,
            fallbackEnabled: this.fallbackToOriginal,
            availableTools: toolRegistry.getToolNames(),
            configuration: this.configManager.getConfig()
        };
    }

    /**
     * Get Deep Research agent (for advanced usage)
     */
    getDeepResearchAgent(): DeepResearchAgent {
        return this.deepResearchAgent;
    }
}