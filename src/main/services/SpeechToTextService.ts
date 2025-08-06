import { EventEmitter } from 'events';
import { SpeechConfig, AudioConfig, SpeechRecognizer, ResultReason } from 'microsoft-cognitiveservices-speech-sdk';

interface STTConfig {
    provider: 'online' | 'offline' | 'auto' | 'whisper';
    language: string;
    autoPunctuation: boolean;
    profanityFilter: boolean;
    offlineModel: 'tiny' | 'base' | 'small' | 'medium';
    whisperBaseUrl?: string;
}

class SpeechToTextService extends EventEmitter {
    private onlineEngine: OnlineSTTEngine;
    private offlineEngine: OfflineSTTEngine;
    private whisperEngine: WhisperSTTEngine;
    private config: STTConfig;
    private isRecording: boolean = false;

    constructor(config: STTConfig) {
        super();
        this.config = config;
        this.onlineEngine = new OnlineSTTEngine(config);
        this.offlineEngine = new OfflineSTTEngine(config);
        this.whisperEngine = new WhisperSTTEngine(config);
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

            if (this.config.provider === 'whisper') {
                const result = await this.whisperEngine.transcribe(buffer);
                this.emit('transcriptionSuccess', { source: 'whisper', text: result });
                return result;
            } else if (this.config.provider === 'online' || this.config.provider === 'auto') {
                try {
                    const result = await this.onlineEngine.transcribe(buffer);
                    this.emit('transcriptionSuccess', { source: 'online', text: result });
                    return result;
                } catch (onlineError) {
                    console.warn('Online STT failed, falling back to offline:', onlineError);

                    // Fallback to offline if auto mode
                    if (this.config.provider === 'auto') {
                        const result = await this.offlineEngine.transcribe(buffer);
                        this.emit('transcriptionSuccess', { source: 'offline', text: result });
                        return result;
                    }

                    throw onlineError;
                }
            } else {
                // Use offline engine directly
                const result = await this.offlineEngine.transcribe(buffer);
                this.emit('transcriptionSuccess', { source: 'offline', text: result });
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

        // WAV header parameters
        const sampleRate = 16000;
        const numChannels = 1;
        const bitsPerSample = 16;
        const byteRate = sampleRate * numChannels * bitsPerSample / 8;
        const blockAlign = numChannels * bitsPerSample / 8;
        const dataSize = totalSamples * 2; // 2 bytes per sample
        const riffChunkSize = 36 + dataSize;

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

        if (newConfig.provider || newConfig.offlineModel) {
            await this.onlineEngine.updateConfig(this.config);
            await this.offlineEngine.updateConfig(this.config);
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

    constructor(private config: STTConfig) {
        this.apiKey = ''; // Will be loaded from secure storage
        this.region = 'westus'; // Default region
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
                const tempFilePath = require('path').join(require('os').tmpdir(), `cindy_audio_${Date.now()}.wav`);
                require('fs').promises.writeFile(tempFilePath, Buffer.from(audioData))
                    .then(() => {
                        const audioConfig = AudioConfig.fromWavFileInput(tempFilePath);
                        const recognizer = new SpeechRecognizer(this.speechConfig!, audioConfig);

                        recognizer.recognizeOnceAsync(
                            (result: any) => {
                                recognizer.close();
                                require('fs').promises.unlink(tempFilePath).catch(console.warn);
                                if (result.reason === ResultReason.RecognizedSpeech) {
                                    resolve(result.text);
                                } else {
                                    reject(new Error(`Speech recognition failed: ${result.reason}`));
                                }
                            },
                            (error: any) => {
                                recognizer.close();
                                require('fs').promises.unlink(tempFilePath).catch(console.warn);
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

class OfflineSTTEngine {
    private isInitialized: boolean = false;
    private whisperFunction: any;
    private modelPath: string;
    private modelDir: string = require('path').join(require('os').homedir(), '.cindy', 'models');

    constructor(private config: STTConfig) {
        this.modelPath = require('path').join(this.modelDir, `ggml-${this.config.offlineModel || 'base'}.bin`);
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            // Ensure model directory exists
            await require('fs').promises.mkdir(this.modelDir, { recursive: true });

            // Download model if it doesn't exist
            if (!await this.modelExists()) {
                await this.downloadModel();
            }

            // Import whisper-node function (not constructor)
            const { whisper } = require('whisper-node');
            this.whisperFunction = whisper;

            this.isInitialized = true;
            console.log('Offline STT engine initialized with model:', this.modelPath);
        } catch (error) {
            console.error('Failed to initialize offline STT engine:', error);
            throw error;
        }
    }

    private async modelExists(): Promise<boolean> {
        try {
            await require('fs').promises.access(this.modelPath);
            return true;
        } catch {
            return false;
        }
    }

    private async downloadModel(): Promise<void> {
        console.log(`Downloading Whisper ${this.config.offlineModel} model to ${this.modelPath}...`);

        // Map config model to Hugging Face model names
        const modelMap: Record<string, string> = {
            'tiny': 'ggml-tiny.bin',
            'base': 'ggml-base.bin',
            'small': 'ggml-small.bin',
            'medium': 'ggml-medium.bin'
        };

        const modelName = modelMap[this.config.offlineModel || 'base'];
        const modelUrl = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${modelName}`;

        const response = await fetch(modelUrl);
        if (!response.ok) {
            throw new Error(`Failed to download model: ${response.status} ${response.statusText}`);
        }

        const fileStream = require('fs').createWriteStream(this.modelPath);
        // Convert ReadableStream to Node.js stream and pipe to file
        const reader = response.body.getReader();
        await new Promise((resolve, reject) => {
            const writeChunk = async () => {
                try {
                    const { done, value } = await reader.read();
                    if (done) {
                        fileStream.end();
                        resolve(undefined);
                        return;
                    }
                    fileStream.write(value);
                    writeChunk();
                } catch (error) {
                    fileStream.destroy(error);
                    reject(error);
                }
            };
            fileStream.on('error', reject);
            fileStream.on('finish', resolve);
            writeChunk();
        });

        console.log(`Model downloaded successfully to ${this.modelPath}`);
    }

    async transcribe(audioData: ArrayBuffer): Promise<string> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        // Convert ArrayBuffer to temporary WAV file
        const tempFilePath = require('path').join(require('os').tmpdir(), `cindy_audio_${Date.now()}.wav`);
        await require('fs').promises.writeFile(tempFilePath, Buffer.from(audioData));

        try {
            // Transcribe using whisper-node function
            console.log('DEBUG: Calling whisper function with options:', {
                modelPath: this.modelPath,
                language: this.config.language
            });

            const result = await this.whisperFunction(tempFilePath, {
                modelPath: this.modelPath,
                whisperOptions: {
                    language: this.config.language,
                    word_timestamps: false,
                    gen_file_txt: false,
                    gen_file_vtt: false,
                    gen_file_srt: false
                }
            });

            console.log('DEBUG: Raw whisper result:', result);
            console.log('DEBUG: Result type:', typeof result);
            console.log('DEBUG: Is array:', Array.isArray(result));

            // Clean up temporary file
            await require('fs').promises.unlink(tempFilePath);

            // Handle empty or null results gracefully
            if (!result) {
                console.log('DEBUG: Whisper returned null/undefined result');
                return '';
            }

            // Extract text from result array - whisper-node returns array of {start, end, speech}
            if (Array.isArray(result)) {
                const text = result.map(segment => segment.speech || '').join(' ').trim();
                console.log('DEBUG: Extracted text:', text);
                return text;
            } else {
                console.log('DEBUG: Unexpected result format, returning as string');
                return String(result || '');
            }
        } catch (error) {
            // Clean up temporary file on error
            await require('fs').promises.unlink(tempFilePath).catch(console.warn);
            console.error('Whisper transcription failed:', error);

            // Return empty string instead of throwing for parsing errors
            if (error.message && error.message.includes('Cannot read properties of null')) {
                console.log('DEBUG: Handling whisper-node parsing error gracefully');
                return '';
            }

            throw error;
        }
    }

    async updateConfig(config: STTConfig): Promise<void> {
        const modelChanged = this.config.offlineModel !== config.offlineModel;
        this.config = config;

        // Update model path if model changed
        if (modelChanged) {
            this.modelPath = require('path').join(this.modelDir, `ggml-${this.config.offlineModel || 'base'}.bin`);
            this.isInitialized = false;
        }

        if (this.isInitialized) {
            await this.initialize();
        }
    }
}

class WhisperSTTEngine {
    private baseUrl: string;

    constructor(config: STTConfig) {
        this.baseUrl = config.whisperBaseUrl || 'http://localhost:5000';
    }

    async transcribe(audioData: ArrayBuffer): Promise<string> {
        const formData = new FormData();
        const buffer = Buffer.from(audioData);
        formData.append('file', buffer as any, {
            filename: 'audio.wav',
            contentType: 'audio/wav'
        } as any);

        const response = await fetch(`${this.baseUrl}/transcribe`, {
            method: 'POST',
            body: formData,
            headers: (formData as any).getHeaders()
        });

        if (!response.ok) {
            throw new Error(`Whisper API error: ${response.status}`);
        }

        const result = await response.json();
        return result.text;
    }
}


export { SpeechToTextService, STTConfig };
