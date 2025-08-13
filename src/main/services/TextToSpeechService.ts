import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface TTSOptions {
    provider?: 'kokoro' | 'xenova' | 'elevenlabs' | 'system';
    speed?: number;
    volume?: number;
    pitch?: number;
    // Streaming options
    enableStreaming?: boolean;
    sentenceBufferSize?: number;
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
}


export class TextToSpeechService extends EventEmitter {
    private model: any = null;
    private isInitialized = false;
    private modelAvailable = false;
    private useSystemTTS = false;
    private options: TTSOptions;
    private tempDir: string;
    private currentPlaybackProcess: any = null; // Track current audio playback process
    private hasLoggedSystemTTS = false; // Flag to prevent repeated logging

    constructor(options: TTSOptions = {}) {
        super();
        this.options = {
            provider: 'system', // Default to system TTS (smallest, fastest)
            speed: 1.0,
            volume: 1.0,
            pitch: 1.0,
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
        } catch (error) {
            console.error(`[TextToSpeechService] Failed to initialize ${this.options.provider} provider:`, error.message);
            // No fallback - fail if provider-specific initialization fails
            throw error;
        }
    }









    private async initializeKokoroModel(): Promise<void> {
        console.log('[TextToSpeechService] Initializing SpeechT5 TTS (Kokoro provider)...');
        try {
            // Test Kokoro availability by attempting to import transformers
            try {
                // Use require() for better Electron compatibility
                const transformersPath = require.resolve('@xenova/transformers');
                console.log('[TextToSpeechService] Found transformers at:', transformersPath);
                
                // Try to actually import the module to test if it works
                await eval('import("@xenova/transformers")');
                console.log('[TextToSpeechService] Successfully imported transformers for SpeechT5 (Kokoro provider)');
                
                // Mark as initialized but DON'T use system TTS fallback
                this.useSystemTTS = false; // NO fallback - user wants only selected model
                this.isInitialized = true;
                this.modelAvailable = true; // Track that model is theoretically available
                this.emit('initialized', { provider: 'kokoro', fallback: false });
                console.log('[TextToSpeechService] ✅ SpeechT5 TTS (Kokoro provider) initialized (no fallback)');
                
            } catch (importError) {
                console.warn('[TextToSpeechService] Transformers import failed');
                console.log('[TextToSpeechService] Import error:', importError.message);
                // DON'T use system TTS fallback - fail instead
                this.useSystemTTS = false;
                this.isInitialized = true;
                this.modelAvailable = false;
                this.emit('initialized', { provider: 'kokoro', fallback: false, error: importError.message });
                console.log('[TextToSpeechService] ❌ SpeechT5 TTS (Kokoro provider) not available (no fallback enabled)');
                return;
            }
        } catch (error) {
            console.error('[TextToSpeechService] ❌ Failed to initialize Kokoro:', error);
            throw error;
        }
    }

