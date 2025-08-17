import { LLMProvider } from '../services/LLMProvider';
import { LangChainMemoryService as MemoryService } from '../services/LangChainMemoryService';
import { LangChainToolExecutorService as ToolExecutorService } from '../services/LangChainToolExecutorService';
import { LangGraphAgent } from './LangGraphAgent';

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

/**
 * ThinkingCindyAgent - Wrapper for backward compatibility
 * Now delegates all functionality to LangGraphAgent
 */
export class ThinkingCindyAgent {
    private langGraphAgent: LangGraphAgent;
    private thinkingSteps: ThinkingStep[] = [];

    constructor(options: AgentOptions) {
        // Create the LangGraphAgent instance
        this.langGraphAgent = new LangGraphAgent({
            llmProvider: options.llmRouter,
            memoryService: options.memoryService,
            toolExecutor: options.toolExecutor,
            config: options.config
        });

        console.log('[ThinkingCindyAgent] Initialized with LangGraph architecture');
        console.log('[ThinkingCindyAgent] Using provider:', options.llmRouter.getCurrentProvider());
    }

    /**
     * Streaming version with thinking steps shown
     * Now delegates to LangGraphAgent for proper graph-based execution
     */
    async *processStreaming(input: string, context?: AgentContext): AsyncGenerator<string> {
        // Convert AgentContext to LangGraphAgentContext
        // const langGraphContext = context ? {
        //     conversationId: context.conversationId,
        //     userId: context.userId,
        //     sessionId: context.sessionId,
        //     timestamp: context.timestamp,
        //     preferences: context.preferences
        // } : undefined;

        // Delegate to LangGraphAgent
        yield* this.langGraphAgent.processStreaming(input);
    }

    // Expose thinking steps for debugging/transparency
    getThinkingSteps(): ThinkingStep[] {
        return [...this.thinkingSteps];
    }
}