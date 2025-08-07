import { ipcRenderer } from 'electron';

class SimpleLiveTranscriptionService {
    private mediaStream: MediaStream | null = null;
    private isListening: boolean = false;
    private mediaRecorder: MediaRecorder | null = null;
    private recordedChunks: Blob[] = [];
    private silenceTimeout: NodeJS.Timeout | null = null;
    private lastAudioActivity: number = 0;
    private onWakeWordCallback: (() => void) | null = null;
    private isProcessing: boolean = false;

    async startLiveTranscription(
        onWakeWord: () => void
    ): Promise<void> {
        if (this.isListening) {
            console.log('SimpleLiveTranscriptionService: Already listening');
            return;
        }

        this.onWakeWordCallback = onWakeWord;

        try {
            // Get microphone access with minimal processing
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000
                }
            });

            // Start continuous recording in small chunks
            this.startChunkedRecording();

            this.isListening = true;
            console.log('SimpleLiveTranscriptionService: Started live transcription');

        } catch (error) {
            console.error('SimpleLiveTranscriptionService: Failed to start:', error);
            this.cleanup();
            throw error;
        }
    }

    private startChunkedRecording(): void {
        if (!this.mediaStream) return;

        // Use MediaRecorder with short chunks
        const options: MediaRecorderOptions = {};
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            options.mimeType = 'audio/webm;codecs=opus';
        }

        this.mediaRecorder = new MediaRecorder(this.mediaStream, options);

        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.recordedChunks.push(event.data);
                this.lastAudioActivity = Date.now();
                
                // Process audio if we have enough chunks and not already processing
                if (this.recordedChunks.length >= 3 && !this.isProcessing) {
                    this.processAudioChunks();
                }
            }
        };

        this.mediaRecorder.onerror = (error) => {
            console.error('SimpleLiveTranscriptionService: MediaRecorder error:', error);
        };

        // Start recording with small chunks (500ms)
        this.mediaRecorder.start(500);
        
        // Set up silence detection
        this.setupSilenceDetection();
    }

    private setupSilenceDetection(): void {
        const checkSilence = () => {
            if (!this.isListening) return;
            
            const now = Date.now();
            const timeSinceLastActivity = now - this.lastAudioActivity;
            
            // If we have chunks and there's been activity recently, process them
            if (this.recordedChunks.length > 0 && timeSinceLastActivity > 1000 && !this.isProcessing) {
                this.processAudioChunks();
            }
            
            // Continue checking
            setTimeout(checkSilence, 500);
        };
        
        setTimeout(checkSilence, 1000);
    }

    private async processAudioChunks(): Promise<void> {
        if (this.isProcessing || this.recordedChunks.length === 0) {
            return;
        }

        this.isProcessing = true;
        const chunksToProcess = [...this.recordedChunks];
        this.recordedChunks = []; // Clear for next collection

        try {
            // Create blob from chunks
            const audioBlob = new Blob(chunksToProcess, { 
                type: chunksToProcess[0]?.type || 'audio/webm' 
            });

            // Convert to ArrayBuffer
            const arrayBuffer = await audioBlob.arrayBuffer();

            // Decode with AudioContext
            const audioContext = new AudioContext({ sampleRate: 16000 });
            
            try {
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                const audioData = audioBuffer.getChannelData(0);

                // Convert to Int16Array
                const int16Data = new Int16Array(audioData.length);
                for (let i = 0; i < audioData.length; i++) {
                    const sample = Math.max(-1, Math.min(1, audioData[i]));
                    int16Data[i] = Math.round(sample * 32767);
                }

                // Check if audio has enough activity
                const audioLevel = this.calculateAudioLevel(audioData);
                if (audioLevel > 0.005) { // Threshold for meaningful audio
                    // Send for transcription
                    const transcript = await ipcRenderer.invoke('transcribe-audio', [int16Data]);
                    
                    if (transcript && transcript.trim()) {
                        console.log('SimpleLiveTranscriptionService: Transcribed:', transcript);
                        
                        // Check for wake word
                        if (this.containsWakeWord(transcript)) {
                            console.log('SimpleLiveTranscriptionService: Wake word detected!');
                            if (this.onWakeWordCallback) {
                                this.onWakeWordCallback();
                            }
                        }
                    }
                }
            } finally {
                await audioContext.close();
            }

        } catch (error) {
            // Don't log every error to avoid spam
            if (Math.random() < 0.1) { // Log 10% of errors
                console.warn('SimpleLiveTranscriptionService: Processing error (sampled):', error);
            }
        } finally {
            this.isProcessing = false;
        }
    }

    private containsWakeWord(text: string): boolean {
        const lowerText = text.toLowerCase().trim();
        const wakeWords = ['hi cindy', 'hey cindy', 'cindy'];
        
        return wakeWords.some(wakeWord => {
            // Check for exact match
            if (lowerText.includes(wakeWord)) {
                return true;
            }
            
            // Check for partial matches with individual words
            const words = lowerText.split(/\s+/);
            if (wakeWord.includes(' ')) {
                const wakeWordParts = wakeWord.split(/\s+/);
                return wakeWordParts.every(part => 
                    words.some(word => word.includes(part) || this.calculateSimilarity(word, part) > 0.8)
                );
            } else {
                return words.some(word => 
                    word.includes(wakeWord) || this.calculateSimilarity(word, wakeWord) > 0.8
                );
            }
        });
    }

    private calculateAudioLevel(audioData: Float32Array): number {
        if (!audioData || audioData.length === 0) {
            return 0;
        }

        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
            sum += audioData[i] * audioData[i];
        }

        const rms = Math.sqrt(sum / audioData.length);
        return Math.min(rms, 1.0);
    }

    private calculateSimilarity(str1: string, str2: string): number {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) {
            return 1.0;
        }
        
        const editDistance = this.levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    private levenshteinDistance(str1: string, str2: string): number {
        const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
        
        for (let i = 0; i <= str1.length; i++) {
            matrix[0][i] = i;
        }
        
        for (let j = 0; j <= str2.length; j++) {
            matrix[j][0] = j;
        }
        
        for (let j = 1; j <= str2.length; j++) {
            for (let i = 1; i <= str1.length; i++) {
                if (str1[i - 1] === str2[j - 1]) {
                    matrix[j][i] = matrix[j - 1][i - 1];
                } else {
                    matrix[j][i] = Math.min(
                        matrix[j - 1][i] + 1,
                        matrix[j][i - 1] + 1,
                        matrix[j - 1][i - 1] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    private cleanup(): void {
        console.log('SimpleLiveTranscriptionService: Cleaning up');

        if (this.silenceTimeout) {
            clearTimeout(this.silenceTimeout);
            this.silenceTimeout = null;
        }

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        this.mediaRecorder = null;

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        this.isListening = false;
        this.isProcessing = false;
        this.recordedChunks = [];
        this.onWakeWordCallback = null;
    }

    async stopLiveTranscription(): Promise<void> {
        if (!this.isListening) {
            return;
        }

        console.log('SimpleLiveTranscriptionService: Stopping live transcription');
        this.cleanup();
    }

    isCurrentlyListening(): boolean {
        return this.isListening;
    }
}

export const simpleLiveTranscriptionService = new SimpleLiveTranscriptionService();