/**
 * Real-Time Speech Recognition using Web Speech API
 * 
 * Provides live transcription while the user is speaking for immediate feedback.
 * This runs in the browser/renderer process for low latency.
 */

export interface RealTimeSpeechConfig {
    language?: string;
    continuous?: boolean;
    interimResults?: boolean;
    maxAlternatives?: number;
}

export class RealTimeSpeechRecognition {
    private recognition: SpeechRecognition | null = null;
    private isSupported: boolean = false;
    private isListening: boolean = false;
    private config: RealTimeSpeechConfig;

    // Event callbacks
    public onResult: ((transcript: string, isFinal: boolean) => void) | null = null;
    public onError: ((error: string) => void) | null = null;
    public onStart: (() => void) | null = null;
    public onEnd: (() => void) | null = null;

    constructor(config: RealTimeSpeechConfig = {}) {
        this.config = {
            language: 'en-US',
            continuous: true,
            interimResults: true,
            maxAlternatives: 1,
            ...config
        };

        this.initializeSpeechRecognition();
    }

    private initializeSpeechRecognition(): void {
        // Check for browser support
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        
        if (!SpeechRecognition) {
            console.warn('Real-time speech recognition not supported in this browser');
            this.isSupported = false;
            return;
        }

        // Note: Web Speech API has limited support in Electron
        // It may work in development but not in production builds
        console.warn('🔧 Web Speech API detected but may not work reliably in Electron');
        console.warn('🔧 Consider using Azure Speech SDK or sherpa-onnx with models for reliable STT');

        this.isSupported = true;
        this.recognition = new SpeechRecognition();

        // Configure recognition
        this.recognition.continuous = this.config.continuous!;
        this.recognition.interimResults = this.config.interimResults!;
        this.recognition.lang = this.config.language!;
        this.recognition.maxAlternatives = this.config.maxAlternatives!;

        // Set up event handlers
        this.recognition.onstart = () => {
            console.log('🎤 Real-time speech recognition started');
            this.isListening = true;
            if (this.onStart) {
                this.onStart();
            }
        };

        this.recognition.onend = () => {
            console.log('🎤 Real-time speech recognition ended');
            this.isListening = false;
            if (this.onEnd) {
                this.onEnd();
            }
        };

        this.recognition.onerror = (event) => {
            console.error('🎤 Real-time speech recognition error:', event.error);
            this.isListening = false;
            if (this.onError) {
                this.onError(`Speech recognition error: ${event.error}`);
            }
        };

        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            // Process all results
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                const transcript = result[0].transcript;

                if (result.isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            // Send results to callback
            if (this.onResult) {
                if (finalTranscript) {
                    this.onResult(finalTranscript.trim(), true);
                } else if (interimTranscript) {
                    this.onResult(interimTranscript.trim(), false);
                }
            }
        };
    }

    public startListening(): boolean {
        if (!this.isSupported) {
            console.warn('Real-time speech recognition not supported');
            return false;
        }

        if (this.isListening) {
            console.warn('Already listening');
            return false;
        }

        try {
            this.recognition?.start();
            return true;
        } catch (error) {
            console.error('Failed to start real-time speech recognition:', error);
            if (this.onError) {
                this.onError('Failed to start speech recognition');
            }
            return false;
        }
    }

    public stopListening(): void {
        if (!this.isSupported || !this.isListening) {
            return;
        }

        try {
            this.recognition?.stop();
        } catch (error) {
            console.error('Failed to stop real-time speech recognition:', error);
        }
    }

    public isCurrentlyListening(): boolean {
        return this.isListening;
    }

    public isWebSpeechSupported(): boolean {
        return this.isSupported;
    }

    public destroy(): void {
        if (this.isListening) {
            this.stopListening();
        }
        
        // Clear event handlers
        this.onResult = null;
        this.onError = null;
        this.onStart = null;
        this.onEnd = null;
        
        this.recognition = null;
    }
}

export default RealTimeSpeechRecognition;