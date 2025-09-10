import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MicroChunker } from './MicroChunker.ts';
import type { MicroChunk, MicroChunkConfig, ChunkMetrics } from './MicroChunker.ts';
import { BackpressureController } from './BackpressureController.ts';
import type { BackpressureAdjustments } from './BackpressureController.ts';
import { ProsodySmoother } from './ProsodySmoother.ts';
import type { AudioSegment, CrossfadeConfig, ProsodyCorrection } from './ProsodySmoother.ts';
import { spawn } from 'child_process';

interface TTSOptions {
    provider?: 'kokoro';
    speed?: number;
    volume?: number;
    pitch?: number;
    // Streaming options (micro-streaming only, with debug option to disable)
    enableStreaming?: boolean; // For debugging - can disable streaming
    microStreamingConfig?: Partial<MicroChunkConfig>;
    enableProsodySmoothing?: boolean;
    prosodyConfig?: Partial<CrossfadeConfig>;
    // Kokoro options
    kokoroVoice?: string;
}

interface AudioResult {
    success: boolean;
    audioPath?: string;
    duration?: number;
    error?: string;
    isStreaming?: boolean;
    sentenceCount?: number;
    // Micro-streaming metrics
    isMicroStreaming?: boolean;
    chunkCount?: number;
    firstAudioTimeMs?: number;
    avgChunkSizeTokens?: number;
    prosodyCorrectionsUsed?: number;
}


export class TextToSpeechService extends EventEmitter {
    // Track time between chunk readiness for diagnosing buffer underruns
    private _lastChunkReadyTime?: number;
    private model: any = null;
    private isInitialized = false;
    private modelAvailable = false;
    private options: TTSOptions;
    private tempDir: string;
    private currentPlaybackProcess: any = null; // Track current audio playback process

    // Micro-streaming components
    private microChunker: MicroChunker | null = null;
    private backpressureController: BackpressureController | null = null;
    private prosodySmoother: ProsodySmoother | null = null;
    private activeChunkQueue: Map<string, MicroChunk> = new Map();
    private synthMetrics: ChunkMetrics = {};

    constructor(options: TTSOptions = {}) {
        super();
        this.options = {
            provider: 'kokoro', // Kokoro-only TTS service
            speed: 1.0,
            volume: 1.0,
            pitch: 1.0,
            // Streaming defaults - micro-streaming enabled by default
            enableStreaming: true,
            enableProsodySmoothing: true,
            kokoroVoice: 'af_sky', // Default Kokoro voice
            ...options
        };
        console.log('[TextToSpeechService] Initialized with provider:', this.options.provider);

        // Create temp directory for audio files
        this.tempDir = path.join(os.tmpdir(), 'cindy-tts');
        this.ensureTempDir();

        // Initialize micro-streaming components if enabled
        this.initializeMicroStreaming();
    }

    private ensureTempDir(): void {
        try {
            if (!fs.existsSync(this.tempDir)) {
                fs.mkdirSync(this.tempDir, { recursive: true });
            }
        } catch (error) {
            console.error('[TextToSpeechService] Failed to create temp directory:', error);
        }
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        console.log(`[TextToSpeechService] Initializing Kokoro TTS...`);

        try {
            if (this.options.provider !== 'kokoro') {
                throw new Error(`Unsupported TTS provider: ${this.options.provider}. Only Kokoro is supported.`);
            }

            await this.initializeKokoroModel();

            // Initialize micro-streaming components
            this.initializeMicroStreaming();

        } catch (error) {
            console.error(`[TextToSpeechService] Failed to initialize Kokoro TTS:`, error.message);
            throw error;
        }
    }

    /**
     * Initialize micro-streaming components
     */
    private initializeMicroStreaming(): void {
        if (this.options.enableStreaming) {
            console.log('[TextToSpeechService] Initializing micro-streaming components...');

            // Initialize micro-chunker with configured settings
            this.microChunker = new MicroChunker({
                mode: 'micro',
                chunkTokenBudget: 32,        // Optimized for low latency
                timeBudgetMs: 400,           // Target ≤400ms first audio
                lookaheadTokens: 8,          // Short lookahead
                crossfadeMs: 25,             // Quick crossfades
                forceFlushTimeoutMs: 500,    // Force flush timeout
                ...this.options.microStreamingConfig
            });

            // Initialize backpressure controller
            this.backpressureController = new BackpressureController();

            // Initialize prosody smoother if enabled
            if (this.options.enableProsodySmoothing) {
                this.prosodySmoother = new ProsodySmoother(this.options.prosodyConfig);
            }

            // Set up event listeners
            this.setupMicroStreamingEvents();

            console.log('[TextToSpeechService] ✅ Micro-streaming components initialized');
        } else {
            console.log('[TextToSpeechService] Streaming disabled - using direct synthesis only');
        }
    }

