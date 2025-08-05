import { ipcRenderer } from 'electron';

class AudioCaptureService {
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
                    sampleRate: 16000 // Porcupine requirement
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
        } catch (error) {
            console.error('Failed to start audio capture:', error);
            throw error;
        }
    }

    async stopCapture(): Promise<Int16Array[]> {
        if (!this.isCapturing) {
            return [];
        }

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

            // Return collected audio data
            return this.audioData;
        } catch (error) {
            console.error('Failed to stop audio capture:', error);
            throw error;
        }
    }

    private startAudioProcessing(): void {
        const processAudio = () => {
            if (!this.isCapturing || !this.analyser) return;

            const bufferLength = this.analyser.fftSize;
            const dataArray = new Uint8Array(bufferLength);
            this.analyser.getByteTimeDomainData(dataArray);

            // Convert to Int16Array for Porcupine
            const int16Array = new Int16Array(dataArray.length);
            for (let i = 0; i < dataArray.length; i++) {
                int16Array[i] = (dataArray[i] - 128) << 8;
            }

            this.audioData.push(int16Array);

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

// Create and export a singleton instance
export const audioCaptureService = new AudioCaptureService();

// Set up IPC handlers for main process communication
ipcRenderer.on('start-recording', async () => {
    try {
        await audioCaptureService.startCapture();
    } catch (error) {
        console.error('Error starting recording:', error);
    }
});

ipcRenderer.on('get-audio-data', async () => {
    try {
        const audioData = await audioCaptureService.stopCapture();
        // Send audio data back to main process
        ipcRenderer.send('audio-data', audioData);
    } catch (error) {
        console.error('Error getting audio data:', error);
    }
});