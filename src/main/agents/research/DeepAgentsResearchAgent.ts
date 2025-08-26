/**
 * Deep Research Agent using DeepAgentsJS
 * A modernized implementation following DeepAgents best practices
 */

// Import DeepAgents dynamically to avoid type recursion issues
// import { createDeepAgent, type SubAgent } from 'deepagents';
import { LLMProvider } from '../../services/LLMProvider';
// Import built-in DeepAgents tools with type bypassing to avoid compilation issues
import { z } from 'zod';

// Dynamic imports to avoid type recursion issues
let deepAgents: any = null;

async function getDeepAgents() {
    if (!deepAgents) {
        try {
            deepAgents = await import('deepagents');
        } catch (error) {
            console.error('[DeepAgentsResearchAgent] Could not import DeepAgents:', error);
            deepAgents = null;
        }
    }
    return deepAgents;
}

// Type definitions for DeepAgents
type SubAgent = {
    name: string;
    description: string;
    prompt: string;
    tools?: string[];
};
import {
    DeepResearchConfiguration,
    DeepResearchConfigManager,
} from './DeepResearchConfig';
import { ResearchStatus } from './DeepResearchState';

/**
 * Configuration options for the Deep Research Agent
 */
export interface DeepAgentsResearchOptions {
    llmProvider: LLMProvider;
    config?: Partial<DeepResearchConfiguration>;
}

/**
 * Search tool for research tasks - simplified to avoid type recursion
 */
const createSearchTool = (llmProvider: LLMProvider): any => {
    // Create a simple tool object that DeepAgents can use
    return {
        name: "internet_search",
        description: "Search the internet for information on a given topic",
        call: async ({ query, maxResults = 5 }: { query: string; maxResults?: number }): Promise<string> => {
            try {
                // Use existing search infrastructure
                const searchResult = await performWebSearch(query, maxResults);
                return searchResult;
            } catch (error) {
                return `Search failed: ${error instanceof Error ? error.message : String(error)}`;
            }
        },
        schema: z.object({
            query: z.string().describe("The search query"),
            maxResults: z
                .number()
                .optional()
                .default(5)
                .describe("Maximum number of results to return"),
        }),
    };
};

// File tools are now provided by DeepAgents built-in tools

/**
 * Web search integration using existing infrastructure
 */
async function performWebSearch(query: string, maxResults: number): Promise<string> {
    try {
        // Import the tool registry dynamically to avoid circular dependencies
        const { toolRegistry } = await import('../tools/ToolRegistry');
        
        // Check if DuckDuckGo search tool is available
        const availableTools = toolRegistry.getAvailableTools();
        if (availableTools.includes('duckduckgo_search')) {
            const searchTool = toolRegistry.getTool('duckduckgo_search') as any;
            if (searchTool && searchTool.call) {
                const result = await searchTool.call({ input: query });
                return result;
            }
        }
        
        // Fallback for development/testing
        return `Search results for "${query}" (max ${maxResults} results) - Search tools currently unavailable, using placeholder results for testing.`;
        
    } catch (error) {
        console.error('Error performing web search:', error);
        return `Search failed: ${error instanceof Error ? error.message : String(error)}`;
    }
}

/**
 * Research SubAgent for conducting focused research
 */
const researchSubAgent: SubAgent = {
    name: "research-agent",
    description: "Used to research specific topics in depth. Only give this researcher one topic at a time. Do not pass multiple sub questions to this researcher. Instead, break down a large topic into the necessary components, and call multiple research agents in parallel, one for each sub question.",
    prompt: `You are a dedicated researcher. Your job is to conduct thorough research based on the user's questions.

## Research Guidelines

Conduct comprehensive research and then reply to the user with a detailed answer to their question.

Use the internet_search tool to gather information from multiple sources.

Only your FINAL answer will be passed on to the user. They will have NO knowledge of anything except your final message, so your final report should be your final message!

Focus on:
- Gathering factual, up-to-date information
- Including specific details and examples  
- Citing sources where possible
- Providing comprehensive coverage of the topic
- Being thorough and methodical in your research approach

## Research Process

1. Start with broad searches to understand the topic context
2. Dive deeper into specific aspects based on initial findings
3. Cross-reference information from multiple sources
4. Synthesize findings into a coherent, comprehensive response

Remember: Your response will be the complete research output for this specific topic.`,
    tools: ["internet_search"]
};

/**
 * Critique SubAgent for reviewing research
 */