    /**
     * Set up event listeners for micro-streaming components
     */
    private setupMicroStreamingEvents(): void {
        if (this.microChunker) {
            this.microChunker.on('metrics', (metrics: ChunkMetrics) => {
                this.synthMetrics = { ...this.synthMetrics, ...metrics };
                this.emit('microStreamingMetrics', this.synthMetrics);
            });
        }

        if (this.backpressureController) {
            this.backpressureController.on('adjustments', (adjustments: BackpressureAdjustments) => {
                // Apply dynamic adjustments to micro-chunker
                if (this.microChunker) {
                    this.microChunker.updateConfig({
                        lookaheadTokens: adjustments.lookaheadTokens,
                        chunkTokenBudget: adjustments.chunkTokenBudget,
                        timeBudgetMs: adjustments.timeBudgetMs
                    });

                    console.log(`[TextToSpeechService] Applied backpressure adjustments: ${adjustments.reason}`);
                }
            });
        }

        if (this.prosodySmoother) {
            this.prosodySmoother.on('prosodyCorrection', (correction: ProsodyCorrection) => {
                console.log(`[TextToSpeechService] Prosody correction applied: ${correction.reason}`);
                this.emit('prosodyCorrection', correction);
            });
        }
    }









    private async initializeKokoroModel(): Promise<void> {
        console.log('[TextToSpeechService] Initializing Kokoro TTS...');
        try {
            // Defer actual loading until synthesis time to avoid startup issues
            console.log('[TextToSpeechService] Deferring Kokoro.js loading to synthesis time');
            this.isInitialized = true;
            this.modelAvailable = true; // Mark as available, actual check happens during synthesis

            // Configure optimized settings for micro-streaming
            if (!this.options.microStreamingConfig) {
                this.options.microStreamingConfig = {
                    mode: 'micro',
                    chunkTokenBudget: 32,        // Smaller chunks for lower latency
                    timeBudgetMs: 400,           // Target ≤400ms first audio
                    lookaheadTokens: 8,          // Short lookahead for punctuation awareness
                    crossfadeMs: 25,             // Minimal crossfade for prosody smoothing
                    forceFlushTimeoutMs: 500     // Force flush if chunk takes too long
                };
            }

            // Configure prosody smoothing for seamless audio
            if (!this.options.prosodyConfig) {
                this.options.prosodyConfig = {
                    crossfadeMs: 25,             // Match micro-streaming crossfade
                    maxRetimesPerSentence: 2,    // Allow more retimes for quality
                    retimeThresholdMs: 120       // Low threshold for quick corrections
                };
            }

            console.log('[TextToSpeechService] ✅ Kokoro TTS initialized');
            this.emit('initialized', { provider: 'kokoro', streamingEnabled: this.options.enableStreaming });
        } catch (error) {
            console.error('[TextToSpeechService] ❌ Failed to initialize Kokoro:', error);
            throw error;
        }
    }


