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
            // Clear any existing data first
            this.audioData = [];

            // Try microphone access first (standard approach)
            console.log('DEBUG: AudioCaptureService: Attempting standard microphone access');
            try {
                this.mediaStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: false,  // Turn off processing for cleaner audio
                        noiseSuppression: false,
                        autoGainControl: false
                        // Remove sampleRate constraint to use hardware default
                    }
                });
                console.log('DEBUG: AudioCaptureService: Standard microphone media stream acquired successfully');
                console.log('DEBUG: AudioCaptureService: Media stream tracks:', this.mediaStream.getTracks().length);
                console.log('DEBUG: AudioCaptureService: Audio track settings:', this.mediaStream.getAudioTracks()[0]?.getSettings());
            } catch (micError) {
                console.warn('DEBUG: AudioCaptureService: Standard microphone access failed:', micError);
                throw new Error(`Microphone access denied: ${micError.message}`);
            }

            // Set up audio context for processing - use default sample rate to match hardware
            console.log('DEBUG: AudioCaptureService: Setting up audio context');
            try {
                // Don't force 16kHz - let AudioContext use the hardware's native rate
                this.audioContext = new AudioContext();
                console.log('DEBUG: AudioCaptureService: Audio context created successfully');
                console.log('DEBUG: AudioCaptureService: Audio context sample rate:', this.audioContext.sampleRate);
                console.log('DEBUG: AudioCaptureService: Audio context state:', this.audioContext.state);
            } catch (error) {
                console.error('DEBUG: AudioCaptureService: Failed to create audio context:', error);
                throw error;
            }

            let source;
            try {
                source = this.audioContext.createMediaStreamSource(this.mediaStream);
                console.log('DEBUG: AudioCaptureService: Media stream source created successfully');
                console.log('DEBUG: AudioCaptureService: MediaStream sample rate from track:', this.mediaStream.getAudioTracks()[0]?.getSettings().sampleRate);
                console.log('DEBUG: AudioCaptureService: MediaStreamSource context sample rate:', source.context.sampleRate);
            } catch (error) {
                console.error('DEBUG: AudioCaptureService: Failed to create media stream source:', error);
                throw error;
            }

            try {
                this.analyser = this.audioContext.createAnalyser();
                this.analyser.fftSize = 1024;
                this.analyser.smoothingTimeConstant = 0.0; // Disable smoothing for raw data
                source.connect(this.analyser);
                console.log('DEBUG: AudioCaptureService: Analyser connected successfully');
                console.log('DEBUG: AudioCaptureService: Analyser fftSize:', this.analyser.fftSize);
                console.log('DEBUG: AudioCaptureService: Analyser frequencyBinCount:', this.analyser.frequencyBinCount);
                console.log('DEBUG: AudioCaptureService: Analyser smoothingTimeConstant:', this.analyser.smoothingTimeConstant);
            } catch (error) {
                console.error('DEBUG: AudioCaptureService: Failed to create analyser or connect source:', error);
                throw error;
            }

            // Set capturing flag BEFORE starting processing loop
            this.isCapturing = true;
            console.log('DEBUG: AudioCaptureService: Set isCapturing to true before starting processing');

            // Resume AudioContext if suspended (required by browsers)
            if (this.audioContext.state === 'suspended') {
                console.log('DEBUG: AudioCaptureService: AudioContext is suspended, resuming...');
                await this.audioContext.resume();
                console.log('DEBUG: AudioCaptureService: AudioContext resumed, new state:', this.audioContext.state);
            }

            // Start processing audio
            console.log('DEBUG: AudioCaptureService: About to start audio processing');
            this.startAudioProcessing();
            console.log('DEBUG: AudioCaptureService: Audio processing started successfully');
            console.log('DEBUG: AudioCaptureService: Final check - analyser exists:', !!this.analyser, 'mediaStream exists:', !!this.mediaStream);
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
        console.log('DEBUG: AudioCaptureService: Starting audio processing loop');
        console.log('DEBUG: AudioCaptureService: Initial state - isCapturing:', this.isCapturing, 'analyser exists:', !!this.analyser);

        const processAudio = () => {
            try {
                if (!this.isCapturing || !this.analyser) {
                    console.log('DEBUG: AudioCaptureService: Stopping audio processing loop, isCapturing:', this.isCapturing, 'analyser exists:', !!this.analyser);
                    return;
                }

                const bufferLength = this.analyser.fftSize;

                // Use Float32Array for proper audio data (range -1.0 to 1.0)
                const dataArray = new Float32Array(bufferLength);
                this.analyser.getFloatTimeDomainData(dataArray);

                // Additional diagnostic: try getByteTimeDomainData for comparison
                if (this.audioData.length === 0) {
                    const byteData = new Uint8Array(bufferLength);
                    this.analyser.getByteTimeDomainData(byteData);
                    const byteNonZero = Array.from(byteData).filter(s => s !== 128).length; // 128 is silence for Uint8
                    console.log('DEBUG: AudioCaptureService: Byte domain data non-128 samples:', byteNonZero, 'out of', byteData.length);
                    console.log('DEBUG: AudioCaptureService: Byte domain data sample (first 10):', Array.from(byteData.slice(0, 10)));

                    // Check if AudioContext is actually processing audio
                    console.log('DEBUG: AudioCaptureService: AudioContext current time:', this.audioContext?.currentTime);
                    console.log('DEBUG: AudioCaptureService: AudioContext base latency:', this.audioContext?.baseLatency);
                }

                // Enhanced debugging for first chunk to check if we're getting any data at all
                if (this.audioData.length === 0) {
                    console.log('DEBUG: AudioCaptureService: Raw float data sample (first 10):', Array.from(dataArray.slice(0, 10)));
                    const rawNonZero = Array.from(dataArray).filter(s => s !== 0).length;
                    console.log('DEBUG: AudioCaptureService: Raw non-zero float samples:', rawNonZero, 'out of', dataArray.length);

                    // Check media stream track status
                    if (this.mediaStream) {
                        const tracks = this.mediaStream.getAudioTracks();
                        if (tracks.length > 0) {
                            const track = tracks[0];
                            console.log('DEBUG: AudioCaptureService: Audio track enabled:', track.enabled);
                            console.log('DEBUG: AudioCaptureService: Audio track readyState:', track.readyState);
                            console.log('DEBUG: AudioCaptureService: Audio track muted:', track.muted);
                            console.log('DEBUG: AudioCaptureService: Audio track constraints:', track.getConstraints());
                            console.log('DEBUG: AudioCaptureService: Audio track capabilities:', track.getCapabilities());
                        }
                    }

                    // Try alternative data retrieval method
                    console.log('DEBUG: AudioCaptureService: Trying alternative getFloatFrequencyData...');
                    const freqData = new Float32Array(this.analyser.frequencyBinCount);
                    this.analyser.getFloatFrequencyData(freqData);
                    const freqNonInfinite = Array.from(freqData).filter(s => s !== -Infinity).length;
                    console.log('DEBUG: AudioCaptureService: Frequency domain non-infinite samples:', freqNonInfinite, 'out of', freqData.length);
                }

                // Convert to Int16Array for speech processing with resampling to 16kHz
                const sourceRate = this.audioContext?.sampleRate || 44100;
                const targetRate = 16000;

                // Log resampling info for first chunk
                if (this.audioData.length === 0) {
                    console.log('DEBUG: AudioCaptureService: Resampling audio from', sourceRate, 'Hz to', targetRate, 'Hz');
                    console.log('DEBUG: AudioCaptureService: Original samples:', dataArray.length, 'Expected resampled:', Math.floor(dataArray.length * targetRate / sourceRate));
                }

                const resampledArray = this.resampleAudio(dataArray, sourceRate, targetRate);

                // Log resampling results for first chunk
                if (this.audioData.length === 0) {
                    console.log('DEBUG: AudioCaptureService: Resampled samples:', resampledArray.length);
                    console.log('DEBUG: AudioCaptureService: Resampled data sample (first 10):', Array.from(resampledArray.slice(0, 10)));
                    const resampledNonZero = Array.from(resampledArray).filter(s => s !== 0).length;
                    console.log('DEBUG: AudioCaptureService: Resampled non-zero samples:', resampledNonZero, 'out of', resampledArray.length);
                }

                // Convert resampled float data to Int16Array
                const int16Array = new Int16Array(resampledArray.length);
                for (let i = 0; i < resampledArray.length; i++) {
                    // Convert from float (-1.0 to 1.0) to int16 (-32768 to 32767)
                    int16Array[i] = Math.max(-32768, Math.min(32767, resampledArray[i] * 32767));
                }

                this.audioData.push(int16Array);

                // Enhanced logging for first chunk and then every 50 chunks
                if (this.audioData.length === 1) {
                    console.log('DEBUG: AudioCaptureService: First audio chunk captured! Size:', int16Array.length);
                    // Sample the first few values to check for actual audio data
                    const samples = Array.from(int16Array.slice(0, 10));
                    const nonZeroSamples = samples.filter(s => s !== 0).length;
                    console.log('DEBUG: AudioCaptureService: Converted samples (first 10):', samples);
                    console.log('DEBUG: AudioCaptureService: Non-zero samples in first chunk:', nonZeroSamples, 'out of 10');

                    // Check audio levels
                    const maxAmplitude = Math.max(...int16Array.map(Math.abs));
                    console.log('DEBUG: AudioCaptureService: Max amplitude in first chunk:', maxAmplitude);
                } else if (this.audioData.length % 50 === 0) {
                    console.log('DEBUG: AudioCaptureService: Audio data chunks collected:', this.audioData.length);
                    // Periodic amplitude check
                    const maxAmplitude = Math.max(...int16Array.map(Math.abs));
                    console.log('DEBUG: AudioCaptureService: Max amplitude in chunk', this.audioData.length, ':', maxAmplitude);
                }

                // Keep buffer size reasonable (about 5 seconds at ~50 fps)
                if (this.audioData.length > 250) {
                    this.audioData.shift();
                }

                // Continue processing
                if (this.isCapturing) {
                    requestAnimationFrame(processAudio);
                } else {
                    console.log('DEBUG: AudioCaptureService: Processing loop stopped - isCapturing is false');
                }
            } catch (error) {
                console.error('DEBUG: AudioCaptureService: Error in audio processing loop:', error);
                this.isCapturing = false;
                console.log('DEBUG: AudioCaptureService: isCapturing set to false due to error in processing loop');
            }
        };

        console.log('DEBUG: AudioCaptureService: About to call processAudio for the first time');
        processAudio();
        console.log('DEBUG: AudioCaptureService: First call to processAudio completed');
    }

    private stopAudioProcessing(): void {
        console.log('AudioCaptureService: Clearing audio data buffer');
        this.audioData = [];
    }

    /**
     * Resample audio from source sample rate to target sample rate using linear interpolation
     * @param inputData Float32Array of audio samples
     * @param sourceRate Source sample rate (e.g., 44100)
     * @param targetRate Target sample rate (e.g., 16000)
     * @returns Float32Array of resampled audio
     */
    private resampleAudio(inputData: Float32Array, sourceRate: number, targetRate: number): Float32Array {
        if (sourceRate === targetRate) {
            return inputData;
        }

        const ratio = sourceRate / targetRate;
        const outputLength = Math.floor(inputData.length / ratio);
        const outputData = new Float32Array(outputLength);

        for (let i = 0; i < outputLength; i++) {
            const sourceIndex = i * ratio;
            const sourceIndexInt = Math.floor(sourceIndex);
            const sourceFraction = sourceIndex - sourceIndexInt;

            // Linear interpolation between two adjacent samples
            if (sourceIndexInt + 1 < inputData.length) {
                outputData[i] = inputData[sourceIndexInt] * (1 - sourceFraction) +
                    inputData[sourceIndexInt + 1] * sourceFraction;
            } else {
                outputData[i] = inputData[sourceIndexInt];
            }
        }

        return outputData;
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
        console.log('DEBUG: AudioCaptureService: About to call startCapture');
        await audioCaptureService.startCapture();
        console.log('DEBUG: AudioCaptureService: startCapture completed, isCapturing:', audioCaptureService.isCurrentlyCapturing());
    } catch (error) {
        console.error('DEBUG: AudioCaptureService: Error starting recording:', error);
        console.error('DEBUG: AudioCaptureService: Error details:', {
            name: error?.name,
            message: error?.message,
            stack: error?.stack
        });
    }
});

ipcRenderer.on('get-audio-data', async () => {
    console.log('AudioCaptureService: Received get-audio-data event, isCapturing:', audioCaptureService.isCurrentlyCapturing());
    try {
        console.log('AudioCaptureService: Calling stopCapture');
        const audioData = await audioCaptureService.stopCapture();
        console.log('AudioCaptureService: Audio data captured, attempting to send to main process', audioData?.length || 0);

        // DIAGNOSTIC: Check the actual audio data before sending
        if (audioData && audioData.length > 0) {
            let totalNonZero = 0;
            let maxAmplitude = 0;
            for (const chunk of audioData) {
                const nonZeroInChunk = chunk.filter(sample => sample !== 0).length;
                totalNonZero += nonZeroInChunk;
                const chunkMax = Math.max(...chunk.map(Math.abs));
                maxAmplitude = Math.max(maxAmplitude, chunkMax);
            }
            console.log('DEBUG: AudioCaptureService: Pre-send analysis:');
            console.log('DEBUG: AudioCaptureService: Total chunks:', audioData.length);
            console.log('DEBUG: AudioCaptureService: Total non-zero samples:', totalNonZero);
            console.log('DEBUG: AudioCaptureService: Max amplitude across all chunks:', maxAmplitude);
        }

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


