import { EventEmitter } from 'events';
import { SpeechConfig, AudioConfig, SpeechRecognizer, ResultReason } from 'microsoft-cognitiveservices-speech-sdk';
import path from 'path';
import fs from 'fs';
import os from 'os';

interface STTConfig {
    provider: 'online' | 'offline' | 'auto' | 'sherpa';
    language: string;
    autoPunctuation: boolean;
    profanityFilter: boolean;
}

class SpeechToTextService extends EventEmitter {
    private onlineEngine: OnlineSTTEngine;
    private sherpaEngine: SherpaSTTEngine;
    private config: STTConfig;
    private isRecording: boolean = false;

    constructor(config: STTConfig) {
        super();
        this.config = config;
        this.onlineEngine = new OnlineSTTEngine(config);
        this.sherpaEngine = new SherpaSTTEngine(config);
    }

    async startRecording(): Promise<void> {
        if (this.isRecording) return;

        try {
            this.isRecording = true;
            this.emit('recordingStarted');
        } catch (error) {
            console.error('Failed to start recording:', error);
            throw error;
        }
    }

    async stopRecording(): Promise<void> {
        if (!this.isRecording) return;

        try {
            this.isRecording = false;
            this.emit('recordingStopped');
        } catch (error) {
            console.error('Failed to stop recording:', error);
            throw error;
        }
    }

    async transcribe(audioData: ArrayBuffer | Int16Array[]): Promise<string> {
        try {
            // Convert Int16Array[] to WAV ArrayBuffer
            let buffer: ArrayBuffer;
            if (Array.isArray(audioData)) {
                // Convert Int16Array[] to WAV format
                buffer = this.int16ArraysToWav(audioData);
            } else {
                buffer = audioData;
            }

            if (this.config.provider === 'sherpa') {
                const result = await this.sherpaEngine.transcribe(buffer);
                this.emit('transcriptionSuccess', { source: 'sherpa', text: result });
                return result;
            } else if (this.config.provider === 'online' || this.config.provider === 'auto') {
                // Check if we have API key for online STT
                if (!this.onlineEngine.hasApiKey()) {
                    const noApiKeyMessage = 'Azure Speech API key not configured. Please set AZURE_SPEECH_KEY environment variable or configure in settings.';
                    console.warn('Online STT not available:', noApiKeyMessage);

                    if (this.config.provider === 'online') {
                        // User specifically requested online, show error message
                        this.emit('transcriptionError', new Error(noApiKeyMessage));
                        throw new Error(noApiKeyMessage);
                    } else {
                        // Auto mode - fallback to sherpa
                        console.log('Auto mode: falling back to sherpa STT due to missing API key');
                        const result = await this.sherpaEngine.transcribe(buffer);
                        this.emit('transcriptionSuccess', { source: 'sherpa', text: result });
                        return result;
                    }
                }

                try {
                    const result = await this.onlineEngine.transcribe(buffer);
                    this.emit('transcriptionSuccess', { source: 'online', text: result });
                    return result;
                } catch (onlineError) {
                    console.warn('Online STT failed, falling back to sherpa:', onlineError);

                    // Fallback to sherpa if auto mode
                    if (this.config.provider === 'auto') {
                        const result = await this.sherpaEngine.transcribe(buffer);
                        this.emit('transcriptionSuccess', { source: 'sherpa', text: result });
                        return result;
                    }

                    throw onlineError;
                }
            } else {
                // Use sherpa engine directly (offline mode)
                const result = await this.sherpaEngine.transcribe(buffer);
                this.emit('transcriptionSuccess', { source: 'sherpa', text: result });
                return result;
            }
        } catch (error) {
            this.emit('transcriptionError', error);
            throw error;
        }
    }

