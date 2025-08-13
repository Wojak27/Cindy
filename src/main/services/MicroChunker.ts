import { EventEmitter } from 'events';

export interface MicroChunkConfig {
    mode: 'sentence' | 'micro';
    lookaheadTokens: number;
    chunkTokenBudget: number;
    timeBudgetMs: number;
    crossfadeMs: number;
    forceFlushTimeoutMs: number;
}

export interface MicroChunk {
    id: string;
    text: string;
    context: {
        sentenceId: string;
        positionInSentence: number;
        isLastInSentence: boolean;
        hasLookahead: boolean;
    };
    timestampQueued: number;
    tokens: string[];
}

export interface ChunkMetrics {
    firstAudioTimeMs?: number;
    chunkSynthTimeMs?: number;
    audioBufferMs?: number;
    underrunsPerMin?: number;
    chunkSizeTokens?: number;
    microRetimeUsed?: boolean;
}

/**
 * Punctuation-Aware Micro-Chunker for Low-Latency TTS Streaming
 * 
 * Replaces sentence-batched chunking with sub-sentence micro-chunks
 * that respect punctuation, token budgets, and time constraints.
 */
export class MicroChunker extends EventEmitter {
    private config: MicroChunkConfig;
    private chunkBuffer: string[] = [];
    private lookaheadBuffer: string[] = [];
    private currentSentenceId: string = '';
    private positionInSentence: number = 0;
    private lastEmissionTime: number = 0;
    private forceFlushTimer: NodeJS.Timeout | null = null;
    private metrics: ChunkMetrics = {};

    // Punctuation patterns
    private readonly SOFT_PUNCTUATION = /[,:;—]/;
    private readonly HARD_PUNCTUATION = /[.!?]/;
    private readonly SENTENCE_ENDINGS = /[.!?]+\s*/;

    constructor(config: Partial<MicroChunkConfig> = {}) {
        super();

        this.config = {
            mode: 'micro',
            lookaheadTokens: 4,
            chunkTokenBudget: 16,
            timeBudgetMs: 250,
            crossfadeMs: 10,
            forceFlushTimeoutMs: 500,
            ...config
        };

        console.log('[MicroChunker] Initialized with config:', this.config);
    }

    /**
     * Process text input and emit micro-chunks
     * Supports both complete text and streaming token inputs
     */
    async processText(text: string): Promise<MicroChunk[]> {
        if (this.config.mode === 'sentence') {
            return this.processSentenceMode(text);
        }

        // Tokenize text for micro-chunking
        const tokens = this.tokenizeText(text);
        return this.processMicroMode(tokens);
    }

    /**
     * Process streaming token deltas (for real-time LLM output)
     */
    processTokenDelta(textDelta: string, isFinal: boolean = false): MicroChunk | null {
        if (this.config.mode === 'sentence') {
            // In sentence mode, buffer until sentence completion
            this.chunkBuffer.push(textDelta);
            if (isFinal || this.SENTENCE_ENDINGS.test(textDelta)) {
                const sentenceText = this.chunkBuffer.join('').trim();
                this.chunkBuffer = [];
                if (sentenceText) {
                    return this.createSentenceChunk(sentenceText);
                }
            }
            return null;
        }

        // Micro mode: process each token delta
        const tokens = this.tokenizeText(textDelta);
        const chunks: MicroChunk[] = [];

        for (const token of tokens) {
            this.chunkBuffer.push(token);

            const chunk = this.checkEmissionTriggers(isFinal);
            if (chunk) {
                chunks.push(chunk);
            }
        }

        // Return the first chunk or null
        return chunks.length > 0 ? chunks[0] : null;
    }

    /**
     * Check if any emission triggers are met
     */
    private checkEmissionTriggers(forceFinal: boolean = false): MicroChunk | null {
        const now = Date.now();
        const timeSinceLastEmission = now - this.lastEmissionTime;
        const currentText = this.chunkBuffer.join('');

        // Reset force flush timer on activity
        this.resetForceFlushTimer();

        // Trigger conditions (in order of priority):

        // 1. Hard punctuation (sentence endings) - always flush
        if (this.HARD_PUNCTUATION.test(currentText)) {
            return this.emitChunk(true);
        }

        // 2. Force final or force timeout
        if (forceFinal) {
            return this.chunkBuffer.length > 0 ? this.emitChunk(true) : null;
        }

        // 3. Soft punctuation with reasonable length
        if (this.SOFT_PUNCTUATION.test(currentText) && this.chunkBuffer.length >= 3) {
            return this.emitChunk(false);
        }

        // 4. Token budget exceeded
        if (this.chunkBuffer.length >= this.config.chunkTokenBudget) {
            return this.emitChunk(false);
        }

        // 5. Time budget exceeded
        if (timeSinceLastEmission >= this.config.timeBudgetMs && this.chunkBuffer.length > 0) {
            return this.emitChunk(false);
        }

        // Start force flush timer if this is first token
        if (this.chunkBuffer.length === 1) {
            this.startForceFlushTimer();
        }

        return null;
    }

