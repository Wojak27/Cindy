/**
 * ToolTokenHandler.ts
 * 
 * Service for parsing and handling tool tokens in real-time during streaming.
 * Extracts tool call blocks from streaming chunks and separates them from display content.
 * Similar to ThinkingTokenHandler but for tool invocations.
 */

export interface ToolCall {
    id: string;
    name: string;
    parameters: any;
    status: 'pending' | 'executing' | 'completed' | 'failed' | 'retrying';
    result?: any;
    error?: string;
    startTime: number;
    endTime?: number;
    duration?: string;
    retryCount?: number;
    maxRetries?: number;
    lastRetryTime?: number;
    retryErrors?: string[];
}

export interface ProcessedToolContent {
    displayContent: string;
    toolCalls: ToolCall[];
    rawContent: string;
    pendingToolContent: string; // For incomplete tool blocks during streaming
}

export class ToolTokenHandler {
    private static instance: ToolTokenHandler;
    private toolStack: string[] = [];
    private currentToolId = 0;
    private readonly TOOL_START_TOKEN = '<tool>';
    private readonly TOOL_END_TOKEN = '</tool>';
    private readonly TOKEN_REGEX = new RegExp(`${this.TOOL_START_TOKEN}|${this.TOOL_END_TOKEN}`, 'g');
    private pendingContent = ''; // Buffer for incomplete tool calls

    private constructor() { }

    /**
     * Get singleton instance
     */
    public static getInstance(): ToolTokenHandler {
        if (!ToolTokenHandler.instance) {
            ToolTokenHandler.instance = new ToolTokenHandler();
        }
        return ToolTokenHandler.instance;
    }

    /**
     * Process a chunk of streaming content to extract tool calls
     * @param chunk - The incoming stream chunk
     * @param conversationId - The current conversation ID
     * @returns Processed content with tool calls separated
     */
    public processChunk(chunk: string, conversationId: string): ProcessedToolContent {
        console.log('🔧 Tool Handler - processChunk called:', {
            chunkLength: chunk?.length || 0,
            chunkPreview: chunk?.substring(0, 100),
            conversationId,
            currentStackDepth: this.toolStack.length,
            hasPendingContent: this.pendingContent.length > 0
        });

        if (!chunk) {
            return {
                displayContent: '',
                toolCalls: [],
                rawContent: '',
                pendingToolContent: this.pendingContent
            };
        }

        const result: ProcessedToolContent = {
            displayContent: '',
            toolCalls: [],
            rawContent: chunk,
            pendingToolContent: ''
        };

        // Combine pending content with new chunk
        const fullContent = this.pendingContent + chunk;
        this.pendingContent = '';

        // Reset regex lastIndex to ensure proper matching
        this.TOKEN_REGEX.lastIndex = 0;

        let match;
        let lastIndex = 0;
        let displayContent = '';
        let inToolBlock = this.toolStack.length > 0;

        // Process all tokens in the chunk
        while ((match = this.TOKEN_REGEX.exec(fullContent)) !== null) {
            const token = match[0];
            const tokenIndex = match.index;

            // Add content before the token to appropriate section
            const contentBeforeToken = fullContent.slice(lastIndex, tokenIndex);

            if (inToolBlock) {
                // We're inside a tool block, so add to the current block
                if (this.toolStack.length > 0) {
                    this.toolStack[this.toolStack.length - 1] += contentBeforeToken;
                }
            } else {
                // We're in display content, so add to display
                displayContent += contentBeforeToken;
            }

            // Handle the token
            if (token === this.TOOL_START_TOKEN) {
                // Start of tool block
                console.log('🔧 Tool Handler: Found TOOL_START_TOKEN, starting new block');
                this.toolStack.push('');
                inToolBlock = true;
            } else if (token === this.TOOL_END_TOKEN) {
                // End of tool block
                console.log('🔧 Tool Handler: Found TOOL_END_TOKEN, finishing block');
                if (this.toolStack.length > 0) {
                    const toolContent = this.toolStack.pop() || '';
                    const toolCall = this.parseToolCall(toolContent, conversationId);
                    
                    if (toolCall) {
                        console.log('🔧 Tool Handler: Parsed tool call:', {
                            id: toolCall.id,
                            name: toolCall.name,
                            parameters: toolCall.parameters
                        });
                        result.toolCalls.push(toolCall);
                    } else {
                        console.warn('🔧 Tool Handler: Failed to parse tool call:', toolContent);
                        // If parsing fails, treat it as display content
                        displayContent += this.TOOL_START_TOKEN + toolContent + this.TOOL_END_TOKEN;
                    }
                }
                inToolBlock = this.toolStack.length > 0;
            }

            lastIndex = this.TOKEN_REGEX.lastIndex;
        }

        // Handle remaining content after the last token
        const remainingContent = fullContent.slice(lastIndex);
        
        if (inToolBlock && this.toolStack.length > 0) {
            // Still inside a tool block, add to stack
            this.toolStack[this.toolStack.length - 1] += remainingContent;
            // Store as pending for next chunk
            result.pendingToolContent = this.TOOL_START_TOKEN + this.toolStack[this.toolStack.length - 1];
        } else {
            // Check if we might be starting a tool block
            const partialStartIndex = remainingContent.lastIndexOf('<');
            if (partialStartIndex !== -1) {
                const potentialTag = remainingContent.slice(partialStartIndex);
                
                // Handle various partial cases
                if (potentialTag === '<' || 
                    potentialTag.startsWith('<t') || 
                    potentialTag.startsWith('<to') ||
                    potentialTag.startsWith('<too') ||
                    potentialTag.startsWith('<tool')) {
                    // Partial '<tool>' token
                    displayContent += remainingContent.slice(0, partialStartIndex);
                    this.pendingContent = potentialTag;
                } else {
                    // Not a tool tag, add all to display
                    displayContent += remainingContent;
                }
            } else {
                displayContent += remainingContent;
            }
        }

        result.displayContent = displayContent;

        console.log('🔧 Tool Handler - processChunk result:', {
            displayContentLength: result.displayContent.length,
            toolCallsCount: result.toolCalls.length,
            finalStackDepth: this.toolStack.length,
            pendingContentLength: this.pendingContent.length
        });

        return result;
    }

