/**
 * Synthesis node for Deep Research agent
 * Compiles all research findings into a comprehensive final report
 */

import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { LLMProvider } from '../../../services/LLMProvider';
import { AgentState } from '../DeepResearchState';
import { DeepResearchConfiguration } from '../DeepResearchConfig';

/**
 * Synthesis node that creates the final research report
 */
export function createSynthesisNode(
    llmProvider: LLMProvider,
    config: DeepResearchConfiguration
) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        console.log('[SynthesisNode] Synthesizing final research report...');
        
        try {
            // Collect all research materials
            const researchMaterials = {
                researchBrief: state.research_brief || 'Research request',
                processedNotes: state.notes || [],
                rawNotes: state.raw_notes || [],
                supervisorMessages: state.supervisor_messages || []
            };

            console.log(`[SynthesisNode] Synthesizing ${researchMaterials.processedNotes.length} processed notes and ${researchMaterials.rawNotes.length} raw notes`);

            // Generate the final report
            const finalReport = await generateFinalReport(
                researchMaterials,
                llmProvider,
                config
            );

            console.log(`[SynthesisNode] Final report generated (${finalReport.length} characters)`);

            return {
                final_report: finalReport,
                messages: [...state.messages, new AIMessage({ content: finalReport })]
            };

        } catch (error: any) {
            console.error('[SynthesisNode] Error during synthesis:', error);
            
            const errorReport = generateErrorReport(state, error);
            
            return {
                final_report: errorReport,
                messages: [...state.messages, new AIMessage({ content: errorReport })]
            };
        }
    };
}

/**
 * Generate the comprehensive final research report
 */
async function generateFinalReport(
    materials: {
        researchBrief: string;
        processedNotes: string[];
        rawNotes: string[];
        supervisorMessages: BaseMessage[];
    },
    llmProvider: LLMProvider,
    config: DeepResearchConfiguration
): Promise<string> {
    
    // Prepare research content for synthesis
    const researchContent = prepareResearchContent(materials);
    
    // Build the synthesis prompt
    const synthesisPrompt = buildSynthesisPrompt(materials.researchBrief, researchContent);
    
    try {
        const result = await llmProvider.invoke([
            new HumanMessage({ content: synthesisPrompt })
        ]);

        return (result.content as string).trim();

    } catch (error) {
        console.error('[SynthesisNode] Error generating final report:', error);
        throw error;
    }
}

/**
 * Prepare all research content for synthesis
 */
function prepareResearchContent(materials: {
    researchBrief: string;
    processedNotes: string[];
    rawNotes: string[];
    supervisorMessages: BaseMessage[];
}): string {
    let content = '';

    // Add processed research notes (primary source)
    if (materials.processedNotes.length > 0) {
        content += '## Processed Research Findings\n\n';
        materials.processedNotes.forEach((note, index) => {
            content += `### Research Finding ${index + 1}\n${note}\n\n`;
        });
    }

    // Add relevant supervisor insights
    if (materials.supervisorMessages.length > 0) {
        content += '## Research Process Notes\n\n';
        const relevantMessages = materials.supervisorMessages
            .filter(msg => msg._getType() === 'ai')
            .slice(-3) // Last 3 supervisor messages
            .map(msg => msg.content);
        
        if (relevantMessages.length > 0) {
            content += relevantMessages.join('\n\n') + '\n\n';
        }
    }

    // Add raw notes as supporting material (if processed notes are insufficient)
    if (materials.processedNotes.length < 2 && materials.rawNotes.length > 0) {
        content += '## Additional Research Data\n\n';
        materials.rawNotes
            .filter(note => note.length > 50) // Filter out very short notes
            .slice(-5) // Last 5 raw notes
            .forEach((note, index) => {
                content += `### Raw Research ${index + 1}\n${note.substring(0, 1000)}${note.length > 1000 ? '...' : ''}\n\n`;
            });
    }

    return content || 'No substantial research content available.';
}

/**
 * Build the synthesis prompt for final report generation
 */
function buildSynthesisPrompt(researchBrief: string, researchContent: string): string {
    return `You are an expert research analyst tasked with creating a comprehensive final report based on extensive research findings.

**Original Research Request:**
${researchBrief}

**Research Materials Collected:**
${researchContent}

**Your Task:**
Create a comprehensive, well-structured research report that addresses the original research request. Your report should be professional, thorough, and accessible to a general audience while maintaining academic rigor.

**Report Structure Requirements:**

1. **Executive Summary** (2-3 paragraphs)
   - Concise overview of key findings
   - Main conclusions and implications
   - Brief methodology note

2. **Introduction** 
   - Context and background of the research topic
   - Scope and objectives
   - Research approach overview

3. **Key Findings** (Main body - organize by themes/categories)
   - Present findings in logical sections
   - Support with evidence and data from research
   - Include relevant statistics, quotes, and examples
   - Maintain clear attribution to sources when possible

4. **Analysis and Insights**
   - Synthesize findings across sources
   - Identify patterns, trends, and relationships
   - Address different perspectives or contradictory information
   - Provide expert interpretation

5. **Implications and Significance**
   - Practical implications of the findings
   - Broader significance and impact
   - Future considerations or recommendations

6. **Conclusion**
   - Summarize key takeaways
   - Address the original research question/request
   - Suggest areas for further investigation if relevant

**Quality Standards:**
- Use clear, professional language
- Ensure logical flow and coherent structure
- Integrate information from multiple sources
- Maintain objectivity while providing analysis
- Include specific details and evidence
- Make the report comprehensive yet readable

**Formatting:**
- Use markdown formatting for headers and structure
- Include bullet points or numbered lists where appropriate
- Ensure proper paragraph breaks for readability

Create a report that thoroughly addresses the research request while being informative, well-organized, and professionally presented.`;
}

/**
 * Generate an error report when synthesis fails
 */
function generateErrorReport(state: AgentState, error: any): string {
    const availableNotes = state.notes?.length || 0;
    const availableRawNotes = state.raw_notes?.length || 0;
    
    return `# Research Report - Incomplete

## Error Summary
An error occurred during the final synthesis phase of the research process.

**Error Details:** ${error.message}

## Research Request
${state.research_brief || 'Research request not available'}

## Available Research Materials
- Processed research notes: ${availableNotes}
- Raw research entries: ${availableRawNotes}

${availableNotes > 0 ? `## Available Research Findings\n\n${state.notes?.slice(-3).join('\n\n') || ''}` : ''}

## Status
The research process encountered an error during final report generation. The research materials collected above represent the work completed before the error occurred.

To resolve this issue, please:
1. Check the system logs for detailed error information
2. Verify all research components are functioning correctly
3. Consider retrying the research request

---
*Report generated with error handling - ${new Date().toISOString()}*`;
}

