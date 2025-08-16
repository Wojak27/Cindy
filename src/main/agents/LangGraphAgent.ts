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
    /**
  * Process a message through the graph with streaming output
  */
    async *processStreaming(input: string, context?: AgentContext): AsyncGenerator<string> {
        // ---------- helpers ----------
        const isAsyncIterable = (v: any): v is AsyncIterable<unknown> =>
            v != null && typeof v[Symbol.asyncIterator] === "function";

        const isIterable = (v: any): v is Iterable<unknown> =>
            v != null && typeof v[Symbol.iterator] === "function";

        const isNodeReadable = (v: any): v is NodeJS.ReadableStream =>
            v && typeof v.on === "function" && typeof v.read === "function";

        const chunkText = function* (text: string, size = 256) {
            for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
        };

        const stringify = (x: any) => {
            if (x == null) return "";
            if (typeof x === "string") return x;
            if (typeof x === "object") {
                // common shapes: {output}, {text}, {content}, {response}
                for (const k of ["output", "text", "content", "response", "finalResponse"]) {
                    if (k in x && (typeof (x as any)[k] === "string" || typeof (x as any)[k] === "number"))
                        return String((x as any)[k]);
                }
                try { return JSON.stringify(x); } catch { return String(x); }
            }
            return String(x);
        };

        const createInitialState = (inp: string, ctx?: AgentContext) => ({
            input: inp,
            ...(ctx ?? {})
        });

        // ---------- implementation ----------
        try {
            console.log("\n🎬 [LangGraphAgent] STARTING STREAMING PROCESS");
            console.log("═".repeat(80));
            console.log(`📥 INPUT: "${input}"`);
            console.log("═".repeat(80));

            const initialState = createInitialState(input, context);

            // Prefer a real async-iterable stream() if present
            const streamFn = (this as any)?.graph?.stream
                ? (this as any).graph.stream.bind((this as any).graph)
                : undefined;

            if (streamFn) {
                const streamRes = streamFn(initialState);

                // Case A: true async iterable
                if (isAsyncIterable(streamRes)) {
                    let finalResponse = "";
                    for await (const chunk of streamRes as AsyncIterable<any>) {
                        const text = stringify(chunk);
                        if (text) {
                            yield text;
                            finalResponse += text;
                        }
                    }
                    return;
                }

                // Case B: Node Readable (some libs return Readable)
                if (isNodeReadable(streamRes)) {
                    let finalResponse = "";
                    for await (const chunk of streamRes as AsyncIterable<any>) {
                        const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : stringify(chunk);
                        if (text) {
                            yield text;
                            finalResponse += text;
                        }
                    }
                    return;
                }

                // Case C: sync iterable
                if (isIterable(streamRes)) {
                    let finalResponse = "";
                    for (const chunk of streamRes as Iterable<any>) {
                        const text = stringify(chunk);
                        if (text) {
                            // not async, but we can still yield
                            yield text;
                            finalResponse += text;
                        }
                    }
                    return;
                }

                // If we got here, .stream() exists but isn't iterable -> fall back
                console.warn("[LangGraphAgent] .stream() returned a non-iterable; falling back to invoke()");
            }

            // Try LangGraph-style streamEvents() if available (events carry tokens/final outputs)
            const streamEventsFn = (this as any)?.graph?.streamEvents
                ? (this as any).graph.streamEvents.bind((this as any).graph)
                : undefined;

            if (streamEventsFn) {
                // Many LangGraph impls support filtering by event types; if yours differs, adjust here
                const events = streamEventsFn(initialState, { version: "v2" });
                if (isAsyncIterable(events)) {
                    let finalResponse = "";
                    for await (const ev of events as AsyncIterable<any>) {
                        // Heuristics: emit token-like payloads first
                        // Common fields: ev.data?.chunk, ev.data?.delta, ev.data?.token, ev.data?.text
                        const maybePieces = [
                            ev?.data?.chunk,
                            ev?.data?.delta,
                            ev?.data?.token,
                            ev?.data?.text,
                            ev?.output
                        ];
                        for (const piece of maybePieces) {
                            const text = stringify(piece);
                            if (text) {
                                yield text;
                                finalResponse += text;
                                break;
                            }
                        }
                        // Some frameworks mark a final event; if needed, you can detect it here
                    }
                    return;
                }
                console.warn("[LangGraphAgent] .streamEvents() returned non-iterable; falling back to invoke()");
            }

            // FINAL FALLBACK: non-streaming run + simulated streaming
            const invokeFn = (this as any)?.graph?.invoke
                ? (this as any).graph.invoke.bind((this as any).graph)
                : undefined;

            if (!invokeFn) {
                throw new Error("Graph has neither stream/streamEvents nor invoke available.");
            }

            const result = await invokeFn(initialState);
            const text = stringify(result);
            if (!text) {
                console.warn("[LangGraphAgent] invoke() returned empty payload, emitting JSON:");
                yield JSON.stringify(result ?? {});
                return;
            }

            // simulate streaming by chunking the text
            for (const chunk of chunkText(text, 256)) yield chunk;

        } catch (error) {
            console.log("\n❌ [LangGraphAgent] Streaming process error");
            console.log("═".repeat(80));
            console.error("[LangGraphAgent] Streaming error:", error);
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