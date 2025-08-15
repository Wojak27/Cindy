import { LLMProvider } from '../services/LLMProvider';
import { LangChainMemoryService as MemoryService } from '../services/LangChainMemoryService';
import { LangChainToolExecutorService as ToolExecutorService } from '../services/LangChainToolExecutorService';
import { AgentPrompts } from '../prompts/AgentPrompts';

interface AgentContext {
    conversationId: string;
    userId?: string;
    sessionId: string;
    timestamp: Date;
    preferences: any;
}

interface AgentOptions {
    store: any;
    memoryService: MemoryService;
    toolExecutor: ToolExecutorService;
    config: any;
    llmRouter: LLMProvider;
}

interface ThinkingStep {
    step: 'analyze' | 'think' | 'tool' | 'synthesize';
    content: string;
    timestamp: Date;
}

interface ToolIntent {
    tool: string;
    forced: boolean; // true if hashtag was used
    parameters: any;
    reasoning: string;
}

interface ThinkingPlan {
    intent: string;
    forcedTools: string[]; // tools forced by hashtags
    suggestedTools: string[]; // tools suggested by analysis
    reasoning: string;
    steps: ToolIntent[];
}

export class ThinkingCindyAgent {
    private memoryService: MemoryService;
    private toolExecutor: ToolExecutorService;
    private llmProvider: LLMProvider;
    private thinkingSteps: ThinkingStep[] = [];

    // Hashtag to tool mapping
    private readonly hashtagToTool: Record<string, string> = {
        '#search': 'search_documents',
        '#read': 'read_file',
        '#write': 'write_file',
        '#list': 'list_directory',
        '#web': 'web_search_preferred',  // Special flag to use preferred web search provider
        '#brave': 'brave_search',
        '#tavily': 'tavily_search',
        '#dir': 'list_directory',
        '#find': 'search_documents',
        '#file': 'read_file',
        '#create': 'write_file'
    };

    constructor(options: AgentOptions) {
        this.memoryService = options.memoryService;
        this.toolExecutor = options.toolExecutor;
        this.llmProvider = options.llmRouter;

        console.log('[ThinkingCindyAgent] Initialized thinking agent with tool forcing capabilities');
        console.log('[ThinkingCindyAgent] Using provider:', this.llmProvider.getCurrentProvider());
    }

    /**
     * Detect if query requires location information
     */
    private async detectLocationRequirement(input: string): Promise<{
        requiresLocation: boolean;
        queryType?: string;
        enhancedQuery?: string;
        userLocation?: string;
    }> {
        try {
            const response = await this.llmProvider.invoke([
                { role: 'system' as const, content: AgentPrompts.LOCATION_DETECTION_PROMPT },
                { role: 'user' as const, content: input }
            ]);

            const responseText = response.content as string;
            const requiresLocation = responseText.includes('REQUIRES_LOCATION: true');

            if (!requiresLocation) {
                return { requiresLocation: false };
            }

            // Extract query type and enhanced query
            const queryTypeMatch = responseText.match(/QUERY_TYPE:\s*(\w+)/);
            const enhancedQueryMatch = responseText.match(/ENHANCED_QUERY:\s*(.+?)(?:\n|$)/);

            return {
                requiresLocation: true,
                queryType: queryTypeMatch?.[1] || 'other',
                enhancedQuery: enhancedQueryMatch?.[1]?.trim() || input
            };
        } catch (error) {
            console.warn('[ThinkingCindyAgent] Location detection failed:', error);
            return { requiresLocation: false };
        }
    }

    /**
     * Get user location (placeholder for now - could integrate with browser geolocation API)
     */
    private async getUserLocation(): Promise<string | null> {
        // TODO: Implement actual location detection
        // This could integrate with:
        // - Browser Geolocation API
        // - IP-based location services
        // - User settings/preferences
        // - Previous location mentions in conversation

        // For now, return null to trigger location request
        return null;
    }

    /**
     * Analyze input for hashtags and intent
     */
    // Assumes the class has:
    // private readonly hashtagToTool: Record<string, string> = { ... }  // your mapping

