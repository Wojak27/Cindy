/**
 * Researcher node for Deep Research agent
 * Conducts detailed research on specific topics using available tools
 */

import { HumanMessage } from '@langchain/core/messages';
import { LLMProvider } from '../../../services/LLMProvider';
import { toolRegistry } from '../../tools/ToolRegistry';
import { ResearcherState, ResearcherOutputState } from '../DeepResearchState';
import { DeepResearchConfiguration } from '../DeepResearchConfig';

/**
 * Researcher node that conducts detailed research on specific topics
 */
export function createResearcherNode(
    llmProvider: LLMProvider,
    config: DeepResearchConfiguration
) {
    return async (state: ResearcherState): Promise<ResearcherOutputState> => {
        console.log('[ResearcherNode] Conducting research on:', state.research_topic.substring(0, 100) + '...');

        try {
            const researchResults = await conductResearchWithTools(
                state.research_topic,
                llmProvider,
                config,
                state.tool_call_iterations
            );

            // Compress and summarize the research findings
            const compressedResearch = await compressResearchFindings(
                researchResults.findings,
                state.research_topic,
                llmProvider,
                config
            );

            console.log('[ResearcherNode] Research completed, findings compressed');

            return {
                compressed_research: compressedResearch,
                raw_notes: researchResults.rawNotes
            };

        } catch (error: any) {
            console.error('[ResearcherNode] Research error:', error);

            return {
                compressed_research: `Research failed for topic: ${state.research_topic}. Error: ${error.message}`,
                raw_notes: [`Error during research: ${error.message}`]
            };
        }
    };
}

/**
 * Conduct research using available tools
 */
async function conductResearchWithTools(
    researchTopic: string,
    llmProvider: LLMProvider,
    config: DeepResearchConfiguration,
    currentIterations: number = 0
): Promise<{ findings: string[]; rawNotes: string[] }> {
    const findings: string[] = [];
    const rawNotes: string[] = [];
    const maxIterations = config.max_react_tool_calls;

    console.log(`[ResearcherNode] Starting research with up to ${maxIterations} tool calls`);

    let toolCallCount = currentIterations;

    while (toolCallCount < maxIterations) {
        try {
            // Get available search tools
            const availableTools = getAvailableSearchTools();

            if (availableTools.length === 0) {
                console.warn('[ResearcherNode] No search tools available');
                break;
            }

            // Generate research queries
            const researchQueries = await generateResearchQueries(
                researchTopic,
                findings,
                llmProvider,
                config
            );

            console.log(`[ResearcherNode] Generated ${researchQueries.length} research queries`);

            // Execute research for each query
            for (const query of researchQueries.slice(0, 3)) { // Limit to 3 queries per iteration
                if (toolCallCount >= maxIterations) break;

                try {
                    // Try different search tools based on configuration
                    const searchTool = selectSearchTool(config, availableTools);
                    console.log(`[ResearcherNode] Using tool: ${searchTool} for query: ${query.substring(0, 50)}...`);

                    const searchResult = await toolRegistry.executeTool(searchTool, { input: query });

                    const resultText = typeof searchResult === 'string' ? searchResult : JSON.stringify(searchResult);

                    if (resultText && resultText.length > 10) {
                        findings.push(`Query: ${query}\nResults: ${resultText}`);
                        rawNotes.push(resultText);
                        toolCallCount++;

                        console.log(`[ResearcherNode] Tool call ${toolCallCount}: Found ${resultText.length} chars of data`);
                    }

                } catch (toolError: any) {
                    console.warn(`[ResearcherNode] Tool execution failed for query "${query}":`, toolError.message);
                    rawNotes.push(`Search failed for "${query}": ${toolError.message}`);
                }
            }

            // Check if we have enough research
            if (findings.length >= 3) {
                console.log('[ResearcherNode] Sufficient research findings collected');
                break;
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error: any) {
            console.error(`[ResearcherNode] Error in research iteration ${toolCallCount}:`, error);
            break;
        }
    }

    console.log(`[ResearcherNode] Research completed with ${findings.length} findings after ${toolCallCount} tool calls`);

    return { findings, rawNotes };
}

/**
 * Get available search tools from the registry
 */
function getAvailableSearchTools(): string[] {
    const searchTools = toolRegistry.getToolsByCategory('search' as any);
    return searchTools.map(tool => tool.name);
}

/**
 * Select appropriate search tool based on configuration
 */
function selectSearchTool(config: DeepResearchConfiguration, availableTools: string[]): string {
    // Priority order based on configuration
    const toolPriority = [
        'tavily_search',
        'web_search',      // DuckDuckGo
        'brave_search',
        'serp_search',
        'wikipedia_search'
    ];

    // Find the first available tool in priority order
    for (const toolName of toolPriority) {
        if (availableTools.includes(toolName)) {
            return toolName;
        }
    }

    // Fallback to any available search tool
    return availableTools[0] || 'web_search';
}

/**
 * Generate research queries for the topic
 */
async function generateResearchQueries(
    researchTopic: string,
    existingFindings: string[],
    llmProvider: LLMProvider,
    config: DeepResearchConfiguration
): Promise<string[]> {
    try {
        const existingContext = existingFindings.length > 0
            ? `\nExisting research findings:\n${existingFindings.slice(-3).join('\n\n')}`
            : '';

        const queryPrompt = `Given the research topic and any existing findings, generate 3-5 specific search queries that will help gather comprehensive information.

Research Topic: ${researchTopic}

${existingContext}

Generate search queries that:
- Are specific and targeted
- Cover different aspects of the topic
- Use varied terminology and approaches
- Avoid duplicating existing research
- Are suitable for web search engines

Return only the search queries, one per line, without numbering or additional text.`;

        const result = await llmProvider.invoke([
            new HumanMessage({ content: queryPrompt })
        ]);

        const response = result.content as string;
        const queries = response.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 5 && !line.match(/^\d+\./))
            .slice(0, 5);

        return queries.length > 0 ? queries : [researchTopic];

    } catch (error) {
        console.error('[ResearcherNode] Error generating queries:', error);
        return [researchTopic];
    }
}

/**
 * Compress research findings into a coherent summary
 */
async function compressResearchFindings(
    findings: string[],
    researchTopic: string,
    llmProvider: LLMProvider,
    config: DeepResearchConfiguration
): Promise<string> {
    if (findings.length === 0) {
        return `No research findings available for topic: ${researchTopic}`;
    }

    try {
        const findingsText = findings.join('\n\n---\n\n');

        const compressionPrompt = `You are a research analyst tasked with synthesizing research findings into a comprehensive summary.

Research Topic: ${researchTopic}

Research Findings:
${findingsText}

Your task is to create a well-structured, comprehensive summary that:

1. **Synthesizes key information** from all the research findings
2. **Identifies main themes and patterns** across sources
3. **Highlights important facts, statistics, and insights**
4. **Organizes information logically** with clear sections
5. **Maintains source attribution** where relevant
6. **Removes redundancy** while preserving unique information
7. **Presents findings in a coherent narrative**

Structure your response with:
- Executive summary (2-3 sentences)
- Key findings (organized by theme/category)
- Important details and supporting evidence
- Conclusion with implications or significance

Keep the summary comprehensive but focused, ensuring all important information from the research is preserved in an organized format.`;

        const result = await llmProvider.invoke([
            new HumanMessage({ content: compressionPrompt })
        ]);

        return (result.content as string).trim();

    } catch (error) {
        console.error('[ResearcherNode] Error compressing findings:', error);
        return `Research summary for ${researchTopic}:\n\n${findings.join('\n\n')}`;
    }
}