    /**
     * Parse tool call content into structured format
     * @param content - The tool call content (JSON string)
     * @param conversationId - The conversation ID
     * @returns Parsed tool call or null if parsing fails
     */
    private parseToolCall(content: string, conversationId: string): ToolCall | null {
        try {
            // Clean up the content by removing trailing backslashes and whitespace
            let cleanContent = content.trim();
            
            // Remove trailing backslashes that might appear from malformed XML
            cleanContent = cleanContent.replace(/\\+$/, '');
            
            // Remove any trailing newlines or extra characters
            cleanContent = cleanContent.replace(/[\n\r\s]*$/, '');
            
            console.log('🔧 Tool Handler: Cleaning content:', { 
                original: content, 
                cleaned: cleanContent 
            });
            
            const parsed = JSON.parse(cleanContent);
            
            if (!parsed.name) {
                console.error('🔧 Tool Handler: Tool call missing required "name" field');
                return null;
            }

            const toolCall: ToolCall = {
                id: `tool-${conversationId}-${this.currentToolId++}`,
                name: parsed.name,
                parameters: parsed.parameters || {},
                status: 'pending',
                startTime: Date.now()
            };

            console.log('🔧 Tool Handler: Successfully parsed tool call:', {
                id: toolCall.id,
                name: toolCall.name,
                parameters: toolCall.parameters
            });

            return toolCall;
        } catch (error) {
            console.error('🔧 Tool Handler: Failed to parse tool call JSON:', error);
            console.error('🔧 Tool Handler: Content that failed to parse:', content);
            
            // Try to fix common issues and parse again
            try {
                let fixedContent = content.trim()
                    .replace(/\\+$/, '') // Remove trailing backslashes
                    .replace(/[\n\r]*$/, '') // Remove trailing newlines
                    .replace(/,\s*}/, '}') // Remove trailing commas
                    .replace(/,\s*]/, ']'); // Remove trailing commas in arrays
                
                console.log('🔧 Tool Handler: Attempting to fix malformed JSON:', fixedContent);
                const parsed = JSON.parse(fixedContent);
                
                if (parsed.name) {
                    const toolCall: ToolCall = {
                        id: `tool-${conversationId}-${this.currentToolId++}`,
                        name: parsed.name,
                        parameters: parsed.parameters || {},
                        status: 'pending',
                        startTime: Date.now()
                    };
                    console.log('🔧 Tool Handler: Fixed and parsed tool call successfully');
                    return toolCall;
                }
            } catch (fixError) {
                console.error('🔧 Tool Handler: Failed to fix malformed JSON:', fixError);
            }
            
