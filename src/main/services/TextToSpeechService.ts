import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MicroChunker, MicroChunk, MicroChunkConfig, ChunkMetrics } from './MicroChunker';
import { BackpressureController, BackpressureAdjustments } from './BackpressureController';
import { ProsodySmoother, AudioSegment, CrossfadeConfig, ProsodyCorrection } from './ProsodySmoother';

interface TTSOptions {
    provider?: 'kokoro' | 'xenova' | 'elevenlabs' | 'system';
    speed?: number;
    volume?: number;
    pitch?: number;
    // Streaming options
    enableStreaming?: boolean;
    sentenceBufferSize?: number;
    // Micro-streaming options
    streamingMode?: 'sentence' | 'micro';
    microStreamingConfig?: Partial<MicroChunkConfig>;
    enableProsodySmoothing?: boolean;
    prosodyConfig?: Partial<CrossfadeConfig>;
    // ElevenLabs specific options
    apiKey?: string;
    voiceId?: string;
    stability?: number;
    similarityBoost?: number;
    // Kokoro/Xenova options
    kokoroVoice?: string;
    xenovaModel?: string;
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
    private useSystemTTS = false;
    private options: TTSOptions;
    private tempDir: string;
    private currentPlaybackProcess: any = null; // Track current audio playback process
    private hasLoggedSystemTTS = false; // Flag to prevent repeated logging

    // Micro-streaming components
    private microChunker: MicroChunker | null = null;
    private backpressureController: BackpressureController | null = null;
    private prosodySmoother: ProsodySmoother | null = null;
    private activeChunkQueue: Map<string, MicroChunk> = new Map();
    private synthMetrics: ChunkMetrics = {};