const critiqueSubAgent: SubAgent = {
    name: "critique-agent", 
    description: "Used to critique the final report. Give this agent information about how you want it to critique the report.",
    prompt: `You are a dedicated editor and critic. You are tasked with critiquing research reports.

You can find the report at \`final_report.md\`.
You can find the original question at \`question.txt\`.

The user may ask for specific areas to critique the report. Respond with a detailed critique of the report and things that could be improved.

You can use the search tool to search for additional information if that will help you critique the report.

Do not write to the \`final_report.md\` yourself.

Things to check:
- Check that each section is appropriately named
- Check that the report is written as you would find in an essay or textbook - text heavy, not just bullet points!
- Check that the report is comprehensive. If any paragraphs or sections are short or missing important details, point it out.
- Check that the article covers key areas, ensures overall understanding, and does not omit important parts.
- Check that the article deeply analyzes causes, impacts, and trends, providing valuable insights
- Check that the article closely follows the research topic and directly answers questions
- Check that the article has a clear structure, fluent language, and is easy to understand.`,
    tools: ["internet_search", "read_file"]
};

/**
 * DeepAgents Research Agent Implementation
 */
export class DeepAgentsResearchAgent {
    private agent: any;
    private llmProvider: LLMProvider;
    private config: DeepResearchConfiguration;
    private configManager: DeepResearchConfigManager;
    private searchTool: any;

    constructor(options: DeepAgentsResearchOptions) {
        this.llmProvider = options.llmProvider;

        // Initialize configuration
        this.configManager = new DeepResearchConfigManager(options.config);
        this.config = this.configManager.getConfig();

        // Create custom search tool
        this.searchTool = createSearchTool(this.llmProvider);

        // Create the DeepAgent (async initialization)
        this.initializeAgent();

        console.log('[DeepAgentsResearchAgent] Initialized with DeepAgents architecture');
        console.log('[DeepAgentsResearchAgent] Configuration:', {
            searchAPI: this.config.search_api,
            maxIterations: this.config.max_researcher_iterations,
            allowClarification: this.config.allow_clarification
        });
    }

    /**
     * Create the DeepAgent with research-specific configuration
     */
    private async createAgent(): Promise<any> {
        const researchInstructions = `You are an expert researcher. Your job is to conduct thorough research and write polished reports.

## Research Process Management

1. **Start by creating a research plan with todos**: Use the write_todos tool to create a structured plan for your research. Break down the research into actionable steps.

2. **Record the original question**: Write the original user question to \`question.txt\` so you have a record of it.

3. **Track your progress**: Update your todo list as you complete each research phase using write_todos. This helps maintain focus and shows progress.

4. **Conduct research systematically**: Use the research-agent to conduct deep research. It will respond to your questions/topics with detailed answers.

5. **Write the final report**: When you have enough information, write it to \`final_report.md\`.

6. **Review and refine**: Call the critique-agent to get a critique of the final report. After that (if needed) you can do more research and edit the \`final_report.md\`.

You can repeat steps 4-6 as many times as needed until you are satisfied with the result.

## Todo Management

Use the write_todos tool to:
- Create initial research plan with specific, actionable tasks
- Track completion of research phases (planning, research, synthesis, review)
- Mark tasks as "pending", "in_progress", or "completed"
- Add new tasks discovered during research

Example todo structure:
[
  {"content": "Record original research question", "status": "pending"},
  {"content": "Research topic background and context", "status": "pending"}, 
  {"content": "Research specific aspects and details", "status": "pending"},
  {"content": "Synthesize findings into comprehensive report", "status": "pending"},
  {"content": "Review and critique report quality", "status": "pending"},
  {"content": "Refine report based on critique", "status": "pending"}
]

Only edit files one at a time to avoid conflicts.

Here are instructions for writing the final report:

<report_instructions>
CRITICAL: Make sure the answer is written in the same language as the human messages! If you make a todo plan - note in the plan what language the report should be in.

Please create a detailed answer to the overall research brief that:
1. Is well-organized with proper headings (# for title, ## for sections, ### for subsections)
2. Includes specific facts and insights from the research
3. References relevant sources using [Title](URL) format when available
4. Provides a balanced, thorough analysis. Be comprehensive and include all relevant information.
5. Includes a "Sources" section at the end with all referenced links

Structure your report appropriately for the type of question:
- For comparisons: intro → overview A → overview B → comparison → conclusion
- For lists: just the list, or separate sections for each item
- For summaries: overview → key concepts → conclusion
- For single topics: comprehensive analysis in logical sections

For each section:
- Use simple, clear language
- Use ## for section titles (Markdown format)
- Do NOT refer to yourself as the writer
- Each section should be as long as necessary to deeply answer the question
- Use bullet points when appropriate, but default to paragraph form

<Citation Rules>
- Assign each unique URL a single citation number [1], [2], etc.
- End with ### Sources that lists each source with corresponding numbers
- Number sources sequentially (1,2,3,4...) without gaps
- Format: [1] Source Title: URL
- Citations are extremely important for credibility
</Citation Rules>
</report_instructions>

You have access to several tools including internet_search for gathering information.`;

        // Get DeepAgents dynamically
        const deepAgentsModule = await getDeepAgents();
        if (!deepAgentsModule) {
            throw new Error('DeepAgents module could not be loaded');
        }
        
        const agent = deepAgentsModule.createDeepAgent({
            // Include custom search tool plus all built-in file system tools
            tools: [
                this.searchTool,
                ...(deepAgentsModule.ls ? [deepAgentsModule.ls] : []),
                ...(deepAgentsModule.readFile ? [deepAgentsModule.readFile] : []),
                ...(deepAgentsModule.writeFile ? [deepAgentsModule.writeFile] : []),
                ...(deepAgentsModule.editFile ? [deepAgentsModule.editFile] : []),
                ...(deepAgentsModule.writeTodos ? [deepAgentsModule.writeTodos] : []),
            ],
            instructions: researchInstructions,
            subagents: [researchSubAgent, critiqueSubAgent],
            model: this.llmProvider as any, // Cast to compatible type
        });
        
        // Note: withConfig may not be available in current version
        return agent;
    }

