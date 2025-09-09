import { LLMProvider } from '../services/LLMProvider';
import { LangChainMemoryService } from '../services/LangChainMemoryService';
import { toolRegistry } from './tools/ToolRegistry';
import { SettingsService } from '../services/SettingsService';
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { END, Annotation, StateGraph, START } from "@langchain/langgraph";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { StructuredTool } from '@langchain/core/tools';
import { Runnable, RunnableConfig } from '@langchain/core/runnables';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { trimThinkTags } from '../utils/strings';
import toolLoader from './tools/ToolLoader';
import 'dotenv/config';
import { logger } from '../utils/ColorLogger';
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AccuWeatherTool } from './tools/weather/AccuWeatherTool';
// execa will be dynamically imported where needed (ESM module)


/**
 * Configuration options for the LangGraphAgent
 */
export interface MainAgentGraphOptions {
    llmProvider: LLMProvider;
    memoryService: LangChainMemoryService;
    config?: any;
    enableStateManagement?: boolean;
    persistState?: boolean;
}

async function renderLocallyWithMermaidCLI(mermaid: string, outPath: string) {
    const tmpMmd = join(tmpdir(), `${randomUUID()}.mmd`);
    writeFileSync(tmpMmd, mermaid, "utf8");
    // mmdc uses Puppeteer under the hood
    // Dynamic import for ESM-only execa module
    const { execa } = await import("execa");
    await execa("npx", ["-y", "@mermaid-js/mermaid-cli", "-i", tmpMmd, "-o", outPath, "--backgroundColor", "white"]);
}

/**
 * Deep Research-enhanced LangGraph Agent.
 * Intelligent routing between Deep Research capabilities and standard processing.
 */
export class MainAgentExecution {
    private llmProvider: LLMProvider;
    private memoryService: LangChainMemoryService;
    private settingsService: SettingsService | null = null;
    private researchAgent: any;
    private writterAgent: any;
    private agent: Runnable;

    // State management properties
    private AgentState;
    private persistState: boolean;

    constructor(options: MainAgentGraphOptions) {
        this.llmProvider = options.llmProvider;
        this.memoryService = options.memoryService;
        this.persistState = options.persistState !== false; // Default to enabled
        toolLoader.loadAllTools(options.config || {});

        // Create a minimal settings service for compatibility
        this.settingsService = this.createCompatibilitySettingsService();
        this.initialize()



        logger.success('RouterLangGraphAgent', 'Initialized with Deep Research routing and state management', {
            provider: this.llmProvider.getCurrentProvider(),
            deepResearchEnabled: true,
            fallbackEnabled: true,
            persistentState: this.persistState
        });
    }

    public async initialize(): Promise<void> {

        this.initializeState();
        this.agent = await this.buildGraph();
        if (true) {
            await this.saveAgentGraphToFile();
        }
    }

    /**
     * Initialize agent session state
     */
    private initializeState(): void {
        this.AgentState = Annotation.Root({
            messages: Annotation<BaseMessage[]>({
                reducer: (x, y) => x.concat(y),
            }),
            sender: Annotation<string>({
                reducer: (x, y) => y ?? x ?? "user",
                default: () => "user",
            }),
        });
    }

    private async buildGraph(): Promise<Runnable> {
        const toolNode = new ToolNode<typeof this.AgentState.State>(toolRegistry.getTools());
        // Research agent and node
        this.researchAgent = await this.createAgent({
            llm: this.llmProvider.getChatModel()!,
            tools: toolRegistry.getTools(),
            systemMessage:
                "You should provide accurate data for the answer writer to use.",
            name: "Researcher",
        });
        // CWritter agent and node
        this.writterAgent = await this.createAgent({
            llm: this.llmProvider.getChatModel()!,
            tools: [],
            systemMessage: "Any text you write will be shown to the user.",
            name: "Writer",
        });
        // 1. Create the graph
        const workflow = new StateGraph(this.AgentState)
            // 2. Add the nodes; these will do the work
            .addNode("Researcher", this.researchNode.bind(this))
            .addNode("Writer", this.writerNode.bind(this))
            .addNode("call_tool", toolNode);

        // 3. Define the edges. We will define both regular and conditional ones
        // After a worker completes, report to supervisor
        workflow.addConditionalEdges("Researcher", this.router.bind(this), {
            // We will transition to the other agent
            continue: "Writer",
            call_tool: "call_tool",
            end: END,
        });

        workflow.addConditionalEdges("Writer", this.router.bind(this), {
            // We will transition to the other agent
            continue: "Researcher",
            call_tool: "call_tool",
            end: END,
        });

        workflow.addConditionalEdges(
            "call_tool",
            // Each agent node updates the 'sender' field
            // the tool calling node does not, meaning
            // this edge will route back to the original agent
            // who invoked the tool
            (x) => {
                return x.sender;
            },
            {
                Researcher: "Researcher",
                Writter: "Writer",
            },
        );

        workflow.addEdge(START, "Researcher");
        const graph = workflow.compile();
        return graph;
    }