    private async analyzeInput(
        input: string
    ): Promise<{ cleanInput: string; forcedTools: string[]; hashtags: string[]; directResponse: boolean }> {
        const hashtagRe = /#\w+/g;

        // 1) Extract hashtags (lowercased) exactly as written in the input
        const hashtags = (input.match(hashtagRe) ?? []).map(tag => tag.toLowerCase());

        // 2) Use your provided hashtagToTool mapping directly
        const forcedTools = Array.from(
            new Set(
                hashtags
                    .map(tag => this.hashtagToTool[tag]) // <- use the mapping as-is
                    .filter((t): t is string => Boolean(t))
            )
        );

        // 3) Clean input (remove hashtags + collapse spaces)
        const cleanInput = input.replace(hashtagRe, '').replace(/\s{2,}/g, ' ').trim();

        // 4) Decide if we should answer directly (ask LLM only if no tools are forced)
        let directResponse: boolean;
        if (forcedTools.length === 0) {
            const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

            const parseDirect = (raw: unknown): boolean | undefined => {
                // Strip message from <think> tags
                const cleanContent = String((raw as any)?.content ?? '')
                    .replace(/<think\b[^>]*>.*?<\/think>/gs, '')
                    .trim();
                if (!cleanContent) return undefined; // empty response
                const content: string = (
                    cleanContent ??
                    String(raw ?? '')
                ).toString();




                const t = content.trim().toLowerCase();

                // Strict single-token booleans
                if (/^(true|yes|y|1|YES)$/.test(t)) return true;
                if (/^(false|no|n|0|NO)$/.test(t)) return false;

                // JSON / key-style hints
                try {
                    const j = JSON.parse(t);
                    if (typeof j === 'boolean') return j;
                    if (j && typeof j === 'object') {
                        const val = (j as any).directResponse ?? (j as any).direct_response ?? (j as any).direct;
                        if (typeof val === 'boolean') return val;
                        if (typeof val === 'string') {
                            const s = val.toLowerCase();
                            if (['true', 'yes', 'y', '1', 'YES'].includes(s)) return true;
                            if (['false', 'no', 'n', '0', 'NO'].includes(s)) return false;
                        }
                    }
                } catch { }

                if (/"directresponse"\s*:\s*true/.test(t)) return true;
                if (/"directresponse"\s*:\s*false/.test(t)) return false;

                // Heuristics
                if (/\bdirect\b/.test(t) && !/\b(tool|tools)\b/.test(t)) return true;
                if (/\b(use|needs?)\s+tool(s)?\b/.test(t)) return false;

                return undefined; // ambiguous -> trigger retry
            };

            const baseSystem = AgentPrompts.getSystemPrompt('direct_response');

            const tryOnce = async (strictness: number): Promise<boolean | undefined> => {
                const extra =
                    strictness === 0
                        ? ''
                        : strictness === 1
                            ? 'Reply with a single token: true or false. No punctuation or extra words.'
                            : 'Reply EXACTLY "true" or "false". Nothing else.';
                const res = await this.llmProvider.invoke([
                    { role: 'system' as const, content: [baseSystem, extra].filter(Boolean).join('\n\n') },
                    { role: 'user' as const, content: cleanInput }
                ]);
                return parseDirect(res);
            };

            const maxAttempts = 3;
            const baseDelayMs = 250;
            let parsed: boolean | undefined;

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                try {
                    parsed = await tryOnce(attempt); // escalate strictness per attempt
                    if (parsed !== undefined) break;
                } catch {
                    // ignore and retry with backoff
                }
                if (attempt < maxAttempts - 1) {
                    const jitter = Math.floor(Math.random() * 50);
                    await sleep(baseDelayMs * Math.pow(2, attempt) + jitter);
                }
            }

            directResponse = parsed ?? false; // conservative fallback
        } else {
            directResponse = false; // tools forced => not a simple direct response
        }

