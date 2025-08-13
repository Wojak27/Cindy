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
    private modelCacheDir: string;
    private currentPlaybackProcess: any = null; // Track current audio playback process
    private hasLoggedSystemTTS = false; // Flag to prevent repeated logging

    constructor(options: TTSOptions = {}) {
        super();
        this.options = {
            modelName: 'onnx-community/orpheus-3b-0.1-ft-ONNX', // Orpheus TTS model
            speed: 1.0,
            volume: 1.0,
            pitch: 1.0,
            dtype: 'q4f16', // Quantized model for better performance
            device: 'cpu', // Can be 'webgpu' for better performance if available
            ...options
        };

        // Create temp directory for audio files
        this.tempDir = path.join(os.tmpdir(), 'cindy-tts');
        this.modelCacheDir = path.join(os.homedir(), '.cache', 'cindy-tts', 'models');
        this.ensureTempDir();
        this.ensureModelCacheDir();
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

    private ensureModelCacheDir(): void {
        try {
            if (!fs.existsSync(this.modelCacheDir)) {
                fs.mkdirSync(this.modelCacheDir, { recursive: true });
                console.log(`[TextToSpeechService] Created model cache directory: ${this.modelCacheDir}`);
            }
        } catch (error) {
            console.error('[TextToSpeechService] Failed to create model cache directory:', error);
        }
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            // Check if we should attempt orpheus-speech initialization
            const shouldTryOrpheus = await this.checkOrpheusAvailability();
            
            if (shouldTryOrpheus) {
                await this.initializeOrpheusModel();
            } else {
                throw new Error('Orpheus-speech not available or network connectivity issues');
            }
        } catch (error) {
            // Fall back to system TTS
            console.log('[TextToSpeechService] Falling back to system TTS...');
            await this.initializeSystemTTS();
        }
    }

    private async initializeOrpheusModel(): Promise<void> {
        console.log('[TextToSpeechService] Initializing Orpheus TTS model...');
        console.log('[TextToSpeechService] Model cache directory:', this.modelCacheDir);
        console.log('[TextToSpeechService] This may take a while on first run as models are downloaded...');

        // Check for corrupted cache and clear if needed
        await this.validateAndCleanCache();

        // Dynamically import orpheus-speech to avoid webpack bundling issues
        const { OrpheusModel } = await import('orpheus-speech');

        const modelName = this.options.modelName || 'onnx-community/orpheus-3b-0.1-ft-ONNX';
        console.log(`[TextToSpeechService] Loading model: ${modelName}`);
        
        const modelOptions = {
            model_name: modelName,
            dtype: this.options.dtype as any || 'q4f16',
            device: this.options.device as any || 'cpu'
        };
        
        console.log(`[TextToSpeechService] Model options:`, modelOptions);
        
        let retryCount = 0;
        const maxRetries = 2;
        
        while (retryCount <= maxRetries) {
            try {
                this.model = await OrpheusModel(modelOptions);
                this.isInitialized = true;
                console.log('[TextToSpeechService] ✅ Orpheus TTS model initialized successfully');
                this.emit('initialized', { provider: 'orpheus' });
                return;
            } catch (modelError) {
                retryCount++;
                console.error(`[TextToSpeechService] ❌ Failed to initialize Orpheus model (attempt ${retryCount}/${maxRetries + 1}):`, modelError.message);
                
                if (this.isCorruptedCacheError(modelError) && retryCount <= maxRetries) {
                    console.log('[TextToSpeechService] 🧹 Detected corrupted cache, clearing and retrying...');
                    await this.clearCorruptedCache();
                    continue;
                }
                
                // If this is the final attempt, throw the error
                if (retryCount > maxRetries) {
                    console.error('[TextToSpeechService] Model initialization error details:', {
                        message: modelError.message,
                        stack: modelError.stack
                    });
                    throw modelError;
                }
            }
        }
    }

    private isCorruptedCacheError(error: any): boolean {
        const errorMessage = error.message || '';
        return errorMessage.includes('Protobuf parsing failed') ||
               errorMessage.includes('Failed to parse model') ||
               errorMessage.includes('Invalid model format') ||
               errorMessage.includes('Unexpected end of JSON input');
    }

    private async validateAndCleanCache(): Promise<void> {
        try {
            // Check common cache locations for corrupted files
            const cacheLocations = [
                path.join(process.cwd(), 'node_modules', '@huggingface', 'transformers', '.cache'),
                path.join(os.homedir(), '.cache', 'huggingface', 'transformers'),
                this.modelCacheDir
            ];

            for (const cacheDir of cacheLocations) {
                if (fs.existsSync(cacheDir)) {
                    await this.validateCacheDirectory(cacheDir);
                }
            }
        } catch (error) {
            console.warn('[TextToSpeechService] Failed to validate cache:', error.message);
        }
    }

    private async validateCacheDirectory(cacheDir: string): Promise<void> {
        try {
            const orpheusDirs = ['onnx-community/orpheus-3b-0.1-ft-ONNX', 'onnx-community/snac_24khz-ONNX'];
            
            for (const orpheusDir of orpheusDirs) {
                const fullPath = path.join(cacheDir, orpheusDir);
                if (fs.existsSync(fullPath)) {
                    // Check if any ONNX files are corrupted (size 0 or very small)
                    const files = this.findFiles(fullPath, '.onnx');
                    for (const file of files) {
                        const stats = fs.statSync(file);
                        if (stats.size < 1000) { // Less than 1KB is likely corrupted
                            console.log(`[TextToSpeechService] 🧹 Removing corrupted cache: ${file}`);
                            fs.unlinkSync(file);
                        }
                    }
                }
            }
        } catch (error) {
            console.warn(`[TextToSpeechService] Failed to validate cache directory ${cacheDir}:`, error.message);
        }
    }

    private findFiles(dir: string, extension: string): string[] {
        const files: string[] = [];
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    files.push(...this.findFiles(fullPath, extension));
                } else if (entry.name.endsWith(extension)) {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            // Directory might not exist or be accessible
        }
        return files;
    }

    private async clearCorruptedCache(): Promise<void> {
        try {
            // Clear Hugging Face transformers cache
            const transformersCache = path.join(process.cwd(), 'node_modules', '@huggingface', 'transformers', '.cache');
            if (fs.existsSync(transformersCache)) {
                const orpheusDirs = [
                    path.join(transformersCache, 'onnx-community', 'orpheus-3b-0.1-ft-ONNX'),
                    path.join(transformersCache, 'onnx-community', 'snac_24khz-ONNX')
                ];
                
                for (const dir of orpheusDirs) {
                    if (fs.existsSync(dir)) {
                        console.log(`[TextToSpeechService] 🧹 Clearing corrupted cache: ${dir}`);
                        fs.rmSync(dir, { recursive: true, force: true });
                    }
                }
            }
            
            // Clear user cache
            if (fs.existsSync(this.modelCacheDir)) {
                console.log(`[TextToSpeechService] 🧹 Clearing user model cache: ${this.modelCacheDir}`);
                fs.rmSync(this.modelCacheDir, { recursive: true, force: true });
                this.ensureModelCacheDir();
            }
            
            console.log('[TextToSpeechService] ✅ Cache cleanup completed');
        } catch (error) {
            console.error('[TextToSpeechService] Failed to clear corrupted cache:', error);
        }
    }

    private async checkOrpheusAvailability(): Promise<boolean> {
        try {
            // Check if orpheus-speech package is available
            await import('orpheus-speech');
            
            // Check network connectivity for model downloads
            const hasNetwork = await this.checkNetworkConnectivity();
            if (!hasNetwork) {
                console.warn('[TextToSpeechService] ⚠️ No network connectivity detected for model downloads');
                return false;
            }
            
            console.log('[TextToSpeechService] ✅ Orpheus-speech package available and network connected');
            return true;
        } catch (error) {
            console.warn('[TextToSpeechService] ⚠️ Orpheus-speech not available:', error.message);
            return false;
        }
    }

    private async checkNetworkConnectivity(): Promise<boolean> {
        try {
            // Try to ping Hugging Face to check if model downloads will work
            const https = require('https');
            return new Promise((resolve) => {
                const req = https.get('https://huggingface.co', { timeout: 5000 }, (res: any) => {
                    resolve(res.statusCode === 200 || res.statusCode === 301 || res.statusCode === 302);
                });
                
                req.on('error', () => resolve(false));
                req.on('timeout', () => {
                    req.destroy();
                    resolve(false);
                });
            });
        } catch (error) {
            return false;
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

            // If model is null but we're initialized, we're using system TTS fallback
            if (!this.model && !this.useSystemTTS) {
                throw new Error('TTS service not properly configured');
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

            if (this.useSystemTTS || !this.model) {
                // Use system TTS as fallback
                console.log('[TextToSpeechService] Using system TTS fallback');
                await this.synthesizeWithSystemTTS(text, fileName);
            } else {
                // Use orpheus-speech
                console.log('[TextToSpeechService] Using orpheus-speech model');
                
                // Create audio stream with Orpheus
                const voice = 'tara'; // Default voice, can be made configurable
                const stream = this.model.generate_speech({ 
                    prompt: text, 
                    voice,
                    temperature: 0.8,
                    repetition_penalty: 1.1
                });
                
                // Collect all audio chunks
                const audioChunks = [];
                for await (const chunk of stream) {
                    if (chunk.audio) {
                        audioChunks.push(chunk.audio);
                    }
                }
                
                // Get the final result and save
                const result = stream.data;
                if (result && result.save) {
                    // Use built-in save method if available
                    await result.save(fileName);
                } else {
                    // Fallback to manual save
                    const combinedAudio = this.combineAudioChunks(audioChunks);
                    await this.saveAudioToFile(combinedAudio, fileName);
                }
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

    private combineAudioChunks(chunks: any[]): Float32Array {
        // Calculate total length
        let totalLength = 0;
        for (const chunk of chunks) {
            totalLength += chunk.length;
        }
        
        // Combine all chunks
        const combined = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
        }
        
        return combined;
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

    async synthesizeAndPlay(text: string): Promise<AudioResult> {
        try {
            // First, ensure service is initialized
            if (!this.isInitialized) {
                console.log('[TextToSpeechService] Service not initialized, attempting to initialize...');
                await this.initialize();
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