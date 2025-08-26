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
     * Returns routing decision and response with retry logic
     */
    async routeMessage(message: string, maxRetries: number = 3): Promise<{
        route: 'deep_research' | 'tool_agent' | 'direct_response';
        response?: string;
    }> {
        const routingPrompt = `You are an intelligent routing agent that decides how to handle user requests. You have three options:

DEEP RESEARCH - For complex research requiring comprehensive analysis:
- Research requests about topics, trends, or detailed information
- Comparative analysis or multi-faceted investigations
- Questions requiring multiple sources and structured methodology
- Requests for in-depth reports or comprehensive overviews
- Academic or professional research needs

TOOL AGENT - For specific actions that require tools:
- Weather inquiries (current conditions, forecasts)
- Map displays and location visualization ("show me where", "display on map", "where is [location]")
- Quick web searches for specific facts
- Tool-based calculations or conversions
- Location coordinates and geographical queries requiring visual maps
- Real-time data requests

DIRECT RESPONSE - For simple questions requiring immediate answers:
- Basic factual questions with straightforward answers
- Common knowledge queries  
- Casual conversation or greetings
- Simple explanations that don't require tools or research

User Message: "${message}"

CRITICAL: You MUST respond with exactly one of these three options. No other format is acceptable:
- "ROUTE_DEEP_RESEARCH" - for comprehensive research requests
- "ROUTE_TOOL_AGENT" - for tool-based actions (weather, maps, searches, etc.)  
- "ROUTE_DIRECT" followed by your direct response - for simple questions

Examples:
- "what's the weather in Paris?" → "ROUTE_TOOL_AGENT"
- "Please show me where Paris is" → "ROUTE_TOOL_AGENT"
- "Display Tokyo on a map" → "ROUTE_TOOL_AGENT"  
- "Where is London? Show it to me" → "ROUTE_TOOL_AGENT"
- "research AI trends in healthcare" → "ROUTE_DEEP_RESEARCH"  
- "hello, how are you?" → "ROUTE_DIRECT Hello! I'm here to help you with questions, research, and various tasks. How can I assist you today?"

IMPORTANT: Only use the exact routing format above. Do not add explanations or extra text.`;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[DeepResearchIntegration] Routing attempt ${attempt}/${maxRetries} for message: "${message.substring(0, 50)}..."`);

                const result = await this.llmProvider.invoke([
                    { role: 'user', content: routingPrompt }
                ]);
                const thinkTagRegex = /<think[^>]*>([\s\S]*?)<\/think>/g;
                result.content = (result.content as string).replace(thinkTagRegex, '').trim();

                const response = (result.content as string).trim();
                console.log(`[DeepResearchIntegration] Routing response (attempt ${attempt}): "${response}"`);

                // Validate response using the validation helper
                const validation = this.validateRoutingResponse(response);

                if (validation.isValid) {
                    console.log(`[DeepResearchIntegration] ✅ Valid routing decision: ${validation.route}`);
                    return {
                        route: validation.route!,
                        response: validation.directResponse
                    };
                } else {
                    console.warn(`[DeepResearchIntegration] ⚠️ Invalid routing format on attempt ${attempt}:`);
                    console.warn(`[DeepResearchIntegration]   Response: "${response}"`);
                    console.warn(`[DeepResearchIntegration]   Issues: ${validation.issues.join(', ')}`);
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

        // All retries exhausted - return fallback with clear messaging
        console.error('[DeepResearchIntegration] ❌ All routing attempts failed, using fallback');
        return {
            route: 'direct_response',
            response: 'I\'m experiencing technical difficulties with my routing system. I can still help you, but some advanced features may be temporarily unavailable. Please try rephrasing your request or try again in a moment.'
        };
    }

    /**
     * Validate and debug routing response format
     */
    private validateRoutingResponse(response: string): {
        isValid: boolean;
        route?: 'deep_research' | 'tool_agent' | 'direct_response';
        directResponse?: string;
        issues: string[];
    } {
        const issues: string[] = [];
        const trimmed = response.trim();

        // Check for exact matches first
        if (trimmed === 'ROUTE_DEEP_RESEARCH') {
            return { isValid: true, route: 'deep_research', issues: [] };
        }

        if (trimmed.startsWith('ROUTE_TOOL_AGENT')) {
            return { isValid: true, route: 'tool_agent', issues: [] };
        }

        if (trimmed.startsWith('ROUTE_DIRECT ')) {
            const directResponse = trimmed.substring('ROUTE_DIRECT '.length).trim();
            if (directResponse.length === 0) {
                issues.push('Empty direct response after ROUTE_DIRECT');
                return { isValid: false, issues };
            }
            return { isValid: true, route: 'direct_response', directResponse, issues: [] };
        }

        // Analyze what went wrong
        if (trimmed.toLowerCase().includes('route_deep_research')) {
            issues.push('Incorrect casing or format for ROUTE_DEEP_RESEARCH');
        }
        if (trimmed.toLowerCase().includes('route_tool_agent')) {
            issues.push('Incorrect casing or format for ROUTE_TOOL_AGENT');
        }
        if (trimmed.toLowerCase().includes('route_direct')) {
            issues.push('Incorrect casing or format for ROUTE_DIRECT');
        }
        if (trimmed.length === 0) {
            issues.push('Empty response');
        }
        if (trimmed.includes('explanation') || trimmed.includes('because') || trimmed.includes('reasoning')) {
            issues.push('Response contains explanation instead of just routing decision');
        }

        return { isValid: false, issues };
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
    async processMessage(message: string): Promise<{
        result: string;
        usedDeepResearch: boolean;
        usedToolAgent?: boolean;
        processingTime: number;
        sideViewData?: any;
    }> {
        const startTime = Date.now();

        try {
            const routing = await this.routeMessage(message);

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
                    console.log('[DeepResearchIntegration] Using direct response');
                    return {
                        result: routing.response || 'I can help you with that.',
                        usedDeepResearch: false,
                        usedToolAgent: false,
                        processingTime: Date.now() - startTime
                    };
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
    async *streamMessage(message: string): AsyncGenerator<{
        type: 'progress' | 'result' | 'tool_result' | 'side_view';
        content: string;
        usedDeepResearch: boolean;
        usedToolAgent?: boolean;
        status?: string;
        data?: any;
    }> {
        try {
            const routing = await this.routeMessage(message);

            switch (routing.route) {
                case 'deep_research':
                    console.log('[DeepResearchIntegration] Streaming Deep Research');
                    for await (const update of this.deepResearchAgent.streamResearch(message)) {
                        yield {
                            ...update,
                            usedDeepResearch: true,
                            usedToolAgent: false
                        };
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
                    console.log('[DeepResearchIntegration] Streaming direct response');
                    yield {
                        type: 'result',
                        content: routing.response || 'I can help you with that.',
                        usedDeepResearch: false,
                        usedToolAgent: false
                    };
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