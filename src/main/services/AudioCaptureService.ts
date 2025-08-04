import { EventEmitter } from 'events';

class AudioCaptureService extends EventEmitter {
    private mediaStream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;
    private isCapturing: boolean = false;
    private audioData: Int16Array[] = [];

    async startCapture(): Promise<void> {
        if (this.isCapturing) return;

        try {
            // Request microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000, // Porcupine requirement
                }
            });

            // Set up audio context for processing
            this.audioContext = new AudioContext({ sampleRate: 16000 });
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);

            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 1024;
            source.connect(this.analyser);

            // Start processing audio
            this.startAudioProcessing();

            this.isCapturing = true;
            this.emit('captureStarted');
        } catch (error) {
            console.error('Failed to start audio capture:', error);
            throw error;
        }
    }

    async stopCapture(): Promise<void> {
        if (!this.isCapturing) return;

        try {
            // Stop audio processing
            this.stopAudioProcessing();

            // Close audio context
            if (this.audioContext) {
                await this.audioContext.close();
                this.audioContext = null;
            }

            // Stop media stream tracks
            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach(track => track.stop());
                this.mediaStream = null;
            }

            this.isCapturing = false;
            this.emit('captureStopped');
        } catch (error) {
            console.error('Failed to stop audio capture:', error);
            throw error;
        }
    }

    getAudioData(): Int16Array {
        if (!this.analyser) {
            throw new Error('Audio not initialized');
        }

        const bufferLength = this.analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteTimeDomainData(dataArray);

        // Convert to Int16Array for Porcupine
        const int16Array = new Int16Array(dataArray.length);
        for (let i = 0; i < dataArray.length; i++) {
            int16Array[i] = (dataArray[i] - 128) << 8;
        }

        return int16Array;
    }

    private startAudioProcessing(): void {
        const processAudio = () => {
            if (!this.isCapturing || !this.analyser) return;

            const audioData = this.getAudioData();
            this.audioData.push(audioData);

            // Keep buffer size reasonable
            if (this.audioData.length > 10) {
                this.audioData.shift();
            }

            requestAnimationFrame(processAudio);
        };

        processAudio();
    }

    private stopAudioProcessing(): void {
        this.audioData = [];
    }

    isCurrentlyCapturing(): boolean {
        return this.isCapturing;
    }
}

export { AudioCaptureService };