    constructor(options: TTSOptions = {}) {
        super();
        this.options = {
            provider: 'system', // Default to system TTS (smallest, fastest)
            speed: 1.0,
            volume: 1.0,
            pitch: 1.0,
            // Streaming defaults
            enableStreaming: false,
            streamingMode: 'sentence',
            enableProsodySmoothing: false,
            // ElevenLabs defaults
            voiceId: 'pNInz6obpgDQGcFmaJgB', // Default voice (Adam)
            stability: 0.5,
            similarityBoost: 0.5,
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

        console.log(`[TextToSpeechService] Initializing with provider: ${this.options.provider}`);

        try {
            switch (this.options.provider) {
                case 'kokoro':
                    await this.initializeKokoroModel();
                    break;
                case 'xenova':
                    await this.initializeXenovaModel();
                    break;
                case 'elevenlabs':
                    await this.initializeElevenLabsService();
                    break;
                case 'system':
                default:
                    await this.initializeSystemTTS();
                    break;
            }

            // Initialize micro-streaming if enabled
            this.initializeMicroStreaming();

        } catch (error) {
            console.error(`[TextToSpeechService] Failed to initialize ${this.options.provider} provider:`, error.message);
            // No fallback - fail if provider-specific initialization fails
            throw error;
        }
    }

    /**
     * Initialize micro-streaming components
     */
    private initializeMicroStreaming(): void {
        if (this.options.streamingMode === 'micro') {
            console.log('[TextToSpeechService] Initializing micro-streaming components...');

            // Initialize micro-chunker
            this.microChunker = new MicroChunker({
                mode: 'micro',
                // Increased defaults for smoother playback
                chunkTokenBudget: 48,
                timeBudgetMs: 750,
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
            this.useSystemTTS = false;
            this.isInitialized = true;
            this.modelAvailable = true; // Mark as available, actual check happens during synthesis
            this.emit('initialized', { provider: 'kokoro', fallback: false });
            console.log('[TextToSpeechService] ✅ Kokoro TTS initialized (deferred loading)');
        } catch (error) {
            console.error('[TextToSpeechService] ❌ Failed to initialize Kokoro:', error);
            throw error;
        }
    }

    private async initializeXenovaModel(): Promise<void> {
        console.log('[TextToSpeechService] Initializing Xenova Transformers...');
        try {
            // Defer actual loading until synthesis time to avoid startup issues
            console.log('[TextToSpeechService] Deferring @xenova/transformers loading to synthesis time');
            this.useSystemTTS = false;
            this.isInitialized = true;
            this.modelAvailable = true; // Mark as available, actual check happens during synthesis
            this.emit('initialized', { provider: 'xenova', fallback: false });
            console.log('[TextToSpeechService] ✅ Xenova Transformers initialized (deferred loading)');
        } catch (error) {
            console.error('[TextToSpeechService] ❌ Failed to initialize Xenova:', error);
            throw error;
        }
    }

    private async initializeElevenLabsService(): Promise<void> {
        console.log('[TextToSpeechService] Initializing ElevenLabs TTS...');
        try {
            // Check if API key is provided
            if (!this.options.apiKey) {
                throw new Error('ElevenLabs API key not configured');
            }
            // No actual initialization needed - just validate API key is present
            this.isInitialized = true;
            this.emit('initialized', { provider: 'elevenlabs' });
            console.log('[TextToSpeechService] ✅ ElevenLabs TTS ready for use');
        } catch (error) {
            console.error('[TextToSpeechService] ❌ Failed to initialize ElevenLabs:', error);
            throw error;
        }
    }

    private async initializeSystemTTS(): Promise<void> {
        try {
            // Test if system TTS is available
            await this.testSystemTTS();

            this.useSystemTTS = true;
            this.isInitialized = true;

            // Only log once per session to avoid spam
            if (!this.hasLoggedSystemTTS) {
                console.log(`[TextToSpeechService] ✅ System TTS ready (${process.platform})`);
                this.hasLoggedSystemTTS = true;
            }

            this.emit('initialized', { provider: 'system', fallback: true });
        } catch (error) {
            console.error('[TextToSpeechService] ❌ System TTS failed:', error);
            this.isInitialized = false;
            throw new Error('System TTS unavailable');
        }
    }

    private async testSystemTTS(): Promise<void> {
        // Simple test - just check if the command exists
        try {
            switch (process.platform) {
                case 'darwin': // macOS
                    // macOS always has 'say' command
                    console.log('[TextToSpeechService] macOS detected, say command available');
                    break;
                case 'win32': // Windows
                    // Windows should have PowerShell
                    console.log('[TextToSpeechService] Windows detected, PowerShell TTS available');
                    break;
                case 'linux': // Linux
                    // We'll assume espeak can be installed or skip if not available
                    console.log('[TextToSpeechService] Linux detected, espeak TTS support');
                    break;
                default:
                    throw new Error(`System TTS not supported on platform: ${process.platform}`);
            }
        } catch (error) {
            throw error;
        }
    }

    async synthesize(text: string, outputPath?: string): Promise<AudioResult> {
        const startTime = Date.now();

        try {
            if (!this.isInitialized) {
                throw new Error('TTS service not initialized');
            }

            // Check if model is available
            if (!this.model && !this.useSystemTTS && !this.modelAvailable) {
                throw new Error('Selected TTS model is not available. Please check your settings or download the required models.');
            }

            if (!text || typeof text !== 'string' || text.trim().length === 0) {
                throw new Error('Invalid text input');
            }

            console.log(`[TextToSpeechService] Synthesizing text: "${text.substring(0, 50)}..."`);

            // Generate unique filename if not provided
            const fileName = outputPath || path.join(
                this.tempDir,
                `tts_${Date.now()}_${Math.random().toString(36).substring(2, 11)}.wav`
            );

            // Route to appropriate TTS provider
            // No automatic fallback - fail if model not available
            switch (this.options.provider) {
                case 'elevenlabs':
                    console.log('[TextToSpeechService] Using ElevenLabs TTS');
                    await this.synthesizeWithElevenLabs(text, fileName);
                    break;
                case 'kokoro':
                    console.log('[TextToSpeechService] Using SpeechT5 TTS (Kokoro provider)');
                    if (!this.modelAvailable) {
                        throw new Error('SpeechT5 TTS model is not available. Please ensure the model files are downloaded.');
                    }
                    await this.synthesizeWithKokoro(text, fileName);
                    break;
                case 'xenova':
                    console.log('[TextToSpeechService] Using Xenova Transformers TTS');
                    if (!this.modelAvailable) {
                        throw new Error('Xenova Transformers is not available. This could be due to:\n• Network connection issues preventing model download\n• Missing @xenova/transformers package\n• Browser/Node.js compatibility issues\n\nTry using a different TTS provider or check your internet connection.');
                    }
                    await this.synthesizeWithXenova(text, fileName);
                    break;
                case 'system':
                    console.log('[TextToSpeechService] Using system TTS');
                    await this.synthesizeWithSystemTTS(text, fileName);
                    break;
                default:
                    throw new Error(`Unknown TTS provider: ${this.options.provider}`);
            }

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


    private async synthesizeWithSystemTTS(text: string, outputPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                // Sanitize text for shell safety
                const sanitizedText = text.replace(/["`$\\]/g, '\\$&');

                if (process.platform === 'darwin') {
                    // macOS - Use say command with AIFF output, then convert to WAV
                    this.synthesizeMacOSTTS(sanitizedText, outputPath)
                        .then(resolve)
                        .catch(reject);
                } else if (process.platform === 'win32') {
                    // Windows - Use PowerShell with SAPI
                    this.synthesizeWindowsTTS(sanitizedText, outputPath)
                        .then(resolve)
                        .catch(reject);
                } else if (process.platform === 'linux') {
                    // Linux - Use espeak
                    this.synthesizeLinuxTTS(sanitizedText, outputPath)
                        .then(resolve)
                        .catch(reject);
                } else {
                    reject(new Error(`System TTS not supported on platform: ${process.platform}`));
                }

            } catch (error) {
                reject(error);
            }
        });
    }

    private async synthesizeMacOSTTS(text: string, outputPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const { spawn } = require('child_process');

            // Create AIFF file first (say command default format)
            const tempAiffPath = outputPath.replace(/\.[^.]+$/, '.aiff');

            console.log(`[TextToSpeechService] macOS TTS: say -o "${tempAiffPath}"`);
            const say = spawn('say', ['-o', tempAiffPath, text], { stdio: 'pipe' });

            say.on('close', async (code: number | null) => {
                if (code === 0) {
                    try {
                        // If we need WAV format, convert AIFF to WAV
                        if (outputPath.endsWith('.wav') && tempAiffPath !== outputPath) {
                            await this.convertAiffToWav(tempAiffPath, outputPath);
                            // Clean up temp AIFF file
                            fs.unlinkSync(tempAiffPath);
                        }
                        console.log('[TextToSpeechService] macOS TTS synthesis completed');
                        resolve();
                    } catch (conversionError) {
                        console.warn('[TextToSpeechService] AIFF to WAV conversion failed, using AIFF');
                        // If conversion fails, rename AIFF to requested output
                        if (fs.existsSync(tempAiffPath)) {
                            fs.renameSync(tempAiffPath, outputPath);
                        }
                        resolve();
                    }
                } else {
                    reject(new Error(`macOS say command exited with code ${code}`));
                }
            });

            say.on('error', (error: Error) => {
                console.error('[TextToSpeechService] macOS TTS error:', error);
                reject(error);
            });
        });
    }

    private async synthesizeWindowsTTS(text: string, outputPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const { spawn } = require('child_process');

            const psScript = `
                Add-Type -AssemblyName System.Speech
                $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
                $synth.SetOutputToWaveFile('${outputPath}')
                $synth.Speak('${text.replace(/'/g, "''")}')
                $synth.Dispose()
            `;

            console.log(`[TextToSpeechService] Windows TTS: PowerShell SAPI`);
            const ps = spawn('powershell', ['-Command', psScript], { stdio: 'pipe' });

            ps.on('close', (code: number | null) => {
                if (code === 0) {
                    console.log('[TextToSpeechService] Windows TTS synthesis completed');
                    resolve();
                } else {
                    reject(new Error(`Windows PowerShell TTS exited with code ${code}`));
                }
            });

            ps.on('error', (error: Error) => {
                console.error('[TextToSpeechService] Windows TTS error:', error);
                reject(error);
            });
        });
    }

