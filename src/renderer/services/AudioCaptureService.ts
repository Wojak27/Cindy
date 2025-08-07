import { ipcRenderer } from 'electron';

class AudioCaptureService {
    private mediaStream: MediaStream | null = null;
    private mediaRecorder: MediaRecorder | null = null;
    private recordedChunks: Blob[] = [];
    private isCapturing: boolean = false;
    private currentAudioBuffer: Int16Array[] = [];
    private audioContext: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;
    private bufferSize: number = 512;

    async startCapture(): Promise<void> {
        console.log('DEBUG: AudioCaptureService: Starting CLEAN capture (no chunks)...');
        if (this.isCapturing) {
            console.log('DEBUG: AudioCaptureService: Already capturing, returning early');
            return;
        }

        try {
            this.recordedChunks = [];

            // Get microphone with minimal processing to avoid distortion
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });

            const track = this.mediaStream.getAudioTracks()[0];
            const settings = track.getSettings();
            console.log('DEBUG: AudioCaptureService: Stream settings:', settings);

            // Use MediaRecorder with best supported format
            let selectedFormat = {};
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                selectedFormat = { mimeType: 'audio/webm;codecs=opus' };
            }

            this.mediaRecorder = new MediaRecorder(this.mediaStream, selectedFormat);

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    console.log(`DEBUG: AudioCaptureService: MediaRecorder chunk: ${event.data.size} bytes`);
                    this.recordedChunks.push(event.data);
                }
            };

            this.mediaRecorder.onerror = (error) => {
                console.error('DEBUG: AudioCaptureService: MediaRecorder error:', error);
            };

            // Start recording with large chunks to minimize fragmentation
            this.mediaRecorder.start(1000); // 1 second chunks
            this.isCapturing = true;

            console.log('DEBUG: AudioCaptureService: Clean MediaRecorder started');
            
            // Set up continuous audio monitoring for wake word detection
            this.setupContinuousMonitoring();

        } catch (error) {
            console.error('DEBUG: AudioCaptureService: Failed to start capture:', error);
            this.cleanup();
            throw error;
        }
    }

    async stopCapture(): Promise<Int16Array[]> {
        console.log('DEBUG: AudioCaptureService: Stopping CLEAN capture...');

        if (!this.isCapturing) {
            console.log('DEBUG: AudioCaptureService: Not capturing, returning empty array');
            return [] as Int16Array[];
        }

        this.isCapturing = false;

        return new Promise<Int16Array[]>((resolve, reject) => {
            if (!this.mediaRecorder) {
                reject(new Error('No MediaRecorder available'));
                return;
            }

            this.mediaRecorder.onstop = async () => {
                try {
                    console.log(`DEBUG: AudioCaptureService: Processing ${this.recordedChunks.length} MediaRecorder chunks`);

                    if (this.recordedChunks.length === 0) {
                        console.warn('DEBUG: AudioCaptureService: No chunks recorded!');
                        this.cleanup();
                        resolve([] as Int16Array[]);
                        return;
                    }

                    // Create blob from MediaRecorder chunks (clean, not fragmented)
                    const blobType = this.recordedChunks[0]?.type || 'audio/webm';
                    const audioBlob = new Blob(this.recordedChunks, { type: blobType });
                    console.log(`DEBUG: AudioCaptureService: Clean blob created - Size: ${audioBlob.size} bytes, Type: ${blobType}`);

                    // Convert to ArrayBuffer
                    const arrayBuffer = await audioBlob.arrayBuffer();
                    console.log(`DEBUG: AudioCaptureService: ArrayBuffer size: ${arrayBuffer.byteLength} bytes`);

                    // Decode with AudioContext
                    const audioContext = new AudioContext({ sampleRate: 16000 });

                    try {
                        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                        console.log(`DEBUG: AudioCaptureService: CLEAN DECODE SUCCESS - Duration: ${audioBuffer.duration.toFixed(2)}s, Sample Rate: ${audioBuffer.sampleRate}Hz`);

                        // Get clean audio data
                        const audioData = audioBuffer.getChannelData(0);
                        console.log(`DEBUG: AudioCaptureService: Clean audio samples: ${audioData.length}`);

                        // Convert to Int16Array
                        const int16Data = new Int16Array(audioData.length);
                        for (let i = 0; i < audioData.length; i++) {
                            const sample = Math.max(-1, Math.min(1, audioData[i]));
                            int16Data[i] = Math.round(sample * 32767);
                        }

                        // Quality check
                        const nonZeroSamples = Array.from(int16Data).filter(s => s !== 0).length;
                        const maxAmplitude = Math.max(...Array.from(int16Data).map(Math.abs));
                        console.log(`DEBUG: AudioCaptureService: CLEAN CONVERSION - Non-zero: ${nonZeroSamples}/${int16Data.length} (${((nonZeroSamples / int16Data.length) * 100).toFixed(1)}%)`);
                        console.log(`DEBUG: AudioCaptureService: CLEAN CONVERSION - Max amplitude: ${maxAmplitude}/32767 (${((maxAmplitude / 32767) * 100).toFixed(1)}%)`);

                        console.log('DEBUG: AudioCaptureService: RETURNING SINGLE CLEAN CHUNK (not 218 fragments!)');
                        resolve([int16Data]);

                    } catch (decodeError) {
                        console.error('DEBUG: AudioCaptureService: Decode error:', decodeError);
                        reject(decodeError);
                    } finally {
                        await audioContext.close();
                    }

                } catch (error) {
                    console.error('DEBUG: AudioCaptureService: Processing error:', error);
                    reject(error);
                }
            };

            this.mediaRecorder.stop();
        }).finally(() => {
            this.cleanup();
        });
    }

    private cleanup(): void {
        console.log('DEBUG: AudioCaptureService: Cleaning up...');

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.analyser = null;
        this.mediaRecorder = null;
        this.isCapturing = false;
        this.recordedChunks = [];
        this.currentAudioBuffer = [];

        console.log('DEBUG: AudioCaptureService: Cleanup completed');
    }

    private setupContinuousMonitoring(): void {
        if (!this.mediaStream) return;

        try {
            // Create audio context for real-time analysis
            this.audioContext = new AudioContext({ sampleRate: 16000 });
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            
            // Create analyser node
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = this.bufferSize * 2;
            source.connect(this.analyser);

            // Start monitoring loop
            this.monitorAudioBuffer();
        } catch (error) {
            console.warn('DEBUG: AudioCaptureService: Failed to setup continuous monitoring:', error);
        }
    }

    private monitorAudioBuffer(): void {
        if (!this.analyser || !this.audioContext) return;

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const monitor = () => {
            if (!this.isCapturing || !this.analyser) return;

            this.analyser.getByteFrequencyData(dataArray);
            
            // Convert to Int16Array for wake word processing
            const audioBuffer = new Int16Array(dataArray.length);
            for (let i = 0; i < dataArray.length; i++) {
                // Convert from 0-255 to -32768 to 32767
                audioBuffer[i] = ((dataArray[i] - 128) / 128) * 32767;
            }

            // Keep a rolling buffer of recent audio (last 5 frames)
            this.currentAudioBuffer.push(audioBuffer);
            if (this.currentAudioBuffer.length > 5) {
                this.currentAudioBuffer.shift();
            }

            // Continue monitoring
            if (this.isCapturing) {
                setTimeout(monitor, 50); // 50ms intervals
            }
        };

        monitor();
    }

    async getCurrentAudioBuffer(): Promise<Int16Array[]> {
        return [...this.currentAudioBuffer]; // Return copy
    }

    isCurrentlyCapturing(): boolean {
        return this.isCapturing;
    }
}

// Create and export a singleton instance
export const audioCaptureService = new AudioCaptureService();

// Set up IPC handlers for main process communication
ipcRenderer.on('start-recording', async () => {
    console.log('DEBUG: AudioCaptureService: Received start-recording event');
    try {
        await audioCaptureService.startCapture();
        console.log('DEBUG: AudioCaptureService: Clean capture started, isCapturing:', audioCaptureService.isCurrentlyCapturing());
    } catch (error) {
        console.error('DEBUG: AudioCaptureService: Error starting recording:', error);
    }
});

ipcRenderer.on('get-audio-data', async () => {
    console.log('DEBUG: AudioCaptureService: Received get-audio-data event');
    try {
        const audioData = await audioCaptureService.stopCapture();
        console.log('DEBUG: AudioCaptureService: Clean audio captured, sending SINGLE CHUNK to main process:', audioData?.length || 0);

        // Send to main process
        ipcRenderer.send('audio-data', audioData);
        console.log('DEBUG: AudioCaptureService: CLEAN audio data sent successfully');

    } catch (error) {
        console.error('DEBUG: AudioCaptureService: Error getting audio data:', error);
    }
});