        return { cleanInput, forcedTools, hashtags, directResponse };
    }



    /**
     * Think and create execution plan
     */
    private async createThinkingPlan(
        cleanInput: string,
        forcedTools: string[],
        context?: AgentContext,
        locationInfo?: {
            requiresLocation: boolean;
            queryType?: string;
            enhancedQuery?: string;
            userLocation?: string;
        }
    ): Promise<ThinkingPlan> {
        const availableTools = this.toolExecutor.getAvailableTools();

        // Build thinking prompt for complex requests
        const thinkingPrompt = `You are Cindy, an intelligent voice assistant. Analyze this user request and create an execution plan.

User request: "${cleanInput}"
Forced tools (must use): ${forcedTools.join(', ') || 'none'}
Available tools: ${availableTools.join(', ')}

Think step by step:
1. What is the user trying to accomplish?
2. What tools are REQUIRED (forced by hashtags)?
3. What additional tools might be helpful?
4. What order should tools be executed in?

Respond with your thinking process and a clear plan. Be concise but thorough.`;

        const thinkingResponse = await this.llmProvider.invoke([
            { role: 'system' as const, content: AgentPrompts.getSystemPrompt('thinking') },
            { role: 'user' as const, content: thinkingPrompt }
        ]);

        const reasoning = thinkingResponse.content as string;

        // Determine suggested tools based on content analysis
        const suggestedTools = this.suggestToolsFromContent(cleanInput, availableTools);

        // Combine forced and suggested tools, prioritizing forced tools
        const allToolsSet = new Set([...forcedTools, ...suggestedTools]);
        const allTools = Array.from(allToolsSet);

        // Create tool intents
        const steps: ToolIntent[] = allTools.map(tool => ({
            tool,
            forced: forcedTools.includes(tool),
            parameters: this.inferToolParameters(tool, cleanInput, locationInfo),
            reasoning: forcedTools.includes(tool) ? 'Forced by hashtag' : 'Suggested by analysis'
        }));

        const plan: ThinkingPlan = {
            intent: this.inferUserIntent(cleanInput),
            forcedTools,
            suggestedTools,
            reasoning,
            steps
        };

        this.addThinkingStep('think',
            `Thinking process:\n${reasoning}\n\n` +
            `Execution plan:\n` +
            `- Intent: ${plan.intent}\n` +
            `- Tools to use: ${allTools.join(', ') || 'none'}\n` +
            `- Execution steps: ${steps.length}`
        );

        return plan;
    }

    /**
     * Synthesize final response with citations
     */
    private async synthesizeResponse(
        cleanInput: string,
        plan: ThinkingPlan,
        toolResults: Record<string, any>,
        context?: AgentContext
    ): Promise<string> {
        // Get conversation history for context
        let history: any[] = [];
        try {
            if (this.memoryService) {
                history = await this.memoryService.getConversationHistory(
                    context?.conversationId || 'default',
                    5 // last 5 messages for context
                );
            }
        } catch (error) {
            console.warn('[ThinkingCindyAgent] Failed to get conversation history:', error);
        }

        // Build enhanced synthesis prompt with tool results
        const toolResultsForPrompt = Object.entries(toolResults).map(([tool, result]) => ({
            name: tool,
            success: result.success,
            result: result.result,
            error: result.error
        }));

        const toolResultsPrompt = AgentPrompts.buildToolResultsPrompt(toolResultsForPrompt);

        const synthesisPrompt = `User's original request: "${cleanInput}"
My thinking process: ${plan.reasoning}
Tools executed: ${plan.steps.map(s => s.tool).join(', ') || 'none'}

${toolResultsPrompt}

Conversation context: ${history.length > 0 ? `Previous ${history.length} messages for context` : 'No previous context'}

Provide a helpful, natural response that addresses the user's request using only the information that was successfully retrieved.`;

        const response = await this.llmProvider.invoke([
            { role: 'system' as const, content: AgentPrompts.getSystemPrompt('synthesis') },
            { role: 'user' as const, content: synthesisPrompt }
        ]);

        let finalResponse = response.content as string;

        // Extract and add citations inline (simplified version)
        const citations = this.extractCitationsFromResults(toolResults);
        if (citations.length > 0) {
            finalResponse += '\n\n**Sources:**\n\n';
            citations.forEach((citation, index) => {
                finalResponse += `**[${index + 1}]** [${citation.title}](${citation.url})`;
                if (citation.source) {
                    finalResponse += ` - *${citation.source}*`;
                }
                finalResponse += '\n\n';
            });
        }

        this.addThinkingStep('synthesize',
            `Final response generated with citations:\n"${finalResponse.substring(0, 200)}${finalResponse.length > 200 ? '...' : ''}"\n` +
            `Citations found: ${citations.length}`
        );

        return finalResponse;
    }

    /**
     * Extract citations from tool results (simplified version)
     */
    private extractCitationsFromResults(toolResults: Record<string, any>): Array<{ title: string; url: string; source?: string }> {
        const citations: Array<{ title: string; url: string; source?: string }> = [];

        for (const [toolName, result] of Object.entries(toolResults)) {
            if (!result?.success) continue;

            try {
                if ((toolName === 'web_search' || toolName === 'brave_search') && typeof result.result === 'string') {
                    // Parse web search results
                    const lines = result.result.split('\n');
                    let currentCitation: { title?: string; url?: string } = {};

                    for (const line of lines) {
                        // Look for numbered results: "1. **Title**"
                        const titleMatch = line.match(/^\d+\.\s*\*\*(.+?)\*\*/);
                        if (titleMatch) {
                            // Save previous citation if complete
                            if (currentCitation.title && currentCitation.url) {
                                citations.push({
                                    title: currentCitation.title,
                                    url: currentCitation.url,
                                    source: this.getSourceFromUrl(currentCitation.url)
                                });
                            }
                            currentCitation = { title: titleMatch[1].trim() };
                        }

                        // Look for URLs: "   URL: https://..."
                        const urlMatch = line.match(/^\s*URL:\s*(.+)$/);
                        if (urlMatch && currentCitation.title) {
                            currentCitation.url = urlMatch[1].trim();
                        }
                    }

                    // Don't forget the last citation
                    if (currentCitation.title && currentCitation.url) {
                        citations.push({
                            title: currentCitation.title,
                            url: currentCitation.url,
                            source: this.getSourceFromUrl(currentCitation.url)
                        });
                    }
                }
            } catch (error) {
                console.error(`[ThinkingCindyAgent] Error extracting citations from ${toolName}:`, error);
            }
        }

        return citations;
    }

    /**
     * Get a readable source name from URL
     */
    private getSourceFromUrl(url: string): string {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace('www.', '');
        } catch {
            return url.length > 50 ? url.substring(0, 50) + '...' : url;
        }
    }


    /**
     * Streaming version with thinking steps shown
     */
    async *processStreaming(input: string, context?: AgentContext): AsyncGenerator<string> {
        try {
            console.log('\n🎬 STARTING STREAMING THINKING PROCESS');
            console.log('═'.repeat(80));
            console.log(`📥 INPUT: "${input}"`);
            console.log('═'.repeat(80));

            this.thinkingSteps = [];

            // Start thinking block with timer
            const thinkingStartTime = Date.now();

            // Analyze input
            console.log('\n🔍 [STREAMING] Analyzing input...');
            const { cleanInput, forcedTools, hashtags, directResponse } = await this.analyzeInput(input);
            if (directResponse) {
                console.log('💬 Direct response detected - no tools needed')
                let finalResponse: string;
                for await (const chunk of this.llmProvider.stream([
                    { role: 'system' as const, content: AgentPrompts.getSystemPrompt('synthesis') },
                    { role: 'user' as const, content: cleanInput }
                ])) {
                    finalResponse += chunk;
                    yield chunk; // Stream response as it comes in
                }
                // Store conversation
                await this.storeConversation(input, finalResponse, context);
            } else {
                yield `<think id="thinking-${context?.conversationId || 'default'}-${thinkingStartTime}" start="${thinkingStartTime}">`;
                yield `**Analysis:**\n`;
                yield `• Clean input: "${cleanInput}"\n`;
                if (hashtags.length > 0) yield `• Hashtags: ${hashtags.join(', ')}\n`;
                if (forcedTools.length > 0) yield `• Forced tools: ${forcedTools.join(', ')}\n`;

                // Check for location requirements
                console.log('\n📍 [STREAMING] Checking location requirements...');
                const locationInfo = await this.detectLocationRequirement(cleanInput);

                if (locationInfo.requiresLocation) {
                    yield `• Location required for: ${locationInfo.queryType}\n`;
                    const userLocation = await this.getUserLocation();

                    if (!userLocation) {
                        yield `• **Location needed**: Please specify your location for accurate results\n`;
                        // We could return early here and ask for location, or continue with generic search
                    } else {
                        yield `• Using location: ${userLocation}\n`;
                        locationInfo.userLocation = userLocation;
                    }
                }
                yield `\n`;

                // Create thinking plan  
                console.log('\n💭 [STREAMING] Creating execution plan...');
                yield "**Planning approach...**\n";

                const plan = await this.createThinkingPlan(cleanInput, forcedTools, context, locationInfo);

                yield `**Intent:** ${plan.intent}\n`;
                if (plan.steps.length > 0) {
                    yield `**Tools planned:** ${plan.steps.map(s => `${s.tool}${s.forced ? ' (forced)' : ''}`).join(', ')}\n`;
                }
                yield `\n`;

                // End thinking block before tool execution
                const thinkingEndTime = Date.now();
                yield `</think end="${thinkingEndTime}">`;

                console.log('\n⚙️ [STREAMING] Executing tools...');
                yield `**Executing tools...**\n`;

                const toolResults: Record<string, any> = {};

                for (let i = 0; i < plan.steps.length; i++) {
                    const step = plan.steps[i];
                    const stepNum = i + 1;
                    const toolId = `tool-${context?.conversationId || 'default'}-${Date.now()}-${i}`;

                    // Start tool execution block with structured information
                    const toolCallInfo = {
                        id: toolId,
                        name: step.tool,
                        parameters: step.parameters,
                        status: 'executing',
                        startTime: Date.now(),
                        reasoning: step.reasoning,
                        forced: step.forced,
                        stepNumber: stepNum,
                        totalSteps: plan.steps.length
                    };

                    // Emit structured tool execution start
                    yield `<tool>${JSON.stringify(toolCallInfo)}</tool>\n`;

                    const startTime = Date.now();
                    try {
                        // Handle special web search preference routing
                        let actualTool = step.tool;
                        if (step.tool === 'web_search_preferred') {
                            // Route to user's preferred web search provider
                            actualTool = 'web_search'; // This will be handled by LangChainToolExecutorService routing
                            console.log(`   🔄 [STREAMING] Routing #web hashtag to preferred web search provider`);
                        }

                        const result = await this.toolExecutor.executeTool(actualTool, step.parameters);
                        const duration = Date.now() - startTime;
                        toolResults[step.tool] = result;

                        // Update tool call with completion status
                        const completedToolCall = {
                            ...toolCallInfo,
                            status: result.success ? 'completed' : 'failed',
                            endTime: Date.now(),
                            duration: `${(duration / 1000).toFixed(1)}s`,
                            result: result.success ? result.result : undefined,
                            error: result.success ? undefined : result.error
                        };

                        // Emit structured tool completion
                        yield `<tool>${JSON.stringify(completedToolCall)}</tool>\n`;

                    } catch (error) {
                        console.error(`[ThinkingCindyAgent] Tool execution error for ${step.tool}:`, error);
                        const duration = Date.now() - startTime;
                        toolResults[step.tool] = { success: false, error: (error as Error).message };

                        // Update tool call with error status
                        const failedToolCall = {
                            ...toolCallInfo,
                            status: 'failed',
                            endTime: Date.now(),
                            duration: `${(duration / 1000).toFixed(1)}s`,
                            error: (error as Error).message
                        };

                        // Emit structured tool error
                        yield `<tool>${JSON.stringify(failedToolCall)}</tool>\n`;
                    }
                }

                // Synthesize response with citations
                console.log('\n📝 [STREAMING] Synthesizing response...');
                yield "**Synthesizing response...**\n";

                const finalResponse = await this.synthesizeResponse(cleanInput, plan, toolResults, context);


                yield finalResponse;
                // Store conversation
                await this.storeConversation(input, finalResponse, context);


                console.log('\n🎉 [STREAMING] Thinking process completed successfully');
                console.log('═'.repeat(80));
            }
        } catch (error) {
            console.log('\n❌ [STREAMING] Thinking process error');
            console.log('═'.repeat(80));
            console.error('[ThinkingCindyAgent] Streaming error:', error);
            yield `\n❌ **Error:** I encountered an issue while processing your request: ${(error as Error).message}`;
        }
    }


    private addThinkingStep(step: ThinkingStep['step'], content: string): void {
        this.thinkingSteps.push({
            step,
            content,
            timestamp: new Date()
        });

    }

    private suggestToolsFromContent(input: string, availableTools: string[]): string[] {
        const suggestions: string[] = [];
        const lowerInput = input.toLowerCase();

        // Content-based tool suggestions
        if ((lowerInput.includes('search') || lowerInput.includes('find') || lowerInput.includes('look for'))
            && availableTools.includes('search_documents')) {
            suggestions.push('search_documents');
        }

        if ((lowerInput.includes('read') || lowerInput.includes('show') || lowerInput.includes('open'))
            && availableTools.includes('read_file')) {
            suggestions.push('read_file');
        }

        if ((lowerInput.includes('write') || lowerInput.includes('create') || lowerInput.includes('save'))
            && availableTools.includes('write_file')) {
            suggestions.push('write_file');
        }

        return suggestions;
    }

    private inferToolParameters(tool: string, input: string, locationInfo?: {
        requiresLocation: boolean;
        queryType?: string;
        enhancedQuery?: string;
        userLocation?: string;
    }): any {
        switch (tool) {
            case 'search_documents':
                return { query: input, limit: 5 };
            case 'read_file':
                // Try to extract file path from input
                const fileMatch = input.match(/(?:read|open|show)\s+(?:file\s+)?(.+?)(?:\s|$)/i);
                return { file_path: fileMatch?.[1] || 'unknown' };
            case 'write_file':
                const writeMatch = input.match(/(?:write|create|save)\s+(.+?)\s+(?:to|in)\s+(.+?)(?:\s|$)/i);
                return {
                    content: writeMatch?.[1] || input,
                    file_path: writeMatch?.[2] || 'output.txt'
                };
            case 'web_search':
            case 'web_search_preferred':
                // Use location-enhanced query if available
                let searchQuery = input.trim();
                if (locationInfo?.requiresLocation && locationInfo.enhancedQuery && locationInfo.userLocation) {
                    searchQuery = locationInfo.enhancedQuery.replace('{LOCATION}', locationInfo.userLocation);
                }

                // Ensure search query is meaningful (at least 3 characters)
                if (searchQuery.length < 3) {
                    return { input: `information about ${searchQuery}` };
                }
                return { input: searchQuery };
            case 'brave_search':
                // Same logic as web_search
                let braveQuery = input.trim();
                if (locationInfo?.requiresLocation && locationInfo.enhancedQuery && locationInfo.userLocation) {
                    braveQuery = locationInfo.enhancedQuery.replace('{LOCATION}', locationInfo.userLocation);
                }
                if (braveQuery.length < 3) {
                    return { input: `information about ${braveQuery}` };
                }
                return { input: braveQuery };
            case 'tavily_search':
                // Tavily also uses input parameter
                let tavilyQuery = input.trim();
                if (locationInfo?.requiresLocation && locationInfo.enhancedQuery && locationInfo.userLocation) {
                    tavilyQuery = locationInfo.enhancedQuery.replace('{LOCATION}', locationInfo.userLocation);
                }
                if (tavilyQuery.length < 3) {
                    return { input: `information about ${tavilyQuery}` };
                }
                return { input: tavilyQuery };
            default:
                return {};
        }
    }

    private inferUserIntent(input: string): string {
        const lowerInput = input.toLowerCase();

        if (lowerInput.includes('search') || lowerInput.includes('find')) {
            return 'search for information';
        }
        if (lowerInput.includes('read') || lowerInput.includes('show')) {
            return 'read/view content';
        }
        if (lowerInput.includes('write') || lowerInput.includes('create')) {
            return 'create/write content';
        }
        if (lowerInput.includes('help') || lowerInput.includes('how')) {
            return 'get help or instructions';
        }

        return 'general conversation';
    }

    private async storeConversation(input: string, response: string, context?: AgentContext): Promise<void> {
        try {
            const conversationId = context?.conversationId || 'default';

            await this.memoryService.addMessage({
                conversationId,
                role: 'user',
                content: input,
                timestamp: new Date()
            });

            await this.memoryService.addMessage({
                conversationId,
                role: 'assistant',
                content: response,
                timestamp: new Date()
            });
        } catch (error) {
            console.warn('[ThinkingCindyAgent] Failed to store conversation:', error);
        }
    }


    // Expose thinking steps for debugging/transparency
    getThinkingSteps(): ThinkingStep[] {
        return [...this.thinkingSteps];
    }
}