/**
 * ThinkingTokenHandler.ts
 * 
 * Service for parsing and handling thinking tokens in real-time during streaming.
 * Extracts thinking blocks from streaming chunks and separates them from display content.
 */

interface ThinkingBlock {
    id: string;
    content: string;
    startTime: number;
    endTime?: number;
    duration?: string;
    isStreaming?: boolean;  // Flag for ongoing thinking
}

interface ProcessedContent {
    displayContent: string;
    thinkingBlocks: ThinkingBlock[];
    rawContent: string;
}

export class ThinkingTokenHandler {
    private static instance: ThinkingTokenHandler;
    private thinkingStack: {content: string, id: string, startTime: number}[] = [];
    private currentBlockId = 0;
    private readonly TOKEN_REGEX = /<think[^>]*>|<\/think[^>]*>/g;

    private constructor() { }

    /**
     * Get singleton instance
     */
    public static getInstance(): ThinkingTokenHandler {
        if (!ThinkingTokenHandler.instance) {
            ThinkingTokenHandler.instance = new ThinkingTokenHandler();
        }
        return ThinkingTokenHandler.instance;
    }

    /**
     * Process a chunk of streaming content to extract thinking blocks
     * @param chunk - The incoming stream chunk
     * @param conversationId - The current conversation ID
     * @returns Processed content with thinking blocks separated
     */
    public processChunk(chunk: string, conversationId: string): ProcessedContent {
        console.log('🐛 DEBUG - ThinkingTokenHandler.processChunk called:', {
            chunkLength: chunk?.length || 0,
            chunkPreview: chunk?.substring(0, 100) + '...',
            conversationId,
            currentStackDepth: this.thinkingStack.length
        });

        if (!chunk) {
            console.log('🐛 DEBUG - ThinkingTokenHandler: Empty chunk, returning empty result');
            return {
                displayContent: '',
                thinkingBlocks: [],
                rawContent: ''
            };
        }

        const result: ProcessedContent = {
            displayContent: '',
            thinkingBlocks: [],
            rawContent: chunk
        };

        // Reset regex lastIndex to ensure proper matching
        this.TOKEN_REGEX.lastIndex = 0;

        let match;
        let lastIndex = 0;
        let displayContent = '';
        let inThinkingBlock = this.thinkingStack.length > 0;

        // Process all tokens in the chunk
        while ((match = this.TOKEN_REGEX.exec(chunk)) !== null) {
            const token = match[0];
            const tokenIndex = match.index;

            // Add content before the token to appropriate section
            const contentBeforeToken = chunk.slice(lastIndex, tokenIndex);

            if (inThinkingBlock) {
                // We're inside a thinking block, so add to the current block
                if (this.thinkingStack.length > 0) {
                    this.thinkingStack[this.thinkingStack.length - 1].content += contentBeforeToken;
                }
            } else {
                // We're in display content, so add to display
                displayContent += contentBeforeToken;
            }

            // Handle the token
            if (token.startsWith('<think')) {
                // Start of thinking block - parse attributes
                console.log('🐛 DEBUG - ThinkingTokenHandler: Found thinking start token:', token);
                
                const idMatch = token.match(/id="([^"]*)"/) || token.match(/id='([^']*)'/);
                const startMatch = token.match(/start="([^"]*)"/) || token.match(/start='([^']*)'/);
                
                const blockId = idMatch ? idMatch[1] : `thinking-${conversationId}-${this.currentBlockId++}`;
                const startTime = startMatch ? parseInt(startMatch[1]) : Date.now();
                
                this.thinkingStack.push({
                    content: '',
                    id: blockId,
                    startTime: startTime
                });
                inThinkingBlock = true;
                
                // Immediately emit incomplete thinking block for display
                result.thinkingBlocks.push({
                    id: blockId,
                    content: '',
                    startTime: startTime,
                    isStreaming: true
                });
                
                console.log('🐛 DEBUG - ThinkingTokenHandler: Started thinking block immediately:', {
                    blockId,
                    startTime
                });
                
            } else if (token.startsWith('</think')) {
                // End of thinking block - parse attributes
                console.log('🐛 DEBUG - ThinkingTokenHandler: Found thinking end token:', token);
                
                if (this.thinkingStack.length > 0) {
                    const thinkingBlock = this.thinkingStack.pop()!;
                    const endMatch = token.match(/end="([^"]*)"/) || token.match(/end='([^']*)'/);
                    const endTime = endMatch ? parseInt(endMatch[1]) : Date.now();
                    
                    console.log('🐛 DEBUG - ThinkingTokenHandler: Completed thinking block:', {
                        blockId: thinkingBlock.id,
                        contentLength: thinkingBlock.content.length,
                        contentPreview: thinkingBlock.content.substring(0, 50) + '...',
                        startTime: thinkingBlock.startTime,
                        endTime: endTime
                    });

                    // Add completed thinking block (will replace the streaming one)
                    result.thinkingBlocks.push({
                        id: thinkingBlock.id,
                        content: thinkingBlock.content,
                        startTime: thinkingBlock.startTime,
                        endTime: endTime,
                        isStreaming: false
                    });
                }
                inThinkingBlock = this.thinkingStack.length > 0;
            }

            lastIndex = this.TOKEN_REGEX.lastIndex;
        }

        // Handle remaining content after the last token
        const remainingContent = chunk.slice(lastIndex);
        if (inThinkingBlock && this.thinkingStack.length > 0) {
            this.thinkingStack[this.thinkingStack.length - 1].content += remainingContent;
        } else {
            displayContent += remainingContent;
        }

        result.displayContent = displayContent;

        console.log('🐛 DEBUG - ThinkingTokenHandler.processChunk result:', {
            displayContentLength: result.displayContent.length,
            displayContentPreview: result.displayContent.substring(0, 50) + '...',
            thinkingBlocksCount: result.thinkingBlocks.length,
            finalStackDepth: this.thinkingStack.length
        });

        return result;
    }

    /**
     * Get incomplete thinking blocks that are currently streaming
     * @param conversationId - The current conversation ID
     * @returns Array of incomplete thinking blocks
     */
    public getIncompleteThinkingBlocks(conversationId: string): ThinkingBlock[] {
        return this.thinkingStack.map(block => ({
            id: block.id,
            content: block.content,
            startTime: block.startTime,
            isStreaming: true
        }));
    }

    /**
     * Finalize thinking blocks when stream completes
     * @param thinkingBlocks - Array of thinking blocks to finalize
     * @returns Thinking blocks with duration calculated
     */
    public finalizeThinkingBlocks(thinkingBlocks: ThinkingBlock[]): ThinkingBlock[] {
        const now = Date.now();
        return thinkingBlocks.map(block => {
            if (!block.endTime) {
                block.endTime = now;
            }

            const durationMs = block.endTime - block.startTime;
            const seconds = Math.floor(durationMs / 1000);
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;

            block.duration = `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;

            return block;
        });
    }

    /**
     * Check if currently processing a thinking block
     */
    public isProcessingThinking(): boolean {
        return this.thinkingStack.length > 0;
    }

    /**
     * Get current thinking stack depth
     */
    public getThinkingDepth(): number {
        return this.thinkingStack.length;
    }

    /**
     * Reset the handler state
     */
    public reset(): void {
        this.thinkingStack = [];
        this.currentBlockId = 0;
    }

    /**
     * Clear incomplete thinking blocks (for cleanup)
     */
    public clearIncompleteBlocks(): void {
        // Any cleanup logic if needed in the future
    }
}

// Export singleton instance
export const thinkingTokenHandler = ThinkingTokenHandler.getInstance();