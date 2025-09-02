/**
 * Supervisor node for Deep Research agent
 * Manages the research process and delegates tasks to researcher nodes
 */

import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { LLMProvider } from '../../../services/LLMProvider';
import { SupervisorState } from '../DeepResearchState';
import { DeepResearchConfiguration } from '../DeepResearchConfig';
import { logger } from '../../../utils/ColorLogger';

/**
 * Supervisor node that orchestrates the research process
 */
export function createSupervisorNode(
    llmProvider: LLMProvider,
    config: DeepResearchConfiguration
) {
    return async (state: SupervisorState): Promise<Partial<SupervisorState>> => {
        logger.stage('SupervisorNode', `Research Iteration ${state.research_iterations + 1}`, 
            `Managing research workflow (${state.notes.length} notes collected)`);
        
        try {
            // Check if we've reached the maximum iterations
            if (state.research_iterations >= config.max_researcher_iterations) {
                logger.info('SupervisorNode', `Maximum research iterations (${config.max_researcher_iterations}) reached, completing research`);
                return {
                    research_iterations: state.research_iterations + 1
                };
            }

            // Build the supervisor prompt
            const supervisorPrompt = buildSupervisorPrompt(state, config);

            // Get LLM response for research decisions
            logger.step('SupervisorNode', 'Consulting supervisor LLM for research decision...', 'running');
            const result = await llmProvider.invoke([
                new HumanMessage({ content: supervisorPrompt })
            ]);
            
            const response = result.content as string;
            logger.debug('SupervisorNode', 'Supervisor response received', { 
                response: response.substring(0, 200) + '...' 
            });

            // Parse the response to determine next action
            const decision = parseSupervisionDecision(response);
            logger.info('SupervisorNode', `Decision: ${decision.action}`, decision);
            
            const updatedMessages = [...state.supervisor_messages, 
                new AIMessage({ content: response })
            ];

            if (decision.action === 'conduct_research') {
                logger.transition('SupervisorNode', 'Planning', 'Research Execution');
                logger.info('SupervisorNode', 'Delegating research task', {
                    topic: decision.research_topic?.substring(0, 100) + '...'
                });
                
                return {
                    supervisor_messages: updatedMessages,
                    research_iterations: state.research_iterations + 1,
                    // The research topic will be picked up by the research workflow
                };
            } else if (decision.action === 'research_complete') {
                logger.success('SupervisorNode', 'Research determined to be complete');
                logger.transition('SupervisorNode', 'Research Phase', 'Synthesis Phase');
                
                return {
                    supervisor_messages: updatedMessages,
                    research_iterations: state.research_iterations + 1,
                };
            } else {
                // Default: continue research
                logger.info('SupervisorNode', 'Continuing research process');
                
                return {
                    supervisor_messages: updatedMessages,
                    research_iterations: state.research_iterations + 1,
                };
            }

        } catch (error: any) {
            logger.error('SupervisorNode', 'Supervisor error occurred', error);
            
            return {
                supervisor_messages: [...state.supervisor_messages, 
                    new AIMessage({ content: `Supervisor error: ${error.message}` })
                ],
                research_iterations: state.research_iterations + 1,
            };
        }
    };
}

/**
 * Build the supervisor prompt for research decision making
 */
function buildSupervisorPrompt(state: SupervisorState, config: DeepResearchConfiguration): string {
    const researchHistory = state.notes.length > 0 
        ? `\nResearch completed so far:\n${state.notes.slice(-5).join('\n\n')}`
        : '\nNo research completed yet.';

    const rawNotesHistory = state.raw_notes.length > 0
        ? `\nRaw research notes:\n${state.raw_notes.slice(-10).join('\n\n')}`
        : '';

    return `You are a Research Supervisor responsible for orchestrating a comprehensive research project.

Research Brief: ${state.research_brief}

Current Research Status:
- Research iteration: ${state.research_iterations + 1} of ${config.max_researcher_iterations}
- Notes collected: ${state.notes.length}
- Raw research entries: ${state.raw_notes.length}

${researchHistory}

${rawNotesHistory}

Your job is to determine the next step in the research process. You have two options:

1. **Continue Research**: If you believe more research is needed, use the conduct_research function to specify exactly what should be researched next. Be very specific and detailed about what aspects need exploration.

2. **Complete Research**: If you believe sufficient research has been gathered and the research brief has been adequately addressed, use the research_complete function.

Guidelines for decision making:
- Ensure the research brief is thoroughly addressed
- Look for gaps in the current research
- Consider if enough diverse sources and perspectives have been explored
- Aim for comprehensive coverage of the topic
- Don't continue research just to reach the maximum iterations
- Quality and completeness matter more than quantity

For research topics, provide detailed, specific instructions (at least a paragraph) that will guide autonomous research agents. Include:
- Specific aspects to investigate
- Types of sources to prioritize
- Key questions to answer
- Context for why this research is needed

Make your decision now.`;
}

/**
 * Parse the LLM response to determine the supervision decision
 */
function parseSupervisionDecision(response: string): {
    action: 'conduct_research' | 'research_complete' | 'continue';
    research_topic?: string;
} {
    try {
        // Try to extract tool calls or structured output
        if (response.includes('conduct_research')) {
            // Extract research topic from the response
            const topicMatch = response.match(/research_topic["\s]*:["\s]*([^"]+)["]/);
            if (topicMatch) {
                return {
                    action: 'conduct_research',
                    research_topic: topicMatch[1]
                };
            }
            
            // Fallback: extract from text
            const lines = response.split('\n');
            const topicLine = lines.find(line => 
                line.toLowerCase().includes('research') && 
                line.toLowerCase().includes('topic')
            );
            
            if (topicLine) {
                return {
                    action: 'conduct_research',
                    research_topic: topicLine
                };
            }
        }
        
        if (response.includes('research_complete') || 
            response.toLowerCase().includes('complete') ||
            response.toLowerCase().includes('sufficient')) {
            return { action: 'research_complete' };
        }
        
        // If we can't parse clearly, default to continue
        return { action: 'continue' };
        
    } catch (error) {
        logger.warn('SupervisorNode', 'Error parsing decision, defaulting to continue', error);
        return { action: 'continue' };
    }
}

/**
 * Helper to extract research topic from supervisor response
 */
export function extractResearchTopicFromSupervision(response: string): string | null {
    try {
        // Try multiple patterns to extract research topic
        const patterns = [
            /research_topic["\s]*:["\s]*([^"]+)["]/,
            /Research topic[:\s]+([^\n]+)/i,
            /Investigate[:\s]+([^\n]+)/i,
            /Research[:\s]+([^\n]+)/i
        ];
        
        for (const pattern of patterns) {
            const match = response.match(pattern);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
        
        return null;
    } catch (error) {
        logger.debug('SupervisorNode', 'Error extracting research topic', error);
        return null;
    }
}