    /**
     * Async initialization of the agent
     */
    private async initializeAgent(): Promise<void> {
        try {
            this.agent = await this.createAgent();
            console.log('[DeepAgentsResearchAgent] DeepAgent created successfully');
        } catch (error) {
            console.error('[DeepAgentsResearchAgent] Error creating DeepAgent:', error);
            // Fallback: create a simple mock agent
            this.agent = {
                invoke: async () => ({ files: {}, messages: [] })
            };
        }
    }

    /**
     * Process a research request (main entry point)
     */
    async processResearch(message: string): Promise<string> {
        console.log('[DeepAgentsResearchAgent] Processing research request...');

        try {
            // Invoke the DeepAgent
            const result = await this.agent.invoke({
                messages: [{ role: "user", content: message }],
            });

            console.log('[DeepAgentsResearchAgent] Research completed successfully');

            // Extract the final report from files
            if (result.files && result.files['final_report.md']) {
                return result.files['final_report.md'];
            }

            // Fallback to last message content
            if (result.messages && result.messages.length > 0) {
                const lastMessage = result.messages[result.messages.length - 1];
                return lastMessage.content || 'Research completed but no final report generated.';
            }

            return 'Research completed but no final report generated.';

        } catch (error: any) {
            console.error('[DeepAgentsResearchAgent] Research processing error:', error);
            return `Research failed: ${error.message}`;
        }
    }

    /**
     * Stream research process with progress updates
     */
    async *streamResearch(message: string): AsyncGenerator<{
        type: 'progress' | 'result';
        content: string;
        status?: ResearchStatus;
    }> {
        console.log('[DeepAgentsResearchAgent] Starting streaming research...');

        try {
            yield { type: 'progress', content: 'Starting research process...', status: ResearchStatus.CLARIFYING };

            // For now, we'll run the full research and then stream the result
            // DeepAgents doesn't have built-in streaming yet, but we can simulate it
            yield { type: 'progress', content: 'Analyzing research requirements...', status: ResearchStatus.PLANNING };

            const result = await this.agent.invoke({
                messages: [{ role: "user", content: message }],
            });

            yield { type: 'progress', content: 'Research completed, generating final report...', status: ResearchStatus.COMPLETE };

            // Extract the final report
            let finalReport = 'Research completed but no final report generated.';
            if (result.files && result.files['final_report.md']) {
                finalReport = result.files['final_report.md'];
            } else if (result.messages && result.messages.length > 0) {
                const lastMessage = result.messages[result.messages.length - 1];
                finalReport = lastMessage.content || finalReport;
            }

            yield {
                type: 'result',
                content: finalReport,
                status: ResearchStatus.COMPLETE
            };

        } catch (error: any) {
            console.error('[DeepAgentsResearchAgent] Streaming research error:', error);
            yield {
                type: 'result',
                content: `Research failed: ${error.message}`,
                status: ResearchStatus.ERROR
            };
        }
    }

    /**
     * Update configuration
     */
    updateConfig(updates: Partial<DeepResearchConfiguration>): void {
        this.configManager.updateConfig(updates);
        this.config = this.configManager.getConfig();

        // Recreate the agent with new configuration
        this.agent = this.createAgent();

        console.log('[DeepAgentsResearchAgent] Configuration updated and agent recreated');
    }

    /**
     * Get current configuration
     */
    getConfig(): DeepResearchConfiguration {
        return this.config;
    }

    /**
     * Get configuration manager
     */
    getConfigManager(): DeepResearchConfigManager {
        return this.configManager;
    }

    /**
     * Get the agent for debugging/visualization
     */
    getAgent(): any {
        return this.agent;
    }
}