/**
 * Researcher node for Deep Research agent
 * Conducts detailed research on specific topics using available tools
 */

import { HumanMessage } from '@langchain/core/messages';
import { LLMProvider } from '../../../services/LLMProvider';
import { toolRegistry } from '../../tools/ToolRegistry';
import { ResearcherState, ResearcherOutputState } from '../DeepResearchState';
import { DeepResearchConfiguration } from '../DeepResearchConfig';
import { logger } from '../../../utils/ColorLogger';

/**
 * Researcher node that conducts detailed research on specific topics
 */
export function createResearcherNode(
    llmProvider: LLMProvider,
    config: DeepResearchConfiguration
) {
    return async (state: ResearcherState): Promise<ResearcherOutputState> => {
        logger.stage('ResearcherNode', 'Starting Research', `Topic: ${state.research_topic}`);
        logger.info('ResearcherNode', `Tool iterations: ${state.tool_call_iterations}`);

        try {
            logger.step('ResearcherNode', 'Initiating research with tools', 'running');
            const researchResults = await conductResearchWithTools(
                state.research_topic,
                llmProvider,
                config,
                state.tool_call_iterations
            );

            logger.success('ResearcherNode', 'Research completed successfully', {
                findings: researchResults.findings.length,
                rawNotes: researchResults.rawNotes.length
            });

            // Compress and summarize the research findings
            logger.step('ResearcherNode', 'Compressing research findings', 'running');
            const compressedResearch = await compressResearchFindings(
                researchResults.findings,
                state.research_topic,
                llmProvider,
                config
            );

            logger.complete('ResearcherNode', 'Research node completed', compressedResearch.length);
            logger.keyValue('ResearcherNode', 'Compressed research length', `${compressedResearch.length} characters`);

            const result = {
                compressed_research: compressedResearch,
                raw_notes: researchResults.rawNotes
            };

            return result;

        } catch (error: any) {
            logger.error('ResearcherNode', 'Research node failed', error);

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

    logger.info('conductResearchWithTools', `Starting research with up to ${maxIterations} tool calls`);

    let toolCallCount = currentIterations;

    while (toolCallCount < maxIterations) {
        try {
            // Get available search tools
            logger.step('conductResearchWithTools', 'Getting available search tools', 'running');
            const availableTools = getAvailableSearchTools();
            logger.info('conductResearchWithTools', `Available tools: [${availableTools.join(', ')}]`);

            if (availableTools.length === 0) {
                logger.warn('conductResearchWithTools', 'No search tools available - cannot conduct research');
                // Return mock research data to test the pipeline
                const mockFindings = [`Mock research for topic: ${researchTopic}. This is placeholder data since no search tools are available.`];
                const mockRawNotes = [`Mock raw note: No search tools available for topic "${researchTopic}"`];
                logger.info('conductResearchWithTools', 'Returning mock data for testing');
                return { findings: mockFindings, rawNotes: mockRawNotes };
            }

            // Generate research queries
            logger.step('conductResearchWithTools', 'Generating research queries', 'running');
            const researchQueries = await generateResearchQueries(
                researchTopic,
                findings,
                llmProvider,
                config
            );

            logger.success('conductResearchWithTools', `Generated ${researchQueries.length} research queries`);
            researchQueries.forEach((query, index) => {
                logger.bullet('conductResearchWithTools', `Query ${index + 1}: ${query}`, 1);
            });

            // Execute research for each query
            for (const query of researchQueries.slice(0, 3)) { // Limit to 3 queries per iteration
                if (toolCallCount >= maxIterations) {
                    logger.warn('conductResearchWithTools', `Reached max iterations (${maxIterations})`);
                    break;
                }

                try {
                    // Try different search tools based on configuration
                    const searchTool = selectSearchTool(config, availableTools);
                    logger.info('conductResearchWithTools', `Using tool: ${searchTool} for query: "${query}"`);

                    const startTime = Date.now();
                    logger.toolStatus('conductResearchWithTools', searchTool, 'starting', 'Executing search');
                    const searchResult = await toolRegistry.executeTool(searchTool, { input: query });
                    const duration = Date.now() - startTime;
                    
                    logger.toolStatus('conductResearchWithTools', searchTool, 'success', `Completed in ${duration}ms`);
                    const resultText = typeof searchResult === 'string' ? searchResult : JSON.stringify(searchResult);
                    
                    logger.toolCall('conductResearchWithTools', searchTool, 
                        { input: query }, 
                        resultText.slice(0, 500) + (resultText.length > 500 ? '...' : ''),
                        duration
                    );

                    if (resultText && resultText.length > 10) {
                        findings.push(`Query: ${query}\nResults: ${resultText}`);
                        rawNotes.push(resultText);
                        toolCallCount++;

                        logger.success('conductResearchWithTools', `Tool call ${toolCallCount} successful: Found ${resultText.length} chars of data`);
                    } else {
                        logger.warn('conductResearchWithTools', `Tool call returned empty or very short result: "${resultText}"`);
                    }

                } catch (toolError: any) {
                    logger.error('conductResearchWithTools', `Tool execution failed for query "${query}"`, toolError);
                    rawNotes.push(`Search failed for "${query}": ${toolError.message}`);
                }
            }

            // Check if we have enough research
            if (findings.length >= 3) {
                logger.success('ResearcherNode', 'Sufficient research findings collected');
                break;
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error: any) {
            logger.error('ResearcherNode', `Error in research iteration ${toolCallCount}`, error);
            break;
        }
    }

    logger.complete('ResearcherNode', `Research completed with ${findings.length} findings after ${toolCallCount} tool calls`);

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
        'brave_search',
        'serp_search',
        'wikipedia_search',
        'web_search',      // DuckDuckGo
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

        let response = result.content as string;
        // remove <think> tags if present
        response = response.replace(/<think>.*?<\/think>/gs, '').trim();
        const queries = response.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 5 && !line.match(/^\d+\./))
            .slice(0, 5);

        return queries.length > 0 ? queries : [researchTopic];

    } catch (error) {
        logger.error('ResearcherNode', 'Error generating queries', error);
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
        logger.error('ResearcherNode', 'Error compressing findings', error);
        return `Research summary for ${researchTopic}:\n\n${findings.join('\n\n')}`;
    }
}

