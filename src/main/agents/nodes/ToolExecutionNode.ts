import { AgentState, AgentStateUpdate, ToolResult, ThinkingStep } from '../state/AgentState';
import { LangChainToolExecutorService } from '../../services/LangChainToolExecutorService';

/**
 * Node that executes planned tools sequentially
 */
export class ToolExecutionNode {
    constructor(private toolExecutor: LangChainToolExecutorService) {}

    /**
     * Execute the tool execution node
     */
    async execute(state: AgentState): Promise<AgentStateUpdate> {
        const { plan, context } = state;
        
        if (!plan || !plan.steps || plan.steps.length === 0) {
            return {
                phase: 'synthesis'
            };
        }
        
        const toolResults: Record<string, ToolResult> = {};
        const thinkingSteps: ThinkingStep[] = [];
        const streamBuffer: string[] = [];
        
        // Execute each tool in the plan
        for (let i = 0; i < plan.steps.length; i++) {
            const step = plan.steps[i];
            const stepNum = i + 1;
            const toolId = `tool-${context?.conversationId || 'default'}-${Date.now()}-${i}`;
            
            // Create tool execution info for streaming
            const toolCallInfo = {
                id: toolId,
                name: step.tool,
                parameters: step.parameters,
                status: 'executing',
                startTime: Date.now(),
                reasoning: step.reasoning,
                forced: step.forced,
                stepNumber: stepNum,
                totalSteps: plan.steps.length
            };
            
            // Add to stream buffer
            streamBuffer.push(`<tool>${JSON.stringify(toolCallInfo)}</tool>\n`);
            
            const startTime = Date.now();
            
            try {
                // Handle special web search preference routing
                let actualTool = step.tool;
                if (step.tool === 'web_search_preferred') {
                    actualTool = 'web_search';
                    console.log(`[ToolExecutionNode] Routing #web hashtag to preferred web search provider`);
                }
                
                // Execute the tool
                const result = await this.toolExecutor.executeTool(actualTool, step.parameters);
                const duration = Date.now() - startTime;
                
                toolResults[step.tool] = result;
                
                // Update tool call with completion status
                const completedToolCall = {
                    ...toolCallInfo,
                    status: result.success ? 'completed' : 'failed',
                    endTime: Date.now(),
                    duration: `${(duration / 1000).toFixed(1)}s`,
                    result: result.success ? result.result : undefined,
                    error: result.success ? undefined : result.error
                };
                
                // Add completion to stream buffer
                streamBuffer.push(`<tool>${JSON.stringify(completedToolCall)}</tool>\n`);
                
                // Create thinking step for this tool execution
                thinkingSteps.push({
                    step: 'tool',
                    content: `Executed ${step.tool}:\n` +
                            `- Status: ${result.success ? 'success' : 'failed'}\n` +
                            `- Duration: ${(duration / 1000).toFixed(1)}s\n` +
                            `${result.error ? `- Error: ${result.error}\n` : ''}`,
                    timestamp: new Date()
                });
                
            } catch (error) {
                console.error(`[ToolExecutionNode] Tool execution error for ${step.tool}:`, error);
                const duration = Date.now() - startTime;
                
                toolResults[step.tool] = { 
                    success: false, 
                    error: (error as Error).message 
                };
                
                // Update tool call with error status
                const failedToolCall = {
                    ...toolCallInfo,
                    status: 'failed',
                    endTime: Date.now(),
                    duration: `${(duration / 1000).toFixed(1)}s`,
                    error: (error as Error).message
                };
                
                // Add error to stream buffer
                streamBuffer.push(`<tool>${JSON.stringify(failedToolCall)}</tool>\n`);
                
                // Create thinking step for error
                thinkingSteps.push({
                    step: 'tool',
                    content: `Failed to execute ${step.tool}:\n` +
                            `- Error: ${(error as Error).message}\n` +
                            `- Duration: ${(duration / 1000).toFixed(1)}s`,
                    timestamp: new Date()
                });
            }
        }
        
        // Update state with results
        return {
            toolResults,
            thinkingSteps,
            streamBuffer,
            phase: 'synthesis'
        };
    }
}

/**
 * Factory function to create the tool execution node
 */
export function createToolExecutionNode(toolExecutor: LangChainToolExecutorService) {
    const node = new ToolExecutionNode(toolExecutor);
    return (state: AgentState) => node.execute(state);
}