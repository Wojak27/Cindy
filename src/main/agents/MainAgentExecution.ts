import { LLMProvider } from '../services/LLMProvider';
import { LangChainMemoryService } from '../services/LangChainMemoryService';
import { toolRegistry } from './tools/ToolRegistry';
import { SettingsService } from '../services/SettingsService';
import { logger } from '../utils/ColorLogger';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { END, Annotation, StateGraph, START } from "@langchain/langgraph";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { StructuredTool } from '@langchain/core/tools';
import { Runnable, RunnableConfig } from '@langchain/core/runnables';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { trimThinkTags } from '../utils/strings';
import toolLoader from './tools/ToolLoader';


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

/**
 * Deep Research-enhanced LangGraph Agent.
 * Intelligent routing between Deep Research capabilities and standard processing.
 */
export class MainAgentExecution {
    private llmProvider: LLMProvider;
    private memoryService: LangChainMemoryService;
    private settingsService: SettingsService | null = null;
    private researchAgent;
    private writterAgent;
    private workflow: Runnable;

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



        logger.success('RouterLangGraphAgent', 'Initialized with Deep Research routing and state management', {
            provider: this.llmProvider.getCurrentProvider(),
            deepResearchEnabled: true,
            fallbackEnabled: true,
            persistentState: this.persistState
        });
    }

    public async initialize(): Promise<void> {

        this.initializeState();
        this.workflow = await this.buildGraph();
    }

    private async buildGraph(): Promise<Runnable> {
        const toolNode = new ToolNode<typeof this.AgentState.State>(toolRegistry.getTools());
        // Research agent and node
        this.researchAgent = await this.createAgent({
            llm: this.llmProvider.getChatModel(),
            tools: toolRegistry.getTools(),
            systemMessage:
                "You should provide accurate data for the answer writer to use.",
            name: "Researcher",
        });
        // CWritter agent and node
        this.writterAgent = await this.createAgent({
            llm: this.llmProvider.getChatModel(),
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
            provider: this.llmProvider.getCurrentProvider(),
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
        return this.workflow;
    }



    private async runAgentNode(props: {
        state: typeof this.AgentState.State;
        agent: Runnable;
        name: string;
        config?: RunnableConfig;
    }) {
        const { state, agent, name, config } = props;
        let result = await agent.invoke(state, config);
        // We convert the agent output into a format that is suitable
        // to append to the global state
        if (!result?.tool_calls || result.tool_calls.length === 0) {
            // If the agent is NOT calling a tool, we want it to
            // look like a human message.
            result = new HumanMessage({ ...result, name: name });
        }
        result.content = trimThinkTags(result.content as string);
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

    //##################
    // State Management Methods
    //##################

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


    /**
     * Get the memory service for external access (used by benchmark)
     */
    public getMemoryService(): LangChainMemoryService {
        return this.memoryService;
    }

    /**
     * Process a message through the Deep Research system (non-streaming)
     */
    async process(input: string, context?: any): Promise<string> {

        return ``;
    }


    /**
     * Process a message through Deep Research with streaming output
     */
    public async *processStreaming(input: string) {
        // 1) Ask the compiled graph to stream events
        const evStream = await this.workflow.streamEvents(
            { messages: [new HumanMessage(input)] },
            { version: "v1" } // important; use the unified event schema
        );

        // 2) Yield updates on node/tool start/end (and optionally LLM token stream)
        for await (const ev of evStream) {
            switch (ev.event) {
                case "on_chain_start": {
                    const node = ev.name ?? ev.data?.name ?? ev.data?.node_name ?? "unknown";
                    yield `▶️ ${node} started\n`;
                    break;
                }
                case "on_llm_stream": {
                    const token = ev.data?.chunk?.content ?? ev.data?.chunk?.text;
                    if (token) yield token;
                    break;
                }
                case "on_chain_end": {
                    const node = ev.name ?? ev.data?.name ?? ev.data?.node_name ?? "unknown";
                    yield `✅ ${node} finished\n`;
                    break;
                }
                case "on_tool_start": {
                    const tool = ev.name ?? ev.data?.name ?? "tool";
                    yield `🛠️ ${tool} running...\n`;
                    break;
                }
                case "on_tool_end": {
                    const tool = ev.name ?? ev.data?.name ?? "tool";
                    yield `🛠️ ${tool} done\n`;
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
                    if (last?.content) yield `\n${typeof last.content === "string" ? last.content : JSON.stringify(last.content)}\n`;
                    break;
                }
                default:
                    // ignore other events or log them to learn the exact shapes for your version
                    break;
            }
        }
    }

    /**
     * Get the current provider being used
     */
    getCurrentProvider(): string {
        return this.llmProvider.getCurrentProvider();
    }


    /**
     * Export agent graph visualization as PNG file
     */
    async exportGraphAsPNG(options: {
        outputPath?: string;
        enableLangSmith?: boolean;
        projectName?: string;
    } = {}): Promise<string> {
        const {
            outputPath = './agent-graph.png',
            enableLangSmith = false,
            projectName = 'deep-research-debug'
        } = options;

        try {
            console.log('🎨 [RouterLangGraphAgent] Generating graph visualization...');

            // Setup LangSmith if requested
            if (enableLangSmith) {
                this.setupLangSmithTracing(projectName);
            }

            // Get the Deep Research agent
            const agent = this.getAgent();

            // Generate and export the graph
            const finalPath = await this.generateGraphPNG(agent, outputPath);

            console.log(`✅ [RouterLangGraphAgent] Graph exported to: ${finalPath}`);
            return finalPath;

        } catch (error) {
            console.error('❌ [RouterLangGraphAgent] Graph export failed:', error);
            throw error;
        }
    }


    /**
     * Setup LangSmith tracing
     */
    private setupLangSmithTracing(projectName: string) {
        console.log('\n🔬 LANGSMITH SETUP');
        console.log('==================');

        try {
            // Set environment variables for LangSmith
            process.env.LANGCHAIN_TRACING_V2 = 'true';
            process.env.LANGCHAIN_PROJECT = projectName;

            // Check if API key is available
            if (process.env.LANGCHAIN_API_KEY) {
                console.log('✅ LangSmith tracing enabled');
                console.log(`📊 Project: ${projectName}`);
                console.log('🔗 Traces will be available at: https://smith.langchain.com/');
                console.log(`   └─ Project: ${projectName}`);
            } else {
                console.log('⚠️  LANGCHAIN_API_KEY not found');
                console.log('💡 To enable LangSmith tracing:');
                console.log('   1. Get API key from https://smith.langchain.com/');
                console.log('   2. Set environment variable: export LANGCHAIN_API_KEY=your_key');
                console.log('   3. Restart the application');
            }

        } catch (error) {
            console.error('❌ Error setting up LangSmith:', error);
        }
    }

    /**
     * Generate PNG file from the graph
     */
    private async generateGraphPNG(deepResearchAgent: any, outputPath: string): Promise<string> {
        try {
            console.log('🔧 [RouterLangGraphAgent] Accessing graph structure...');

            // Get the main graph from the Deep Research agent
            const mainGraph = deepResearchAgent.getMainGraph();

            if (!mainGraph || !mainGraph.get_graph) {
                throw new Error('Graph structure not accessible from Deep Research agent');
            }

            console.log('📊 [RouterLangGraphAgent] Generating mermaid diagram...');

            // Get the graph representation
            const graph = mainGraph.get_graph();

            // Try to get mermaid representation
            let mermaidCode: string;

            if (graph.draw_mermaid) {
                mermaidCode = graph.draw_mermaid();
            } else {
                // Fallback: generate our own mermaid representation
                mermaidCode = this.generateFallbackMermaidCode();
            }

            console.log('🖼️ [RouterLangGraphAgent] Converting to PNG...');

            // Convert mermaid to PNG using mermaid-cli or puppeteer
            const finalPath = await this.convertMermaidToPNG(mermaidCode, outputPath);

            return finalPath;

        } catch (error) {
            console.error('❌ [RouterLangGraphAgent] Error generating PNG:', error);

            // Fallback: create a basic visualization
            console.log('🔄 [RouterLangGraphAgent] Using fallback visualization...');
            return await this.createFallbackVisualization(outputPath);
        }
    }

    /**
     * Generate fallback mermaid code when graph introspection fails
     */
    private generateFallbackMermaidCode(): string {
        return `
graph TD
    Start([Start]) --> Clarification[ClarificationNode]
    Clarification --> |Need Clarification| NeedClarification[Ask User]
    Clarification --> |No Clarification| Research[ResearchProcess]
    Research --> Supervisor[SupervisorGraph]
    Supervisor --> ResearchLoop[ResearcherGraph]
    ResearchLoop --> |Continue| Supervisor
    Supervisor --> |Complete| Synthesis[SynthesisNode]
    Synthesis --> End([End])
    NeedClarification --> End
    
    subgraph "Supervisor Graph"
        SupervisorNode[SupervisorNode]
        DelegateResearch[DelegateResearch]
        SupervisorNode --> DelegateResearch
        DelegateResearch --> SupervisorNode
    end
    
    subgraph "Researcher Graph"
        ResearcherNode[ResearcherNode]
        ResearcherNode --> |Tool Execution| ResearcherNode
    end
    
    style Start fill:#e1f5fe
    style End fill:#f3e5f5
    style Clarification fill:#fff3e0
    style Research fill:#e8f5e8
    style Synthesis fill:#fce4ec
    style SupervisorNode fill:#fff8e1
    style ResearcherNode fill:#e0f2f1
`;
    }

    /**
     * Convert mermaid code to PNG using available tools
     */
    private async convertMermaidToPNG(mermaidCode: string, outputPath: string): Promise<string> {

        try {
            // First, save the mermaid code to a temporary file
            const mermaidPath = outputPath.replace(/\.png$/i, '.mmd');
            await fs.writeFile(mermaidPath, mermaidCode, 'utf-8');
            console.log(`📝 [RouterLangGraphAgent] Mermaid code saved to: ${mermaidPath}`);

            // Try to use mermaid-cli if available

            return new Promise((resolve, reject) => {
                // Try mmdc (mermaid-cli) first
                const mmdc = spawn('mmdc', ['-i', mermaidPath, '-o', outputPath, '-b', 'white'], {
                    stdio: 'pipe'
                });

                mmdc.on('close', async (code: number) => {
                    if (code === 0) {
                        console.log('✅ [RouterLangGraphAgent] PNG generated using mermaid-cli');
                        resolve(path.resolve(outputPath));
                    } else {
                        console.log('⚠️ [RouterLangGraphAgent] mermaid-cli not available, using fallback...');
                        try {
                            const fallbackPath = await this.createFallbackVisualization(outputPath);
                            resolve(fallbackPath);
                        } catch (error) {
                            reject(error);
                        }
                    }
                });

                mmdc.on('error', async () => {
                    console.log('⚠️ [RouterLangGraphAgent] mermaid-cli not found, using fallback...');
                    try {
                        const fallbackPath = await this.createFallbackVisualization(outputPath);
                        resolve(fallbackPath);
                    } catch (error) {
                        reject(error);
                    }
                });
            });

        } catch (error) {
            console.warn('⚠️ [RouterLangGraphAgent] Mermaid conversion failed, using fallback');
            return await this.createFallbackVisualization(outputPath);
        }
    }

    /**
     * Create a fallback visualization using simple text-based approach
     */
    private async createFallbackVisualization(outputPath: string): Promise<string> {

        try {
            // Check if we can use node-canvas for better visualization
            let createCanvas;

            try {
                const canvas = require('canvas');
                createCanvas = canvas.createCanvas;
            } catch (canvasError) {
                console.log('⚠️ [RouterLangGraphAgent] node-canvas not available, creating text diagram...');
                return await this.createTextDiagram(outputPath);
            }

            // Create canvas
            const width = 1200;
            const height = 800;
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');

            // Set background
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);

            // Draw the graph
            await this.drawGraphOnCanvas(ctx);

            // Save as PNG
            const buffer = canvas.toBuffer('image/png');
            await fs.writeFile(outputPath, buffer);

            console.log('✅ [RouterLangGraphAgent] Canvas-based PNG created');
            return path.resolve(outputPath);

        } catch (error) {
            console.warn('⚠️ [RouterLangGraphAgent] Canvas fallback failed, creating text diagram');
            return await this.createTextDiagram(outputPath);
        }
    }

    /**
     * Draw the graph structure on canvas
     */
    private async drawGraphOnCanvas(ctx: any): Promise<void> {
        // Set up drawing styles
        ctx.strokeStyle = '#333';
        ctx.fillStyle = '#333';
        ctx.lineWidth = 2;
        ctx.font = '14px Arial';

        // Define node positions
        const nodes = {
            start: { x: 100, y: 100, label: 'Start' },
            clarification: { x: 300, y: 100, label: 'Clarification' },
            research: { x: 500, y: 100, label: 'Research Process' },
            supervisor: { x: 700, y: 200, label: 'Supervisor' },
            researcher: { x: 900, y: 300, label: 'Researcher' },
            synthesis: { x: 700, y: 400, label: 'Synthesis' },
            end: { x: 500, y: 500, label: 'End' }
        };

        // Draw nodes
        Object.values(nodes).forEach(node => {
            this.drawNode(ctx, node.x, node.y, node.label);
        });

        // Draw edges
        this.drawEdge(ctx, nodes.start, nodes.clarification);
        this.drawEdge(ctx, nodes.clarification, nodes.research);
        this.drawEdge(ctx, nodes.research, nodes.supervisor);
        this.drawEdge(ctx, nodes.supervisor, nodes.researcher);
        this.drawEdge(ctx, nodes.researcher, nodes.supervisor);
        this.drawEdge(ctx, nodes.supervisor, nodes.synthesis);
        this.drawEdge(ctx, nodes.synthesis, nodes.end);

        // Add title
        ctx.font = '24px Arial';
        ctx.fillStyle = '#000';
        ctx.fillText('Deep Research Agent Graph', 400, 50);
    }

    /**
     * Draw a single node on canvas
     */
    private drawNode(ctx: any, x: number, y: number, label: string): void {
        const width = 120;
        const height = 60;

        // Draw rounded rectangle
        ctx.beginPath();
        ctx.roundRect(x - width / 2, y - height / 2, width, height, 10);
        ctx.fillStyle = '#e3f2fd';
        ctx.fill();
        ctx.strokeStyle = '#1976d2';
        ctx.stroke();

        // Draw text
        ctx.fillStyle = '#000';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, y + 4);
    }

    /**
     * Draw an edge between two nodes
     */
    private drawEdge(ctx: any, from: any, to: any): void {
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = '#666';
        ctx.stroke();

        // Draw arrow head
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const arrowLength = 10;

        ctx.beginPath();
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(
            to.x - arrowLength * Math.cos(angle - Math.PI / 6),
            to.y - arrowLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(
            to.x - arrowLength * Math.cos(angle + Math.PI / 6),
            to.y - arrowLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
    }

    /**
     * Create a simple text-based diagram as final fallback
     */
    private async createTextDiagram(outputPath: string): Promise<string> {
        const fs = require('fs').promises;
        const path = require('path');

        const textDiagram = `
DEEP RESEARCH AGENT GRAPH VISUALIZATION
======================================

[Start] 
   ↓
[ClarificationNode] 
   ↓ (no clarification needed)
[ResearchProcess]
   ↓
[SupervisorGraph] ←→ [ResearcherGraph]
   ↓ (research complete)
[SynthesisNode]
   ↓
[End]

SUPERVISOR GRAPH:
- SupervisorNode ←→ DelegateResearch

RESEARCHER GRAPH:
- ResearcherNode (with tool execution loop)

Generated: ${new Date().toISOString()}
Output requested: ${outputPath}

Note: Install 'mermaid-cli' or 'canvas' npm packages for proper PNG generation.
Command: npm install -g @mermaid-js/mermaid-cli
        `;

        const textPath = outputPath.replace(/\.png$/i, '.txt');
        await fs.writeFile(textPath, textDiagram, 'utf8');

        console.log(`📄 [RouterLangGraphAgent] Text diagram created: ${textPath}`);
        console.log('💡 [RouterLangGraphAgent] Install mermaid-cli for PNG generation: npm install -g @mermaid-js/mermaid-cli');

        return path.resolve(textPath);
    }

}