    // Either agent can decide to end
    private router(state: typeof this.AgentState.State) {
        const messages = state.messages;
        const lastMessage = messages[messages.length - 1] as AIMessage;
        if (lastMessage?.tool_calls && lastMessage.tool_calls.length > 0) {
            // The previous agent is invoking a tool
            return "call_tool";
        }
        if (
            typeof lastMessage.content === "string" &&
            lastMessage.content.includes("FINAL ANSWER")
        ) {
            // Any agent decided the work is done
            return "end";
        }
        return "continue";
    }
    public getStatus(): { provider: string, availableTools: string[] } {
        return {
            provider: this.llmProvider.getCurrentProvider()!,
            availableTools: toolRegistry.getAllToolNames()
        };
    }



    public updateLLMProvider(llmProvider: LLMProvider) {
        this.llmProvider = llmProvider;
        logger.info('RouterLangGraphAgent', 'LLM provider updated', {
            provider: this.llmProvider.getCurrentProvider(),
        });
    }

    private getAgent() {
        return this.agent;
    }


    private async runAgentNode(props: {
        state: typeof this.AgentState.State;
        agent: Runnable;
        name: string;
        config?: RunnableConfig;
    }) {
        logger.info('RouterLangGraphAgent', `Running agent node: ${props.name}, recent message: "${trimThinkTags(props.state.messages.slice(-1)[0]?.content ?? "")}"`);
        const { state, agent, name, config } = props;
        let result = await agent.invoke(state, config);
        // We convert the agent output into a format that is suitable
        // to append to the global state
        if (!result?.tool_calls || result.tool_calls.length === 0) {
            // If the agent is NOT calling a tool, we want it to
            // look like a human message.
            result = new HumanMessage({ ...result, name: name });
        }
        return {
            messages: [result],
            // Since we have a strict workflow, we can
            // track the sender so we know who to pass to next.
            sender: name,
        };
    }
    private async writerNode(state: typeof this.AgentState.State) {
        return this.runAgentNode({
            state: state,
            agent: this.writterAgent,
            name: "ChartGenerator",
        });
    }

    private async researchNode(
        state: typeof this.AgentState.State,
        config?: RunnableConfig,
    ) {
        return this.runAgentNode({
            state: state,
            agent: this.researchAgent,
            name: "Researcher",
            config,
        });
    }

    private async createAgent({
        llm,
        tools,
        systemMessage,
        name,
    }: {
        llm: BaseChatModel;
        tools: StructuredTool[];
        systemMessage: string;
        name?: string;
    }): Promise<Runnable> {
        const toolNames = tools.map((tool) => tool.name).join(", ");
        console.log(`[RouterLangGraphAgent] Creating agent ${name ? name : ""} with tools: ${toolNames}`);

        let prompt = ChatPromptTemplate.fromMessages([
            [
                "system",
                "You are a helpful AI assistant, collaborating with other assistants." +
                " Use the provided tools to progress towards answering the question." +
                " If you are unable to fully answer, that's OK, another assistant with different tools " +
                " will help where you left off. Execute what you can to make progress." +
                " If you or any of the other assistants have the final answer or deliverable," +
                " prefix your response with FINAL ANSWER so the team knows to stop." +
                " You have access to the following tools: {tool_names}.\n{system_message}",
            ],
            new MessagesPlaceholder("messages"),
        ]);
        prompt = await prompt.partial({
            system_message: systemMessage,
            tool_names: toolNames,
        });

        return prompt.pipe(llm.bindTools(tools));
    }


    /**
     * Create a compatibility settings service for Deep Research integration
     */
    private createCompatibilitySettingsService(): SettingsService {
        // Return a minimal settings service that provides default values
        return {
            getCurrentProvider: () => this.llmProvider.getCurrentProvider(),
            // Add other minimal methods as needed for compatibility
        } as any;
    }

    /**
     * Get the memory service for external access (used by benchmark)
     */
    public getMemoryService(): LangChainMemoryService {
        return this.memoryService;
    }

    public async process(input: string): Promise<string> {
        const output = await this.agent.invoke(
            { messages: [new HumanMessage(input)] },
        );
        const msgs = output?.messages;
        const last = Array.isArray(msgs) ? msgs[msgs.length - 1] : null;
        return last?.content ? (typeof last.content === "string" ? last.content : JSON.stringify(last.content)) : "No response";
    }

