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

        // DIAGNOSTIC: Log input audio data details
        console.log('DEBUG: Input audio data size:', audioData.byteLength, 'bytes');

        // Check if audio data is effectively empty
        const audioBuffer = new Uint8Array(audioData);
        const nonZeroSamples = audioBuffer.filter(sample => sample !== 0).length;
        console.log('DEBUG: Non-zero audio samples:', nonZeroSamples, 'out of', audioBuffer.length);

        if (audioData.byteLength === 0) {
            console.log('DEBUG: Audio data is completely empty');
            return '';
        }

        if (nonZeroSamples === 0) {
            console.log('DEBUG: Audio data contains only silence (all zeros)');
            return '';
        }

        // Convert ArrayBuffer to temporary WAV file
        const tempFilePath = require('path').join(require('os').tmpdir(), `cindy_audio_${Date.now()}.wav`);
        const audioBuffer2 = Buffer.from(audioData);
        await require('fs').promises.writeFile(tempFilePath, audioBuffer2);

        // DIAGNOSTIC: Validate the created WAV file
        try {
            const stats = await require('fs').promises.stat(tempFilePath);
            console.log('DEBUG: Created WAV file size:', stats.size, 'bytes');
            console.log('DEBUG: WAV file path:', tempFilePath);

            // Read WAV header to validate format
            const header = await require('fs').promises.readFile(tempFilePath, { start: 0, end: 44 });
            const riffMarker = header.toString('ascii', 0, 4);
            const waveMarker = header.toString('ascii', 8, 12);
            console.log('DEBUG: WAV RIFF marker:', riffMarker);
            console.log('DEBUG: WAV WAVE marker:', waveMarker);

            if (riffMarker !== 'RIFF' || waveMarker !== 'WAVE') {
                console.error('DEBUG: Invalid WAV file format detected');
                await require('fs').promises.unlink(tempFilePath);
                return '';
            }
        } catch (statError) {
            console.error('DEBUG: Failed to validate WAV file:', statError);
            return '';
        }

        let result: any;

        try {
            // Additional WAV file validation
            const wavBuffer = await require('fs').promises.readFile(tempFilePath);
            console.log('DEBUG: WAV file first 16 bytes:', Array.from(wavBuffer.slice(0, 16)));

            // Check if this is a valid audio duration
            const wavHeader = wavBuffer.slice(0, 44);
            const dataSize = wavHeader.readUInt32LE(40);
            const duration = dataSize / (16000 * 2); // 16kHz, 16-bit (whisper-node requirement)
            console.log('DEBUG: Audio duration:', duration, 'seconds');

            // Analyze audio amplitude levels - process in chunks to avoid stack overflow
            const audioSamples = wavBuffer.slice(44); // Skip WAV header
            const samples = new Int16Array(audioSamples.buffer, audioSamples.byteOffset, audioSamples.byteLength / 2);

            // Process amplitude calculation in chunks to avoid stack overflow
            let maxAmplitude = 0;
            let totalAmplitude = 0;
            let nonSilentSamples = 0;

            const chunkSize = 1024;
            for (let i = 0; i < samples.length; i += chunkSize) {
                const chunk = samples.slice(i, i + chunkSize);
                for (const sample of chunk) {
                    const abs = Math.abs(sample);
                    maxAmplitude = Math.max(maxAmplitude, abs);
                    totalAmplitude += abs;
                    if (abs > 100) nonSilentSamples++;
                }
            }

            const avgAmplitude = totalAmplitude / samples.length;
            const nonSilentPercent = (nonSilentSamples / samples.length) * 100;

            console.log('DEBUG: Audio analysis:');
            console.log('  - Max amplitude:', maxAmplitude, '/ 32767 (', ((maxAmplitude / 32767) * 100).toFixed(1), '%)');
            console.log('  - Average amplitude:', avgAmplitude.toFixed(1));
            console.log('  - Non-silent samples:', nonSilentPercent.toFixed(1), '%');
            console.log('  - Audio appears', maxAmplitude > 1000 ? 'LOUD enough' : 'TOO QUIET');

            if (duration < 0.1) {
                console.log('DEBUG: Audio too short (<0.1s), likely empty');
                await require('fs').promises.unlink(tempFilePath);
                return '';
            }

            // Debug logging removed - no longer saving files to desktop
            console.log('DEBUG: Processing audio file at:', tempFilePath);

            // DIAGNOSTIC: Test model corruption - try re-downloading if transcription fails
            console.log('DEBUG: ===== MODEL CORRUPTION TEST =====');

            // Check model file integrity
            const modelStats = await require('fs').promises.stat(this.modelPath);
            console.log('DEBUG: Current model size:', modelStats.size, 'bytes');

            // Calculate simple checksum
            const modelData = await require('fs').promises.readFile(this.modelPath);
            const firstChunk = modelData.slice(0, 1000);
            const lastChunk = modelData.slice(-1000);
            console.log('DEBUG: Model first 20 bytes:', Array.from(firstChunk.slice(0, 20)));
            console.log('DEBUG: Model last 20 bytes:', Array.from(lastChunk.slice(-20)));

            // Try backup model if available
            const backupModelPath = this.modelPath.replace('.bin', '_backup.bin');
            const hasBackup = await require('fs').promises.access(backupModelPath).then(() => true).catch(() => false);
            console.log('DEBUG: Backup model available:', hasBackup);

            // DIAGNOSTIC: Validate model file and audio format before whisper call
            const modelExists = await require('fs').promises.access(this.modelPath).then(() => true).catch(() => false);
            let modelSize = 0;
            if (modelExists) {
                const modelStats = await require('fs').promises.stat(this.modelPath);
                modelSize = modelStats.size;
            }

            // Check if WAV format exactly matches whisper-node requirements
            const sampleRateFromHeader = wavHeader.readUInt32LE(24); // Offset 24 = sample rate
            const channelsFromHeader = wavHeader.readUInt16LE(22);   // Offset 22 = channels
            const bitsPerSampleFromHeader = wavHeader.readUInt16LE(34); // Offset 34 = bits per sample

            console.log('DEBUG: Pre-Whisper validation:');
            console.log('  - Model file exists:', modelExists);
            console.log('  - Model file size:', (modelSize / 1024 / 1024).toFixed(1), 'MB');
            console.log('  - WAV sample rate:', sampleRateFromHeader, 'Hz (whisper-node needs 16000)');
            console.log('  - WAV channels:', channelsFromHeader, '(whisper-node needs 1)');
            console.log('  - WAV bits per sample:', bitsPerSampleFromHeader, '(whisper-node needs 16)');
            console.log('  - Audio duration:', duration.toFixed(2), 'seconds');
            console.log('  - Max amplitude:', maxAmplitude, '/ 32767');

            // Warn about potential format mismatches
            if (sampleRateFromHeader !== 16000) {
                console.log('DEBUG: ⚠️  WAV sample rate mismatch! Expected 16000, got', sampleRateFromHeader);
            }
            if (channelsFromHeader !== 1) {
                console.log('DEBUG: ⚠️  WAV channels mismatch! Expected 1, got', channelsFromHeader);
            }
            if (bitsPerSampleFromHeader !== 16) {
                console.log('DEBUG: ⚠️  WAV bits per sample mismatch! Expected 16, got', bitsPerSampleFromHeader);
            }

            console.log('DEBUG: Calling whisper function with options:', {
                modelPath: this.modelPath,
                language: 'en',
                duration: duration + 's',
                maxAmplitude,
                avgAmplitude: avgAmplitude.toFixed(1),
                fileExists: modelExists,
                modelSizeMB: (modelSize / 1024 / 1024).toFixed(1)
            });

            // DIAGNOSTIC: Test model integrity and whisper-node directly
            console.log('DEBUG: ===== WHISPER-NODE LIBRARY DIAGNOSTIC =====');

            // Test 1: Validate model file integrity
            const modelBuffer = await require('fs').promises.readFile(this.modelPath);
            const modelMd5 = require('crypto').createHash('md5').update(modelBuffer).digest('hex');
            console.log('DEBUG: Model file MD5 hash:', modelMd5);
            console.log('DEBUG: Model file first 100 bytes:', Array.from(modelBuffer.slice(0, 100)));

            // Test 2: Try basic whisper-node call with minimal options first
            console.log('DEBUG: Testing whisper-node with MINIMAL options (no custom settings)');
            try {
                result = await this.whisperFunction(tempFilePath, {
                    modelPath: this.modelPath
                    // No whisperOptions at all - use defaults
                });
                console.log('DEBUG: Minimal whisper call succeeded, result:', result);
            } catch (minimalError) {
                console.log('DEBUG: Minimal whisper call failed:', minimalError.message);

                // Test 3: Try with just language specified
                console.log('DEBUG: Testing whisper-node with just language option');
                try {
                    result = await this.whisperFunction(tempFilePath, {
                        modelPath: this.modelPath,
                        whisperOptions: {
                            language: 'en'
                        }
                    });
                    console.log('DEBUG: Language-only whisper call succeeded, result:', result);
                } catch (languageError) {
                    console.log('DEBUG: Language-only whisper call failed:', languageError.message);

                    // Test 4: Try ultra-permissive settings as final attempt
                    console.log('DEBUG: Testing whisper-node with ULTRA-PERMISSIVE settings as last resort');
                    result = await this.whisperFunction(tempFilePath, {
                        modelPath: this.modelPath,
                        whisperOptions: {
                            language: 'en',
                            temperature: 1.0,
                            no_speech_threshold: 0.1,
                            logprob_threshold: -2.0,
                            compression_ratio_threshold: 10.0,
                            suppress_blank: false,
                            suppress_non_speech_tokens: false
                        }
                    });
                    console.log('DEBUG: Ultra-permissive whisper call result:', result);
                }
            }

            // FALLBACK: If whisper still returns empty, try re-downloading model
            if (!result || (Array.isArray(result) && result.length === 0)) {
                console.log('DEBUG: ===== MODEL RE-DOWNLOAD ATTEMPT =====');
                console.log('DEBUG: Whisper returned empty despite perfect audio - attempting model re-download');

                const backupPath = this.modelPath.replace('.bin', '_corrupted_backup.bin');
                try {
                    // Backup current model
                    await require('fs').promises.copyFile(this.modelPath, backupPath);
                    console.log('DEBUG: Backed up potentially corrupted model to:', backupPath);

                    // Delete current model
                    await require('fs').promises.unlink(this.modelPath);
                    console.log('DEBUG: Deleted potentially corrupted model');

                    // Re-download fresh model
                    console.log('DEBUG: Re-downloading fresh model...');
                    await this.downloadModel();

                    // Reinitialize whisper
                    this.isInitialized = false;
                    await this.initialize();

                    // Retry transcription with fresh model
                    console.log('DEBUG: Retrying transcription with fresh model...');
                    result = await this.whisperFunction(tempFilePath, {
                        modelPath: this.modelPath,
                        whisperOptions: {
                            language: 'en'
                        }
                    });
                    console.log('DEBUG: Fresh model result:', result);

                } catch (redownloadError) {
                    console.log('DEBUG: Model re-download failed:', redownloadError.message);
                    // Restore backup if re-download fails
                    try {
                        await require('fs').promises.copyFile(backupPath, this.modelPath);
                        console.log('DEBUG: Restored backup model');
                    } catch (restoreError) {
                        console.log('DEBUG: Failed to restore backup:', restoreError.message);
                    }
                }
            }
        } catch (whisperError: any) {
            // Handle specific parseTranscript error from whisper-node
            if (whisperError.message && (
                whisperError.message.includes('Cannot read properties of null') ||
                whisperError.message.includes("reading 'shift'") ||
                whisperError.message.includes('parseTranscript')
            )) {
                console.log('DEBUG: whisper-node parseTranscript error caught - whisper returned null, trying alternative approach');
                result = null;
            } else {
                // Re-throw other whisper errors
                throw whisperError;
            }
        }

        console.log('DEBUG: Raw whisper result:', result);
        console.log('DEBUG: Result type:', typeof result);
        console.log('DEBUG: Is array:', Array.isArray(result));

        if (result === null) {
            console.log('DEBUG: Whisper explicitly returned null - likely empty/silent audio');
        } else if (result === undefined) {
            console.log('DEBUG: Whisper returned undefined - possible processing error');
        }

        // Clean up temporary file
        await require('fs').promises.unlink(tempFilePath);

        // Handle empty or null results gracefully
        if (!result) {
            console.log('DEBUG: Whisper returned null/undefined result - audio was likely empty or silent');
            return '';
        }

        // Extract text from result array - whisper-node returns array of {start, end, speech}
        if (Array.isArray(result)) {
            if (result.length === 0) {
                console.log('DEBUG: Whisper returned empty array - no speech detected');
                return '';
            }

            console.log('DEBUG: Whisper result segments:', result.length);
            result.forEach((segment, index) => {
                console.log(`DEBUG: Segment ${index}:`, {
                    start: segment?.start,
                    end: segment?.end,
                    speech: segment?.speech
                });
            });

            const text = result
                .map(segment => segment?.speech || '')
                .filter(speech => speech && speech !== '[BLANK_AUDIO]') // Filter out blank audio markers
                .join(' ')
                .trim();
            console.log('DEBUG: Extracted text:', text);

            // If we only got blank audio, return empty string
            if (!text || text === '[BLANK_AUDIO]') {
                console.log('DEBUG: Only blank audio detected - audio may be too quiet or unclear');
                return '';
            }

            return text;
        } else {
            console.log('DEBUG: Unexpected result format, returning as string');
            return String(result || '');
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
