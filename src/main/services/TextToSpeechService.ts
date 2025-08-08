import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface TTSOptions {
    modelName?: string;
    speed?: number;
    volume?: number;
    pitch?: number;
    dtype?: string;
    device?: string;
}

interface AudioResult {
    success: boolean;
    audioPath?: string;
    duration?: number;
    error?: string;
}

export class TextToSpeechService extends EventEmitter {
    private model: any = null;
    private isInitialized = false;
    private useSystemTTS = false;
    private options: TTSOptions;
    private tempDir: string;

    constructor(options: TTSOptions = {}) {
        super();
        this.options = {
            modelName: 'microsoft/speecht5_tts',
            speed: 1.0,
            volume: 1.0,
            pitch: 1.0,
            dtype: 'fp32',
            device: 'cpu',
            ...options
        };

        // Create temp directory for audio files
        this.tempDir = path.join(os.tmpdir(), 'cindy-tts');
        this.ensureTempDir();
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

        try {
            console.log('[TextToSpeechService] Initializing Orpheus TTS model...');
            console.log('[TextToSpeechService] This may take a while on first run as models are downloaded...');

            // Dynamically import orpheus-speech to avoid webpack bundling issues
            const { OrpheusModel } = await import('orpheus-speech');

            // Initialize the Orpheus model using the async function
            this.model = await OrpheusModel({
                model_name: this.options.modelName || 'microsoft/speecht5_tts',
                dtype: this.options.dtype as any || 'fp32',
                device: this.options.device as any || 'cpu'
            });

            this.isInitialized = true;
            console.log('[TextToSpeechService] TTS model initialized successfully');
            this.emit('initialized');
        } catch (error) {
            console.error('[TextToSpeechService] Failed to initialize TTS model:', error);
            console.error('[TextToSpeechService] This might be due to:');
            console.error('  - Missing orpheus-speech package');
            console.error('  - Missing internet connection for model download');
            console.error('  - Insufficient disk space for model files');
            console.error('  - System compatibility issues');
            console.error('  - Model not available for the specified configuration');
            
            // Fall back to system TTS
            console.log('[TextToSpeechService] Falling back to system TTS...');
            this.useSystemTTS = true;
            this.isInitialized = true;
            this.emit('initialized', { fallback: true });
            
            return; // Don't throw error, just use fallback
        }
    }

    async synthesize(text: string, outputPath?: string): Promise<AudioResult> {
        const startTime = Date.now();

        try {
            if (!this.isInitialized || !this.model) {
                throw new Error('TTS service not initialized');
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

            if (this.useSystemTTS) {
                // Use system TTS as fallback
                await this.synthesizeWithSystemTTS(text, fileName);
            } else {
                // Use orpheus-speech
                const audioData = await this.model.generate(text);
                await this.saveAudioToFile(audioData, fileName);
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

            this.emit('error', { text, error, duration });

            return {
                success: false,
                error: error.message,
                duration
            };
        }
    }

    private async saveAudioToFile(audioData: any, filePath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                // audioData from Orpheus should be a Float32Array or similar
                // Convert to WAV format and write to file
                if (audioData instanceof Float32Array || Array.isArray(audioData)) {
                    // Create a simple WAV file buffer
                    const wavBuffer = this.encodeWAV(audioData, 16000); // 16kHz sample rate
                    fs.writeFileSync(filePath, Buffer.from(wavBuffer));
                } else if (audioData.audio) {
                    // If audioData has an audio property
                    const wavBuffer = this.encodeWAV(audioData.audio, audioData.sample_rate || 16000);
                    fs.writeFileSync(filePath, Buffer.from(wavBuffer));
                } else {
                    // Try to write raw data
                    fs.writeFileSync(filePath, Buffer.from(audioData));
                }
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    private encodeWAV(samples: Float32Array | number[], sampleRate: number): ArrayBuffer {
        const length = samples.length;
        const buffer = new ArrayBuffer(44 + length * 2);
        const view = new DataView(buffer);

        // WAV header
        const writeString = (offset: number, string: string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + length * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, length * 2, true);

        // Convert float samples to 16-bit PCM
        const offset = 44;
        for (let i = 0; i < length; i++) {
            const sample = Math.max(-1, Math.min(1, samples[i]));
            view.setInt16(offset + i * 2, sample * 0x7FFF, true);
        }

        return buffer;
    }

    private async synthesizeWithSystemTTS(text: string, outputPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const { spawn } = require('child_process');
                let command: string;
                let args: string[];

                switch (process.platform) {
                    case 'darwin': // macOS
                        command = 'say';
                        args = ['-o', outputPath, '--data-format=LEF32@22050', text];
                        break;
                    case 'win32': // Windows
                        // Use PowerShell with SAPI
                        command = 'powershell';
                        args = [
                            '-Command',
                            `Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.SetOutputToWaveFile('${outputPath}'); $synth.Speak('${text.replace(/'/g, "''")}'); $synth.Dispose()`
                        ];
                        break;
                    case 'linux': // Linux
                        // Use espeak if available
                        command = 'espeak';
                        args = ['-w', outputPath, text];
                        break;
                    default:
                        throw new Error(`System TTS not supported on platform: ${process.platform}`);
                }

                console.log(`[TextToSpeechService] Using system TTS: ${command} ${args.join(' ')}`);
                const tts = spawn(command, args, { stdio: 'pipe' });

                tts.on('close', (code: number | null) => {
                    if (code === 0) {
                        console.log('[TextToSpeechService] System TTS synthesis completed');
                        resolve();
                    } else {
                        reject(new Error(`System TTS exited with code ${code}`));
                    }
                });

                tts.on('error', (error: Error) => {
                    console.error('[TextToSpeechService] System TTS error:', error);
                    reject(error);
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    async synthesizeAndPlay(text: string): Promise<AudioResult> {
        try {
            const result = await this.synthesize(text);

            if (result.success && result.audioPath) {
                await this.playAudioFile(result.audioPath);
            }

            return result;
        } catch (error) {
            console.error('[TextToSpeechService] Synthesize and play failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    private async playAudioFile(filePath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const { spawn } = require('child_process');

                // Platform-specific audio player commands
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
                        throw new Error(`Unsupported platform: ${process.platform}`);
                }

                const player = spawn(command, args, { stdio: 'pipe' });

                player.on('close', (code: number | null) => {
                    if (code === 0) {
                        console.log('[TextToSpeechService] Audio playback completed');
                        this.emit('played', filePath);
                        resolve();
                    } else {
                        reject(new Error(`Audio player exited with code ${code}`));
                    }
                });

                player.on('error', (error: Error) => {
                    console.error('[TextToSpeechService] Audio playback error:', error);
                    reject(error);
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    async updateOptions(newOptions: Partial<TTSOptions>): Promise<void> {
        this.options = { ...this.options, ...newOptions };

        // If model name changed, reinitialize
        if (newOptions.modelName && newOptions.modelName !== this.options.modelName) {
            this.isInitialized = false;
            await this.initialize();
        }

        this.emit('optionsUpdated', this.options);
        console.log('[TextToSpeechService] Options updated:', this.options);
    }

    getOptions(): TTSOptions {
        return { ...this.options };
    }

    isReady(): boolean {
        return this.isInitialized && this.model !== null;
    }

    async cleanup(): Promise<void> {
        try {
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
            if (!this.model) {
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
}

export type { TTSOptions, AudioResult };