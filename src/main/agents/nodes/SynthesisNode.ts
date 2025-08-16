import { AgentState, AgentStateUpdate, Citation, ThinkingStep } from '../state/AgentState';
import { LLMProvider } from '../../services/LLMProvider';
import { LangChainMemoryService } from '../../services/LangChainMemoryService';
import { AgentPrompts } from '../../prompts/AgentPrompts';

/**
 * Node that synthesizes the final response from tool results
 */
export class SynthesisNode {
    constructor(
        private llmProvider: LLMProvider,
        private memoryService: LangChainMemoryService | null
    ) {}

    /**
     * Execute the synthesis node
     */
    async execute(state: AgentState): Promise<AgentStateUpdate> {
        const { cleanInput, plan, toolResults, context, directResponse } = state;
        
        // If this is a direct response (no tools), generate simple response
        if (directResponse) {
            const response = await this.generateDirectResponse(cleanInput, context);
            return {
                finalResponse: response,
                phase: 'complete'
            };
        }
        
        // Get conversation history for context
        let history: any[] = [];
        try {
            if (this.memoryService) {
                history = await this.memoryService.getConversationHistory(
                    context?.conversationId || 'default',
                    5 // last 5 messages for context
                );
            }
        } catch (error) {
            console.warn('[SynthesisNode] Failed to get conversation history:', error);
        }
        
        // Build tool results for prompt
        const toolResultsForPrompt = Object.entries(toolResults).map(([tool, result]) => ({
            name: tool,
            success: result.success,
            result: result.result,
            error: result.error
        }));
        
        const toolResultsPrompt = AgentPrompts.buildToolResultsPrompt(toolResultsForPrompt);
        
        // Build synthesis prompt
        const synthesisPrompt = `User's original request: "${cleanInput}"
${plan ? `My thinking process: ${plan.reasoning}` : ''}
${plan ? `Tools executed: ${plan.steps.map(s => s.tool).join(', ') || 'none'}` : ''}

${toolResultsPrompt}

Conversation context: ${history.length > 0 ? `Previous ${history.length} messages for context` : 'No previous context'}

Provide a helpful, natural response that addresses the user's request using only the information that was successfully retrieved.`;
        
        // Generate response
        const response = await this.llmProvider.invoke([
            { role: 'system' as const, content: AgentPrompts.getSystemPrompt('synthesis') },
            { role: 'user' as const, content: synthesisPrompt }
        ]);
        
        let finalResponse = response.content as string;
        
        // Extract and add citations
        const citations = this.extractCitationsFromResults(toolResults);
        if (citations.length > 0) {
            finalResponse += '\n\n**Sources:**\n\n';
            citations.forEach((citation, index) => {
                finalResponse += `**[${index + 1}]** [${citation.title}](${citation.url})`;
                if (citation.source) {
                    finalResponse += ` - *${citation.source}*`;
                }
                finalResponse += '\n\n';
            });
        }
        
        // Create thinking step
        const thinkingStep: ThinkingStep = {
            step: 'synthesize',
            content: `Final response generated with citations:\n"${finalResponse.substring(0, 200)}${finalResponse.length > 200 ? '...' : ''}"\n` +
                    `Citations found: ${citations.length}`,
            timestamp: new Date()
        };
        
        // Store conversation in memory
        if (this.memoryService && context) {
            try {
                await this.memoryService.addMessage({
                    conversationId: context.conversationId,
                    role: 'user',
                    content: state.input,
                    timestamp: new Date()
                });
                
                await this.memoryService.addMessage({
                    conversationId: context.conversationId,
                    role: 'assistant',
                    content: finalResponse,
                    timestamp: new Date()
                });
            } catch (error) {
                console.warn('[SynthesisNode] Failed to store conversation:', error);
            }
        }
        
        // Update state
        return {
            finalResponse,
            citations,
            thinkingSteps: [thinkingStep],
            phase: 'complete'
        };
    }
    
    /**
     * Generate a direct response without tools
     */
    private async generateDirectResponse(cleanInput: string, context: any): Promise<string> {
        const response = await this.llmProvider.invoke([
            { role: 'system' as const, content: AgentPrompts.getSystemPrompt('synthesis') },
            { role: 'user' as const, content: cleanInput }
        ]);
        
        const finalResponse = response.content as string;
        
        // Store conversation in memory
        if (this.memoryService && context) {
            try {
                await this.memoryService.addMessage({
                    conversationId: context.conversationId,
                    role: 'user',
                    content: cleanInput,
                    timestamp: new Date()
                });
                
                await this.memoryService.addMessage({
                    conversationId: context.conversationId,
                    role: 'assistant',
                    content: finalResponse,
                    timestamp: new Date()
                });
            } catch (error) {
                console.warn('[SynthesisNode] Failed to store conversation:', error);
            }
        }
        
        return finalResponse;
    }
    
    /**
     * Extract citations from tool results
     */
    private extractCitationsFromResults(toolResults: Record<string, any>): Citation[] {
        const citations: Citation[] = [];
        
        for (const [toolName, result] of Object.entries(toolResults)) {
            if (!result?.success) continue;
            
            try {
                if ((toolName === 'web_search' || toolName === 'brave_search') && typeof result.result === 'string') {
                    // Parse web search results
                    const lines = result.result.split('\n');
                    let currentCitation: { title?: string; url?: string } = {};
                    
                    for (const line of lines) {
                        // Look for numbered results: "1. **Title**"
                        const titleMatch = line.match(/^\d+\.\s*\*\*(.+?)\*\*/);
                        if (titleMatch) {
                            // Save previous citation if complete
                            if (currentCitation.title && currentCitation.url) {
                                citations.push({
                                    title: currentCitation.title,
                                    url: currentCitation.url,
                                    source: this.getSourceFromUrl(currentCitation.url)
                                });
                            }
                            currentCitation = { title: titleMatch[1].trim() };
                        }
                        
                        // Look for URLs: "   URL: https://..."
                        const urlMatch = line.match(/^\s*URL:\s*(.+)$/);
                        if (urlMatch && currentCitation.title) {
                            currentCitation.url = urlMatch[1].trim();
                        }
                    }
                    
                    // Don't forget the last citation
                    if (currentCitation.title && currentCitation.url) {
                        citations.push({
                            title: currentCitation.title,
                            url: currentCitation.url,
                            source: this.getSourceFromUrl(currentCitation.url)
                        });
                    }
                }
            } catch (error) {
                console.error(`[SynthesisNode] Error extracting citations from ${toolName}:`, error);
            }
        }
        
        return citations;
    }
    
    /**
     * Get a readable source name from URL
     */
    private getSourceFromUrl(url: string): string {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace('www.', '');
        } catch {
            return url.length > 50 ? url.substring(0, 50) + '...' : url;
        }
    }
}

/**
 * Factory function to create the synthesis node
 */
export function createSynthesisNode(llmProvider: LLMProvider, memoryService: LangChainMemoryService | null) {
    const node = new SynthesisNode(llmProvider, memoryService);
    return (state: AgentState) => node.execute(state);
}