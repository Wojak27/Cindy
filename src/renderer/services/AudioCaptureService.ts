import { ipcRenderer } from 'electron';

class AudioCaptureService {
    private mediaStream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;
    private isCapturing: boolean = false;
    private audioData: Int16Array[] = [];

    async startCapture(): Promise<void> {
        console.log('DEBUG: AudioCaptureService: startCapture called, current isCapturing:', this.isCapturing);
        if (this.isCapturing) {
            console.log('DEBUG: AudioCaptureService: Already capturing, returning early');
            return;
        }
        console.log('DEBUG: AudioCaptureService: Starting audio capture...');

        try {
            // Try microphone access first (standard approach)
            console.log('DEBUG: AudioCaptureService: Attempting standard microphone access');
            try {
                this.mediaStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        sampleRate: 16000 // Porcupine requirement
                    }
                });
                console.log('DEBUG: AudioCaptureService: Standard microphone media stream acquired successfully');
            } catch (micError) {
                console.warn('DEBUG: AudioCaptureService: Standard microphone access failed, trying desktop audio fallback:', micError);

                // Fallback to desktop audio sources via IPC
                console.log('DEBUG: AudioCaptureService: Requesting desktop audio sources via IPC');
                const sources = await ipcRenderer.invoke('get-desktop-audio-sources');
                console.log('DEBUG: AudioCaptureService: Audio sources retrieved:', sources?.length || 0);

                if (!sources || sources.length === 0) {
                    console.error('DEBUG: AudioCaptureService: No audio sources available');
                    throw new Error('No audio sources found and microphone access failed');
                }

                // Find the first audio source
                const audioSource = sources.find((source: any) => source.name === 'Entire screen' || source.name.includes('audio'));
                console.log('DEBUG: AudioCaptureService: Audio source found:', audioSource?.name);

                if (!audioSource) {
                    console.error('DEBUG: AudioCaptureService: No suitable audio source found in:', sources.map((s: any) => s.name));
                    throw new Error('No suitable audio sources found');
                }

                // Request desktop audio access
                console.log('DEBUG: AudioCaptureService: Requesting desktop audio access with source ID:', audioSource.id);
                try {
                    this.mediaStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            mandatory: {
                                chromeMediaSource: 'desktop',
                                chromeMediaSourceId: audioSource.id,
                                echoCancellation: true,
                                noiseSuppression: true,
                                sampleRate: 16000 // Porcupine requirement
                            }
                        } as any // Type assertion to handle Chrome-specific constraints
                    });
                    console.log('DEBUG: AudioCaptureService: Desktop audio media stream acquired');
                } catch (error) {
                    console.error('DEBUG: AudioCaptureService: Failed to acquire desktop audio stream:', error);
                    throw error;
                }
            }

            // Set up audio context for processing
            console.log('DEBUG: AudioCaptureService: Setting up audio context');
            try {
                this.audioContext = new AudioContext({ sampleRate: 16000 });
                console.log('DEBUG: AudioCaptureService: Audio context created successfully');
            } catch (error) {
                console.error('DEBUG: AudioCaptureService: Failed to create audio context:', error);
                throw error;
            }

            let source;
            try {
                source = this.audioContext.createMediaStreamSource(this.mediaStream);
                console.log('DEBUG: AudioCaptureService: Media stream source created successfully');
            } catch (error) {
                console.error('DEBUG: AudioCaptureService: Failed to create media stream source:', error);
                throw error;
            }

            try {
                this.analyser = this.audioContext.createAnalyser();
                this.analyser.fftSize = 1024;
                source.connect(this.analyser);
                console.log('DEBUG: AudioCaptureService: Analyser connected successfully');
            } catch (error) {
                console.error('DEBUG: AudioCaptureService: Failed to create analyser or connect source:', error);
                throw error;
            }

            // Start processing audio
            console.log('DEBUG: AudioCaptureService: Starting audio processing');
            this.startAudioProcessing();
            console.log('DEBUG: AudioCaptureService: Audio processing started successfully');

            this.isCapturing = true;
            console.log('DEBUG: AudioCaptureService: Audio capture started successfully, isCapturing:', this.isCapturing);
        } catch (error) {
            console.error('DEBUG: AudioCaptureService: Failed to start audio capture:', error);
            console.error('DEBUG: AudioCaptureService: Error details:', {
                name: error.name,
                message: error.message,
                code: error.code
            });
            // Reset state on error
            this.isCapturing = false;
            this.mediaStream = null;
            this.audioContext = null;
            this.analyser = null;
            console.log('DEBUG: AudioCaptureService: isCapturing reset to false due to error');
            throw error;
        }
    }

    async stopCapture(): Promise<Int16Array[]> {
        console.log('AudioCaptureService: stopCapture called, isCapturing:', this.isCapturing);
        if (!this.isCapturing) {
            console.log('AudioCaptureService: Not capturing, returning empty array');
            return [];
        }

        try {
            console.log('AudioCaptureService: Stopping capture, current audio data length:', this.audioData.length);
            // Copy audio data BEFORE stopping processing (which clears the buffer)
            const audioDataCopy = [...this.audioData];
            console.log('AudioCaptureService: Copied audio data, length:', audioDataCopy.length);

            // Stop capture flag first (this stops the processing loop)
            this.isCapturing = false;
            console.log('AudioCaptureService: Set isCapturing to false to stop processing loop');

            // Wait a bit for the processing loop to finish
            await new Promise(resolve => setTimeout(resolve, 100));

            // Now clear the buffer
            this.stopAudioProcessing();
            console.log('AudioCaptureService: Audio processing stopped and buffer cleared');

            // Close audio context
            console.log('AudioCaptureService: Closing audio context');
            if (this.audioContext) {
                await this.audioContext.close();
                this.audioContext = null;
                console.log('AudioCaptureService: Audio context closed');
            }

            // Stop media stream tracks
            console.log('AudioCaptureService: Stopping media stream tracks');
            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach(track => track.stop());
                this.mediaStream = null;
                console.log('AudioCaptureService: Media stream tracks stopped');
            }

            this.isCapturing = false;
            console.log('AudioCaptureService: Capture stopped, isCapturing set to false');

            // Return collected audio data
            console.log('AudioCaptureService: Returning audio data, length:', audioDataCopy.length);
            return audioDataCopy;
        } catch (error) {
            console.error('AudioCaptureService: Failed to stop audio capture:', error);
            // Ensure we still set isCapturing to false even if there's an error
            this.isCapturing = false;
            console.log('AudioCaptureService: isCapturing set to false due to error in stopCapture');
            throw error;
        }
    }

    private startAudioProcessing(): void {
        console.log('AudioCaptureService: Starting audio processing loop');
        const processAudio = () => {
            try {
                if (!this.isCapturing || !this.analyser) {
                    console.log('AudioCaptureService: Stopping audio processing loop, isCapturing:', this.isCapturing, 'analyser exists:', !!this.analyser);
                    return;
                }

                const bufferLength = this.analyser.fftSize;
                const dataArray = new Uint8Array(bufferLength);
                this.analyser.getByteTimeDomainData(dataArray);

                // Convert to Int16Array for speech processing
                const int16Array = new Int16Array(dataArray.length);
                for (let i = 0; i < dataArray.length; i++) {
                    // Improved conversion from Uint8 to Int16
                    int16Array[i] = (dataArray[i] - 128) * 256;
                }

                this.audioData.push(int16Array);

                // Log every 10 chunks to avoid spam but confirm it's working
                if (this.audioData.length % 10 === 0) {
                    console.log('AudioCaptureService: Audio data chunks collected:', this.audioData.length);
                }

                // Keep buffer size reasonable (about 5 seconds at ~50 fps)
                if (this.audioData.length > 250) {
                    this.audioData.shift();
                }

                // Continue processing
                if (this.isCapturing) {
                    requestAnimationFrame(processAudio);
                }
            } catch (error) {
                console.error('AudioCaptureService: Error in audio processing loop:', error);
                this.isCapturing = false;
                console.log('AudioCaptureService: isCapturing set to false due to error in processing loop');
            }
        };

        processAudio();
    }

    private stopAudioProcessing(): void {
        console.log('AudioCaptureService: Clearing audio data buffer');
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
    console.log('AudioCaptureService: Received start-recording event');
    try {
        console.log('AudioCaptureService: Calling startCapture');
        await audioCaptureService.startCapture();
        console.log('AudioCaptureService: startCapture completed, isCapturing:', audioCaptureService.isCurrentlyCapturing());
    } catch (error) {
        console.error('AudioCaptureService: Error starting recording:', error);
    }
});

ipcRenderer.on('get-audio-data', async () => {
    console.log('AudioCaptureService: Received get-audio-data event, isCapturing:', audioCaptureService.isCurrentlyCapturing());
    try {
        console.log('AudioCaptureService: Calling stopCapture');
        const audioData = await audioCaptureService.stopCapture();
        console.log('AudioCaptureService: Audio data captured, attempting to send to main process', audioData?.length || 0);

        // Send audio data back to main process
        try {
            console.log('AudioCaptureService: Sending audio data to main process');
            ipcRenderer.send('audio-data', audioData);
            console.log('AudioCaptureService: Successfully sent audio data to main process');
        } catch (sendError) {
            console.error('AudioCaptureService: Failed to send audio data to main process:', sendError);
            // Handle EPIPE and other communication errors gracefully
            if (sendError.code === 'EPIPE') {
                console.warn('AudioCaptureService: Main process pipe is closed - cannot send audio data');
            } else {
                console.error('AudioCaptureService: Error sending audio data to main process:', sendError);
            }
        }
    } catch (error) {
        console.error('AudioCaptureService: Error getting audio data:', error);
    }
});