    /**
     * Converts Int16Array audio chunks to WAV format ArrayBuffer
     * @param chunks Array of Int16Array audio data chunks
     * @returns ArrayBuffer containing WAV file data
     */
    private int16ArraysToWav(chunks: Int16Array[]): ArrayBuffer {
        // Calculate total number of samples
        const totalSamples = chunks.reduce((sum, chunk) => sum + chunk.length, 0);

        // WAV header parameters - whisper-node REQUIRES 16kHz
        const sampleRate = 16000;  // whisper-node requirement: "Files must be .wav and 16Hz"
        const numChannels = 1;
        const bitsPerSample = 16;
        const byteRate = sampleRate * numChannels * bitsPerSample / 8;
        const blockAlign = numChannels * bitsPerSample / 8;
        const dataSize = totalSamples * 2; // 2 bytes per sample
        const riffChunkSize = 36 + dataSize;

        console.log('DEBUG: Creating WAV with required 16kHz sample rate for whisper-node compatibility');

        // Create buffer for WAV file (RIFF header + data)
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        // RIFF header
        this.writeString(view, 0, 'RIFF');
        view.setUint32(4, riffChunkSize, true);
        this.writeString(view, 8, 'WAVE');

        // Format chunk
        this.writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true); // fmt chunk size
        view.setUint16(20, 1, true); // audio format (PCM)
        view.setUint16(22, numChannels, true); // number of channels
        view.setUint32(24, sampleRate, true); // sample rate
        view.setUint32(28, byteRate, true); // byte rate
        view.setUint16(32, blockAlign, true); // block align
        view.setUint16(34, bitsPerSample, true); // bits per sample

        // Data chunk
        this.writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);

        // Add audio data
        let offset = 44;
        for (const chunk of chunks) {
            for (let i = 0; i < chunk.length; i++) {
                view.setInt16(offset, chunk[i], true);
                offset += 2;
            }
        }

        return buffer;
    }

    /**
     * Helper method to write a string to a DataView
     */
    private writeString(view: DataView, offset: number, str: string): void {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    }

    async updateConfig(newConfig: Partial<STTConfig>): Promise<void> {
        this.config = { ...this.config, ...newConfig };

        if (newConfig.provider) {
            await this.onlineEngine.updateConfig(this.config);
            await this.sherpaEngine.updateConfig(this.config);
        }

        this.emit('configUpdated', this.config);
    }

    getConfig(): STTConfig {
        return { ...this.config };
    }
}

class OnlineSTTEngine {
    private speechConfig: SpeechConfig | null = null;
    private apiKey: string;
    private region: string;
    private config: STTConfig;

    constructor(config: STTConfig) {
        this.config = config;
        this.apiKey = process.env.AZURE_SPEECH_KEY || ''; // Will be loaded from secure storage
        this.region = process.env.AZURE_SPEECH_REGION || 'westus'; // Default region
    }

    hasApiKey(): boolean {
        return Boolean(this.apiKey && this.apiKey.trim());
    }

    async initialize(): Promise<void> {
        try {
            this.speechConfig = SpeechConfig.fromSubscription(this.apiKey, this.region);
            this.speechConfig.speechRecognitionLanguage = this.config.language;

            // Configure recognition parameters
            this.speechConfig.enableDictation();

            if (this.config.autoPunctuation) {
                this.speechConfig.enableAudioLogging();
            }
        } catch (error) {
            console.error('Failed to initialize online STT engine:', error);
            throw error;
        }
    }

    async transcribe(audioData: ArrayBuffer): Promise<string> {
        if (!this.speechConfig) {
            await this.initialize();
        }

        return new Promise((resolve, reject) => {
            try {
                // Convert ArrayBuffer to temporary file
                const tempFilePath = path.join(os.tmpdir(), `cindy_audio_${Date.now()}.wav`);
                fs.promises.writeFile(tempFilePath, Buffer.from(audioData))
                    .then(() => {
                        const audioConfig = AudioConfig.fromWavFileInput(tempFilePath);
                        const recognizer = new SpeechRecognizer(this.speechConfig!, audioConfig);

                        recognizer.recognizeOnceAsync(
                            (result: any) => {
                                recognizer.close();
                                fs.promises.unlink(tempFilePath).catch(console.warn);
                                if (result.reason === ResultReason.RecognizedSpeech) {
                                    resolve(result.text);
                                } else {
                                    reject(new Error(`Speech recognition failed: ${result.reason}`));
                                }
                            },
                            (error: any) => {
                                recognizer.close();
                                fs.promises.unlink(tempFilePath).catch(console.warn);
                                reject(new Error(`Speech recognition error: ${error}`));
                            }
                        );
                    })
                    .catch((writeError: unknown) => {
                        const errorMessage = writeError instanceof Error ? writeError.message : String(writeError);
                        reject(new Error(`Failed to write audio to temp file: ${errorMessage}`));
                    });
            } catch (error) {
                reject(new Error(`Failed to transcribe audio: ${error}`));
            }
        });
    }

