import { AgentState, AgentStateUpdate, ThinkingStep } from '../state/AgentState';
import { LLMProvider } from '../../services/LLMProvider';
import { AgentPrompts } from '../../prompts/AgentPrompts';

/**
 * Hashtag to tool mapping
 */
const HASHTAG_TO_TOOL: Record<string, string> = {
    '#search': 'search_documents',
    '#read': 'read_file',
    '#write': 'write_file',
    '#list': 'list_directory',
    '#web': 'web_search',
    '#brave': 'brave_search',
    '#tavily': 'tavily_search',
    '#dir': 'list_directory',
    '#find': 'search_documents',
    '#file': 'read_file',
    '#create': 'write_file'
};

/**
 * Node that analyzes user input to extract hashtags, clean the input,
 * and determine if a direct response is appropriate.
 */
export class AnalyzeInputNode {
    constructor(private llmProvider: LLMProvider) {}

    /**
     * Execute the analyze input node
     */
    async execute(state: AgentState): Promise<AgentStateUpdate> {
        const { input } = state;
        
        // Extract hashtags
        const hashtagRe = /#\w+/g;
        const hashtags = (input.match(hashtagRe) ?? []).map(tag => tag.toLowerCase());
        
        // Map hashtags to tools
        const forcedTools = Array.from(
            new Set(
                hashtags
                    .map(tag => HASHTAG_TO_TOOL[tag])
                    .filter((t): t is string => Boolean(t))
            )
        );
        
        // Clean input (remove hashtags and collapse spaces)
        const cleanInput = input.replace(hashtagRe, '').replace(/\s{2,}/g, ' ').trim();
        
        // Determine if direct response is appropriate
        let directResponse = false;
        
        if (forcedTools.length === 0) {
            // Only check for direct response if no tools are forced
            directResponse = await this.checkDirectResponse(cleanInput);
        }
        
        // Create thinking step
        const thinkingStep: ThinkingStep = {
            step: 'analyze',
            content: `Input analysis:\n` +
                    `- Hashtags found: ${hashtags.join(', ') || 'none'}\n` +
                    `- Forced tools: ${forcedTools.join(', ') || 'none'}\n` +
                    `- Direct response: ${directResponse}`,
            timestamp: new Date()
        };
        
        // Update state
        return {
            cleanInput,
            hashtags,
            forcedTools,
            directResponse,
            thinkingSteps: [thinkingStep],
            phase: directResponse ? 'synthesis' : 'planning'
        };
    }
    
    /**
     * Check if the input requires only a direct response
     */
    private async checkDirectResponse(cleanInput: string): Promise<boolean> {
        const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
        
        const parseDirect = (raw: unknown): boolean | undefined => {
            // Strip message from <think> tags
            const cleanContent = String((raw as any)?.content ?? '')
                .replace(/<think\b[^>]*>.*?<\/think>/g, '')
                .trim();
            if (!cleanContent) return undefined;
            
            const content = cleanContent.toString().trim().toLowerCase();
            
            // Strict single-token booleans
            if (/^(true|yes|y|1)$/i.test(content)) return true;
            if (/^(false|no|n|0)$/i.test(content)) return false;
            
            // JSON parsing
            try {
                const j = JSON.parse(content);
                if (typeof j === 'boolean') return j;
                if (j && typeof j === 'object') {
                    const val = (j as any).directResponse ?? (j as any).direct_response ?? (j as any).direct;
                    if (typeof val === 'boolean') return val;
                    if (typeof val === 'string') {
                        const s = val.toLowerCase();
                        if (['true', 'yes', 'y', '1'].includes(s)) return true;
                        if (['false', 'no', 'n', '0'].includes(s)) return false;
                    }
                }
            } catch {}
            
            // Heuristics
            if (/\bdirect\b/.test(content) && !/\b(tool|tools)\b/.test(content)) return true;
            if (/\b(use|needs?)\s+tool(s)?\b/.test(content)) return false;
            
            return undefined;
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
                parsed = await tryOnce(attempt);
                if (parsed !== undefined) break;
            } catch {
                // ignore and retry
            }
            if (attempt < maxAttempts - 1) {
                const jitter = Math.floor(Math.random() * 50);
                await sleep(baseDelayMs * Math.pow(2, attempt) + jitter);
            }
        }
        
        return parsed ?? false;
    }
}

/**
 * Factory function to create the analyze input node
 */
export function createAnalyzeInputNode(llmProvider: LLMProvider) {
    const node = new AnalyzeInputNode(llmProvider);
    return (state: AgentState) => node.execute(state);
}