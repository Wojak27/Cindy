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
            // Convert Int16Array[] to ArrayBuffer if needed
            let buffer: ArrayBuffer;
            if (Array.isArray(audioData)) {
                // Convert Int16Array[] to ArrayBuffer
                const totalLength = audioData.reduce((sum, arr) => sum + arr.length, 0);
                buffer = new ArrayBuffer(totalLength * 2);
                const view = new DataView(buffer);
                let offset = 0;
                for (const chunk of audioData) {
                    for (const sample of chunk) {
                        view.setInt16(offset, sample, true);
                        offset += 2;
                    }
                }
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

    constructor(private config: STTConfig) {
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            // This is a simplified example - actual implementation would initialize whisper.cpp
            console.log('Initializing offline STT engine with model:', this.config.offlineModel);
            this.isInitialized = true;
        } catch (error) {
            console.error('Failed to initialize offline STT engine:', error);
            throw error;
        }
    }

    async transcribe(audioData: ArrayBuffer): Promise<string> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        // Convert ArrayBuffer to temporary file
        const tempFilePath = require('path').join(require('os').tmpdir(), `cindy_audio_${Date.now()}.wav`);
        await require('fs').promises.writeFile(tempFilePath, Buffer.from(audioData));

        return new Promise((resolve, reject) => {
            // In a real implementation, this would call whisper.cpp
            setTimeout(() => {
                // Clean up temporary file
                require('fs').promises.unlink(tempFilePath).catch(console.warn);

                // Return simulated result
                resolve("This is a simulated transcription result from the offline STT engine.");
            }, 1000);
        });
    }

    async updateConfig(config: STTConfig): Promise<void> {
        this.config = config;
        // Re-initialize if model changed
        if (this.isInitialized) {
            this.isInitialized = false;
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
