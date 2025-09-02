/**
 * Clarification node for Deep Research agent
 * Determines if user clarification is needed before starting research
 */

import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { LLMProvider } from '../../../services/LLMProvider';
import { AgentState, ClarifyWithUser } from '../DeepResearchState';
import { DeepResearchConfiguration } from '../DeepResearchConfig';
import { ClarificationSchema, validateClarification, parseClarificationFromText } from '../../schemas/clarification';

/**
 * Clarification node that asks the user for more information if needed
 */
export function createClarificationNode(
    llmProvider: LLMProvider,
    config: DeepResearchConfiguration
) {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        console.log('[ClarificationNode] Analyzing if clarification is needed...');

        try {
            // If clarification is disabled, skip this node
            if (!config.allow_clarification) {
                console.log('[ClarificationNode] Clarification disabled, proceeding to research');
                return {
                    research_brief: extractResearchTopicFromMessages(state.messages),
                    supervisor_messages: [...(state.supervisor_messages || []),
                    new AIMessage({ content: 'Proceeding directly to research without clarification.' })
                    ]
                };
            }

            // Build the clarification prompt
            const messagesText = state.messages.map(msg =>
                `${msg._getType()}: ${msg.content}`
            ).join('\n');

            const today = new Date().toISOString().split('T')[0];

            const clarificationPrompt = `
These are the messages that have been exchanged so far from the user asking for the report:
<Messages>
${messagesText}
</Messages>

Today's date is ${today}.

Assess whether you need to ask a clarifying question, or if the user has already provided enough information for you to start research.
IMPORTANT: If you can see in the messages history that you have already asked a clarifying question, you almost always do not need to ask another one. Only ask another question if ABSOLUTELY NECESSARY.

If there are acronyms, abbreviations, or unknown terms, ask the user to clarify.
If you need to ask a question, follow these guidelines:
- Be concise while gathering all necessary information
- Make sure to gather all the information needed to carry out the research task in a concise, well-structured manner.
- Use bullet points or numbered lists if appropriate for clarity. Make sure that this uses markdown formatting and will be rendered correctly if the string output is passed to a markdown renderer.
- Don't ask for unnecessary information, or information that the user has already provided. If you can see that the user has already provided the information, do not ask for it again.

Respond in valid JSON format with these exact keys:
"need_clarification": boolean,
"question": "<question to ask the user to clarify the report scope>",
"verification": "<verification message that we will start research>"

If you need to ask a clarifying question, return:
"need_clarification": true,
"question": "<your clarifying question>",
"verification": ""

If you do not need to ask a clarifying question, return:
"need_clarification": false,
"question": "",
"verification": "<acknowledgement message that you will now start research based on the provided information>"

For the verification message when no clarification is needed:
- Acknowledge that you have sufficient information to proceed
- Briefly summarize the key aspects of what you understand from their request
- Confirm that you will now begin the research process
- Keep the message concise and professional
            `.trim();

            // Get structured LLM response using Zod validation
            const structuredResult = await llmProvider.invokeStructured([
                new HumanMessage({ content: clarificationPrompt })
            ], ClarificationSchema, {
                maxRetries: config.max_structured_output_retries || 3,
                fallback: {
                    need_clarification: false,
                    question: '',
                    verification: 'I have sufficient information to proceed with the research.'
                }
            });

            let clarificationResult: ClarifyWithUser;
            
            if (structuredResult.success) {
                console.log(`[ClarificationNode] Structured parsing successful on attempt ${structuredResult.attempts}`);
                clarificationResult = structuredResult.data as ClarifyWithUser;
            } else {
                console.warn(`[ClarificationNode] Structured parsing failed after ${structuredResult.attempts} attempts:`, 
                    'error' in structuredResult ? structuredResult.error : 'Unknown error');
                
                // Fallback to manual parsing
                const response = (await llmProvider.invoke([
                    new HumanMessage({ content: clarificationPrompt })
                ])).content as string;
                
                const fallbackResult = parseClarificationFromText(response);
                if (fallbackResult && 
                    typeof fallbackResult.need_clarification === 'boolean' &&
                    typeof fallbackResult.question === 'string' &&
                    typeof fallbackResult.verification === 'string') {
                    clarificationResult = fallbackResult as ClarifyWithUser;
                } else {
                    clarificationResult = {
                        need_clarification: false,
                        question: '',
                        verification: 'I have sufficient information to proceed with the research.'
                    };
                }
                
                console.log('[ClarificationNode] Using fallback parsing result');
            }

            console.log('[ClarificationNode] Clarification result:', clarificationResult);

            if (clarificationResult.need_clarification) {
                // User clarification is needed
                return {
                    supervisor_messages: [...(state.supervisor_messages || []),
                    new AIMessage({ content: clarificationResult.question })
                    ]
                };
            } else {
                // No clarification needed, extract research brief and proceed
                const researchBrief = await extractDetailedResearchBrief(
                    state.messages,
                    llmProvider,
                    config
                );

                return {
                    research_brief: researchBrief,
                    supervisor_messages: [...(state.supervisor_messages || []),
                    new AIMessage({ content: clarificationResult.verification })
                    ]
                };
            }

        } catch (error: any) {
            console.error('[ClarificationNode] Error:', error);

            // Fallback: proceed without clarification
            return {
                research_brief: extractResearchTopicFromMessages(state.messages),
                supervisor_messages: [...(state.supervisor_messages || []),
                new AIMessage({ content: `Error during clarification analysis: ${error.message}. Proceeding with research.` })
                ]
            };
        }
    };
}

/**
 * Extract a basic research topic from messages
 */
function extractResearchTopicFromMessages(messages: BaseMessage[]): string {
    // Find the most recent human message
    const humanMessages = messages.filter(msg => msg._getType() === 'human');
    if (humanMessages.length === 0) {
        return 'General research request';
    }

    const lastHumanMessage = humanMessages[humanMessages.length - 1];
    return lastHumanMessage.content as string;
}

/**
 * Extract a detailed research brief using LLM
 */
async function extractDetailedResearchBrief(
    messages: BaseMessage[],
    llmProvider: LLMProvider,
    config: DeepResearchConfiguration
): Promise<string> {
    try {
        const messagesText = messages.map(msg =>
            `${msg._getType()}: ${msg.content}`
        ).join('\n');

        const researchBriefPrompt = `You will be given a set of messages that have been exchanged so far between yourself and the user. 
Your job is to translate these messages into a more detailed and concrete research question that will be used to guide the research.

The messages that have been exchanged so far between yourself and the user are:
<Messages>
${messagesText}
</Messages>

Based on these messages, formulate a comprehensive research brief that will guide the research process. The research brief should be detailed and specific enough to guide autonomous research agents.

Requirements for the research brief:
- Should be at least a paragraph long
- Should include the specific topic or question to research
- Should include any context, background, or constraints mentioned by the user
- Should specify the scope and depth of research expected
- Should be actionable for research agents

Return only the research brief text, no additional formatting or explanation.`;

        const result = await llmProvider.invoke([
            new HumanMessage({ content: researchBriefPrompt })
        ]);

        return (result.content as string).trim();

    } catch (error) {
        console.error('[ClarificationNode] Error extracting research brief:', error);
        return extractResearchTopicFromMessages(messages);
    }
}