    /**
     * Process a message through Deep Research with streaming output
     */
    public async *processStreaming(input: string) {
        // 1) Ask the compiled graph to stream events
        const evStream = await this.agent.streamEvents(
            { messages: [new HumanMessage(input)] },
            { version: "v2" } // important; use the unified event schema
        );

        // 2) Yield structured updates on node/tool start/end (and optionally LLM token stream)
        for await (const ev of evStream) {
            switch (ev.event) {
                case "on_chain_start": {
                    const node = ev.name ?? "unknown";
                    yield {
                        stepId: node,
                        title: `${node} started`,
                        status: "running",
                        timestamp: Date.now()
                    };
                    break;
                }
                case "on_llm_stream": {
                    const token = ev.data?.chunk?.content ?? ev.data?.chunk?.text;
                    if (token) yield token;
                    break;
                }
                case "on_chain_end": {
                    const node = ev.name ?? "unknown";
                    yield {
                        stepId: node,
                        title: `${node} finished`,
                        status: "completed",
                        timestamp: Date.now()
                    };
                    break;
                }
                case "on_tool_start": {
                    const tool = ev.name ?? "tool";
                    yield {
                        stepId: `tool-${Date.now()}`,
                        title: `Executing ${tool}`,
                        status: "running",
                        context: { toolName: tool },
                        timestamp: Date.now()
                    };
                    break;
                }
                case "on_tool_end": {
                    const tool = ev.name ?? "tool";
                    yield {
                        stepId: `tool-${Date.now()}`,
                        title: `Executed ${tool}`,
                        status: "completed",
                        context: { toolName: tool },
                        timestamp: Date.now()
                    };

                    // Handle document search results
                    if (tool === "'VectorSearchTool'" && ev.data?.output) {
                        const output = typeof ev.data.output === "string" ? ev.data.output : JSON.stringify(ev.data.output);
                        const rawResultsMatch = output.match(/<!-- RAW_RESULTS: (\[.*?\]) -->/);
                        if (rawResultsMatch) {
                            try {
                                const rawResults = JSON.parse(rawResultsMatch[1]);
                                for (const file of rawResults) {
                                    console.log("[MainAgentExecution] Retrieved document:", file);
                                    yield {
                                        stepId: `document-${Date.now()}`,
                                        title: "Document Retrieved",
                                        status: "completed",
                                        context: { file },
                                        timestamp: Date.now()
                                    };
                                    // Explicit side-panel marker for renderer
                                    yield `side-panel-document ${JSON.stringify(file)}`;
                                }
                            } catch (parseError) {
                                console.error("[MainAgentExecution] Failed to parse RAW_RESULTS:", parseError);
                            }
                        }
                    }
                    break;
                }
                // Optional: stream LLM tokens as they arrive
                case "on_chat_model_stream": {
                    const token = ev.data?.chunk?.content ?? ev.data?.chunk?.text;
                    if (token) yield token;
                    break;
                }
                // When the graph ends, you can emit the final message if needed
                case "on_graph_end": {
                    const output = ev.data?.output;
                    const msgs = output?.messages;
                    const last = Array.isArray(msgs) ? msgs[msgs.length - 1] : null;
                    if (last?.content) {
                        const content = typeof last.content === "string" ? last.content : JSON.stringify(last.content);
                        yield `\n${content}\n`;

                        // Check for weather-related keywords in input or output
                        const isWeatherQuery = /weather|temperature|forecast|rain|snow|sunny|cloudy/i.test(input) ||
                            /weather|temperature|forecast|rain|snow|sunny|cloudy/i.test(content);

                        if (isWeatherQuery) {
                            try {
                                // Use a default location or extract from input (simple heuristic)
                                const location = "Stockholm"; // TODO: Extract from input or use user's location
                                const weatherTool = new AccuWeatherTool();
                                const weatherData = await weatherTool._call(location);
                                yield `side-panel-weather ${weatherData}\n`;
                            } catch (error) {
                                console.error("[MainAgentExecution] Failed to fetch weather data:", error);
                            }
                        }
                    }
                    break;
                }
                default:
                    // ignore other events or log them to learn the exact shapes for your version
                    break;
            }
        }
    }

    async saveAgentGraphToFile(filePath: string = "./graphState.png") {
        const graph = this.getAgent().getGraph();

        // 1) Try remote once or twice (nice when it works)
        try {
            const blob = await graph.drawMermaidPng({ backgroundColor: "white" }); // hits mermaid.ink
            const buf = Buffer.from(await blob.arrayBuffer());
            writeFileSync(filePath, buf);
            console.log(`Graph state saved to ${filePath}`);
            return;
        } catch (e) {
            console.warn("Mermaid.INK failed, falling back to local renderer:", (e as Error)?.message ?? e);
        }

        // 2) Reliable local fallback (no network)
        const mermaid = graph.drawMermaid({ withStyles: true });
        await renderLocallyWithMermaidCLI(mermaid, filePath);
        console.log(`Graph state saved to ${filePath} (local render)`);
    }

    /**
     * Get the current provider being used
     */
    getCurrentProvider(): string {
        return this.llmProvider.getCurrentProvider() ?? "unknown";
    }

}