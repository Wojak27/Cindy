import { LLMProvider } from "../services/LLMProvider.ts";
import { toolRegistry } from "./tools/ToolRegistry.ts";
import { SettingsService } from "../services/SettingsService.ts";
import { START, StateGraph } from "@langchain/langgraph";
import { createReactAgent, ToolNode } from "@langchain/langgraph/prebuilt";
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { Runnable } from "@langchain/core/runnables";
import { pull } from "langchain/hub";
import "dotenv/config";
import { logger } from "../utils/ColorLogger.ts";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AccuWeatherTool } from "./tools/weather/AccuWeatherTool.ts";
import { Annotation, END } from "@langchain/langgraph";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import z from "zod";
import toolLoader from "./tools/ToolLoader.ts";
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
  await execa("npx", [
    "-y",
    "@mermaid-js/mermaid-cli",
    "-i",
    tmpMmd,
    "-o",
    outPath,
    "--backgroundColor",
    "white",
  ]);
}

/**
 * ReactAgent-based LangGraph Agent.
 * Uses LangGraph's ReactAgent for intelligent tool usage and reasoning.
 */
export class MainAgentExecution {
  private llmProvider: LLMProvider;
  private settingsService: SettingsService | null = null;
  private persistState: boolean;
  private agentGraph: any;
  private toolConfig: any = {};

  constructor(options: MainAgentGraphOptions) {
    this.llmProvider = options.llmProvider;
    this.persistState = options.persistState !== false; // Default to enabled

    // Create a minimal settings service for compatibility
    this.settingsService = this.createCompatibilitySettingsService();
    this.toolConfig = options.config || {};

    logger.success(
      "MainAgentExecution",
      "Initialized with ReactAgent pattern and tool integration",
      {
        provider: this.llmProvider.getCurrentProvider(),
        toolCount: toolRegistry.getTools().length,
        persistentState: this.persistState,
      }
    );
  }

  public async initialize(): Promise<void> {
    // // Load all available tools
    await toolLoader.loadAllTools(this.toolConfig || {});
    this.initializeState();

    // Create ReactAgent with all tools
    this.agentGraph = await this.buildReactAgent();

    // Optionally save graph visualization
    if (this.toolConfig.saveGraph) {
      await this.saveAgentGraphToFile();
    }
  }

  /**
   * Decides whether the agent should retrieve more information or end the process.
   * This function checks the last message in the state for a function call. If a tool call is
   * present, the process continues to retrieve information. Otherwise, it ends the process.
   * @param {typeof GraphState.State} state - The current state of the agent, including all messages.
   * @returns {string} - A decision to either "continue" the retrieval process or "end" it.
   */
  private shouldRetrieve(state: typeof this.AgentState): string {
    const { messages } = state;
    console.log("---DECIDE TO RETRIEVE---");
    const lastMessage = messages[messages.length - 1];

    if (
      "tool_calls" in lastMessage &&
      Array.isArray(lastMessage.tool_calls) &&
      lastMessage.tool_calls.length
    ) {
      console.log("---DECISION: RETRIEVE---");
      return "retrieve";
    }
    // If there are no tool calls then we finish.
    return END;
  }
  /**
   * Determines whether the Agent should continue based on the relevance of retrieved documents.
   * This function checks if the last message in the conversation is of type FunctionMessage, indicating
   * that document retrieval has been performed. It then evaluates the relevance of these documents to the user's
   * initial question using a predefined model and output parser. If the documents are relevant, the conversation
   * is considered complete. Otherwise, the retrieval process is continued.
   * @param {typeof GraphState.State} state - The current state of the agent, including all messages.
   * @returns {Promise<Partial<typeof GraphState.State>>} - The updated state with the new message added to the list of messages.
   */
  private async gradeDocuments(
    state: typeof this.AgentState
  ): Promise<Partial<typeof this.AgentState>> {
    console.log("---GET RELEVANCE---");

    const { messages } = state;
    const tool = {
      name: "give_relevance_score",
      description: "Give a relevance score to the retrieved documents.",
      schema: z.object({
        binaryScore: z.string().describe("Relevance score 'yes' or 'no'"),
      }),
    };
    const prompt = ChatPromptTemplate.fromTemplate(
      `You are a grader assessing relevance of retrieved docs to a user question.
    Here are the retrieved docs:
    \n ------- \n
    {context} 
    \n ------- \n
    Here is the user question: {question}
    If the content of the docs are relevant to the users question, score them as relevant.
    Give a binary score 'yes' or 'no' score to indicate whether the docs are relevant to the question.
    Yes: The docs are relevant to the question.
    No: The docs are not relevant to the question.`
    );

    const model = this.llmProvider.getChatModel()!.bindTools!([tool]);

    const chain = prompt.pipe(model!);

    const lastMessage = messages[messages.length - 1];

    const score = await chain.invoke({
      question: messages[0].content as string,
      context: lastMessage.content as string,
    });

    return {
      messages: [score],
    };
  }