    /**
     * Emit a micro-chunk with lookahead
     */
    private emitChunk(isEndOfSentence: boolean): MicroChunk {
        const chunkTokens = [...this.chunkBuffer];
        const chunkText = chunkTokens.join('');

        // Update sentence tracking
        if (isEndOfSentence) {
            this.currentSentenceId = `sentence_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            this.positionInSentence = 0;
        } else {
            this.positionInSentence++;
        }

        // Create chunk with context
        const chunk: MicroChunk = {
            id: `chunk_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            text: chunkText.trim(),
            context: {
                sentenceId: this.currentSentenceId,
                positionInSentence: this.positionInSentence,
                isLastInSentence: isEndOfSentence,
                hasLookahead: this.lookaheadBuffer.length > 0
            },
            timestampQueued: Date.now(),
            tokens: chunkTokens
        };

        // Clear emitted tokens from buffer
        this.chunkBuffer = [];
        this.lastEmissionTime = Date.now();

        // Reset force flush timer
        this.resetForceFlushTimer();

        // Emit metrics
        this.updateMetrics(chunk);

        console.log(`[MicroChunker] Emitted chunk: "${chunk.text}" (${chunk.tokens.length} tokens)`);

        return chunk;
    }

    /**
     * Fallback to sentence mode processing
     */
    private processSentenceMode(text: string): MicroChunk[] {
        const sentences = this.splitIntoSentences(text);
        return sentences.map(sentence => this.createSentenceChunk(sentence));
    }

    /**
     * Process text in micro mode
     */
    private processMicroMode(tokens: string[]): MicroChunk[] {
        const chunks: MicroChunk[] = [];

        for (const token of tokens) {
            this.chunkBuffer.push(token);
            const chunk = this.checkEmissionTriggers();
            if (chunk) {
                chunks.push(chunk);
            }
        }

        // Flush any remaining tokens
        if (this.chunkBuffer.length > 0) {
            const finalChunk = this.emitChunk(true);
            chunks.push(finalChunk);
        }

        return chunks;
    }

    /**
     * Create a sentence-mode chunk
     */
    private createSentenceChunk(text: string): MicroChunk {
        const sentenceId = `sentence_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

        return {
            id: `chunk_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            text: text.trim(),
            context: {
                sentenceId,
                positionInSentence: 0,
                isLastInSentence: true,
                hasLookahead: false
            },
            timestampQueued: Date.now(),
            tokens: this.tokenizeText(text)
        };
    }

    /**
     * Simple tokenization (word-based with punctuation separation)
     */
    private tokenizeText(text: string): string[] {
        return text
            .split(/(\s+|[^\w\s])/g)
            .filter(token => token.trim().length > 0);
    }

    /**
     * Split text into sentences (fallback for sentence mode)
     */
    private splitIntoSentences(text: string): string[] {
        const sentences = text
            .split(this.SENTENCE_ENDINGS)
            .map(s => s.trim())
            .filter(s => s.length > 0);

        // Add back punctuation
        const matches = text.match(this.SENTENCE_ENDINGS);
        if (matches) {
            return sentences.map((sentence, i) =>
                sentence + (matches[i] || '.')
            );
        }

        return sentences.length > 0 ? sentences : [text];
    }

    /**
     * Start force flush timer
     */
    private startForceFlushTimer(): void {
        this.resetForceFlushTimer();

        this.forceFlushTimer = setTimeout(() => {
            if (this.chunkBuffer.length > 0) {
                console.log('[MicroChunker] Force flush timeout triggered');
                const chunk = this.emitChunk(false);
                this.emit('chunk', chunk);
            }
        }, this.config.forceFlushTimeoutMs);
    }

    /**
     * Reset force flush timer
     */
    private resetForceFlushTimer(): void {
        if (this.forceFlushTimer) {
            clearTimeout(this.forceFlushTimer);
            this.forceFlushTimer = null;
        }
    }

    /**
     * Update chunking metrics
     */
    private updateMetrics(chunk: MicroChunk): void {
        this.metrics.chunkSizeTokens = chunk.tokens.length;

        // Track first audio time if this is first chunk
        if (chunk.context.positionInSentence === 0) {
            this.metrics.firstAudioTimeMs = Date.now() - chunk.timestampQueued;
        }

        this.emit('metrics', this.metrics);
    }

    /**
     * Update configuration at runtime (hot-reloadable)
     */
    updateConfig(newConfig: Partial<MicroChunkConfig>): void {
        const oldMode = this.config.mode;
        this.config = { ...this.config, ...newConfig };

        console.log('[MicroChunker] Config updated:', this.config);

        // Reset state if mode changed
        if (oldMode !== this.config.mode) {
            this.reset();
        }

        this.emit('configUpdated', this.config);
    }

    /**
     * Reset chunker state
     */
    reset(): void {
        this.chunkBuffer = [];
        this.lookaheadBuffer = [];
        this.currentSentenceId = '';
        this.positionInSentence = 0;
        this.lastEmissionTime = 0;
        this.resetForceFlushTimer();
        this.metrics = {};

        console.log('[MicroChunker] State reset');
    }

    /**
     * Get current configuration
     */
    getConfig(): MicroChunkConfig {
        return { ...this.config };
    }

    /**
     * Get current metrics
     */
    getMetrics(): ChunkMetrics {
        return { ...this.metrics };
    }

    /**
     * Cleanup resources
     */
    cleanup(): void {
        this.resetForceFlushTimer();
        this.removeAllListeners();
        console.log('[MicroChunker] Cleanup completed');
    }
}