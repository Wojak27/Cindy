import { StateGraph } from '@langchain/langgraph';
import { AgentState, AgentStateAnnotation, AgentContext, createInitialState } from './state/AgentState';
import { createAnalyzeInputNode } from './nodes/AnalyzeInputNode';
import { createPlanningNode } from './nodes/PlanningNode';
import { createToolExecutionNode } from './nodes/ToolExecutionNode';
import { createSynthesisNode } from './nodes/SynthesisNode';
import { LLMProvider } from '../services/LLMProvider';
import { LangChainMemoryService } from '../services/LangChainMemoryService';
import { LangChainToolExecutorService } from '../services/LangChainToolExecutorService';

/**
 * Configuration options for the LangGraphAgent
 */
export interface LangGraphAgentOptions {
    llmProvider: LLMProvider;
    memoryService: LangChainMemoryService;
    toolExecutor: LangChainToolExecutorService;
    config?: any;
}

/**
 * LangGraph-based implementation of the Cindy Agent.
 * This is a proper graph-based agent with nodes and edges for each phase of processing.
 */
export class LangGraphAgent {
    private graph: any;
    private llmProvider: LLMProvider;
    private memoryService: LangChainMemoryService;
    private toolExecutor: LangChainToolExecutorService;

    constructor(options: LangGraphAgentOptions) {
        this.llmProvider = options.llmProvider;
        this.memoryService = options.memoryService;
        this.toolExecutor = options.toolExecutor;

        // Build the graph
        this.graph = this.buildGraph();

        console.log('[LangGraphAgent] Initialized with LangGraph architecture');
        console.log('[LangGraphAgent] Using provider:', this.llmProvider.getCurrentProvider());
    }

    /**
     * Build the state graph
     */
    private buildGraph() {
        // Create the graph builder with our state annotation
        const workflow = new StateGraph(AgentStateAnnotation as any);

        // Add nodes
        workflow.addNode('analyze_input', createAnalyzeInputNode(this.llmProvider));
        workflow.addNode('planning', createPlanningNode(this.llmProvider, this.toolExecutor));
        workflow.addNode('tool_execution', createToolExecutionNode(this.toolExecutor));
        workflow.addNode('synthesis', createSynthesisNode(this.llmProvider, this.memoryService));

        // Add edges
        workflow.addEdge('__start__' as any, 'analyze_input' as any);

        // Conditional routing after analyze_input
        workflow.addConditionalEdges(
            'analyze_input' as any,
            (state: AgentState) => {
                // If direct response, skip to synthesis
                if (state.directResponse) {
                    return 'synthesis';
                }
                // Otherwise, go to planning
                return 'planning';
            }
        );

        // Planning always goes to tool execution if there are tools, otherwise synthesis
        workflow.addConditionalEdges(
            'planning' as any,
            (state: AgentState) => {
                if (state.plan && state.plan.steps && state.plan.steps.length > 0) {
                    return 'tool_execution';
                }
                return 'synthesis';
            }
        );

        // Tool execution always goes to synthesis
        workflow.addEdge('tool_execution' as any, 'synthesis' as any);

        // Synthesis goes to end
        workflow.addEdge('synthesis' as any, '__end__' as any);

        // Compile the graph
        return workflow.compile();
    }

    /**
     * Process a message through the graph (non-streaming)
     */
    async process(input: string, context?: AgentContext): Promise<string> {
        try {
            console.log('[LangGraphAgent] Processing input:', input);

            // Create initial state
            const initialState = createInitialState(input, context);

            // Run the graph
            const result = await this.graph.invoke(initialState);

            console.log('[LangGraphAgent] Processing complete');
            return result.finalResponse || 'I encountered an issue processing your request.';

        } catch (error) {
            console.error('[LangGraphAgent] Processing error:', error);
            return `I encountered an error: ${(error as Error).message}`;
        }
    }

    /**
     * Process a message through the graph with streaming output
     */
    async *processStreaming(input: string, context?: AgentContext): AsyncGenerator<string> {
        try {
            console.log('\n🎬 [LangGraphAgent] STARTING STREAMING PROCESS');
            console.log('═'.repeat(80));
            console.log(`📥 INPUT: "${input}"`);
            console.log('═'.repeat(80));

            // Create initial state
            const initialState = createInitialState(input, context);

            // Start thinking block with timer
            // const thinkingStartTime = Date.now();
            // const thinkingId = `thinking-${context?.conversationId || 'default'}-${thinkingStartTime}`;

            // For now, we'll use invoke and simulate streaming since LangGraph stream API may vary
            // Run the graph non-streaming and emit results progressively
            const result = await this.graph.invoke(initialState);

            // Emit thinking block
            // yield `<think id="${thinkingId}" start="${thinkingStartTime}">`;
            // yield "**Analyzing input...**\n";

            // if (result.hashtags?.length > 0) {
            //     yield `**Hashtags detected:** ${result.hashtags.join(', ')}\n`;
            // }
            // if (result.forcedTools?.length > 0) {
            //     yield `**Tools to use:** ${result.forcedTools.join(', ')}\n`;
            // }

            // if (result.plan) {
            //     yield "**Planning approach...**\n";
            //     yield `**Intent:** ${result.plan.intent}\n`;
            //     if (result.plan.steps?.length > 0) {
            //         yield `**Tools planned:** ${result.plan.steps.map((s: any) => 
            //             `${s.tool}${s.forced ? ' (forced)' : ''}`
            //         ).join(', ')}\n`;
            //     }
            //     yield `\n`;
            // }

            // // Close thinking block
            // const thinkingEndTime = Date.now();
            // yield `</think end="${thinkingEndTime}">`;

            // // Emit tool execution if any
            // if (result.streamBuffer?.length > 0) {
            //     yield `**Executing tools...**\n`;
            //     for (const bufferItem of result.streamBuffer) {
            //         yield bufferItem;
            //     }
            // }

            // // Emit final response
            // if (result.finalResponse) {
            //     yield result.finalResponse;
            // }

            // console.log('\n🎉 [LangGraphAgent] Process completed successfully');
            // console.log('═'.repeat(80));

        } catch (error) {
            console.log('\n❌ [LangGraphAgent] Streaming process error');
            console.log('═'.repeat(80));
            console.error('[LangGraphAgent] Streaming error:', error);
            yield `\n❌ **Error:** I encountered an issue while processing your request: ${(error as Error).message}`;
        }
    }

    /**
     * Get the current provider being used
     */
    getCurrentProvider(): string {
        return this.llmProvider.getCurrentProvider();
    }

    /**
     * Get available tools
     */
    getAvailableTools(): string[] {
        return this.toolExecutor.getAvailableTools();
    }
}