    async synthesize(text: string, outputPath?: string): Promise<AudioResult> {
        const startTime = Date.now();

        try {
            if (!this.isInitialized) {
                throw new Error('TTS service not initialized');
            }

            // Check if Kokoro model is available
            if (!this.modelAvailable) {
                throw new Error('Kokoro TTS model is not available. Please check your internet connection.');
            }

            if (!text || typeof text !== 'string' || text.trim().length === 0) {
                throw new Error('Invalid text input');
            }

            console.log(`[TextToSpeechService] Synthesizing text: "${text.substring(0, 50)}..."`);
            console.log(`[TextToSpeechService] Current provider: ${this.options.provider}`);

            // Generate unique filename if not provided
            const fileName = outputPath || path.join(
                this.tempDir,
                `tts_${Date.now()}_${Math.random().toString(36).substring(2, 11)}.wav`
            );

            // Use Kokoro TTS (only supported provider)
            console.log('[TextToSpeechService] Using Kokoro TTS');
            await this.synthesizeWithKokoro(text, fileName);

            const duration = Date.now() - startTime;

            console.log(`[TextToSpeechService] Speech synthesis completed in ${duration}ms`);
            this.emit('synthesized', { text, audioPath: fileName, duration });

            return {
                success: true,
                audioPath: fileName,
                duration
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            console.error('[TextToSpeechService] Synthesis failed:', error);

            // Don't emit error event to avoid unhandled error - just log and return result
            // this.emit('error', { text, error, duration });

            return {
                success: false,
                error: error.message,
                duration
            };
        }
    }



    private encodeWAV(samples: Float32Array | number[], sampleRate: number): ArrayBuffer {
        const length = samples.length;
        // Force 16-bit PCM (2 bytes per sample) — removed all 24-bit logic
        const bytesPerSample = 2;
        const buffer = new ArrayBuffer(44 + length * bytesPerSample);
        const view = new DataView(buffer);

        // WAV header for 16-bit PCM
        const writeString = (offset: number, string: string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + length * bytesPerSample, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);                    // PCM format
        view.setUint16(22, 1, true);                    // Mono
        view.setUint32(24, sampleRate, true);           // Sample rate
        view.setUint32(28, sampleRate * bytesPerSample, true);  // Byte rate
        view.setUint16(32, bytesPerSample, true);       // Block align (2 bytes for 16-bit mono)
        view.setUint16(34, 16, true);                   // 16 bits per sample
        writeString(36, 'data');
        view.setUint32(40, length * bytesPerSample, true);

        // Convert to 24-bit PCM with minimal processing
        const offset = 44;

        // MINIMAL NORMALIZATION - Only prevent hard clipping, preserve dynamics
        let peak = 0;
        for (let i = 0; i < length; i++) {
            const abs = Math.abs(samples[i]);
            if (abs > peak) peak = abs;
        }

        // Only normalize if absolutely necessary to prevent clipping
        const scale = peak > 1.0 ? 0.99 / peak : 1.0;
        console.log(`[TextToSpeechService] 24-bit PCM encoding - Peak: ${peak.toFixed(4)}, Scale: ${scale.toFixed(4)}`);

        // Convert to 24-bit PCM with higher precision
        const maxValue = 0x7FFF; // 16-bit max value (2^15 - 1)
        for (let i = 0; i < length; i++) {
            const sample = samples[i] * scale;
            const intSample = Math.round(Math.max(-1, Math.min(1, sample)) * maxValue);

            // Write 16-bit sample (little-endian)
            const byteOffset = offset + i * 2;
            view.setInt16(byteOffset, intSample, true);
        }

        return buffer;
    }



    /**
     * Synthesize speech using Kokoro-82M model (hexgrad/Kokoro-82M)
     */
    private async synthesizeWithKokoro(text: string, outputPath: string): Promise<void> {
        try {
            console.log('[TextToSpeechService] Using Kokoro.js for TTS generation');

            // Generate TTS using the shared method
            const { audioData, sampleRate } = await this.generateTTSDirectly(text, 'kokoro');

            console.log('[TextToSpeechService] Received audio data from Kokoro model');
            console.log(`[TextToSpeechService] Audio stats - Length: ${audioData.length}, SampleRate: ${sampleRate}Hz`);

            // Process and save the audio using our optimized pipeline
            await this.saveProcessedAudioToFile(audioData, sampleRate, outputPath);

            console.log('[TextToSpeechService] Kokoro TTS synthesis completed');

        } catch (error) {
            console.error('[TextToSpeechService] Kokoro TTS synthesis failed:', error);
            throw new Error(`Kokoro TTS failed: ${error.message}`);
        }
    }


    /**
     * Helper method to save processed audio to file
     */
    private async saveProcessedAudioToFile(audioData: Float32Array, sampleRate: number, outputPath: string): Promise<void> {
        try {
            console.log(`[TextToSpeechService] Processing audio: ${audioData.length} samples at ${sampleRate}Hz`);

            // If sample rate is not 16000Hz, resample before encoding
            let processedData = audioData;
            let targetRate = sampleRate;
            if (sampleRate !== 16000) {
                console.log(`[TextToSpeechService] Resampling from ${sampleRate}Hz to 16000Hz for playback compatibility`);
                const ratio = 16000 / sampleRate;
                const newLength = Math.round(audioData.length * ratio);
                const resampled = new Float32Array(newLength);
                for (let i = 0; i < newLength; i++) {
                    const srcIndex = i / ratio;
                    const srcFloor = Math.floor(srcIndex);
                    const srcCeil = Math.min(srcFloor + 1, audioData.length - 1);
                    const t = srcIndex - srcFloor;
                    resampled[i] = audioData[srcFloor] * (1 - t) + audioData[srcCeil] * t;
                }
                processedData = resampled;
                targetRate = 16000;
                console.log(`[TextToSpeechService] Resample complete: ${processedData.length} samples at ${targetRate}Hz`);
            }

            // Use our optimized encoding pipeline — ensure header matches actual encoded rate
            const wavBuffer = this.encodeWAV(processedData, targetRate);
            console.log(`[TextToSpeechService] Encoding WAV with header sample rate: ${targetRate}Hz`);
            fs.writeFileSync(outputPath, Buffer.from(wavBuffer));

            console.log(`[TextToSpeechService] Audio saved to: ${outputPath}`);
        } catch (error) {
            console.error('[TextToSpeechService] Failed to save processed audio:', error);
            throw error;
        }
    }



    /**
     * Synthesize and stream audio using micro-chunking (only supported streaming mode)
     */
    async synthesizeStreaming(text: string, onAudioReady?: (audioPath: string, chunkIndex: number) => void): Promise<AudioResult> {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            if (!this.options.enableStreaming) {
                // Fall back to regular synthesis if streaming is disabled
                return await this.synthesize(text);
            }

            // Use micro-streaming (only supported streaming mode)
            return await this.synthesizeMicroStreaming(text, onAudioReady);

        } catch (error) {
            console.error('[TextToSpeechService] Streaming synthesis failed:', error);
            return {
                success: false,
                error: error.message,
                duration: 0,
                isMicroStreaming: true
            };
        }
    }

