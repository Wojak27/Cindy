import { LLMProvider } from '../services/LLMProvider.ts';
import { toolRegistry } from './tools/ToolRegistry.ts';
import { SettingsService } from '../services/SettingsService.ts';
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Runnable } from '@langchain/core/runnables';
import toolLoader from './tools/ToolLoader.ts';
import 'dotenv/config';
import { logger } from '../utils/ColorLogger.ts';
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AccuWeatherTool } from './tools/weather/AccuWeatherTool.ts';
// execa will be dynamically imported where needed (ESM module)


/**
 * Configuration options for the LangGraphAgent
 */
export interface MainAgentGraphOptions {
    llmProvider: LLMProvider;
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
 * ReactAgent-based LangGraph Agent.
 * Uses LangGraph's ReactAgent for intelligent tool usage and reasoning.
 */
export class MainAgentExecution {
    private llmProvider: LLMProvider;
    private settingsService: SettingsService | null = null;
    private agent: Runnable;
    private persistState: boolean;
    private toolConfig: any = {};

    constructor(options: MainAgentGraphOptions) {
        this.llmProvider = options.llmProvider;
        this.persistState = options.persistState !== false; // Default to enabled

        // Create a minimal settings service for compatibility
        this.settingsService = this.createCompatibilitySettingsService();
        this.toolConfig = options.config || {};
        this.initialize()

        logger.success('MainAgentExecution', 'Initialized with ReactAgent pattern and tool integration', {
            provider: this.llmProvider.getCurrentProvider(),
            toolCount: toolRegistry.getTools().length,
            persistentState: this.persistState
        });
    }

    public async initialize(): Promise<void> {
        // Load all available tools
        await toolLoader.loadAllTools(this.toolConfig || {});
        
        // Create ReactAgent with all tools
        this.agent = await this.buildReactAgent();
        
        // Optionally save graph visualization
        if (this.toolConfig.saveGraph) {
            await this.saveAgentGraphToFile();
        }
    }

    /**
     * Build ReactAgent using LangGraph's prebuilt ReactAgent
     */
    private async buildReactAgent(): Promise<Runnable> {
        const tools = toolRegistry.getTools();
        const model = this.llmProvider.getChatModel();
        
        if (!model) {
            throw new Error('LLM model not available');
        }

        // Create system prompt for ReactAgent
        const systemPrompt = new SystemMessage(
            "You are a helpful AI assistant with access to various tools. " +
            "Use the available tools to research information and provide accurate, comprehensive responses. " +
            "When using tools, think step by step about what information you need and which tools can help. " +
            "Always provide detailed explanations based on the information you gather."
        );

        // Create ReactAgent with tools
        const agent = createReactAgent({
            llm: model,
            tools: tools,
            prompt: systemPrompt
        });

        logger.info('MainAgentExecution', `ReactAgent created with ${tools.length} tools`, {
            toolNames: tools.map(t => t.name)
        });

        return agent;
    }

    // ReactAgent handles routing and tool calling internally
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


    // ReactAgent handles node execution and tool calling internally


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

                                // Yield event for document retrieval completion
                                yield {
                                    stepId: `documents-${Date.now()}`,
                                    title: `Retrieved ${rawResults.length} document${rawResults.length === 1 ? '' : 's'}`,
                                    status: "completed",
                                    context: {
                                        documentCount: rawResults.length,
                                        documents: rawResults.map((file: any) => file.name || file.path)
                                    },
                                    timestamp: Date.now()
                                };

                                // Send documents as a batch to the side panel
                                if (rawResults.length > 0) {
                                    // Convert to RetrievedDocument format
                                    const retrievedDocs = rawResults.map((file: any) => ({
                                        path: file.path || '',
                                        name: file.name || file.path?.split('/').pop() || 'Unknown',
                                        size: file.size || 0,
                                        mtime: file.mtime || new Date().toISOString(),
                                        chunks: file.chunks || 1,
                                        relevanceScore: file.relevanceScore || file.score,
                                        matchedContent: file.matchedContent
                                    }));

                                    // Emit multiple documents marker
                                    yield `side-panel-documents ${JSON.stringify(retrievedDocs)}`;
                                }

                                // Still emit individual document markers for backward compatibility
                                for (const file of rawResults) {
                                    console.log("[MainAgentExecution] Retrieved document:", file);
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