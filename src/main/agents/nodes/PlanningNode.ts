import { AgentState, AgentStateUpdate, ThinkingPlan, ToolIntent, ThinkingStep } from '../state/AgentState';
import { LLMProvider } from '../../services/LLMProvider';
import { LangChainToolExecutorService } from '../../services/LangChainToolExecutorService';
import { AgentPrompts } from '../../prompts/AgentPrompts';

/**
 * Node that creates an execution plan based on user input and available tools
 */
export class PlanningNode {
    constructor(
        private llmProvider: LLMProvider,
        private toolExecutor: LangChainToolExecutorService
    ) {}

    /**
     * Execute the planning node
     */
    async execute(state: AgentState): Promise<AgentStateUpdate> {
        const { cleanInput, forcedTools } = state;
        const availableTools = this.toolExecutor.getAvailableTools();
        
        // Build thinking prompt
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

        // Get LLM to create a plan
        const thinkingResponse = await this.llmProvider.invoke([
            { role: 'system' as const, content: AgentPrompts.getSystemPrompt('thinking') },
            { role: 'user' as const, content: thinkingPrompt }
        ]);
        
        const reasoning = thinkingResponse.content as string;
        
        // Determine suggested tools based on content analysis
        const suggestedTools = this.suggestToolsFromContent(cleanInput, availableTools);
        
        // Combine forced and suggested tools
        const allToolsSet = new Set([...forcedTools, ...suggestedTools]);
        const allTools = Array.from(allToolsSet);
        
        // Create tool intents
        const steps: ToolIntent[] = allTools.map(tool => ({
            tool,
            forced: forcedTools.includes(tool),
            parameters: this.inferToolParameters(tool, cleanInput),
            reasoning: forcedTools.includes(tool) ? 'Forced by hashtag' : 'Suggested by analysis'
        }));
        
        // Create the plan
        const plan: ThinkingPlan = {
            intent: this.inferUserIntent(cleanInput),
            forcedTools,
            suggestedTools,
            reasoning,
            steps
        };
        
        // Create thinking step
        const thinkingStep: ThinkingStep = {
            step: 'think',
            content: `Thinking process:\n${reasoning}\n\n` +
                    `Execution plan:\n` +
                    `- Intent: ${plan.intent}\n` +
                    `- Tools to use: ${allTools.join(', ') || 'none'}\n` +
                    `- Execution steps: ${steps.length}`,
            timestamp: new Date()
        };
        
        // Update state
        return {
            plan,
            thinkingSteps: [thinkingStep],
            phase: steps.length > 0 ? 'tools' : 'synthesis'
        };
    }
    
    /**
     * Suggest tools based on input content
     */
    private suggestToolsFromContent(input: string, availableTools: string[]): string[] {
        const suggestions: string[] = [];
        const lowerInput = input.toLowerCase();
        
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
        
        if ((lowerInput.includes('web') || lowerInput.includes('internet') || lowerInput.includes('online'))
            && availableTools.includes('web_search')) {
            suggestions.push('web_search');
        }
        
        return suggestions;
    }
    
    /**
     * Infer tool parameters from input
     */
    private inferToolParameters(tool: string, input: string): any {
        switch (tool) {
            case 'search_documents':
                return { query: input, limit: 5 };
                
            case 'read_file':
                const fileMatch = input.match(/(?:read|open|show)\s+(?:file\s+)?(.+?)(?:\s|$)/i);
                return { file_path: fileMatch?.[1] || 'unknown' };
                
            case 'write_file':
                const writeMatch = input.match(/(?:write|create|save)\s+(.+?)\s+(?:to|in)\s+(.+?)(?:\s|$)/i);
                return {
                    content: writeMatch?.[1] || input,
                    file_path: writeMatch?.[2] || 'output.txt'
                };
                
            case 'web_search':
            case 'brave_search':
            case 'tavily_search':
                let searchQuery = input.trim();
                if (searchQuery.length < 3) {
                    return { input: `information about ${searchQuery}` };
                }
                return { input: searchQuery };
                
            case 'list_directory':
                const dirMatch = input.match(/(?:list|show|dir)\s+(?:directory\s+)?(.+?)(?:\s|$)/i);
                return { path: dirMatch?.[1] || '.' };
                
            default:
                return {};
        }
    }
    
    /**
     * Infer user intent from input
     */
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
        if (lowerInput.includes('web') || lowerInput.includes('internet')) {
            return 'search the web';
        }
        
        return 'general conversation';
    }
}

/**
 * Factory function to create the planning node
 */
export function createPlanningNode(llmProvider: LLMProvider, toolExecutor: LangChainToolExecutorService) {
    const node = new PlanningNode(llmProvider, toolExecutor);
    return (state: AgentState) => node.execute(state);
}