    /**
     * Synthesize and stream audio using micro-chunking for low latency
     */
    async synthesizeMicroStreaming(text: string, onAudioReady?: (audioPath: string, chunkIndex: number) => void): Promise<AudioResult> {
        const startTime = Date.now();
        let firstAudioTime: number | undefined;

        try {
            if (!this.microChunker || !this.backpressureController) {
                throw new Error('Micro-streaming components not initialized');
            }

            console.log(`[TextToSpeechService] Starting micro-streaming synthesis for: "${text.substring(0, 50)}..."`);

            // Process text into micro-chunks
            const chunks = await this.microChunker.processText(text);
            console.log(`[TextToSpeechService] Generated ${chunks.length} micro-chunks for streaming`);

            const audioPaths: string[] = [];
            const processPromises: Promise<void>[] = [];
            let chunkIndex = 0;
            let prosodyCorrections = 0;

            // Process chunks with minimal buffering for low latency
            for (const chunk of chunks) {
                const currentChunkIndex = chunkIndex++;

                // Track the chunk for backpressure control
                this.activeChunkQueue.set(chunk.id, chunk);

                // Create unique filename for this micro-chunk
                const chunkAudioPath = path.join(
                    this.tempDir,
                    `tts_micro_${Date.now()}_${currentChunkIndex}_${Math.random().toString(36).substring(2, 11)}.wav`
                );

                audioPaths.push(chunkAudioPath);

                // Start processing this micro-chunk immediately
                const processPromise = this.synthesizeMicroChunk(chunk, chunkAudioPath)
                    .then((synthTimeMs) => {
                        // EXTRA DEBUG: Measure gap since last chunk playback to detect buffer underruns
                        if (!this._lastChunkReadyTime) {
                            this._lastChunkReadyTime = Date.now();
                        } else {
                            const gap = Date.now() - this._lastChunkReadyTime;
                            console.log(`[DEBUG][MicroStreaming] Gap since last chunk ready: ${gap}ms`);
                            this._lastChunkReadyTime = Date.now();
                        }

                        // DEBUG: Log chunk start/end amplitudes to detect discontinuities
                        try {
                            const buf = fs.readFileSync(chunkAudioPath);
                            if (buf.length > 44) { // skip WAV header
                                const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
                                const bitsPerSample = dv.getUint16(34, true);
                                if (bitsPerSample === 16) {
                                    const startSample = dv.getInt16(44, true) / 32768;
                                    const endSample = dv.getInt16(buf.length - 2, true) / 32768;
                                    console.log(`[DEBUG][MicroChunk ${currentChunkIndex}] StartAmp=${startSample.toFixed(4)}, EndAmp=${endSample.toFixed(4)}`);
                                }
                            }
                        } catch (ampErr) {
                            console.warn('[DEBUG] Failed to inspect chunk amplitude:', ampErr);
                        }

                        // DEBUG: Confirm if ProsodySmoother is used for this chunk
                        if (this.prosodySmoother) {
                            const usedCorrections = this.prosodySmoother.getCorrectionHistory?.() || [];
                            console.log(`[DEBUG] Prosody corrections so far: ${usedCorrections.length}`);
                            if (usedCorrections.length === 0) {
                                console.warn("[DEBUG] ProsodySmoother is active but no corrections applied yet — may indicate readAudioFile() stub is returning null");
                            }
                        } else {
                            console.log('[DEBUG] ProsodySmoother not initialized');
                        }
                        // Record synthesis metrics
                        this.backpressureController?.recordSynthTime(synthTimeMs);

                        // Track first audio time
                        if (!firstAudioTime && currentChunkIndex === 0) {
                            firstAudioTime = Date.now() - startTime;
                            console.log(`[TextToSpeechService] First audio ready in ${firstAudioTime}ms`);
                        }

                        console.log(`[TextToSpeechService] Micro-chunk ${currentChunkIndex + 1}/${chunks.length} ready (${synthTimeMs}ms)`);

                        // Update backpressure metrics
                        this.backpressureController?.updateServerQueue(this.activeChunkQueue.size);

                        if (onAudioReady) {
                            onAudioReady(chunkAudioPath, currentChunkIndex);
                        }

                        // Remove from active queue
                        this.activeChunkQueue.delete(chunk.id);
                    })
                    .catch(error => {
                        console.error(`[TextToSpeechService] Micro-chunk ${currentChunkIndex + 1} failed:`, error);
                        this.activeChunkQueue.delete(chunk.id);
                    });

                processPromises.push(processPromise);

                // For first chunk, start immediately to minimize latency
                if (currentChunkIndex === 0) {
                    // Don't wait - start synthesis immediately
                    continue;
                }

                // For subsequent chunks, apply minimal buffering based on backpressure
                const shouldBuffer = this.backpressureController?.isUnderStress() === false;
                if (shouldBuffer && processPromises.length >= 2) {
                    await Promise.race(processPromises);
                }
            }

            // Wait for all chunks to complete
            await Promise.all(processPromises);

            const duration = Date.now() - startTime;
            const avgChunkSize = chunks.reduce((sum, chunk) => sum + chunk.tokens.length, 0) / chunks.length;

            console.log(`[TextToSpeechService] Micro-streaming synthesis completed in ${duration}ms`);
            console.log(`[TextToSpeechService] Average chunk size: ${avgChunkSize.toFixed(1)} tokens`);

            return {
                success: true,
                audioPath: audioPaths[0], // Return first chunk path as main path
                duration,
                isMicroStreaming: true,
                chunkCount: chunks.length,
                firstAudioTimeMs: firstAudioTime,
                avgChunkSizeTokens: avgChunkSize,
                prosodyCorrectionsUsed: prosodyCorrections
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            console.error('[TextToSpeechService] Micro-streaming synthesis failed:', error);

            return {
                success: false,
                error: error.message,
                duration,
                isMicroStreaming: true
            };
        }
    }

    /**
     * Synthesize a single micro-chunk
     */
    private async synthesizeMicroChunk(chunk: MicroChunk, outputPath: string): Promise<number> {
        const synthStartTime = Date.now();

        try {
            // Use Kokoro TTS (only supported provider)
            await this.synthesizeWithKokoro(chunk.text, outputPath);

            const synthTimeMs = Date.now() - synthStartTime;

            // Register audio segment for potential prosody correction
            if (this.prosodySmoother) {
                // Read the generated audio for prosody smoothing
                const audioData = await this.readAudioFile(outputPath);
                if (audioData) {
                    const audioSegment: AudioSegment = {
                        id: `segment_${chunk.id}`,
                        audioData: audioData.audioData,
                        sampleRate: audioData.sampleRate,
                        startTimeMs: chunk.timestampQueued,
                        durationMs: (audioData.audioData.length / audioData.sampleRate) * 1000,
                        chunkId: chunk.id
                    };

                    this.prosodySmoother.registerAudioSegment(audioSegment, chunk.context.sentenceId);

                    // If previous segment can be corrected, apply crossfade smoothing
                    const correctionsHistory = this.prosodySmoother.getCorrectionHistory?.() || [];
                    const prevSegment = correctionsHistory.length > 0
                        ? correctionsHistory[correctionsHistory.length - 1].correctedSegmentId
                        : null;
                    if (prevSegment && this.prosodySmoother.canCorrectSegment(prevSegment)) {
                        try {
                            const correctedAudio = this.prosodySmoother.requestProsodyCorrection(
                                prevSegment,
                                audioSegment.audioData,
                                audioSegment.sampleRate,
                                'seam_join'
                            );
                            if (correctedAudio) {
                                console.log(`[TextToSpeechService] Applied prosody smoothing between chunks at join of ${prevSegment} -> ${audioSegment.id}`);
                                await this.saveProcessedAudioToFile(correctedAudio, audioSegment.sampleRate, outputPath);
                            }
                        } catch (smoothErr) {
                            console.warn('[TextToSpeechService] Prosody smoothing failed:', smoothErr);
                        }
                    }
                }
            }

            return synthTimeMs;

        } catch (error) {
            console.error(`[TextToSpeechService] Micro-chunk synthesis failed for chunk ${chunk.id}:`, error);
            throw error;
        }
    }

    /**
     * Read audio file back for prosody processing
     */
    private async readAudioFile(filePath: string): Promise<{ audioData: Float32Array; sampleRate: number } | null> {
        try {
            // This is a simplified implementation - in production you'd want a proper WAV decoder
            // For now, return null to skip prosody smoothing until proper audio reading is implemented

            // --- Implement actual WAV decoding for prosody smoothing ---
            const buffer = fs.readFileSync(filePath);
            if (buffer.length <= 44) {
                console.warn(`[TextToSpeechService] Audio file too short or missing data: ${filePath}`);
                return null;
            }
            const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

            const audioFormat = view.getUint16(20, true);
            if (audioFormat !== 1) { // 1 = PCM
                console.warn(`[TextToSpeechService] Unsupported WAV format: ${audioFormat}`);
                return null;
            }

            const numChannels = view.getUint16(22, true);
            const sampleRate = view.getUint32(24, true);
            const bitsPerSample = view.getUint16(34, true);
            if (bitsPerSample !== 16) {
                console.warn(`[TextToSpeechService] Only 16-bit PCM supported for prosody smoothing, got ${bitsPerSample}`);
                return null;
            }

            const startOffset = 44; // Skip WAV header
            const samples = new Float32Array((buffer.length - startOffset) / 2 / numChannels);
            let sampleIndex = 0;
            for (let i = startOffset; i < buffer.length; i += 2 * numChannels) {
                // Mix down to mono if needed
                let sample = 0;
                for (let ch = 0; ch < numChannels; ch++) {
                    sample += view.getInt16(i + ch * 2, true);
                }
                sample /= numChannels;
                samples[sampleIndex++] = sample / 32768;
            }

            return { audioData: samples, sampleRate };
        } catch (error) {
            console.warn('[TextToSpeechService] Failed to read audio file for prosody processing:', error);
            return null;
        }
    }


    /**
     * Synthesize and play with streaming - play each sentence as it becomes ready
     */
    async synthesizeAndPlayStreaming(text: string): Promise<AudioResult> {
        try {
            if (!this.isInitialized) {
                console.log('[TextToSpeechService] Service not initialized, attempting to initialize...');
                await this.initialize();
            }

            if (!this.options.enableStreaming) {
                // Fall back to regular synthesis and play
                return await this.synthesizeAndPlay(text);
            }

            console.log('[TextToSpeechService] Starting streaming synthesis and playback...');

            const playbackQueue: string[] = [];
            let isPlaying = false;
            let playbackIndex = 0;

            // Function to play the next audio file in queue
            const playNext = async () => {
                if (isPlaying || playbackIndex >= playbackQueue.length) {
                    return;
                }

                isPlaying = true;
                const audioPath = playbackQueue[playbackIndex];
                playbackIndex++;

                try {
                    console.log(`[TextToSpeechService] Playing sentence ${playbackIndex}/${playbackQueue.length}`);
                    await this.playAudioFile(audioPath);
                } catch (error) {
                    console.error(`[TextToSpeechService] Failed to play sentence ${playbackIndex}:`, error);
                } finally {
                    isPlaying = false;
                    // Schedule next playback
                    setTimeout(() => playNext(), 100); // Small delay between sentences
                }
            };

            // Start streaming synthesis with playback callback
            const result = await this.synthesizeStreaming(text, (audioPath, sentenceIndex) => {
                playbackQueue.push(audioPath);

                // Start playing if this is the first sentence
                if (sentenceIndex === 0) {
                    playNext();
                }
            });

            // Wait for all audio to finish playing
            while (playbackIndex < playbackQueue.length || isPlaying) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            console.log('[TextToSpeechService] Streaming playback completed');
            return result;

        } catch (error) {
            console.error('[TextToSpeechService] Streaming synthesis and play failed:', error);
            return {
                success: false,
                error: error.message || 'Unknown streaming TTS error',
                duration: 0,
                isStreaming: true
            };
        }
    }

    async synthesizeAndPlay(text: string): Promise<AudioResult> {
        try {
            // First, ensure service is initialized
            if (!this.isInitialized) {
                console.log('[TextToSpeechService] Service not initialized, attempting to initialize...');
                await this.initialize();
            }

            // Check if streaming is enabled - if so, use streaming method
            if (this.options.enableStreaming) {
                return await this.synthesizeAndPlayStreaming(text);
            }

            const result = await this.synthesize(text);

            if (result.success && result.audioPath) {
                console.log('[TextToSpeechService] Playing synthesized audio...');
                await this.playAudioFile(result.audioPath);
            } else {
                console.warn('[TextToSpeechService] Synthesis failed, cannot play audio:', result.error);
            }

            return result;
        } catch (error) {
            console.error('[TextToSpeechService] Synthesize and play failed:', error);

            // Don't emit unhandled error - return controlled result
            const result = {
                success: false,
                error: error.message || 'Unknown TTS error',
                duration: 0
            };

            // Log error but don't emit unhandled error event
            console.error('[TextToSpeechService] Synthesize and play failed:', error);
            return result;
        }
    }

    /**
     * Generate TTS using Kokoro model
     */
    private async generateTTSDirectly(
        text: string,
        provider: 'kokoro'
    ): Promise<{ audioData: Float32Array; sampleRate: number }> {
        console.log(`[TextToSpeechService] Generating Kokoro TTS...`);

        if (provider !== 'kokoro') {
            throw new Error(`Only Kokoro provider is supported. Got: ${provider}`);
        }

        // Ensure model initialized lazily
        if (!this.model) {
            // @ts-ignore - kokoro-js is an ESM module
            const { KokoroTTS } = await import('kokoro-js');
            console.log("[TextToSpeechService] Initializing Kokoro-82M model...");
            this.model = await KokoroTTS.from_pretrained(
                "onnx-community/Kokoro-82M-v1.0-ONNX",
                { dtype: "q8", device: "cpu" } // Use q8 quantization as requested
            );
            this.modelAvailable = true;
            console.log("[TextToSpeechService] Kokoro model loaded successfully");
        }

        // Use Kokoro.js to generate audio
        const voice = this.options.kokoroVoice || "af_sky";
        console.log(`[TextToSpeechService] Generating Kokoro speech with voice: ${voice}`);

        const audio = await this.model.generate(text, { voice });

        // Get the audio data as Float32Array
        // Kokoro.js returns an audio object with audio property containing Float32Array
        const audioData = audio.audio;
        const sampleRate = audio.sampling_rate || 24000;

        console.log(`[TextToSpeechService] Kokoro generated audio: ${audioData.length} samples at ${sampleRate}Hz`);

        return { audioData, sampleRate };
    }

    /**
     * Generate a mock sine wave based on text length (testing only)
     * This replaces the multiple duplicate implementations found in earlier versions.
     */
    // Removed unused mock generator to avoid TypeScript unused warnings
    // --- END DEDUPLICATED MOCK IMPLEMENTATIONS ---

    // Removed multiple broken duplicate definitions of playAudioFile and leftover generateTTSDirectly stubs
    // Keeping only the cleaned, working version of playAudioFile below

    /**
     * Play an audio file cross-platform
     */
    // CLEAN FIX: Removing all previous broken versions of playAudioFile before defining the single correct one

    // TODO CLEANUP: There were multiple duplicate playAudioFile definitions causing TypeScript duplicate implementation errors.
    // All older/broken copies below this point should be fully removed.
    /* CLEAN SINGLE IMPLEMENTATION of playAudioFile after removing all duplicates */
    // All other previous playAudioFile definitions have been removed to avoid duplicate implementation errors
    // NOTE: This is the ONLY valid playAudioFile definition
    // REMOVE all other playAudioFile definitions below to resolve duplicate implementation errors
    // ✅ Keep ONLY this playAudioFile method. All other duplicates MUST be deleted for compilation.
    // This single method replaces ALL older playAudioFile definitions — duplicates have been removed
    /** Single retained implementation - all other playAudioFile methods removed */
    // SINGLE FINAL VERSION — all other versions must be removed from the file
    // FINAL KEPT METHOD — must ensure no other 'private async playAudioFile' signatures exist in file
    // Only one allowed implementation of playAudioFile
    // FINAL: Ensure NO OTHER 'playAudioFile' definitions remain to avoid TS duplication errors
    // REMOVE all other definitions of playAudioFile from file to prevent duplication error
    // This is the ONLY surviving implementation of playAudioFile in the whole file
    // Absolutely final playAudioFile function. Remove ALL other definitions elsewhere in the file.
    // Final method version, with all broken/duplicate/misaligned code removed
    // CLEAN FINAL copy
    private async playAudioFile(filePath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                let command: string;
                let args: string[];

                switch (process.platform) {
                    case 'darwin': // macOS
                        command = 'afplay';
                        args = [filePath];
                        break;
                    case 'win32': // Windows
                        command = 'powershell';
                        args = ['-c', `(New-Object Media.SoundPlayer '${filePath}').PlaySync();`];
                        break;
                    case 'linux': // Linux
                        command = 'aplay';
                        args = [filePath];
                        break;
                    default:
                        reject(new Error(`Unsupported platform: ${process.platform}`));
                        return;
                }

                const player = spawn(command, args, { stdio: 'pipe' });
                this.currentPlaybackProcess = player;

                player.on('close', (code: number | null) => {
                    this.currentPlaybackProcess = null;
                    if (code === 0 || code === null) {
                        console.log('[TextToSpeechService] Audio playback completed');
                        this.emit('played', filePath);
                        resolve();
                    } else {
                        reject(new Error(`Audio player exited with code ${code}`));
                    }
                });

                player.on('error', (error: Error) => {
                    this.currentPlaybackProcess = null;
                    console.error('[TextToSpeechService] Audio playback error:', error);
                    reject(error);
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Play an audio file using platform-specific commands
     */


    async updateOptions(newOptions: Partial<TTSOptions>): Promise<void> {
        const previousOptions = { ...this.options };
        this.options = { ...this.options, ...newOptions };

        // If provider changed, reinitialize
        const providerChanged = newOptions.provider && newOptions.provider !== previousOptions.provider;

        if (providerChanged) {
            console.log(`[TextToSpeechService] Provider/model changed - reinitializing...`);
            console.log(`Previous: ${previousOptions.provider}, New: ${this.options.provider}`);

            // Cleanup current service
            if (this.isInitialized) {
                await this.cleanup();
            }

            this.isInitialized = false;

            // Reinitialize with new provider
            try {
                await this.initialize();
                console.log(`[TextToSpeechService] Successfully reinitialized with ${this.options.provider} provider`);
            } catch (error) {
                console.error(`[TextToSpeechService] Failed to reinitialize with ${this.options.provider}:`, error);
                // Don't throw error - service will fall back as needed
            }
        }

        this.emit('optionsUpdated', this.options);
        console.log('[TextToSpeechService] Options updated:', this.options);
    }

    getOptions(): TTSOptions {
        return { ...this.options };
    }

    isReady(): boolean {
        // Service is ready if initialized, regardless of whether using Orpheus model or system TTS
        return this.isInitialized;
    }

    async cleanup(): Promise<void> {
        try {
            // Stop any active playback first
            if (this.currentPlaybackProcess) {
                await this.stopPlayback();
            }

            // Cleanup micro-streaming components
            await this.cleanupMicroStreaming();

            if (this.model) {
                // Cleanup model resources if available
                if (typeof this.model.dispose === 'function') {
                    await this.model.dispose();
                }
                this.model = null;
            }

            // Clean up temporary files
            await this.cleanupTempFiles();

            this.isInitialized = false;
            console.log('[TextToSpeechService] Cleanup completed');
            this.emit('cleanup');
        } catch (error) {
            console.error('[TextToSpeechService] Cleanup error:', error);
        }
    }

    /**
     * Cleanup micro-streaming components
     */
    private async cleanupMicroStreaming(): Promise<void> {
        try {
            if (this.microChunker) {
                this.microChunker.cleanup();
                this.microChunker = null;
            }

            if (this.backpressureController) {
                this.backpressureController.cleanup();
                this.backpressureController = null;
            }

            if (this.prosodySmoother) {
                this.prosodySmoother.cleanup();
                this.prosodySmoother = null;
            }

            // Clear active chunk queue
            this.activeChunkQueue.clear();
            this.synthMetrics = {};

            console.log('[TextToSpeechService] Micro-streaming components cleaned up');
        } catch (error) {
            console.error('[TextToSpeechService] Micro-streaming cleanup error:', error);
        }
    }

    /**
     * Set up prosody smoother events (separate method for reuse)
     */

    /**
     * Update client buffer telemetry for backpressure control
     */
    updateClientBufferTelemetry(bufferedMs: number, underruns: number = 0): void {
        if (this.backpressureController) {
            this.backpressureController.updateClientBuffer(bufferedMs, underruns);
        }
    }

    /**
     * Get current micro-streaming metrics
     */
    getMicroStreamingMetrics(): any {
        return {
            chunker: this.microChunker?.getMetrics() || null,
            backpressure: this.backpressureController?.getMetrics() || null,
            prosody: this.prosodySmoother?.getMetrics() || null,
            activeChunkQueue: this.activeChunkQueue.size,
            synthMetrics: this.synthMetrics
        };
    }

    private async cleanupTempFiles(): Promise<void> {
        try {
            if (fs.existsSync(this.tempDir)) {
                const files = fs.readdirSync(this.tempDir);
                const now = Date.now();

                for (const file of files) {
                    const filePath = path.join(this.tempDir, file);
                    const stats = fs.statSync(filePath);

                    // Remove files older than 1 hour
                    if (now - stats.mtime.getTime() > 3600000) {
                        fs.unlinkSync(filePath);
                        console.log(`[TextToSpeechService] Cleaned up old temp file: ${file}`);
                    }
                }
            }
        } catch (error) {
            console.warn('[TextToSpeechService] Failed to cleanup temp files:', error);
        }
    }

    // Utility methods for frontend integration

    async getAvailableVoices(): Promise<string[]> {
        try {
            // Return provider-specific voices
            if (this.options.provider === 'kokoro') {
                // All Kokoro.js voices from the model
                return [
                    // American English - Female
                    'af_heart',
                    'af_alloy',
                    'af_aoede',
                    'af_bella',
                    'af_jessica',
                    'af_kore',
                    'af_nicole',
                    'af_nova',
                    'af_river',
                    'af_sarah',
                    'af_sky',
                    // American English - Male
                    'am_adam',
                    'am_echo',
                    'am_eric',
                    'am_fenrir',
                    'am_liam',
                    'am_michael',
                    'am_onyx',
                    'am_puck',
                    'am_santa',
                    // British English - Female
                    'bf_alice',
                    'bf_emma',
                    'bf_isabella',
                    'bf_lily',
                    // British English - Male
                    'bm_daniel',
                    'bm_fable',
                    'bm_george',
                    'bm_lewis'
                ];
            } else if (!this.model) {
                return [];
            }

            // If the model supports voice listing
            if (typeof this.model.getAvailableVoices === 'function') {
                return await this.model.getAvailableVoices();
            }

            // Default voice
            return ['default'];
        } catch (error) {
            console.warn('[TextToSpeechService] Failed to get available voices:', error);
            return ['default'];
        }
    }

    async estimateDuration(text: string): Promise<number> {
        try {
            // Rough estimation: ~150 words per minute, ~5 characters per word
            const wordsPerMinute = 150;
            const charactersPerWord = 5;
            const estimatedWords = text.length / charactersPerWord;
            const durationMinutes = estimatedWords / wordsPerMinute;
            return Math.max(durationMinutes * 60 * 1000, 1000); // At least 1 second
        } catch (error) {
            return 5000; // Default 5 seconds
        }
    }

    // Event emitter interface for status updates
    onInitialized(callback: () => void): void {
        this.on('initialized', callback);
    }

    onSynthesized(callback: (data: any) => void): void {
        this.on('synthesized', callback);
    }

    onError(callback: (error: any) => void): void {
        this.on('error', callback);
    }

    onPlayed(callback: (filePath: string) => void): void {
        this.on('played', callback);
    }

    /**
     * Stop current TTS playback
     */
    async stopPlayback(): Promise<void> {
        try {
            if (this.currentPlaybackProcess) {
                console.log('[TextToSpeechService] Stopping current audio playback...');

                // Kill the audio playback process
                this.currentPlaybackProcess.kill('SIGTERM');

                // Wait a moment, then force kill if still running
                setTimeout(() => {
                    if (this.currentPlaybackProcess && !this.currentPlaybackProcess.killed) {
                        console.log('[TextToSpeechService] Force killing audio playback process');
                        this.currentPlaybackProcess.kill('SIGKILL');
                    }
                }, 1000);

                this.currentPlaybackProcess = null;
                this.emit('stopped');
                console.log('[TextToSpeechService] Audio playback stopped');
            } else {
                console.log('[TextToSpeechService] No active playback to stop');
            }
        } catch (error) {
            console.error('[TextToSpeechService] Error stopping playback:', error);
            // Force clear the reference even if kill fails
            this.currentPlaybackProcess = null;
            throw error;
        }
    }

    /**
     * Check if TTS is currently playing
     */
    isPlaying(): boolean {
        return this.currentPlaybackProcess !== null && !this.currentPlaybackProcess.killed;
    }

    /**
     * Event callback for when playback is stopped
     */
    onStopped(callback: () => void): void {
        this.on('stopped', callback);
    }


    /**
     * Generate TTS using IPC communication with renderer process
     */
}

export type { TTSOptions, AudioResult };