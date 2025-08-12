import { LLMProvider } from '../services/LLMProvider';
import { LangChainMemoryService as MemoryService } from '../services/LangChainMemoryService';
import { LangChainToolExecutorService as ToolExecutorService } from '../services/LangChainToolExecutorService';

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
     * Phase 1: Analyze input for hashtags and intent
     */
    private analyzeInput(input: string): { cleanInput: string; forcedTools: string[]; hashtags: string[] } {
        const hashtags = (input.match(/#\w+/g) || []).map(tag => tag.toLowerCase());
        const forcedTools = hashtags.map(tag => this.hashtagToTool[tag]).filter(Boolean);
        const cleanInput = input.replace(/#\w+/g, '').trim();

        this.addThinkingStep('analyze',
            `Input analysis:\n` +
            `- Original: "${input}"\n` +
            `- Clean input: "${cleanInput}"\n` +
            `- Hashtags found: ${hashtags.join(', ') || 'none'}\n` +
            `- Forced tools: ${forcedTools.join(', ') || 'none'}`
        );

        return { cleanInput, forcedTools, hashtags };
    }

    /**
     * Phase 2: Think and create execution plan
     */
    private async createThinkingPlan(cleanInput: string, forcedTools: string[], context?: AgentContext): Promise<ThinkingPlan> {
        const availableTools = this.toolExecutor.getAvailableTools();

        // Check if this is a simple greeting that doesn't require complex planning
        if (this.isSimpleGreeting(cleanInput) && forcedTools.length === 0) {
            console.log('🎯 Simple greeting detected - skipping complex planning phase');
            
            const plan: ThinkingPlan = {
                intent: 'simple greeting',
                forcedTools: [],
                suggestedTools: [],
                reasoning: 'Simple greeting detected - no tools needed for direct response',
                steps: []
            };

            this.addThinkingStep('think',
                `Simple greeting detected: "${cleanInput}"\n` +
                `No planning required - will respond directly without tools`
            );

            return plan;
        }

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
            { role: 'system' as const, content: 'You are an AI assistant that thinks carefully about how to help users. Focus on creating clear execution plans.' },
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
            parameters: this.inferToolParameters(tool, cleanInput),
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
     * Phase 3: Execute tools according to plan
     */
    private async executeTools(plan: ThinkingPlan, _context?: AgentContext): Promise<Record<string, any>> {
        const toolResults: Record<string, any> = {};

        if (plan.steps.length === 0) {
            console.log('📭 No tools to execute - proceeding with direct response');
            return toolResults;
        }

        console.log(`🔧 Executing ${plan.steps.length} tool(s):`);

        for (let i = 0; i < plan.steps.length; i++) {
            const step = plan.steps[i];
            const stepNum = i + 1;

            console.log(`\n🛠️  TOOL ${stepNum}/${plan.steps.length}: ${step.tool.toUpperCase()}`);
            console.log(`   ${step.forced ? '🔒 FORCED by hashtag' : '💡 SUGGESTED by analysis'}`);
            console.log(`   📋 Reason: ${step.reasoning}`);
            console.log(`   ⚙️  Parameters: ${JSON.stringify(step.parameters, null, 2)}`);

            this.addThinkingStep('tool',
                `Tool ${stepNum}: ${step.tool}\n` +
                `Type: ${step.forced ? 'FORCED' : 'SUGGESTED'}\n` +
                `Reason: ${step.reasoning}\n` +
                `Parameters: ${JSON.stringify(step.parameters, null, 2)}`
            );

            const startTime = Date.now();
            try {
                console.log(`   🚀 Executing...`);
                
                // Handle special web search preference routing
                let actualTool = step.tool;
                if (step.tool === 'web_search_preferred') {
                    // Route to user's preferred web search provider
                    actualTool = 'web_search'; // This will be handled by LangChainToolExecutorService routing
                    console.log(`   🔄 Routing #web hashtag to preferred web search provider`);
                }
                
                const result = await this.toolExecutor.executeTool(actualTool, step.parameters);
                const duration = Date.now() - startTime;

                toolResults[step.tool] = result;

                if (result.success) {
                    console.log(`   ✅ SUCCESS (${duration}ms)`);
                    console.log(`   📄 Result: ${typeof result.result === 'string' ?
                        result.result.substring(0, 150) + (result.result.length > 150 ? '...' : '') :
                        JSON.stringify(result.result).substring(0, 150)}`);
                } else {
                    console.log(`   ❌ FAILED (${duration}ms)`);
                    console.log(`   🚫 Error: ${result.error}`);
                }

            } catch (error) {
                const duration = Date.now() - startTime;
                console.log(`   💥 EXCEPTION (${duration}ms)`);
                console.log(`   🚫 Error: ${(error as Error).message}`);

                toolResults[step.tool] = {
                    success: false,
                    error: (error as Error).message
                };
            }
        }

        return toolResults;
    }

    /**
     * Phase 4: Synthesize final response with citations
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

        // Build synthesis prompt
        const toolResultsSummary = Object.entries(toolResults)
            .map(([tool, result]) =>
                `${tool}: ${result.success ? 'SUCCESS' : 'FAILED'}\n` +
                `${result.success ? result.result || 'No output' : result.error || 'Unknown error'}`
            )
            .join('\n\n');

        const synthesisPrompt = `You are Cindy, a helpful voice assistant. Based on the user's request and the tools I executed, provide a natural, conversational response.

User's original request: "${cleanInput}"
My thinking process: ${plan.reasoning}
Tools executed: ${plan.steps.map(s => s.tool).join(', ') || 'none'}

Tool results:
${toolResultsSummary || 'No tools were executed'}

Conversation context: ${history.length > 0 ? `Previous ${history.length} messages for context` : 'No previous context'}

Provide a helpful, natural response that:
1. Addresses the user's request
2. Incorporates relevant information from tool results
3. Is conversational and friendly
4. Mentions what you did (which tools you used) naturally if relevant

Keep it concise but informative.`;

        const response = await this.llmProvider.invoke([
            { role: 'system' as const, content: this.getSystemPrompt() },
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
     * Main processing method with thinking workflow
     */
    async process(input: string, context?: AgentContext): Promise<string> {
        try {
            console.log('\n🧠 THINKING AGENT PROCESSING INPUT');
            console.log('═'.repeat(80));
            console.log(`📥 USER INPUT: "${input}"`);
            console.log(`🕒 TIMESTAMP: ${new Date().toISOString()}`);
            console.log(`👤 CONTEXT: ${context?.conversationId || 'default'}`);
            console.log('═'.repeat(80));

            this.thinkingSteps = []; // Reset thinking steps

            // Phase 1: Analyze input
            console.log('\n🔍 PHASE 1: ANALYZING INPUT');
            console.log('─'.repeat(40));
            const { cleanInput, forcedTools, hashtags } = this.analyzeInput(input);

            console.log(`📝 Clean input: "${cleanInput}"`);
            console.log(`🏷️  Hashtags found: [${hashtags.join(', ') || 'none'}]`);
            console.log(`🔧 Forced tools: [${forcedTools.join(', ') || 'none'}]`);

            // Phase 2: Create thinking plan
            console.log('\n💭 PHASE 2: CREATING EXECUTION PLAN');
            console.log('─'.repeat(40));
            const plan = await this.createThinkingPlan(cleanInput, forcedTools, context);

            console.log(`🎯 Intent: ${plan.intent}`);
            console.log(`🛠️  Tools to execute: [${plan.steps.map(s => s.tool).join(', ') || 'none'}]`);
            console.log(`📋 Execution steps: ${plan.steps.length}`);

            // Phase 3: Execute tools
            console.log('\n⚙️ PHASE 3: EXECUTING TOOLS');
            console.log('─'.repeat(40));
            const toolResults = await this.executeTools(plan, context);

            const successCount = Object.values(toolResults).filter(r => r.success).length;
            const totalTools = Object.keys(toolResults).length;
            console.log(`✅ Tool execution complete: ${successCount}/${totalTools} successful`);

            // Phase 4: Generate response
            let finalResponse: string;
            if (plan.steps.length === 0 && plan.intent === 'simple greeting') {
                // Direct response for simple greetings - no synthesis needed
                console.log('\n💬 PHASE 4: DIRECT RESPONSE (SIMPLE GREETING)');
                console.log('─'.repeat(40));
                const directResponse = await this.llmProvider.invoke([
                    { role: 'system' as const, content: this.getSystemPrompt() },
                    { role: 'user' as const, content: cleanInput }
                ]);
                finalResponse = directResponse.content as string;
            } else {
                // Complex response with synthesis
                console.log('\n📝 PHASE 4: SYNTHESIZING RESPONSE');
                console.log('─'.repeat(40));
                finalResponse = await this.synthesizeResponse(cleanInput, plan, toolResults, context);
            }

            console.log(`📄 Response length: ${finalResponse.length} characters`);
            console.log(`🎯 Response preview: "${finalResponse.substring(0, 100)}${finalResponse.length > 100 ? '...' : ''}"`);

            // Store conversation in memory
            await this.storeConversation(input, finalResponse, context);

            console.log('\n🎉 THINKING PROCESS COMPLETED SUCCESSFULLY');
            console.log('═'.repeat(80));
            return finalResponse;

        } catch (error) {
            console.log('\n❌ THINKING PROCESS ERROR');
            console.log('═'.repeat(80));
            console.error('[ThinkingCindyAgent] Error details:', error);
            return this.handleError(input, error as Error, context);
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
            yield `<think id="thinking-${context?.conversationId || 'default'}-${thinkingStartTime}" start="${thinkingStartTime}">`;
            yield "🧠 **Cindy is thinking...**\n\n";
            yield `💭 **Analyzing:** "${input}"\n\n`;

            // Phase 1: Analyze input
            console.log('\n🔍 [STREAMING] Phase 1: Analyzing input...');
            const { cleanInput, forcedTools, hashtags } = this.analyzeInput(input);

            yield `🔍 **Analysis Complete:**\n`;
            yield `📝 Clean input: "${cleanInput}"\n`;
            yield `🏷️  Hashtags: ${hashtags.length > 0 ? hashtags.join(', ') : 'none'}\n`;
            yield `🔧 Forced tools: ${forcedTools.length > 0 ? forcedTools.join(', ') : 'none'}\n\n`;

            // Phase 2: Create thinking plan  
            console.log('\n💭 [STREAMING] Phase 2: Creating execution plan...');
            yield "💭 **Planning approach...**\n";

            const plan = await this.createThinkingPlan(cleanInput, forcedTools, context);

            yield `🎯 **Intent:** ${plan.intent}\n`;
            yield `🛠️  **Tools planned:** ${plan.steps.length > 0 ? plan.steps.map(s => `${s.tool}${s.forced ? ' (forced)' : ''}`).join(', ') : 'none'}\n\n`;
            
            // End thinking block before tool execution
            const thinkingEndTime = Date.now();
            yield `</think end="${thinkingEndTime}">`;

            // Phase 3: Execute tools
            if (plan.steps.length > 0) {
                console.log('\n⚙️ [STREAMING] Phase 3: Executing tools...');
                yield `⚙️ [STREAMING] Phase 3: Executing tools...\n`;

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

                // Phase 4: Synthesize response with citations
                console.log('\n📝 [STREAMING] Phase 4: Synthesizing response...');
                yield "📝 [STREAMING] Phase 4: Synthesizing response...\n";

                const finalResponse = await this.synthesizeResponse(cleanInput, plan, toolResults, context);

                // Store conversation
                await this.storeConversation(input, finalResponse, context);

                yield "📝 **Final Response:**\n\n";
                yield finalResponse;
            } else {
                // No tools needed, direct response
                console.log('\n💬 [STREAMING] Direct response (no tools needed)...');
                yield "💬 **Responding directly (no tools needed)...**\n\n";

                const directResponse = await this.llmProvider.invoke([
                    { role: 'system' as const, content: this.getSystemPrompt() },
                    { role: 'user' as const, content: cleanInput }
                ]);

                const response = directResponse.content as string;
                await this.storeConversation(input, response, context);
                yield response;
            }

            console.log('\n🎉 [STREAMING] Thinking process completed successfully');
            console.log('═'.repeat(80));

        } catch (error) {
            console.log('\n❌ [STREAMING] Thinking process error');
            console.log('═'.repeat(80));
            console.error('[ThinkingCindyAgent] Streaming error:', error);
            yield `\n❌ **Error:** I encountered an issue while processing your request: ${(error as Error).message}`;
        }
    }


    // Helper methods
    private isSimpleGreeting(input: string): boolean {
        const cleanInput = input.toLowerCase().trim();
        
        // Simple greetings and basic interactions
        const simpleGreetings = [
            'hi', 'hello', 'hey', 'howdy', 'yo',
            'good morning', 'good afternoon', 'good evening', 'good night',
            'how are you', 'how are you doing', 'how\'s it going',
            'what\'s up', 'whats up', 'sup',
            'thanks', 'thank you', 'bye', 'goodbye', 'see you',
            'yes', 'no', 'ok', 'okay', 'sure', 'alright'
        ];

        // Check exact matches
        if (simpleGreetings.includes(cleanInput)) {
            return true;
        }

        // Check if input is very short and likely conversational
        if (cleanInput.length <= 10 && !cleanInput.includes('?') && !cleanInput.includes('search') && !cleanInput.includes('find')) {
            return true;
        }

        return false;
    }

    private addThinkingStep(step: ThinkingStep['step'], content: string): void {
        this.thinkingSteps.push({
            step,
            content,
            timestamp: new Date()
        });

        // Enhanced console output with thinking process visibility
        const stepEmojis = {
            'analyze': '🔍',
            'think': '💭',
            'tool': '⚙️',
            'synthesize': '📝'
        };

        const emoji = stepEmojis[step] || '🤖';
        const stepName = step.toUpperCase().padEnd(10);

        console.log(`\n${emoji} [${stepName}] ${content}`);
        console.log('─'.repeat(80));
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

    private inferToolParameters(tool: string, input: string): any {
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
                // Ensure search query is meaningful (at least 3 characters)
                const searchQuery = input.trim();
                if (searchQuery.length < 3) {
                    return { input: `information about ${searchQuery}` };
                }
                return { input: searchQuery };
            case 'brave_search':
                // Same logic as web_search
                const braveQuery = input.trim();
                if (braveQuery.length < 3) {
                    return { input: `information about ${braveQuery}` };
                }
                return { input: braveQuery };
            case 'tavily_search':
                // Tavily also uses input parameter
                const tavilyQuery = input.trim();
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

    private async handleError(input: string, error: Error, context?: AgentContext): Promise<string> {
        console.error('[ThinkingCindyAgent] Processing error:', error);

        // Try fallback direct response
        try {
            const contextInfo = context?.conversationId ? ` (Conversation: ${context.conversationId})` : '';
            const fallbackResponse = await this.llmProvider.invoke([
                { role: 'system' as const, content: 'You are a helpful assistant. The user asked something but there was a technical issue.' },
                { role: 'user' as const, content: `I asked: "${input}" but there was an error${contextInfo}. Can you help me anyway?` }
            ]);

            return `I encountered a technical issue, but let me try to help: ${fallbackResponse.content}`;
        } catch (fallbackError) {
            return "I'm sorry, I'm experiencing technical difficulties right now. Please try again in a moment.";
        }
    }

    private getSystemPrompt(): string {
        return `You are Cindy, an intelligent voice assistant. You are helpful, knowledgeable, and conversational. 
        You have access to various tools and can think through problems step by step. 
        Always be honest about what you can and cannot do.`;
    }

    // Expose thinking steps for debugging/transparency
    getThinkingSteps(): ThinkingStep[] {
        return [...this.thinkingSteps];
    }
}