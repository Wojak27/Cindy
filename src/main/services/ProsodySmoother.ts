import { EventEmitter } from 'events';

export interface AudioSegment {
    id: string;
    audioData: Float32Array;
    sampleRate: number;
    startTimeMs: number;
    durationMs: number;
    chunkId: string;
}

export interface CrossfadeConfig {
    crossfadeMs: number;
    maxRetimesPerSentence: number;
    retimeThresholdMs: number;
}

export interface ProsodyCorrection {
    originalSegmentId: string;
    correctedSegmentId: string;
    crossfadeStartMs: number;
    crossfadeDurationMs: number;
    reason: string;
}

/**
 * Prosody Smoother for TTS Micro-Chunk Crossfading
 * 
 * Handles seamless audio transitions when late context requires
 * prosody corrections in micro-chunked TTS synthesis.
 */
export class ProsodySmoother extends EventEmitter {
    private config: CrossfadeConfig;
    private audioSegments: Map<string, AudioSegment> = new Map();
    private currentSentenceId: string = '';
    private retimesInCurrentSentence: number = 0;
    private pendingCorrections: Map<string, ProsodyCorrection> = new Map();

    constructor(config: Partial<CrossfadeConfig> = {}) {
        super();

        this.config = {
            crossfadeMs: 10,
            maxRetimesPerSentence: 1,
            retimeThresholdMs: 120,
            ...config
        };

        console.log('[ProsodySmoother] Initialized with config:', this.config);
    }

    /**
     * Register an audio segment for potential prosody correction
     */
    registerAudioSegment(segment: AudioSegment, sentenceId: string): void {
        // Reset retime counter for new sentences
        if (this.currentSentenceId !== sentenceId) {
            this.currentSentenceId = sentenceId;
            this.retimesInCurrentSentence = 0;
        }

        this.audioSegments.set(segment.id, segment);

        // Keep only recent segments to prevent memory bloat
        this.cleanupOldSegments();

        console.log(`[ProsodySmoother] Registered audio segment: ${segment.id} (${segment.durationMs}ms)`);
    }

    /**
     * Request prosody correction for a segment
     * Returns corrected audio with crossfade applied
     */
    requestProsodyCorrection(
        originalSegmentId: string,
        correctedAudioData: Float32Array,
        correctedSampleRate: number,
        reason: string = 'late_context_change'
    ): Float32Array | null {

        // Check if we've exceeded the retime limit for this sentence
        if (this.retimesInCurrentSentence >= this.config.maxRetimesPerSentence) {
            console.warn(`[ProsodySmoother] Retime limit reached for sentence: ${this.currentSentenceId}`);
            return null;
        }

        const originalSegment = this.audioSegments.get(originalSegmentId);
        if (!originalSegment) {
            console.warn(`[ProsodySmoother] Original segment not found: ${originalSegmentId}`);
            return null;
        }

        // Ensure sample rates match
        if (originalSegment.sampleRate !== correctedSampleRate) {
            console.warn(`[ProsodySmoother] Sample rate mismatch: ${originalSegment.sampleRate} vs ${correctedSampleRate}`);
            return null;
        }

        const crossfadeDurationMs = Math.min(this.config.crossfadeMs, originalSegment.durationMs / 2);
        const crossfadeSamples = Math.floor((crossfadeDurationMs / 1000) * originalSegment.sampleRate);

        // Calculate crossfade start point (end of original - crossfade duration)
        const originalLength = originalSegment.audioData.length;
        const crossfadeStartSample = Math.max(0, originalLength - crossfadeSamples);

        console.log(`[ProsodySmoother] Applying crossfade: ${crossfadeDurationMs}ms (${crossfadeSamples} samples)`);

        // Apply crossfade
        const correctedAudio = this.applyCrossfade(
            originalSegment.audioData,
            correctedAudioData,
            crossfadeStartSample,
            crossfadeSamples
        );

        // Record the correction
        const correction: ProsodyCorrection = {
            originalSegmentId,
            correctedSegmentId: `corrected_${originalSegmentId}_${Date.now()}`,
            crossfadeStartMs: (crossfadeStartSample / originalSegment.sampleRate) * 1000,
            crossfadeDurationMs,
            reason
        };

        this.pendingCorrections.set(correction.correctedSegmentId, correction);
        this.retimesInCurrentSentence++;

        console.log(`[ProsodySmoother] Prosody correction applied: ${reason}`);
        this.emit('prosodyCorrection', correction);

        return correctedAudio;
    }

