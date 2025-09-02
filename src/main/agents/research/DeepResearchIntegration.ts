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
import { getApiKeyService } from '../../services/ApiKeyService';
import { logger } from '../../utils/ColorLogger';
import { setupLangSmithForResearch } from '../../services/LangSmithService';
import { z } from 'zod';

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

        logger.success('DeepResearchIntegration', 'Initialized with multi-agent routing system', {
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
            logger.error('DeepResearchIntegration', 'Error creating config from settings', error);
            return new DeepResearchConfigManager();
        }
    }

    /**
     * Get search API preference using centralized API key service
     */
    private getSearchAPIFromSettings(): string {
        try {
            // Use centralized API key service for consistent API key loading
            const apiKeyService = getApiKeyService(this.settingsService);
            const apiKeys = apiKeyService.getAllApiKeys();

            logger.info('DeepResearchIntegration', 'Checking API keys for search provider selection...');

            // Prefer APIs with available keys (priority order: most reliable first)
            if (apiKeys.braveApiKey) {
                logger.success('DeepResearchIntegration', 'Using Brave Search (primary - reliable, privacy-focused)');
                return 'brave';
            } else if (apiKeys.tavilyApiKey) {
                logger.success('DeepResearchIntegration', 'Using Tavily Search (secondary - AI-optimized)');
                return 'tavily';
            } else if (apiKeys.serpApiKey) {
                logger.success('DeepResearchIntegration', 'Using SerpAPI (tertiary - Google results)');
                return 'serpapi';
            } else {
                logger.warn('DeepResearchIntegration', 'Using DuckDuckGo (fallback - free but VQD issues)');
                return 'duckduckgo';
            }
        } catch (error) {
            logger.error('DeepResearchIntegration', 'Error checking API keys, using DuckDuckGo fallback', error);
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
            logger.debug('DeepResearchIntegration', 'Vector store file check: disabled pending proper implementation');
            return false;

        } catch (error) {
            logger.warn('DeepResearchIntegration', 'Error checking vector store files', error);
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

            // Load tools with priority order (reliable providers first, DuckDuckGo as fallback)
            // Use centralized API key service for consistent key loading
            const apiKeyService = getApiKeyService(this.settingsService);
            const apiKeys = apiKeyService.getAllApiKeys();

            logger.stage('DeepResearchIntegration', 'Tool Initialization', 'Loading tools with centralized API key service');

            // Initialize LangSmith for research tracing
            const langSmithSession = await setupLangSmithForResearch('deep-research-agent');
            if (langSmithSession) {
                logger.success('DeepResearchIntegration', `LangSmith session started: ${langSmithSession.sessionId}`);
            }
            logger.section('DeepResearchIntegration', 'API Key Diagnostics', () => {
                apiKeyService.logDiagnostics();
            });

            const toolConfig = {
                // API keys from centralized service
                braveApiKey: apiKeys.braveApiKey,
                serpApiKey: apiKeys.serpApiKey,
                tavilyApiKey: apiKeys.tavilyApiKey,
                accuWeatherApiKey: apiKeys.accuWeatherApiKey,
                enabledTools: {
                    // Search providers in priority order (most reliable first)
                    brave: true,       // Primary if API key available
                    tavily: true,      // Secondary if API key available  
                    serpapi: true,     // Tertiary if API key available
                    wikipedia: true,   // Always available (reliable for factual info)
                    duckduckgo: true,  // Fallback (free but VQD issues)
                    vector: hasVectorStoreFiles, // Only enable if there are user files
                    weather: true      // Always enable weather tool
                }
            };

            await toolLoader.loadAllTools(toolConfig);

            logger.success('DeepResearchIntegration', 'Tools initialized successfully', toolRegistry.getStats());

        } catch (error) {
            logger.error('DeepResearchIntegration', 'Error initializing tools', error);
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
        const responseSchema = z.object({
            route: z.enum(['DEEP_RESEARCH', 'TOOL_AGENT', 'DIRECT']),
            response: z.string().min(1).optional()
        });
        const routingPrompt = `Route this message to one of three options. Respond with ONLY one of these exact phrases if they apply:

            DEEP_RESEARCH - for research requests
            TOOL_AGENT - for weather, maps, searches  

            For simple questions you can answer directly, respond with:

            DIRECT your response to the human

            Examples:
            Message: "What's the weather in New York?" => TOOL_AGENT
            Message: "Explain quantum computing in simple terms" => DEEP_RESEARCH
            Message: "Who won the World Series in 2020?" => DIRECT The Los Angeles Dodgers won the World Series in 2020.
            Message: "Tell me a joke" => DIRECT Why don't scientists trust atoms? Because they make up everything!

            Message: "${message}"`;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                logger.info('DeepResearchIntegration', `Routing attempt ${attempt}/${maxRetries}`, {
                    message: message.substring(0, 50) + (message.length > 50 ? '...' : '')
                });

                const result = await this.llmProvider.invoke([
                    new HumanMessage({ content: routingPrompt })
                ]);
                // Clean response text and remove thinking tags
                const thinkTagRegex = /<think[^>]*>([\s\S]*?)<\/think>/g;
                const cleanResponse = (result.content as string).replace(thinkTagRegex, '').trim();
                // Validate response using Zod schema
                const parseResult = responseSchema.safeParse({
                    route: cleanResponse.trim().toUpperCase().startsWith('DEEP_RESEARCH') ? 'DEEP_RESEARCH' :
                        cleanResponse.trim().toUpperCase().startsWith('TOOL_AGENT') ? 'TOOL_AGENT' :
                            cleanResponse.trim().toUpperCase().startsWith('DIRECT') ? 'DIRECT' : '',
                    response: cleanResponse.trim().toUpperCase().startsWith('DIRECT') ?
                        cleanResponse.trim().substring(6).trim() : undefined
                });
                if (!parseResult.success) {
                    logger.warn('DeepResearchIntegration', `Routing response validation failed on attempt ${attempt}`, {
                        errors: parseResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`),
                        response: result.content
                    });
                    if (attempt < maxRetries) {
                        logger.info('DeepResearchIntegration', `Retrying routing decision (attempt ${attempt + 1}/${maxRetries})`);
                        // Add a small delay before retry
                        await new Promise(resolve => setTimeout(resolve, 500));
                        continue;
                    } else {
                        logger.error('DeepResearchIntegration', 'All routing attempts failed validation');
                        break;
                    }
                }


                logger.debug('DeepResearchIntegration', `Routing response (attempt ${attempt})`, { response: cleanResponse });

                // Parse using the Zod-based routing parser
                const routingDecision = parseRoutingResponse(cleanResponse);

                if (routingDecision) {
                    logger.success('DeepResearchIntegration', `Valid routing decision: ${routingDecision.route}`);
                    logger.transition('DeepResearchIntegration', 'Message Analysis', routingDecision.route.toUpperCase());
                    return {
                        route: routingDecision.route,
                        response: routingDecision.response
                    };
                } else {
                    logger.warn('DeepResearchIntegration', `Invalid routing format on attempt ${attempt}`, { response: cleanResponse });
                }

                // If we got here, the response format was invalid
                if (attempt < maxRetries) {
                    logger.info('DeepResearchIntegration', `Retrying routing decision (attempt ${attempt + 1}/${maxRetries})`);
                    // Add a small delay before retry
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

            } catch (error) {
                logger.error('DeepResearchIntegration', `Error in routing attempt ${attempt}`, error);

                if (attempt < maxRetries) {
                    logger.info('DeepResearchIntegration', `Retrying after error (attempt ${attempt + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    logger.error('DeepResearchIntegration', 'All routing attempts failed due to errors');
                }
            }
        }

        // All retries exhausted - use intelligent fallback
        logger.error('DeepResearchIntegration', 'All routing attempts failed, using intelligent fallback');
        const fallbackRoute = this.getIntelligentFallback(message);
        logger.warn('DeepResearchIntegration', `Using intelligent fallback route: ${fallbackRoute}`);

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
                logger.warn('DeepResearchIntegration', `Missing required tools for ${routing.route}`, { missingTools: toolCheck.missingTools });
                return {
                    result: toolCheck.errorMessage,
                    usedDeepResearch: false,
                    usedToolAgent: false,
                    processingTime: Date.now() - startTime
                };
            }

            switch (routing.route) {
                case 'deep_research':
                    logger.stage('DeepResearchIntegration', 'Deep Research Mode', 'Using comprehensive research workflow');
                    const researchResult = await this.deepResearchAgent.processResearch(message);
                    return {
                        result: researchResult,
                        usedDeepResearch: true,
                        usedToolAgent: false,
                        processingTime: Date.now() - startTime
                    };

                case 'tool_agent':
                    logger.stage('DeepResearchIntegration', 'Tool Agent Mode', 'Using specialized tool execution');

                    // Check tool availability before processing
                    const availableTools = this.toolAgent.getAvailableTools();
                    logger.info('DeepResearchIntegration', `Available tools: ${availableTools.join(', ')}`);

                    if (availableTools.length === 0) {
                        logger.warn('DeepResearchIntegration', 'No tools available, returning helpful message');
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
                            logger.warn('DeepResearchIntegration', 'Tool agent returned empty result');
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
                    logger.stage('DeepResearchIntegration', 'Direct Response Mode', 'Using memory-enhanced direct response');
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
            logger.error('DeepResearchIntegration', 'Error processing message', error);

            if (this.fallbackToOriginal) {
                logger.warn('DeepResearchIntegration', 'Falling back to original system');
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
                logger.warn('DeepResearchIntegration', `Missing required tools for ${routing.route}`, { missingTools: toolCheck.missingTools });
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