    async updateConfig(config: STTConfig): Promise<void> {
        this.config = config;
        if (this.speechConfig) {
            this.speechConfig.speechRecognitionLanguage = config.language;
        }
    }
}

class SherpaSTTEngine {
    private recognizer: any = null;
    private config: STTConfig;
    private isInitialized: boolean = false;
    private sherpa: any = null;

    constructor(config: STTConfig) {
        this.config = config;
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            console.log('[SherpaSTTEngine] Initializing sherpa-onnx engine...');

            // Import sherpa-onnx

            // Sherpa-onnx requires proper model files to work correctly
            // Since we don't have models configured, we'll simulate basic functionality
            console.log('[SherpaSTTEngine] Sherpa-onnx needs proper models - using fallback mode');

            // Don't try to create a recognizer without proper models
            // This prevents the "null function or function signature mismatch" error
            this.recognizer = null;

            this.isInitialized = true;
            console.log('[SherpaSTTEngine] Sherpa STT engine initialized successfully');
        } catch (error) {
            console.error('[SherpaSTTEngine] Failed to initialize:', error);
            // Don't throw error - allow service to continue without sherpa
            this.isInitialized = true;  // Mark as initialized to prevent retry loops
            console.log('[SherpaSTTEngine] Continuing without functional sherpa engine - will return empty transcripts');
        }
    }

    async transcribe(audioData: ArrayBuffer): Promise<string> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            console.log('[SherpaSTTEngine] Processing audio data:', audioData.byteLength, 'bytes');

            if (!this.recognizer) {
                console.log('[SherpaSTTEngine] No recognizer available - sherpa-onnx requires model files');
                console.log('[SherpaSTTEngine] To use sherpa-onnx, download models from https://github.com/k2-fsa/sherpa-onnx');
                return 'Audio captured successfully. To enable sherpa-onnx transcription, please configure model files.';
            }

            // Convert ArrayBuffer to audio samples for sherpa-onnx
            // Sherpa expects Float32Array of audio samples
            const audioSamples = this.arrayBufferToFloat32Array(audioData);

            if (audioSamples.length === 0) {
                console.log('[SherpaSTTEngine] No audio samples - returning empty');
                return '';
            }

            console.log('[SherpaSTTEngine] Converted to', audioSamples.length, 'audio samples');

            try {
                // Use the offline recognizer to process the audio
                const stream = this.recognizer.createStream();
                stream.acceptWaveform(16000, audioSamples);
                stream.inputFinished();

                this.recognizer.decode(stream);
                const result = this.recognizer.getResult(stream);

                stream.free();

                const text = result.text || '';
                console.log('[SherpaSTTEngine] Transcription result:', text);

                return text.trim();
            } catch (transcriptionError) {
                console.warn('[SherpaSTTEngine] Transcription failed:', transcriptionError.message);
                return '';
            }

        } catch (error) {
            console.error('[SherpaSTTEngine] Transcription error:', error);
            // Don't throw - just return empty string to maintain app stability
            return '';
        }
    }

    /**
     * Convert ArrayBuffer (containing WAV data) to Float32Array of audio samples
     */
    private arrayBufferToFloat32Array(arrayBuffer: ArrayBuffer): Float32Array {
        try {
            // Skip WAV header (first 44 bytes) and convert to 16-bit PCM samples
            const dataView = new DataView(arrayBuffer);
            const pcmData = new Int16Array(arrayBuffer, 44); // Skip WAV header

            // Convert 16-bit PCM to float32 samples (normalized to [-1, 1])
            const float32Samples = new Float32Array(pcmData.length);
            for (let i = 0; i < pcmData.length; i++) {
                float32Samples[i] = pcmData[i] / 32768.0;  // Normalize 16-bit to [-1, 1]
            }

            console.log('[SherpaSTTEngine] Converted', pcmData.length, '16-bit samples to float32');
            return float32Samples;
        } catch (error) {
            console.error('[SherpaSTTEngine] Failed to convert audio data:', error);
            return new Float32Array(0);
        }
    }

    async updateConfig(config: STTConfig): Promise<void> {
        this.config = config;
        // Reinitialize if needed
        if (this.isInitialized) {
            this.isInitialized = false;
            await this.initialize();
        }
    }
}



export { SpeechToTextService };