  /**
   * Check the relevance of the previous LLM tool call.
   *
   * @param {typeof GraphState.State} state - The current state of the agent, including all messages.
   * @returns {string} - A directive to either "yes" or "no" based on the relevance of the documents.
   */
  private checkRelevance(state: typeof this.AgentState): string {
    console.log("---CHECK RELEVANCE---");

    const { messages } = state;
    const lastMessage = messages[messages.length - 1];
    if (!("tool_calls" in lastMessage)) {
      throw new Error(
        "The 'checkRelevance' node requires the most recent message to contain tool calls."
      );
    }
    const toolCalls = (lastMessage as AIMessage).tool_calls;
    if (!toolCalls || !toolCalls.length) {
      throw new Error("Last message was not a function message");
    }

    if (toolCalls[0].args.binaryScore === "yes") {
      console.log("---DECISION: DOCS RELEVANT---");
      return "yes";
    }
    console.log("---DECISION: DOCS NOT RELEVANT---");
    return "no";
  }

  // Nodes

  /**
   * Invokes the agent model to generate a response based on the current state.
   * This function calls the agent model to generate a response to the current conversation state.
   * The response is added to the state's messages.
   * @param {typeof GraphState.State} state - The current state of the agent, including all messages.
   * @returns {Promise<Partial<typeof GraphState.State>>} - The updated state with the new message added to the list of messages.
   */
  private async agent(
    state: typeof this.AgentState
  ): Promise<Partial<typeof this.AgentState>> {
    console.log("---CALL AGENT---");
    const tools = toolRegistry.getTools();

    const { messages } = state;
    // Find the AIMessage which contains the `give_relevance_score` tool call,
    // and remove it if it exists. This is because the agent does not need to know
    // the relevance score.
    const filteredMessages = messages.filter((message: any) => {
      if (
        "tool_calls" in message &&
        Array.isArray(message.tool_calls) &&
        message.tool_calls.length > 0
      ) {
        return message.tool_calls[0].name !== "search_documents";
      }
      return true;
    });

    let model = this.llmProvider.getChatModel()!;
    model = model.bindTools!(tools);

    const response = await model.invoke(filteredMessages);
    return {
      messages: [response],
    };
  }

  /**
   * Transform the query to produce a better question.
   * @param {typeof GraphState.State} state - The current state of the agent, including all messages.
   * @returns {Promise<Partial<typeof GraphState.State>>} - The updated state with the new message added to the list of messages.
   */
  private async rewrite(
    state: typeof this.AgentState
  ): Promise<Partial<typeof this.AgentState>> {
    console.log("---TRANSFORM QUERY---");

    const { messages } = state;
    const question = messages[0].content as string;
    const prompt = ChatPromptTemplate.fromTemplate(
      `Look at the input and try to reason about the underlying semantic intent / meaning. \n 
    Here is the initial question:
    \n ------- \n
    {question} 
    \n ------- \n
    Formulate an improved question:`
    );

    // Grader
    const model = this.llmProvider.getChatModel()!;
    const response = await prompt.pipe(model).invoke({ question });
    return {
      messages: [response],
    };
  }

  /**
   * Generate answer
   * @param {typeof GraphState.State} state - The current state of the agent, including all messages.
   * @returns {Promise<Partial<typeof GraphState.State>>} - The updated state with the new message added to the list of messages.
   */
  private async generate(
    state: typeof this.AgentState
  ): Promise<Partial<typeof this.AgentState>> {
    console.log("---GENERATE---");

    const { messages } = state;
    const question = messages[0].content as string;
    // Extract the most recent ToolMessage
    const lastToolMessage = messages
      .slice()
      .reverse()
      .find((msg: any) => msg._getType() === "tool");
    if (!lastToolMessage) {
      throw new Error("No tool message found in the conversation history");
    }

    const docs = lastToolMessage.content as string;

    const prompt = await pull<ChatPromptTemplate>("rlm/rag-prompt");

    const llm = this.llmProvider.getChatModel()!;

    const ragChain = prompt.pipe(llm);

    const response = await ragChain.invoke({
      context: docs,
      question,
    });

    return {
      messages: [response],
    };
  }
  /**
   * Initialize agent session state
   */
  private initializeState(): void {
    this.AgentState = Annotation.Root({
      messages: Annotation<BaseMessage[]>({
        reducer: (x, y) => x.concat(y),
        default: () => [],
      }),
    });
  }

