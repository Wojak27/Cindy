import { ipcRenderer } from 'electron';

class LiveTranscriptionService {
    private mediaStream: MediaStream | null = null;
    private isListening: boolean = false;
    private audioContext: AudioContext | null = null;
    private processor: ScriptProcessorNode | null = null;
    private silenceTimeout: NodeJS.Timeout | null = null;
    private silenceThreshold: number = 500; // ms of silence before stopping
    private audioThreshold: number = 0.01; // Minimum audio level to consider as speech
    private onTranscriptionCallback: ((text: string) => void) | null = null;
    private onWakeWordCallback: (() => void) | null = null;
    private onSpeechStopCallback: (() => void) | null = null;

    async startLiveTranscription(
        onTranscription: (text: string) => void,
        onWakeWord: () => void,
        onSpeechStop: () => void
    ): Promise<void> {
        if (this.isListening) {
            console.log('LiveTranscriptionService: Already listening');
            return;
        }

        this.onTranscriptionCallback = onTranscription;
        this.onWakeWordCallback = onWakeWord;
        this.onSpeechStopCallback = onSpeechStop;

        try {
            // Get microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000
                }
            });

            // Create audio context for real-time processing
            this.audioContext = new AudioContext({ sampleRate: 16000 });
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            
            // Use AnalyserNode for simpler audio level monitoring
            const analyser = this.audioContext.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            
            let audioBuffer: Float32Array[] = [];
            let isCollectingAudio = false;
            let lastSpeechTime = 0;

            const monitorAudio = () => {
                if (!this.isListening) return;

                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                analyser.getByteFrequencyData(dataArray);

                // Calculate audio level from frequency data
                const audioLevel = this.calculateFrequencyLevel(dataArray);

                if (audioLevel > this.audioThreshold) {
                    lastSpeechTime = Date.now();
                    
                    if (!isCollectingAudio) {
                        console.log('LiveTranscriptionService: Speech detected, starting collection');
                        isCollectingAudio = true;
                        audioBuffer = [];
                    }
                    
                    // Clear any existing silence timeout
                    if (this.silenceTimeout) {
                        clearTimeout(this.silenceTimeout);
                        this.silenceTimeout = null;
                    }
                } else if (isCollectingAudio && Date.now() - lastSpeechTime > this.silenceThreshold) {
                    // Process collected audio after silence
                    if (audioBuffer.length > 0) {
                        console.log('LiveTranscriptionService: Silence detected, processing audio');
                        this.processCollectedAudio([...audioBuffer]); // Pass copy
                    }
                    audioBuffer = [];
                    isCollectingAudio = false;
                }

                // Continue monitoring
                setTimeout(monitorAudio, 100); // Check every 100ms
            };

            // Start monitoring
            monitorAudio();

            this.isListening = true;
            console.log('LiveTranscriptionService: Started live transcription');

        } catch (error) {
            console.error('LiveTranscriptionService: Failed to start:', error);
            this.cleanup();
            throw error;
        }
    }

    async stopLiveTranscription(): Promise<void> {
        if (!this.isListening) {
            return;
        }

        console.log('LiveTranscriptionService: Stopping live transcription');
        this.cleanup();
    }

    private async processCollectedAudio(audioBuffer: Float32Array[]): Promise<void> {
        try {
            if (audioBuffer.length === 0) return;

            // Combine all audio chunks into a single buffer
            const totalLength = audioBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
            const combinedBuffer = new Float32Array(totalLength);
            let offset = 0;
            
            for (const chunk of audioBuffer) {
                combinedBuffer.set(chunk, offset);
                offset += chunk.length;
            }

            // Convert to Int16Array for transcription
            const int16Data = new Int16Array(combinedBuffer.length);
            for (let i = 0; i < combinedBuffer.length; i++) {
                const sample = Math.max(-1, Math.min(1, combinedBuffer[i]));
                int16Data[i] = Math.round(sample * 32767);
            }

            // Send for transcription
            const transcript = await ipcRenderer.invoke('transcribe-audio', [int16Data]);
            
            if (transcript && transcript.trim()) {
                console.log('LiveTranscriptionService: Transcribed:', transcript);
                
                // Check for wake word
                if (this.containsWakeWord(transcript)) {
                    console.log('LiveTranscriptionService: Wake word detected!');
                    if (this.onWakeWordCallback) {
                        this.onWakeWordCallback();
                    }
                } else {
                    // Regular transcription callback
                    if (this.onTranscriptionCallback) {
                        this.onTranscriptionCallback(transcript);
                    }
                }
                
                // Notify speech stop
                if (this.onSpeechStopCallback) {
                    this.onSpeechStopCallback();
                }
            }
        } catch (error) {
            console.error('LiveTranscriptionService: Error processing audio:', error);
        }
    }

    private containsWakeWord(text: string): boolean {
        const lowerText = text.toLowerCase().trim();
        const wakeWords = ['hi cindy', 'hey cindy', 'cindy'];
        
        return wakeWords.some(wakeWord => {
            if (lowerText.includes(wakeWord)) {
                return true;
            }
            
            // Check for partial matches
            const words = lowerText.split(/\s+/);
            if (wakeWord.includes(' ')) {
                const wakeWordParts = wakeWord.split(/\s+/);
                return wakeWordParts.every(part => words.some(word => word.includes(part)));
            } else {
                return words.some(word => word.includes(wakeWord) || this.calculateSimilarity(word, wakeWord) > 0.8);
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

    private calculateFrequencyLevel(frequencyData: Uint8Array): number {
        if (!frequencyData || frequencyData.length === 0) {
            return 0;
        }

        let sum = 0;
        for (let i = 0; i < frequencyData.length; i++) {
            sum += frequencyData[i];
        }

        const average = sum / frequencyData.length;
        return average / 255.0; // Normalize to 0-1
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
        console.log('LiveTranscriptionService: Cleaning up');

        if (this.silenceTimeout) {
            clearTimeout(this.silenceTimeout);
            this.silenceTimeout = null;
        }

        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        this.isListening = false;
        this.onTranscriptionCallback = null;
        this.onWakeWordCallback = null;
        this.onSpeechStopCallback = null;
    }

    isCurrentlyListening(): boolean {
        return this.isListening;
    }
}

export const liveTranscriptionService = new LiveTranscriptionService();