            return null;
        }
    }

    /**
     * Execute a tool call with retry mechanism
     * @param toolCall - The tool call to execute
     * @param executor - Function to execute the tool
     * @param options - Retry configuration options
     * @returns Updated tool call with result or error
     */
    public async executeToolCall(
        toolCall: ToolCall, 
        executor: (name: string, params: any) => Promise<any>,
        options: {
            maxRetries?: number;
            baseDelay?: number;
            maxDelay?: number;
            exponentialBackoff?: boolean;
            retryableErrors?: string[];
        } = {}
    ): Promise<ToolCall> {
        const {
            maxRetries = 3,
            baseDelay = 1000,
            maxDelay = 10000,
            exponentialBackoff = true,
            retryableErrors = ['timeout', 'network', 'rate limit', 'temporary']
        } = options;

        // Initialize retry properties
        toolCall.maxRetries = maxRetries;
        toolCall.retryCount = toolCall.retryCount || 0;
        toolCall.retryErrors = toolCall.retryErrors || [];

        console.log('🔧 Tool Handler: Executing tool call:', {
            id: toolCall.id,
            name: toolCall.name,
            parameters: toolCall.parameters,
            attempt: toolCall.retryCount + 1,
            maxRetries: toolCall.maxRetries
        });

        toolCall.status = toolCall.retryCount > 0 ? 'retrying' : 'executing';

        for (let attempt = toolCall.retryCount; attempt <= maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    toolCall.lastRetryTime = Date.now();
                    console.log(`🔧 Tool Handler: Retry attempt ${attempt}/${maxRetries} for tool ${toolCall.name}`);
                }

                const result = await executor(toolCall.name, toolCall.parameters);
                
                toolCall.status = 'completed';
                toolCall.result = result;
                toolCall.endTime = Date.now();
                toolCall.retryCount = attempt;
                
                const durationMs = toolCall.endTime - toolCall.startTime;
                const seconds = Math.floor(durationMs / 1000);
                toolCall.duration = `${seconds}s`;

                console.log('🔧 Tool Handler: Tool call completed:', {
                    id: toolCall.id,
                    name: toolCall.name,
                    duration: toolCall.duration,
                    attempts: attempt + 1,
                    resultPreview: JSON.stringify(result).substring(0, 100)
                });

                return toolCall;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                toolCall.retryErrors.push(errorMessage);
                toolCall.retryCount = attempt;

                console.error(`🔧 Tool Handler: Tool call attempt ${attempt + 1} failed:`, {
                    id: toolCall.id,
                    name: toolCall.name,
                    error: errorMessage,
                    attempt: attempt + 1
                });

                // Check if error is retryable
                const isRetryableError = retryableErrors.some(retryableError => 
                    errorMessage.toLowerCase().includes(retryableError.toLowerCase())
                );

                // If this is the last attempt or error is not retryable, fail
                if (attempt >= maxRetries || !isRetryableError) {
                    toolCall.status = 'failed';
                    toolCall.error = `Failed after ${attempt + 1} attempts. Last error: ${errorMessage}`;
                    toolCall.endTime = Date.now();
                    
                    const durationMs = toolCall.endTime - toolCall.startTime;
                    const seconds = Math.floor(durationMs / 1000);
                    toolCall.duration = `${seconds}s`;

                    console.error('🔧 Tool Handler: Tool call permanently failed:', {
                        id: toolCall.id,
                        name: toolCall.name,
                        error: toolCall.error,
                        duration: toolCall.duration,
                        totalAttempts: attempt + 1,
                        allErrors: toolCall.retryErrors
                    });

                    return toolCall;
                }

                // Calculate delay for next retry
                let delay = baseDelay;
                if (exponentialBackoff) {
                    delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
                }

                // Add jitter to prevent thundering herd
                const jitter = Math.random() * 0.1 * delay;
                delay += jitter;

                console.log(`🔧 Tool Handler: Retrying in ${Math.round(delay)}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                
                toolCall.status = 'retrying';
            }
        }

        // This should never be reached, but just in case
        toolCall.status = 'failed';
        toolCall.error = 'Unexpected retry loop exit';
        return toolCall;
    }

    /**
     * Format tool results for inclusion in LLM context
     * @param toolCalls - Array of executed tool calls
     * @returns Formatted string for LLM context
     */
    public formatToolResults(toolCalls: ToolCall[]): string {
        if (toolCalls.length === 0) return '';

        const results = toolCalls.map(call => {
            let statusInfo = `Tool: ${call.name}\nStatus: ${call.status}`;
            
            if (call.retryCount && call.retryCount > 0) {
                statusInfo += `\nAttempts: ${call.retryCount + 1}${call.maxRetries ? `/${call.maxRetries + 1}` : ''}`;
            }
            
            if (call.duration) {
                statusInfo += `\nDuration: ${call.duration}`;
            }

            if (call.status === 'completed') {
                statusInfo += `\nResult: ${JSON.stringify(call.result, null, 2)}`;
            } else if (call.status === 'failed') {
                statusInfo += `\nError: ${call.error}`;
                if (call.retryErrors && call.retryErrors.length > 1) {
                    statusInfo += `\nAll Errors: ${call.retryErrors.join(', ')}`;
                }
            } else if (call.status === 'retrying') {
                statusInfo += `\nCurrently retrying...`;
                if (call.retryErrors && call.retryErrors.length > 0) {
                    statusInfo += `\nPrevious Errors: ${call.retryErrors.join(', ')}`;
                }
            }

            return statusInfo;
        }).join('\n\n---\n\n');

        return `Tool Execution Results:\n\n${results}`;
    }

    /**
     * Check if currently processing a tool block
     */
    public isProcessingTool(): boolean {
        const hasStack = this.toolStack.length > 0;
        const hasMeaningfulPending = this.hasMeaningfulPendingContent();
        
        if (hasStack || hasMeaningfulPending) {
            console.log('🔧 Tool Handler: isProcessingTool() debug:', {
                hasStack,
                stackDepth: this.toolStack.length,
                hasPending: this.pendingContent.length > 0,
                hasMeaningfulPending,
                pendingContentLength: this.pendingContent.length,
                pendingContent: this.pendingContent
            });
        }
        
        return hasStack || hasMeaningfulPending;
    }

    /**
     * Check if pending content represents a meaningful incomplete tool block
     * vs just partial tag starts that should be ignored
     */
    private hasMeaningfulPendingContent(): boolean {
        if (!this.pendingContent) return false;
        
        // Ignore simple partial tag starts - these are not meaningful incomplete blocks
        const trimmed = this.pendingContent.trim();
        if (trimmed === '<' || 
            trimmed === '<t' || 
            trimmed === '<to' || 
            trimmed === '<too' || 
            trimmed === '<tool') {
            return false;
        }
        
        // Consider it meaningful if it looks like it has actual tool content
        return trimmed.includes('<tool>') || trimmed.length > 10;
    }

    /**
     * Get current tool stack depth
     */
    public getToolDepth(): number {
        return this.toolStack.length;
    }

    /**
     * Get any pending content that couldn't be fully processed
     */
    public getPendingContent(): string {
        return this.pendingContent;
    }

    /**
     * Reset the handler state
     */
    public reset(): void {
        this.toolStack = [];
        this.currentToolId = 0;
        this.pendingContent = '';
        console.log('🔧 Tool Handler: State reset');
    }

    /**
     * Finalize any incomplete tool blocks (for error recovery)
     * @returns Any pending tool content that was incomplete
     */
    public finalize(): string {
        const pending = this.pendingContent;
        const stackContent = this.toolStack.join('');
        const hasMeaningfulPending = this.hasMeaningfulPendingContent();
        
        console.log('🔧 Tool Handler: finalize() called:', {
            pendingContent: pending,
            stackContent: stackContent,
            stackLength: this.toolStack.length,
            hasMeaningfulPending: hasMeaningfulPending,
            willReturnContent: !!(stackContent || hasMeaningfulPending)
        });
        
        this.reset();
        
        if (stackContent) {
            const result = pending + this.TOOL_START_TOKEN + stackContent;
            console.log('🔧 Tool Handler: finalize() returning stack content:', result);
            return result;
        }
        
        if (hasMeaningfulPending) {
            console.log('🔧 Tool Handler: finalize() returning meaningful pending content:', pending);
            return pending;
        }
        
        console.log('🔧 Tool Handler: finalize() ignoring trivial pending content:', pending);
        return '';
    }
}

// Export singleton instance
export const toolTokenHandler = ToolTokenHandler.getInstance();