  /**
   * Build ReactAgent using LangGraph's prebuilt ReactAgent
   */
  private async buildReactAgent(): Promise<Runnable> {
    const tools = toolRegistry.getTools();
    const toolNode = new ToolNode<typeof this.AgentState>(tools);
    const model = this.llmProvider.getChatModel();

    if (!model) {
      throw new Error("LLM model not available");
    }

    // Create system prompt for ReactAgent
    const systemPrompt = new SystemMessage(
      "You are a helpful AI assistant named Cindy." +
        "You are highly intelligent and capable of complex reasoning tasks" +
        "you have a nice personality and you are very friendly and always polite. " +
        " You have access to various tools. " +
        "Use the available tools to research information and provide accurate, comprehensive responses. " +
        "When using tools, think step by step about what information you need and which tools can help. " +
        "Always provide detailed explanations based on the information you gather." +
        "In your workflow, whenever asked to retrieve something, like documents or memories, past conversations ect." +
        "You always use first the memory tools, vector search tools or document search tools before answering. " +
        "Unless specifically asked to search the web or do research, you should not use web search tools. "
    );

    // Define the graph
    const workflow = new StateGraph(this.AgentState)
      // Define the nodes which we'll cycle between.
      .addNode("agent", this.agent.bind(this))
      .addNode("retrieve", toolNode)
      .addNode("gradeDocuments", this.gradeDocuments.bind(this))
      .addNode("rewrite", this.rewrite.bind(this))
      .addNode("generate", this.generate.bind(this));

    // Call agent node to decide to retrieve or not
    workflow.addEdge(START, "agent");

    // Decide whether to retrieve
    workflow.addConditionalEdges(
      "agent",
      // Assess agent decision
      this.shouldRetrieve
    );

    workflow.addEdge("retrieve", "gradeDocuments");

    // Edges taken after the `action` node is called.
    workflow.addConditionalEdges(
      "gradeDocuments",
      // Assess agent decision
      this.checkRelevance,
      {
        // Call tool node
        yes: "generate",
        no: "rewrite", // placeholder
      }
    );

    workflow.addEdge("generate", END);
    workflow.addEdge("rewrite", "agent");

    logger.info(
      "MainAgentExecution",
      `ReactAgent created with ${tools.length} tools`,
      {
        toolNames: tools.map((t) => t.name),
      }
    );
    const app = workflow.compile();
    return app;
  }

  // ReactAgent handles routing and tool calling internally
  public getStatus(): { provider: string; availableTools: string[] } {
    return {
      provider: this.llmProvider.getCurrentProvider()!,
      availableTools: toolRegistry.getAllToolNames(),
    };
  }

  public updateLLMProvider(llmProvider: LLMProvider) {
    this.llmProvider = llmProvider;
    logger.info("RouterLangGraphAgent", "LLM provider updated", {
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
    const output = await this.agent.invoke({
      messages: [new HumanMessage(input)],
    });
    const msgs = output?.messages;
    const last = Array.isArray(msgs) ? msgs[msgs.length - 1] : null;
    return last?.content
      ? typeof last.content === "string"
        ? last.content
        : JSON.stringify(last.content)
      : "No response";
  }

  /**
   * Process a message through Deep Research with streaming output
   */
  public async *processStreaming(input: string) {
    // 1) Ask the compiled graph to stream events
    const evStream = await this.agentGraph.streamEvents(
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
            timestamp: Date.now(),
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
            timestamp: Date.now(),
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
            timestamp: Date.now(),
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
            timestamp: Date.now(),
          };

          // Handle document search results
          if (tool === "'VectorSearchTool'" && ev.data?.output) {
            const output =
              typeof ev.data.output === "string"
                ? ev.data.output
                : JSON.stringify(ev.data.output);
            const rawResultsMatch = output.match(
              /<!-- RAW_RESULTS: (\[.*?\]) -->/
            );
            if (rawResultsMatch) {
              try {
                const rawResults = JSON.parse(rawResultsMatch[1]);

                // Yield event for document retrieval completion
                yield {
                  stepId: `documents-${Date.now()}`,
                  title: `Retrieved ${rawResults.length} document${rawResults.length === 1 ? "" : "s"}`,
                  status: "completed",
                  context: {
                    documentCount: rawResults.length,
                    documents: rawResults.map(
                      (file: any) => file.name || file.path
                    ),
                  },
                  timestamp: Date.now(),
                };

                // Send documents as a batch to the side panel
                if (rawResults.length > 0) {
                  // Convert to RetrievedDocument format
                  const retrievedDocs = rawResults.map((file: any) => ({
                    path: file.path || "",
                    name: file.name || file.path?.split("/").pop() || "Unknown",
                    size: file.size || 0,
                    mtime: file.mtime || new Date().toISOString(),
                    chunks: file.chunks || 1,
                    relevanceScore: file.relevanceScore || file.score,
                    matchedContent: file.matchedContent,
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
                console.error(
                  "[MainAgentExecution] Failed to parse RAW_RESULTS:",
                  parseError
                );
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
            const content =
              typeof last.content === "string"
                ? last.content
                : JSON.stringify(last.content);
            yield `\n${content}\n`;

            // Check for weather-related keywords in input or output
            const isWeatherQuery =
              /weather|temperature|forecast|rain|snow|sunny|cloudy/i.test(
                input
              ) ||
              /weather|temperature|forecast|rain|snow|sunny|cloudy/i.test(
                content
              );

            if (isWeatherQuery) {
              try {
                // Use a default location or extract from input (simple heuristic)
                const location = "Stockholm"; // TODO: Extract from input or use user's location
                const weatherTool = new AccuWeatherTool();
                const weatherData = await weatherTool._call(location);
                yield `side-panel-weather ${weatherData}\n`;
              } catch (error) {
                console.error(
                  "[MainAgentExecution] Failed to fetch weather data:",
                  error
                );
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
      console.warn(
        "Mermaid.INK failed, falling back to local renderer:",
        (e as Error)?.message ?? e
      );
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
