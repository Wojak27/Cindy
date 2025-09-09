/**
 * ToolTokenHandler.ts (Renderer)
 * 
 * Service for parsing and handling tool tokens in real-time during streaming on the renderer side.
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

interface ProcessedContent {
    displayContent: string;
    toolCalls: ToolCall[];
    rawContent: string;
}

export class ToolTokenHandler {
    private static instance: ToolTokenHandler;
    private toolStack: string[] = [];
    private currentToolId = 0;
    private readonly TOOL_START_TOKEN = '<tool>';
    private readonly TOOL_END_TOKEN = '</tool>';
    private readonly ERROR_START_TOKEN = '<error>';
    private readonly ERROR_END_TOKEN = '</error>';
    private readonly TOKEN_REGEX = new RegExp(`${this.TOOL_START_TOKEN}|${this.TOOL_END_TOKEN}|${this.ERROR_START_TOKEN}|${this.ERROR_END_TOKEN}`, 'g');

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
    public processChunk(chunk: string, conversationId: string): ProcessedContent {


        if (!chunk) {
            return {
                displayContent: '',
                toolCalls: [],
                rawContent: ''
            };
        }

        const result: ProcessedContent = {
            displayContent: '',
            toolCalls: [],
            rawContent: chunk
        };

        // Reset regex lastIndex to ensure proper matching
        this.TOKEN_REGEX.lastIndex = 0;

        let match;
        let lastIndex = 0;
        let displayContent = '';
        let inToolBlock = this.toolStack.length > 0;

        // Process all tokens in the chunk
        while ((match = this.TOKEN_REGEX.exec(chunk)) !== null) {
            const token = match[0];
            const tokenIndex = match.index;

            // Add content before the token to appropriate section
            const contentBeforeToken = chunk.slice(lastIndex, tokenIndex);

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
            if (token === this.TOOL_START_TOKEN || token === this.ERROR_START_TOKEN) {
                // Start of tool or error block
                this.toolStack.push('');
                inToolBlock = true;
            } else if (token === this.TOOL_END_TOKEN || token === this.ERROR_END_TOKEN) {
                // End of tool or error block
                if (this.toolStack.length > 0) {
                    const toolContent = this.toolStack.pop() || '';
                    const isError = token === this.ERROR_END_TOKEN;
                    const toolCall = this.parseToolCall(toolContent, conversationId, isError);

                    if (toolCall) {

                        result.toolCalls.push(toolCall);
                    } else {
                        // If parsing fails, treat it as display content
                        const startToken = isError ? this.ERROR_START_TOKEN : this.TOOL_START_TOKEN;
                        displayContent += startToken + toolContent + token;
                    }
                }
                inToolBlock = this.toolStack.length > 0;
            }

            lastIndex = this.TOKEN_REGEX.lastIndex;
        }

        // Handle remaining content after the last token
        const remainingContent = chunk.slice(lastIndex);
        if (inToolBlock && this.toolStack.length > 0) {
            this.toolStack[this.toolStack.length - 1] += remainingContent;
        } else {
            displayContent += remainingContent;
        }

        result.displayContent = displayContent;



        return result;
    }

    /**
     * Parse tool call content into structured format
     * @param content - The tool call content (JSON string)
     * @param conversationId - The conversation ID
     * @param isError - Whether this is an error block
     * @returns Parsed tool call or null if parsing fails
     */
    private parseToolCall(content: string, conversationId: string, isError: boolean = false): ToolCall | null {
        try {
            // Debug log before cleaning
            console.debug("[ToolTokenHandler] Raw incoming content chunk:", JSON.stringify(content));
            
            // Clean up the content: preserve leading spaces from streaming tokens,
            // remove only trailing newlines, spaces, and stray backslashes
            let cleanContent = content;

            // Remove trailing backslashes that might appear from malformed XML
            cleanContent = cleanContent.replace(/\\+$/, "");

            // Remove only trailing whitespace (not leading!)
            cleanContent = cleanContent.replace(/[\n\r\s]*$/, "");

            // Debug log after cleaning
            console.debug("[ToolTokenHandler] Cleaned content chunk:", JSON.stringify(cleanContent));



            const parsed = JSON.parse(cleanContent);

            if (!parsed.name) {
                return null;
            }

            const toolCall: ToolCall = {
                id: `tool-${conversationId}-${this.currentToolId++}`,
                name: parsed.name,
                parameters: parsed.parameters || {},
                status: isError ? 'failed' : 'pending',
                error: isError ? (parsed.error || 'Unknown error') : undefined,
                startTime: Date.now()
            };



            return toolCall;
        } catch (error) {
            return null;
        }
    }

    /**
     * Get incomplete tool calls that are currently being processed
     * This allows showing tool calls before the closing </tool> tag
     * @param conversationId - The conversation ID for generating tool call IDs
     * @returns Array of incomplete tool calls
     */
    public getIncompleteToolCalls(conversationId: string): ToolCall[] {
        const incompleteToolCalls: ToolCall[] = [];

        // Process current tool stack content
        this.toolStack.forEach((toolContent, index) => {
            if (toolContent.trim()) {
                try {
                    // Try to parse partial JSON to extract tool name and parameters
                    const partialToolCall = this.parsePartialToolCall(toolContent, conversationId, index);
                    if (partialToolCall) {
                        incompleteToolCalls.push(partialToolCall);
                    }
                } catch (error) {
                    // If parsing fails, create a basic incomplete tool call
                    incompleteToolCalls.push({
                        id: `incomplete-tool-${conversationId}-${index}`,
                        name: 'parsing...',
                        parameters: {},
                        status: 'pending',
                        startTime: Date.now()
                    });
                }
            }
        });

        return incompleteToolCalls;
    }

    /**
     * Parse partial tool call JSON content
     * @param content - Partial tool call content
     * @param conversationId - Conversation ID
     * @param index - Stack index for unique ID
     * @returns Partial tool call or null if not parseable
     */
    private parsePartialToolCall(content: string, conversationId: string, index: number): ToolCall | null {
        try {
            // Clean up content
            let cleanContent = content.trim();

            // Try to extract name from partial JSON
            let toolName = 'parsing...';
            let toolParameters = {};

            // Look for name field
            const nameMatch = cleanContent.match(/"name"\s*:\s*"([^"]+)"/);
            if (nameMatch) {
                toolName = nameMatch[1];
            }

            // Look for parameters field
            const parametersMatch = cleanContent.match(/"parameters"\s*:\s*(\{[^}]*\}?)/);
            if (parametersMatch) {
                try {
                    const paramStr = parametersMatch[1];
                    // Try to parse parameters, adding closing brace if needed
                    let completeParamStr = paramStr;
                    if (!paramStr.endsWith('}')) {
                        completeParamStr = paramStr + '}';
                    }
                    toolParameters = JSON.parse(completeParamStr);
                } catch (paramError) {
                    // Parameters not fully formed yet
                    toolParameters = { parsing: 'in progress...' };
                }
            }

            return {
                id: `incomplete-tool-${conversationId}-${index}`,
                name: toolName,
                parameters: toolParameters,
                status: 'pending',
                startTime: Date.now()
            };

        } catch (error) {
            return null;
        }
    }

    /**
     * Check if currently processing a tool block
     */
    public isProcessingTool(): boolean {
        return this.toolStack.length > 0;
    }

    /**
     * Get current tool stack depth
     */
    public getToolDepth(): number {
        return this.toolStack.length;
    }

    /**
     * Reset the handler state
     */
    public reset(): void {
        this.toolStack = [];
        this.currentToolId = 0;
    }
}

// Export singleton instance
export const toolTokenHandler = ToolTokenHandler.getInstance();