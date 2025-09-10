import { EventEmitter } from 'events';
import type { MicroChunkConfig } from './MicroChunker.ts';

export interface BackpressureMetrics {
    estimatedClientBufferMs: number;
    serverTtsQueueLength: number;
    underrunsInLastMinute: number;
    avgChunkSynthTimeMs: number;
    lastBufferUpdateTimestamp: number;
}

export interface BackpressureAdjustments {
    lookaheadTokens: number;
    chunkTokenBudget: number;
    timeBudgetMs: number;
    shouldThrottle: boolean;
    reason: string;
}

/**
 * Backpressure Controller for Adaptive TTS Streaming
 * 
 * Monitors client audio buffer depth and TTS queue to dynamically
 * adjust chunking parameters for optimal streaming performance.
 */
export class BackpressureController extends EventEmitter {
    private metrics: BackpressureMetrics = {
        estimatedClientBufferMs: 0,
        serverTtsQueueLength: 0,
        underrunsInLastMinute: 0,
        avgChunkSynthTimeMs: 0,
        lastBufferUpdateTimestamp: 0
    };

    private synthTimeHistory: number[] = [];
    private underrunHistory: { timestamp: number }[] = [];
    private readonly MAX_HISTORY_LENGTH = 20;
    private readonly UNDERRUN_WINDOW_MS = 60000; // 1 minute

    // Buffer thresholds (in milliseconds)
    private readonly HIGH_BUFFER_THRESHOLD = 1500;   // > 1.5s: increase chunks
    private readonly LOW_BUFFER_THRESHOLD = 80;      // < 80ms: reduce chunks
    private readonly CRITICAL_LOW_THRESHOLD = 40;    // < 40ms: emergency mode

    constructor() {
        super();
        console.log('[BackpressureController] Initialized');
    }

    /**
     * Update client buffer telemetry
     */
    updateClientBuffer(bufferedMs: number, underruns: number = 0): void {
        this.metrics.estimatedClientBufferMs = bufferedMs;
        this.metrics.lastBufferUpdateTimestamp = Date.now();

        // Track underruns
        if (underruns > 0) {
            for (let i = 0; i < underruns; i++) {
                this.underrunHistory.push({ timestamp: Date.now() });
            }
            this.cleanupUnderrunHistory();
        }

        this.updateUnderrunMetrics();
        this.emit('bufferUpdate', this.metrics);

        console.log(`[BackpressureController] Buffer: ${bufferedMs}ms, Underruns: ${this.metrics.underrunsInLastMinute}`);
    }

    /**
     * Update server-side TTS queue metrics
     */
    updateServerQueue(queueLength: number): void {
        this.metrics.serverTtsQueueLength = queueLength;
    }

    /**
     * Record TTS synthesis time for a chunk
     */
    recordSynthTime(synthTimeMs: number): void {
        this.synthTimeHistory.push(synthTimeMs);

        // Keep only recent history
        if (this.synthTimeHistory.length > this.MAX_HISTORY_LENGTH) {
            this.synthTimeHistory.shift();
        }

        // Update average
        this.metrics.avgChunkSynthTimeMs =
            this.synthTimeHistory.reduce((sum, time) => sum + time, 0) / this.synthTimeHistory.length;
    }