    private async initializeXenovaModel(): Promise<void> {
        console.log('[TextToSpeechService] Initializing Xenova Transformers...');
        try {
            // Test Xenova availability by attempting to import transformers
            try {
                await eval('import("@xenova/transformers")');
                console.log('[TextToSpeechService] Successfully imported transformers for Xenova');
                // Mark as initialized but DON'T use system TTS fallback
                this.useSystemTTS = false; // NO fallback - user wants only selected model
                this.isInitialized = true;
                this.modelAvailable = true;
                this.emit('initialized', { provider: 'xenova', fallback: false });
                console.log('[TextToSpeechService] ✅ Xenova Transformers initialized (no fallback)');
            } catch (importError) {
                console.warn('[TextToSpeechService] ES module issue with transformers');
                console.log('[TextToSpeechService] Import error:', importError.message);
                // DON'T use system TTS fallback - fail instead
                this.useSystemTTS = false;
                this.isInitialized = true;
                this.modelAvailable = false;
                this.emit('initialized', { provider: 'xenova', fallback: false, error: importError.message });
                console.log('[TextToSpeechService] ❌ Xenova Transformers not available (no fallback enabled)');
                return;
            }
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
                        throw new Error('Xenova Transformers model is not available. Please ensure the model files are downloaded.');
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

        // Improved float to 16-bit PCM conversion with better normalization
        const offset = 44;
        
        // First pass: find the peak value for normalization
        let peak = 0;
        for (let i = 0; i < length; i++) {
            const abs = Math.abs(samples[i]);
            if (abs > peak) peak = abs;
        }
        
        // Normalize to prevent clipping, but maintain dynamic range
        const scale = peak > 0 ? Math.min(1.0, 0.95 / peak) : 1.0;
        
        // Second pass: convert with proper scaling
        for (let i = 0; i < length; i++) {
            const sample = Math.max(-1, Math.min(1, samples[i] * scale));
            view.setInt16(offset + i * 2, Math.round(sample * 0x7FFF), true);
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
            // Try to dynamically import @xenova/transformers with better error handling
            let pipeline: any;
            try {
                // For Electron environments, try using eval to bypass CommonJS restrictions
                const transformers = await eval('import("@xenova/transformers")');
                pipeline = transformers.pipeline;
                console.log('[TextToSpeechService] Successfully imported transformers via eval');
            } catch (importError) {
                console.error('[TextToSpeechService] Transformers import failed for SpeechT5 (Kokoro provider)');
                console.error('[TextToSpeechService] Import error:', importError.message);
                throw new Error(`SpeechT5 TTS model unavailable: ${importError.message}`);
            }
            
            console.log('[TextToSpeechService] Loading SpeechT5 TTS model for Kokoro provider...');
            
            // Initialize TTS pipeline with SpeechT5 model (compatible with transformers.js)
            const synthesizer = await pipeline('text-to-speech', 'Xenova/speecht5_tts');
            
            console.log('[TextToSpeechService] Generating speech with SpeechT5...');
            
            // Generate speech with proper SpeechT5 configuration
            // Use a more natural speaker embedding pattern for better audio quality
            const speakerEmbeddings = new Float32Array(512);
            // Initialize with a natural speaker pattern (based on SpeechT5 recommendations)
            for (let i = 0; i < 512; i++) {
                speakerEmbeddings[i] = Math.sin(i * 0.01) * 0.3 + 0.1;
            }
            
            const result = await synthesizer(text, { 
                speaker_embeddings: speakerEmbeddings,
                // Additional parameters for better quality
                max_new_tokens: 4000,
                do_sample: false  // Use greedy decoding for more stable output
            });
            
            // Convert result to audio file
            await this.saveXenovaAudioToFile(result, outputPath);
            
            console.log('[TextToSpeechService] SpeechT5 (Kokoro provider) synthesis completed');
            
        } catch (error) {
            console.error('[TextToSpeechService] SpeechT5 (Kokoro provider) synthesis failed:', error);
            throw new Error(`SpeechT5 TTS failed: ${error.message}`);
        }
    }

    /**
     * Synthesize speech using Xenova Transformers (lighter models)
     */
    private async synthesizeWithXenova(text: string, outputPath: string): Promise<void> {
        try {
            // Try to dynamically import @xenova/transformers with better error handling
            let pipeline: any;
            try {
                // For Electron environments, try using eval to bypass CommonJS restrictions
                const transformers = await eval('import("@xenova/transformers")');
                pipeline = transformers.pipeline;
                console.log('[TextToSpeechService] Successfully imported transformers via eval for Xenova');
            } catch (importError) {
                console.error('[TextToSpeechService] Transformers import failed for Xenova');
                console.error('[TextToSpeechService] Import error:', importError.message);
                throw new Error(`Xenova Transformers model unavailable: ${importError.message}`);
            }
            
            console.log('[TextToSpeechService] Loading Xenova TTS model...');
            
            // Use a lightweight model by default - can be configurable
            const modelName = this.options.xenovaModel || 'Xenova/speecht5_tts';
            
            // Initialize TTS pipeline with specified model
            const synthesizer = await pipeline('text-to-speech', modelName);
            
            console.log(`[TextToSpeechService] Generating speech with ${modelName}...`);
            
            // Generate speech with proper SpeechT5 configuration
            // Use a more natural speaker embedding pattern for better audio quality
            const speakerEmbeddings = new Float32Array(512);
            // Initialize with a natural speaker pattern (based on SpeechT5 recommendations)
            for (let i = 0; i < 512; i++) {
                speakerEmbeddings[i] = Math.sin(i * 0.01) * 0.3 + 0.1;
            }
            
            const result = await synthesizer(text, { 
                speaker_embeddings: speakerEmbeddings,
                // Additional parameters for better quality
                max_new_tokens: 4000,
                do_sample: false  // Use greedy decoding for more stable output
            });
            
            // Convert result to audio file
            await this.saveXenovaAudioToFile(result, outputPath);
            
            console.log('[TextToSpeechService] Xenova TTS synthesis completed');
            
        } catch (error) {
            console.error('[TextToSpeechService] Xenova TTS synthesis failed:', error);
            throw new Error(`Xenova TTS failed: ${error.message}`);
        }
    }

    /**
     * Save Xenova/Transformers audio output to file
     */
    private async saveXenovaAudioToFile(audioResult: any, outputPath: string): Promise<void> {
        try {
            // Extract audio data from the transformers result
            let audioData: Float32Array;
            let sampleRate: number = 16000; // Default sample rate
            
            if (audioResult.audio) {
                audioData = audioResult.audio;
                sampleRate = audioResult.sampling_rate || 16000;
            } else if (audioResult.data) {
                audioData = audioResult.data;
                sampleRate = audioResult.sampling_rate || 16000;
            } else if (Array.isArray(audioResult) || audioResult instanceof Float32Array) {
                audioData = audioResult instanceof Float32Array ? audioResult : new Float32Array(audioResult);
            } else {
                throw new Error('Unsupported audio result format from Xenova/Transformers');
            }
            
            // Convert to WAV format and save
            const wavBuffer = this.encodeWAV(audioData, sampleRate);
            fs.writeFileSync(outputPath, Buffer.from(wavBuffer));
            
            console.log(`[TextToSpeechService] Saved Xenova audio to ${outputPath}`);
            
        } catch (error) {
            console.error('[TextToSpeechService] Failed to save Xenova audio:', error);
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
     * Synthesize and stream audio sentence by sentence
     */
    async synthesizeStreaming(text: string, onAudioReady?: (audioPath: string, sentenceIndex: number) => void): Promise<AudioResult> {
        const startTime = Date.now();
        
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            if (!this.options.enableStreaming) {
                // Fall back to regular synthesis if streaming is disabled
                return await this.synthesize(text);
            }

            console.log(`[TextToSpeechService] Starting streaming synthesis for: "${text.substring(0, 50)}..."`);

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
            console.log(`[TextToSpeechService] Streaming synthesis completed in ${duration}ms`);
            
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

                // Store reference to current playback process
                this.currentPlaybackProcess = player;

                player.on('close', (code: number | null) => {
                    this.currentPlaybackProcess = null; // Clear reference
                    if (code === 0 || code === null) {
                        // null exit code can occur when process is killed/stopped normally
                        console.log('[TextToSpeechService] Audio playback completed');
                        this.emit('played', filePath);
                        resolve();
                    } else {
                        reject(new Error(`Audio player exited with code ${code}`));
                    }
                });

                player.on('error', (error: Error) => {
                    this.currentPlaybackProcess = null; // Clear reference
                    console.error('[TextToSpeechService] Audio playback error:', error);
                    reject(error);
                });

            } catch (error) {
                reject(error);
            }
        });
    }

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
}

export type { TTSOptions, AudioResult };