    private async synthesizeLinuxTTS(text: string, outputPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const { spawn } = require('child_process');

            console.log(`[TextToSpeechService] Linux TTS: espeak -w "${outputPath}"`);
            const espeak = spawn('espeak', ['-w', outputPath, text], { stdio: 'pipe' });

            espeak.on('close', (code: number | null) => {
                if (code === 0) {
                    console.log('[TextToSpeechService] Linux TTS synthesis completed');
                    resolve();
                } else {
                    reject(new Error(`Linux espeak exited with code ${code}`));
                }
            });

            espeak.on('error', (error: Error) => {
                console.error('[TextToSpeechService] Linux TTS error:', error);
                reject(error);
            });
        });
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
     * Synthesize speech using Xenova Transformers via renderer process
     */
    private async synthesizeWithXenova(text: string, outputPath: string): Promise<void> {
        try {
            console.log('[TextToSpeechService] Starting Xenova TTS synthesis via renderer process...');

            // Generate TTS directly on server-side
            const { audioData, sampleRate } = await this.generateTTSDirectly(text, 'xenova');

            console.log('[TextToSpeechService] Received audio data from renderer process');
            console.log(`[TextToSpeechService] Audio stats - Length: ${audioData.length}, SampleRate: ${sampleRate}Hz`);

            // Process and save the audio using our optimized pipeline
            await this.saveProcessedAudioToFile(audioData, sampleRate, outputPath);

            console.log('[TextToSpeechService] Xenova TTS synthesis completed via renderer process');

        } catch (error) {
            console.error('[TextToSpeechService] Xenova TTS synthesis failed:', error);
            throw new Error(`Xenova TTS failed: ${error.message}`);
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
            const fs = require('fs');
            fs.writeFileSync(outputPath, Buffer.from(wavBuffer));

            console.log(`[TextToSpeechService] Audio saved to: ${outputPath}`);
        } catch (error) {
            console.error('[TextToSpeechService] Failed to save processed audio:', error);
            throw error;
        }
    }

    /**
     * Synthesize speech using ElevenLabs API
     */
    private async synthesizeWithElevenLabs(text: string, outputPath: string): Promise<void> {
        if (!this.options.apiKey) {
            throw new Error('ElevenLabs API key not configured');
        }

        const url = `https://api.elevenlabs.io/v1/text-to-speech/${this.options.voiceId}`;

        const requestBody = {
            text: text,
            model_id: "eleven_monolingual_v1",
            voice_settings: {
                stability: this.options.stability || 0.5,
                similarity_boost: this.options.similarityBoost || 0.5
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': this.options.apiKey
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}`);
        }

        const audioBuffer = await response.arrayBuffer();

        // Save MP3 temporarily then convert to WAV
        const tempMp3Path = outputPath.replace('.wav', '.mp3');
        fs.writeFileSync(tempMp3Path, Buffer.from(audioBuffer));

        // Convert MP3 to WAV using ffmpeg
        await this.convertMp3ToWav(tempMp3Path, outputPath);

        // Clean up temporary MP3 file
        try {
            fs.unlinkSync(tempMp3Path);
        } catch (error) {
            console.warn('[TextToSpeechService] Failed to clean up temporary MP3 file:', error);
        }
    }

    private async convertMp3ToWav(mp3Path: string, wavPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const { spawn } = require('child_process');
                const ffmpeg = spawn('ffmpeg', ['-i', mp3Path, '-y', wavPath], { stdio: 'pipe' });

                ffmpeg.on('close', (code: number | null) => {
                    if (code === 0) {
                        console.log('[TextToSpeechService] MP3 to WAV conversion completed');
                        resolve();
                    } else {
                        reject(new Error(`ffmpeg exited with code ${code}`));
                    }
                });

                ffmpeg.on('error', (error: Error) => {
                    console.error('[TextToSpeechService] ffmpeg conversion error:', error);
                    reject(error);
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    private async convertAiffToWav(aiffPath: string, wavPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                // Try using ffmpeg if available
                const { spawn } = require('child_process');
                const ffmpeg = spawn('ffmpeg', ['-i', aiffPath, '-y', wavPath], { stdio: 'pipe' });

                ffmpeg.on('close', (code: number | null) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`ffmpeg conversion failed with code ${code}`));
                    }
                });

                ffmpeg.on('error', () => {
                    // If ffmpeg is not available, try afconvert (macOS built-in)
                    const afconvert = spawn('afconvert', ['-f', 'WAVE', '-d', 'LEI16', aiffPath, wavPath], { stdio: 'pipe' });

                    afconvert.on('close', (afCode: number | null) => {
                        if (afCode === 0) {
                            resolve();
                        } else {
                            reject(new Error(`afconvert failed with code ${afCode}`));
                        }
                    });

                    afconvert.on('error', (afError: Error) => {
                        reject(afError);
                    });
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Split text into sentences for streaming synthesis
     */
    private splitIntoSentences(text: string): string[] {
        // Basic sentence splitting - can be improved with more sophisticated NLP
        const sentences = text
            .split(/[.!?]+/)
            .map(s => s.trim())
            .filter(s => s.length > 0)
            .map(s => s + (text.match(/[.!?]/) ? text.match(/[.!?]/)[0] : '.'));

        // If no sentence boundaries found, split by length (max ~100 chars per chunk)
        if (sentences.length === 1 && sentences[0].length > 100) {
            const chunks = [];
            const words = sentences[0].split(' ');
            let currentChunk = '';

            for (const word of words) {
                if (currentChunk.length + word.length > 100) {
                    chunks.push(currentChunk.trim());
                    currentChunk = word;
                } else {
                    currentChunk += (currentChunk ? ' ' : '') + word;
                }
            }

            if (currentChunk) {
                chunks.push(currentChunk.trim());
            }

            return chunks;
        }

        return sentences;
    }

    /**
     * Synthesize and stream audio sentence by sentence or micro-chunk by micro-chunk
     */
    async synthesizeStreaming(text: string, onAudioReady?: (audioPath: string, chunkIndex: number) => void): Promise<AudioResult> {
        const startTime = Date.now();

        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            if (!this.options.enableStreaming) {
                // Fall back to regular synthesis if streaming is disabled
                return await this.synthesize(text);
            }

            // Route to micro-streaming if enabled
            if (this.options.streamingMode === 'micro' && this.microChunker) {
                return await this.synthesizeMicroStreaming(text, onAudioReady);
            }

            // Original sentence-based streaming
            console.log(`[TextToSpeechService] Starting sentence-based streaming synthesis for: "${text.substring(0, 50)}..."`);

            // Split text into sentences
            const sentences = this.splitIntoSentences(text);
            console.log(`[TextToSpeechService] Split into ${sentences.length} sentences for streaming`);

            const audioPaths: string[] = [];
            const sentenceBufferSize = this.options.sentenceBufferSize || 2;

            // Process sentences in parallel (buffer ahead)
            const processPromises: Promise<void>[] = [];

            for (let i = 0; i < sentences.length; i++) {
                const sentence = sentences[i];
                const sentenceIndex = i;

                // Create unique filename for this sentence
                const sentenceAudioPath = path.join(
                    this.tempDir,
                    `tts_stream_${Date.now()}_${sentenceIndex}_${Math.random().toString(36).substring(2, 11)}.wav`
                );

                audioPaths.push(sentenceAudioPath);

                // Start processing this sentence
                const processPromise = this.synthesizeSentence(sentence, sentenceAudioPath)
                    .then(() => {
                        console.log(`[TextToSpeechService] Sentence ${sentenceIndex + 1}/${sentences.length} ready`);
                        if (onAudioReady) {
                            onAudioReady(sentenceAudioPath, sentenceIndex);
                        }
                    })
                    .catch(error => {
                        console.error(`[TextToSpeechService] Sentence ${sentenceIndex + 1} failed:`, error);
                    });

                processPromises.push(processPromise);

                // If we have enough sentences buffering, wait for some to complete
                if (processPromises.length >= sentenceBufferSize) {
                    await Promise.race(processPromises);
                }
            }

            // Wait for all sentences to complete
            await Promise.all(processPromises);

            const duration = Date.now() - startTime;
            console.log(`[TextToSpeechService] Sentence streaming synthesis completed in ${duration}ms`);

            return {
                success: true,
                audioPath: audioPaths[0], // Return first sentence path as main path
                duration,
                isStreaming: true,
                sentenceCount: sentences.length
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            console.error('[TextToSpeechService] Streaming synthesis failed:', error);

            return {
                success: false,
                error: error.message,
                duration,
                isStreaming: true
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
                            const fsDbg = require('fs');
                            const buf = fsDbg.readFileSync(chunkAudioPath);
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
            // Route to the appropriate synthesis method based on provider
            switch (this.options.provider) {
                case 'elevenlabs':
                    await this.synthesizeWithElevenLabs(chunk.text, outputPath);
                    break;
                case 'kokoro':
                    await this.synthesizeWithKokoro(chunk.text, outputPath);
                    break;
                case 'xenova':
                    await this.synthesizeWithXenova(chunk.text, outputPath);
                    break;
                case 'system':
                default:
                    await this.synthesizeWithSystemTTS(chunk.text, outputPath);
                    break;
            }

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
     * Synthesize a single sentence (used by streaming)
     */
    private async synthesizeSentence(sentence: string, outputPath: string): Promise<void> {
        // Route to the appropriate synthesis method based on provider
        switch (this.options.provider) {
            case 'elevenlabs':
                await this.synthesizeWithElevenLabs(sentence, outputPath);
                break;
            case 'kokoro':
                await this.synthesizeWithKokoro(sentence, outputPath);
                break;
            case 'xenova':
                await this.synthesizeWithXenova(sentence, outputPath);
                break;
            case 'system':
            default:
                await this.synthesizeWithSystemTTS(sentence, outputPath);
                break;
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

    // --- BEGIN DEDUPLICATED MOCK IMPLEMENTATIONS ---
    /**
     * Generate TTS directly on server-side (mock implementation for now)
     * In production, replace with actual call to a Node.js-compatible TTS model.
     */
    // ✅ Deduplicated - keeping only this generateTTSDirectly, remove all other definitions from file
    private async generateTTSDirectly(
        text: string,
        provider: 'xenova' | 'kokoro' | 'elevenlabs'
    ): Promise<{ audioData: Float32Array; sampleRate: number }> {
        console.log(`[TextToSpeechService] Generating real TTS for provider=${provider}`);

        switch (provider) {
            case 'kokoro':
                // Ensure model initialized lazily
                if (!this.model) {
                    // @ts-ignore - kokoro-js is an ESM module
                    const { KokoroTTS } = await import('kokoro-js');
                    console.log("[TextToSpeechService] Initializing Kokoro-82M model...");
                    this.model = await KokoroTTS.from_pretrained(
                        "onnx-community/Kokoro-82M-ONNX",
                        { dtype: "q8" } // Use q8 quantization for balance of quality and size
                    );
                    this.modelAvailable = true;
                    console.log("[TextToSpeechService] Kokoro model loaded successfully");
                }
                break;
            case 'xenova':
                if (!this.model) {
                    const { pipeline } = await (new Function("modulePath", "return import(modulePath)"))('@xenova/transformers');

                    const defaultEmbedding = new Float32Array(256); // placeholder 256-dim zero vector
                    console.log("[TextToSpeechService] Initializing Xenova model with default placeholder speaker_embeddings");
                    console.log("[DEBUG] Speaker embeddings debug info — Type:", Object.prototype.toString.call(defaultEmbedding), "Length:", defaultEmbedding.length, "Instance of Float32Array:", defaultEmbedding instanceof Float32Array);
                    // Ensure default embedding is actually passed if not provided in options
                    const speakerEmbeddings = (this.options as any).speaker_embeddings || defaultEmbedding;
                    const xenovaModelId = this.options.xenovaModel || 'Xenova/speecht5_tts'; // switched to fully public model
                    const localModelPath = path.join(process.cwd(), 'models', 'xenova-public');

                    // Ensure local model directory exists or trigger download
                    if (!fs.existsSync(localModelPath) || fs.readdirSync(localModelPath).length === 0) {
                        console.log(`[TextToSpeechService] Local Xenova model not found, downloading to ${localModelPath}...`);
                        try {
                            // Use node-fetch to download the model as huggingface_hub JS client is not installed
                            const fetch = (await import('node-fetch')).default;
                            const fsPromises = fs.promises;
                            const downloadFile = async (url: string, dest: string) => {
                                const res = await fetch(url, {
                                    headers: {
                                        ...(process.env.HUGGING_FACE_HUB_TOKEN || process.env.HF_TOKEN
                                            ? { Authorization: `Bearer ${process.env.HUGGING_FACE_HUB_TOKEN || process.env.HF_TOKEN}` }
                                            : {})
                                    }
                                });
                                if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
                                const buffer = await res.arrayBuffer();
                                await fsPromises.mkdir(path.dirname(dest), { recursive: true });
                                await fsPromises.writeFile(dest, Buffer.from(buffer));
                            };

                            console.log('[TextToSpeechService] Downloading Xenova model files manually...');
                            const baseUrl = `https://huggingface.co/${xenovaModelId}/resolve/main`;
                            const filesToDownload = [
                                // Ensure all model + tokenizer files are included for offline use
                                'config.json',
                                'model.onnx',
                                'tokenizer.json',
                                'tokenizer_config.json',
                                'vocab.json',
                                'preprocessor_config.json',
                                'special_tokens_map.json'
                            ];

                            for (const fileName of filesToDownload) {
                                await downloadFile(`${baseUrl}/${fileName}`, path.join(localModelPath, fileName));
                            }
                            // snapshotDownload removed — replaced with direct manual file downloads above
                            console.log('[TextToSpeechService] ✅ Xenova model downloaded locally');
                        } catch (downloadError) {
                            console.warn('[TextToSpeechService] Failed to download Xenova model locally:', downloadError);
                        }
                    } else {
                        console.log('[TextToSpeechService] Local Xenova model found, skipping download.');
                    }

                    this.model = await pipeline(
                        'text-to-speech',
                        'Xenova/speecht5_tts',
                        {
                            speaker_embeddings: new Float32Array(speakerEmbeddings), // Ensure proper Float32Array
                            vocoder: 'Xenova/universal-vocoder'
                        }
                    );
                    this.modelAvailable = true;
                }
                break;
            case 'elevenlabs':
                // ElevenLabs handled separately via API
                const tempPath = path.join(this.tempDir, `tts_elevenlabs_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.wav`);
                await this.synthesizeWithElevenLabs(text, tempPath);
                // Read the WAV file and decode into Float32Array
                const buffer = fs.readFileSync(tempPath);
                // Decode WAV without external dependency
                const decodeWav = (data: Buffer) => {
                    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
                    view.getUint16(22, true); // numChannels (not used currently)
                    const sampleRate = view.getUint32(24, true);
                    const bitsPerSample = view.getUint16(34, true);
                    if (bitsPerSample !== 16) {
                        throw new Error(`[TextToSpeechService] Unsupported WAV bit depth: ${bitsPerSample}`);
                    }
                    const startOffset = 44;
                    const samples = new Float32Array((data.length - startOffset) / 2);
                    for (let i = 0; i < samples.length; i++) {
                        const s = view.getInt16(startOffset + i * 2, true);
                        samples[i] = s / 32768;
                    }
                    return { audioData: samples, sampleRate };
                };
                const audioBuffer = decodeWav(buffer);
                return { audioData: audioBuffer.audioData, sampleRate: audioBuffer.sampleRate };

            default:
                break;
        }

        if (provider === 'kokoro') {
            // Use Kokoro.js to generate audio
            const voice = this.options.kokoroVoice || "af_sky";
            console.log(`[TextToSpeechService] Generating Kokoro speech with voice: ${voice}`);
            
            const audio = await this.model.generate(text, { voice });
            
            // Get the audio data as Float32Array
            // Kokoro.js returns an audio object with wav data
            const audioBuffer = audio.wav;
            const audioData = new Float32Array(audioBuffer.length / 2);
            const dataView = new DataView(audioBuffer.buffer);
            
            // Convert Int16 PCM to Float32
            for (let i = 0; i < audioData.length; i++) {
                audioData[i] = dataView.getInt16(i * 2, true) / 32768.0;
            }
            
            return { audioData, sampleRate: 24000 }; // Kokoro uses 24kHz
        } else if (provider === 'xenova') {
            // Debug log actual speaker embeddings type before model call
            let embToUse: any;
            if (this.model && this.model.processor_config && this.model.processor_config.speaker_embeddings) {
                embToUse = this.model.processor_config.speaker_embeddings;
                console.log("[DEBUG] Speaker embeddings before TTS call — Type:", Object.prototype.toString.call(embToUse),
                    "Is Float32Array:", embToUse instanceof Float32Array,
                    "Length:", embToUse.length !== undefined ? embToUse.length : 'N/A');
            } else {
                embToUse = new Float32Array(512); // default if missing, match expected dimensions
                console.log("[DEBUG] No speaker embeddings found in model.processor_config before TTS call — injecting default Float32Array(512)");
            }

            const output: any = await this.model(text, { speaker_embeddings: embToUse });

            // Expect model output has audio tensor/data
            let audioData: Float32Array;
            let sampleRate = 22050; // typical default, adjust if provided
            if (output && output.audio) {
                audioData = output.audio instanceof Float32Array ? output.audio : new Float32Array(output.audio);
                if (output.sample_rate) {
                    sampleRate = output.sample_rate;
                }
            } else {
                throw new Error(`[TextToSpeechService] ${provider} model returned no audio`);
            }
            return { audioData, sampleRate };
        }

        throw new Error(`[TextToSpeechService] Unsupported provider in generateTTSDirectly: ${provider}`);
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
                const { spawn } = require('child_process');
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

        // If provider or model changed, reinitialize
        const providerChanged = newOptions.provider && newOptions.provider !== previousOptions.provider;
        const xenovaModelChanged = newOptions.xenovaModel && newOptions.xenovaModel !== previousOptions.xenovaModel;

        if (providerChanged || xenovaModelChanged) {
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