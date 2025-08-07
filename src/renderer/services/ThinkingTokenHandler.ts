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
}

interface ProcessedContent {
    displayContent: string;
    thinkingBlocks: ThinkingBlock[];
    rawContent: string;
}

export class ThinkingTokenHandler {
    private static instance: ThinkingTokenHandler;
    private thinkingStack: string[] = [];
    private currentBlockId = 0;
    private readonly THINKING_START_TOKEN = '<think>';
    private readonly THINKING_END_TOKEN = '</think>';
    private readonly TOKEN_REGEX = new RegExp(`${this.THINKING_START_TOKEN}|${this.THINKING_END_TOKEN}`, 'g');

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
                    this.thinkingStack[this.thinkingStack.length - 1] += contentBeforeToken;
                }
            } else {
                // We're in display content, so add to display
                displayContent += contentBeforeToken;
            }

            // Handle the token
            if (token === this.THINKING_START_TOKEN) {
                // Start of thinking block
                console.log('🐛 DEBUG - ThinkingTokenHandler: Found THINKING_START_TOKEN, starting new block');
                this.thinkingStack.push('');
                inThinkingBlock = true;
            } else if (token === this.THINKING_END_TOKEN) {
                // End of thinking block
                console.log('🐛 DEBUG - ThinkingTokenHandler: Found THINKING_END_TOKEN, finishing block');
                if (this.thinkingStack.length > 0) {
                    const thinkingContent = this.thinkingStack.pop() || '';
                    const blockId = `thinking-${conversationId}-${this.currentBlockId++}`;

                    console.log('🐛 DEBUG - ThinkingTokenHandler: Created thinking block:', {
                        blockId,
                        contentLength: thinkingContent.length,
                        contentPreview: thinkingContent.substring(0, 50) + '...',
                        startTime: Date.now()
                    });

                    result.thinkingBlocks.push({
                        id: blockId,
                        content: thinkingContent,
                        startTime: Date.now()
                    });
                }
                inThinkingBlock = this.thinkingStack.length > 0;
            }

            lastIndex = this.TOKEN_REGEX.lastIndex;
        }

        // Handle remaining content after the last token
        const remainingContent = chunk.slice(lastIndex);
        if (inThinkingBlock && this.thinkingStack.length > 0) {
            this.thinkingStack[this.thinkingStack.length - 1] += remainingContent;
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
     * Get incomplete thinking blocks that are currently being processed
     * This allows showing thinking blocks before the closing </think> tag
     * @param conversationId - The conversation ID for generating block IDs
     * @returns Array of incomplete thinking blocks
     */
    public getIncompleteThinkingBlocks(conversationId: string): ThinkingBlock[] {
        const incompleteBlocks: ThinkingBlock[] = [];
        
        // Process current thinking stack content
        this.thinkingStack.forEach((thinkingContent, index) => {
            if (thinkingContent.trim()) {
                incompleteBlocks.push({
                    id: `incomplete-thinking-${conversationId}-${index}`,
                    content: thinkingContent,
                    startTime: Date.now()
                });
            }
        });

        return incompleteBlocks;
    }
}

// Export singleton instance
export const thinkingTokenHandler = ThinkingTokenHandler.getInstance();