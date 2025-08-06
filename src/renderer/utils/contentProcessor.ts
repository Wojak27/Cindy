/**
 * ContentProcessor.ts
 * 
 * Utility for processing message content to extract thinking blocks and format code blocks
 * Works on both new streaming content and existing stored messages
 */

export interface ProcessedContent {
    displayContent: string;
    thinkingBlocks: ThinkingBlock[];
    hasCodeBlocks: boolean;
}

export interface ThinkingBlock {
    id: string;
    content: string;
    startTime: number;
    endTime?: number;
    duration?: string;
    messageId?: string;
}

export class ContentProcessor {
    private static readonly THINKING_START_TOKEN = '<think>';
    private static readonly THINKING_END_TOKEN = '</think>';
    private static readonly CODE_BLOCK_REGEX = /```(\w+)?\n([\s\S]*?)```/g;

    /**
     * Process message content to extract thinking blocks and format code blocks
     * @param content - Raw message content
     * @param messageId - ID of the message this content belongs to
     * @param conversationId - ID of the conversation
     * @returns Processed content with thinking blocks and formatted code
     */
    static processMessageContent(
        content: string, 
        messageId: string, 
        conversationId: string
    ): ProcessedContent {
        if (!content) {
            return {
                displayContent: '',
                thinkingBlocks: [],
                hasCodeBlocks: false
            };
        }

        // First extract thinking blocks
        const { displayContent, thinkingBlocks } = this.extractThinkingBlocks(
            content, 
            messageId, 
            conversationId
        );

        // Then process code blocks in the display content
        const formattedContent = this.formatCodeBlocks(displayContent);
        const hasCodeBlocks = this.CODE_BLOCK_REGEX.test(displayContent);

        return {
            displayContent: formattedContent,
            thinkingBlocks,
            hasCodeBlocks
        };
    }

    /**
     * Extract thinking blocks from content
     */
    private static extractThinkingBlocks(
        content: string, 
        messageId: string, 
        conversationId: string
    ): { displayContent: string; thinkingBlocks: ThinkingBlock[] } {
        const thinkingBlocks: ThinkingBlock[] = [];
        let displayContent = '';
        let blockCounter = 0;

        // Split content by thinking tokens
        const parts = content.split(/(<think>|<\/think>)/g);
        let insideThinking = false;
        let currentThinkingContent = '';

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];

            if (part === this.THINKING_START_TOKEN) {
                insideThinking = true;
                currentThinkingContent = '';
            } else if (part === this.THINKING_END_TOKEN) {
                if (insideThinking && currentThinkingContent.trim()) {
                    // Create thinking block
                    const blockId = `thinking-${conversationId}-${messageId}-${blockCounter++}`;
                    thinkingBlocks.push({
                        id: blockId,
                        content: currentThinkingContent.trim(),
                        startTime: Date.now(),
                        endTime: Date.now(),
                        messageId: messageId,
                        duration: '00:00'
                    });
                }
                insideThinking = false;
                currentThinkingContent = '';
            } else {
                if (insideThinking) {
                    currentThinkingContent += part;
                } else {
                    displayContent += part;
                }
            }
        }

        return { displayContent, thinkingBlocks };
    }

    /**
     * Format code blocks with syntax highlighting classes
     */
    private static formatCodeBlocks(content: string): string {
        return content.replace(this.CODE_BLOCK_REGEX, (match, language, code) => {
            const lang = language || 'text';
            const escapedCode = this.escapeHtml(code.trim());
            
            return `<div class="code-block-container">
                <div class="code-block-header">
                    <span class="code-block-language">${lang}</span>
                    <button class="code-block-copy" onclick="navigator.clipboard.writeText(\`${code.trim().replace(/`/g, '\\`')}\`)">
                        📋 Copy
                    </button>
                </div>
                <pre class="code-block"><code class="language-${lang}">${escapedCode}</code></pre>
            </div>`;
        });
    }

    /**
     * Escape HTML characters
     */
    private static escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Process all existing messages in a conversation
     * @param messages - Array of messages to process
     * @param conversationId - ID of the conversation
     * @returns Updated messages with extracted thinking blocks
     */
    static processExistingMessages(
        messages: any[], 
        conversationId: string
    ): { updatedMessages: any[]; extractedThinkingBlocks: ThinkingBlock[] } {
        const updatedMessages = [];
        const extractedThinkingBlocks: ThinkingBlock[] = [];

        for (const message of messages) {
            if (message.role === 'assistant' && message.content) {
                const processed = this.processMessageContent(
                    message.content, 
                    message.id, 
                    conversationId
                );

                // Update message content with processed content
                const updatedMessage = {
                    ...message,
                    content: processed.displayContent,
                    hasCodeBlocks: processed.hasCodeBlocks
                };

                updatedMessages.push(updatedMessage);
                extractedThinkingBlocks.push(...processed.thinkingBlocks);
            } else {
                // Non-assistant messages pass through unchanged
                updatedMessages.push(message);
            }
        }

        return { updatedMessages, extractedThinkingBlocks };
    }

    /**
     * Check if content contains thinking tokens
     */
    static hasThinkingTokens(content: string): boolean {
        return content.includes(this.THINKING_START_TOKEN) || content.includes(this.THINKING_END_TOKEN);
    }

    /**
     * Check if content contains code blocks
     */
    static hasCodeBlocks(content: string): boolean {
        return this.CODE_BLOCK_REGEX.test(content);
    }
}

export default ContentProcessor;