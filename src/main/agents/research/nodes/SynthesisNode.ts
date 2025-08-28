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
        console.log('[SynthesisNode] ===== SYNTHESIS NODE STARTING =====');
        console.log('[SynthesisNode] Input state analysis:');
        console.log(`[SynthesisNode] - research_brief: ${state.research_brief ? 'EXISTS' : 'NULL'} (${state.research_brief?.length || 0} chars)`);
        console.log(`[SynthesisNode] - notes: ${state.notes?.length || 0} items`);
        console.log(`[SynthesisNode] - raw_notes: ${state.raw_notes?.length || 0} items`);
        console.log(`[SynthesisNode] - supervisor_messages: ${state.supervisor_messages?.length || 0} items`);
        
        try {
            // Collect all research materials
            const researchMaterials = {
                researchBrief: state.research_brief || 'Research request',
                processedNotes: state.notes || [],
                rawNotes: state.raw_notes || [],
                supervisorMessages: state.supervisor_messages || []
            };

            console.log(`[SynthesisNode] Material analysis:`);
            console.log(`[SynthesisNode] - processedNotes: ${researchMaterials.processedNotes.length} items`);
            console.log(`[SynthesisNode] - rawNotes: ${researchMaterials.rawNotes.length} items`);
            console.log(`[SynthesisNode] - supervisorMessages: ${researchMaterials.supervisorMessages.length} items`);

            // Debug: Show sample content if available
            if (researchMaterials.processedNotes.length > 0) {
                console.log(`[SynthesisNode] - First processed note preview: ${researchMaterials.processedNotes[0].substring(0, 100)}...`);
            }
            if (researchMaterials.rawNotes.length > 0) {
                console.log(`[SynthesisNode] - First raw note preview: ${researchMaterials.rawNotes[0].substring(0, 100)}...`);
            }

            // Generate the final report
            console.log('[SynthesisNode] Calling generateFinalReport...');
            const finalReport = await generateFinalReport(
                researchMaterials,
                llmProvider,
                config
            );

            console.log(`[SynthesisNode] ===== FINAL REPORT GENERATED =====`);
            console.log(`[SynthesisNode] Report length: ${finalReport.length} characters`);
            console.log(`[SynthesisNode] Report preview: ${finalReport.substring(0, 200)}...`);

            const result = {
                final_report: finalReport,
                messages: [...state.messages, new AIMessage({ content: finalReport })]
            };

            console.log('[SynthesisNode] ===== SYNTHESIS NODE COMPLETE =====');
            console.log('[SynthesisNode] Returning state with final_report set');

            return result;

        } catch (error: any) {
            console.error('[SynthesisNode] ===== SYNTHESIS ERROR =====');
            console.error('[SynthesisNode] Error during synthesis:', error);
            console.error('[SynthesisNode] Error stack:', error.stack);
            
            const errorReport = generateErrorReport(state, error);
            console.log(`[SynthesisNode] Generated error report (${errorReport.length} characters)`);
            
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
    
    console.log('[generateFinalReport] Preparing research content...');
    // Prepare research content for synthesis
    const researchContent = prepareResearchContent(materials);
    console.log(`[generateFinalReport] Research content prepared (${researchContent.length} characters)`);
    
    // Build the synthesis prompt
    console.log('[generateFinalReport] Building synthesis prompt...');
    const synthesisPrompt = buildSynthesisPrompt(materials.researchBrief, researchContent);
    console.log(`[generateFinalReport] Synthesis prompt built (${synthesisPrompt.length} characters)`);
    
    try {
        console.log('[generateFinalReport] Invoking LLM provider...');
        const result = await llmProvider.invoke([
            new HumanMessage({ content: synthesisPrompt })
        ]);

        const finalReport = (result.content as string).trim();
        console.log(`[generateFinalReport] LLM response received (${finalReport.length} characters)`);

        if (!finalReport || finalReport.length < 50) {
            console.warn('[generateFinalReport] Warning: Generated report seems too short');
            console.warn(`[generateFinalReport] Report content: "${finalReport}"`);
        }

        return finalReport;

    } catch (error) {
        console.error('[generateFinalReport] Error generating final report:', error);
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
    console.log('[prepareResearchContent] Preparing research content...');
    console.log(`[prepareResearchContent] - processedNotes: ${materials.processedNotes.length} items`);
    console.log(`[prepareResearchContent] - rawNotes: ${materials.rawNotes.length} items`);
    console.log(`[prepareResearchContent] - supervisorMessages: ${materials.supervisorMessages.length} items`);
    
    let content = '';

    // Add processed research notes (primary source)
    if (materials.processedNotes.length > 0) {
        console.log('[prepareResearchContent] Adding processed research findings...');
        content += '## Processed Research Findings\n\n';
        materials.processedNotes.forEach((note, index) => {
            content += `### Research Finding ${index + 1}\n${note}\n\n`;
        });
    }

    // Add relevant supervisor insights
    if (materials.supervisorMessages.length > 0) {
        console.log('[prepareResearchContent] Adding supervisor insights...');
        content += '## Research Process Notes\n\n';
        const relevantMessages = materials.supervisorMessages
            .filter(msg => msg._getType() === 'ai')
            .slice(-3) // Last 3 supervisor messages
            .map(msg => msg.content);
        
        console.log(`[prepareResearchContent] Found ${relevantMessages.length} relevant supervisor messages`);
        if (relevantMessages.length > 0) {
            content += relevantMessages.join('\n\n') + '\n\n';
        }
    }

    // Add raw notes as supporting material (if processed notes are insufficient)
    if (materials.processedNotes.length < 2 && materials.rawNotes.length > 0) {
        console.log('[prepareResearchContent] Adding raw notes as supporting material...');
        content += '## Additional Research Data\n\n';
        const validRawNotes = materials.rawNotes.filter(note => note.length > 50);
        console.log(`[prepareResearchContent] Found ${validRawNotes.length} valid raw notes`);
        
        validRawNotes
            .slice(-5) // Last 5 raw notes
            .forEach((note, index) => {
                content += `### Raw Research ${index + 1}\n${note.substring(0, 1000)}${note.length > 1000 ? '...' : ''}\n\n`;
            });
    }

    if (!content || content.trim() === '') {
        console.warn('[prepareResearchContent] ⚠️ No research content available, generating basic content');
        content = `## Research Request\n${materials.researchBrief}\n\n## Status\nNo research data was collected. This may be due to:\n- Search tools being unavailable\n- Network connectivity issues\n- Tool configuration problems\n\nPlease try the research request again or check the system configuration.`;
    }

    console.log(`[prepareResearchContent] Prepared content length: ${content.length} characters`);
    return content;
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
   - **REQUIRED**: Use in-text citations for all web-based information (e.g., "According to [Source Name](URL)...")
   - Reference specific sources when presenting facts, statistics, or claims

4. **Analysis and Insights**
   - Synthesize findings across sources
   - Identify patterns, trends, and relationships
   - Address different perspectives or contradictory information
   - Provide expert interpretation with clear source attribution

5. **Implications and Significance**
   - Practical implications of the findings
   - Broader significance and impact
   - Future considerations or recommendations

6. **Conclusion**
   - Summarize key takeaways
   - Address the original research question/request
   - Suggest areas for further investigation if relevant

7. **Sources and References** (MANDATORY)
   - Extract and list all web sources used in the research
   - Format as numbered references: "1. [Title](URL) - Brief description"
   - Include at least 3-5 sources when available from web searches
   - Sources should correspond to citations used throughout the report

**Quality Standards:**
- Use clear, professional language
- Ensure logical flow and coherent structure
- Integrate information from multiple sources with proper attribution
- Maintain objectivity while providing analysis
- Include specific details and evidence with source links
- Make the report comprehensive yet readable
- **CRITICAL**: Every web-based claim must be backed by a cited source

**Citation Requirements:**
- Use in-text citations throughout the report for web-based information
- Format sources as clickable markdown links: [Source Title](URL)
- When referencing web search results, extract URLs and titles from the research content
- If URLs are available in research materials, they MUST be included as references
- End the report with a "Sources and References" section listing all sources

**Formatting:**
- Use markdown formatting for headers and structure
- Include bullet points or numbered lists where appropriate
- Ensure proper paragraph breaks for readability
- Make all source references clickable links

Create a report that thoroughly addresses the research request while being informative, well-organized, professionally presented, and properly cited with all web sources referenced.`;
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