    /**
     * Calculate backpressure adjustments based on current metrics
     */
    calculateAdjustments(baseConfig: MicroChunkConfig): BackpressureAdjustments {
        const buffer = this.metrics.estimatedClientBufferMs;
        const queueLength = this.metrics.serverTtsQueueLength;
        const underruns = this.metrics.underrunsInLastMinute;

        // Default adjustments (no change)
        let adjustments: BackpressureAdjustments = {
            lookaheadTokens: baseConfig.lookaheadTokens,
            chunkTokenBudget: baseConfig.chunkTokenBudget,
            timeBudgetMs: baseConfig.timeBudgetMs,
            shouldThrottle: false,
            reason: 'no_adjustment_needed'
        };

        // High buffer condition: increase chunk sizes to reduce overhead
        if (buffer > this.HIGH_BUFFER_THRESHOLD) {
            adjustments = {
                lookaheadTokens: Math.min(baseConfig.lookaheadTokens + 2, 6),
                chunkTokenBudget: Math.min(baseConfig.chunkTokenBudget + 8, 24),
                timeBudgetMs: baseConfig.timeBudgetMs + 100,
                shouldThrottle: false,
                reason: `high_buffer_${buffer}ms_increase_chunks`
            };
        }
        // Low buffer condition: decrease chunk sizes for faster emission
        else if (buffer < this.LOW_BUFFER_THRESHOLD || underruns >= 2) {
            adjustments = {
                lookaheadTokens: Math.max(baseConfig.lookaheadTokens - 1, 3),
                chunkTokenBudget: Math.max(baseConfig.chunkTokenBudget - 4, 8),
                timeBudgetMs: Math.max(baseConfig.timeBudgetMs - 50, 150),
                shouldThrottle: false,
                reason: `low_buffer_${buffer}ms_underruns_${underruns}_decrease_chunks`
            };
        }
        // Critical low buffer: emergency mode
        else if (buffer < this.CRITICAL_LOW_THRESHOLD) {
            adjustments = {
                lookaheadTokens: 3,
                chunkTokenBudget: 6,
                timeBudgetMs: 100,
                shouldThrottle: false,
                reason: `critical_low_buffer_${buffer}ms_emergency_mode`
            };
        }
        // High server queue: throttle to prevent overflow
        else if (queueLength > 5) {
            adjustments = {
                lookaheadTokens: baseConfig.lookaheadTokens,
                chunkTokenBudget: Math.min(baseConfig.chunkTokenBudget + 4, 20),
                timeBudgetMs: baseConfig.timeBudgetMs + 50,
                shouldThrottle: true,
                reason: `high_server_queue_${queueLength}_throttle`
            };
        }

        console.log(`[BackpressureController] Adjustments: ${adjustments.reason}`);
        this.emit('adjustments', adjustments);

        return adjustments;
    }

    /**
     * Estimate client buffer based on synthesis metrics
     * (fallback when client telemetry is unavailable)
     */
    estimateClientBuffer(): number {
        // Simple estimation based on average synthesis time and queue
        const avgSynthTime = this.metrics.avgChunkSynthTimeMs || 200;
        const queuedAudio = this.metrics.serverTtsQueueLength * avgSynthTime;

        // Assume some reasonable playback buffer
        return Math.max(queuedAudio - 500, 0);
    }

    /**
     * Get current backpressure metrics
     */
    getMetrics(): BackpressureMetrics {
        return { ...this.metrics };
    }

    /**
     * Check if system is under stress
     */
    isUnderStress(): boolean {
        return (
            this.metrics.estimatedClientBufferMs < this.LOW_BUFFER_THRESHOLD ||
            this.metrics.underrunsInLastMinute >= 2 ||
            this.metrics.serverTtsQueueLength > 5
        );
    }

    /**
     * Check if system has excess capacity
     */
    hasExcessCapacity(): boolean {
        return (
            this.metrics.estimatedClientBufferMs > this.HIGH_BUFFER_THRESHOLD &&
            this.metrics.underrunsInLastMinute === 0 &&
            this.metrics.serverTtsQueueLength <= 2
        );
    }

    /**
     * Clean up old underrun records
     */
    private cleanupUnderrunHistory(): void {
        const cutoff = Date.now() - this.UNDERRUN_WINDOW_MS;
        this.underrunHistory = this.underrunHistory.filter(
            record => record.timestamp > cutoff
        );
    }

    /**
     * Update underrun metrics
     */
    private updateUnderrunMetrics(): void {
        this.cleanupUnderrunHistory();
        this.metrics.underrunsInLastMinute = this.underrunHistory.length;
    }

    /**
     * Reset controller state
     */
    reset(): void {
        this.metrics = {
            estimatedClientBufferMs: 0,
            serverTtsQueueLength: 0,
            underrunsInLastMinute: 0,
            avgChunkSynthTimeMs: 0,
            lastBufferUpdateTimestamp: 0
        };

        this.synthTimeHistory = [];
        this.underrunHistory = [];

        console.log('[BackpressureController] State reset');
    }

    /**
     * Cleanup resources
     */
    cleanup(): void {
        this.reset();
        this.removeAllListeners();
        console.log('[BackpressureController] Cleanup completed');
    }
}