    /**
     * Apply crossfade between original and corrected audio
     */
    private applyCrossfade(
        originalAudio: Float32Array,
        correctedAudio: Float32Array,
        crossfadeStartSample: number,
        crossfadeSamples: number
    ): Float32Array {

        const resultLength = Math.max(originalAudio.length, correctedAudio.length);
        const result = new Float32Array(resultLength);

        // Copy original audio up to crossfade point
        for (let i = 0; i < crossfadeStartSample; i++) {
            result[i] = originalAudio[i] || 0;
        }

        // Apply crossfade
        for (let i = 0; i < crossfadeSamples; i++) {
            const originalIndex = crossfadeStartSample + i;
            const correctedIndex = i;

            if (originalIndex < originalAudio.length && correctedIndex < correctedAudio.length) {
                // Linear crossfade: fade out original, fade in corrected
                const fadeOut = (crossfadeSamples - i) / crossfadeSamples;
                const fadeIn = i / crossfadeSamples;

                // Apply gentle S-curve for smoother transition
                const smoothFadeOut = this.applySmoothCurve(fadeOut);
                const smoothFadeIn = this.applySmoothCurve(fadeIn);

                result[originalIndex] =
                    (originalAudio[originalIndex] * smoothFadeOut) +
                    (correctedAudio[correctedIndex] * smoothFadeIn);
            }
        }

        // Copy remaining corrected audio
        const remainingStart = crossfadeStartSample + crossfadeSamples;
        const correctedOffset = crossfadeSamples;

        for (let i = remainingStart; i < resultLength; i++) {
            const correctedIndex = correctedOffset + (i - remainingStart);
            result[i] = correctedIndex < correctedAudio.length ? correctedAudio[correctedIndex] : 0;
        }

        return result;
    }

    /**
     * Apply smooth S-curve for more natural crossfade
     */
    private applySmoothCurve(t: number): number {
        // Smooth step function: 3t² - 2t³
        return t * t * (3 - 2 * t);
    }

    /**
     * Check if a segment can be corrected (within time threshold)
     */
    canCorrectSegment(segmentId: string): boolean {
        const segment = this.audioSegments.get(segmentId);
        if (!segment) return false;

        const timeSinceCreation = Date.now() - segment.startTimeMs;
        const withinTimeLimit = timeSinceCreation <= this.config.retimeThresholdMs;
        const withinRetimeLimit = this.retimesInCurrentSentence < this.config.maxRetimesPerSentence;

        return withinTimeLimit && withinRetimeLimit;
    }

    /**
     * Get correction history for debugging
     */
    getCorrectionHistory(): ProsodyCorrection[] {
        return Array.from(this.pendingCorrections.values());
    }

    /**
     * Clean up old audio segments to prevent memory leaks
     */
    private cleanupOldSegments(): void {
        const cutoffTime = Date.now() - (this.config.retimeThresholdMs * 2);
        const toDelete: string[] = [];

        for (const [id, segment] of this.audioSegments) {
            if (segment.startTimeMs < cutoffTime) {
                toDelete.push(id);
            }
        }

        for (const id of toDelete) {
            this.audioSegments.delete(id);
            this.pendingCorrections.delete(id);
        }

        if (toDelete.length > 0) {
            console.log(`[ProsodySmoother] Cleaned up ${toDelete.length} old segments`);
        }
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig: Partial<CrossfadeConfig>): void {
        this.config = { ...this.config, ...newConfig };
        console.log('[ProsodySmoother] Config updated:', this.config);
        this.emit('configUpdated', this.config);
    }

    /**
     * Get current configuration
     */
    getConfig(): CrossfadeConfig {
        return { ...this.config };
    }

    /**
     * Get metrics about prosody corrections
     */
    getMetrics() {
        return {
            retimesInCurrentSentence: this.retimesInCurrentSentence,
            totalActiveSegments: this.audioSegments.size,
            totalPendingCorrections: this.pendingCorrections.size,
            currentSentenceId: this.currentSentenceId
        };
    }

    /**
     * Reset smoother state for new session
     */
    reset(): void {
        this.audioSegments.clear();
        this.pendingCorrections.clear();
        this.currentSentenceId = '';
        this.retimesInCurrentSentence = 0;

        console.log('[ProsodySmoother] State reset');
    }

    /**
     * Cleanup resources
     */
    cleanup(): void {
        this.reset();
        this.removeAllListeners();
        console.log('[ProsodySmoother] Cleanup completed');
    }
}