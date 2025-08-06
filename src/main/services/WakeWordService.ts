import { EventEmitter } from 'events';
import { PorcupineWrapper } from '../utils/PorcupineWrapper';
import { audioCaptureService } from '../../renderer/services/AudioCaptureService';
import { SettingsService } from './SettingsService';

class WakeWordService extends EventEmitter {
    private porcupine: PorcupineWrapper;
    private audioCapture: typeof audioCaptureService;
    private settingsService: SettingsService;
    private isListening: boolean = false;
    private detectionInterval: NodeJS.Timeout | null = null;
    private accessKey: string = ''; // Will be loaded from secure storage

    constructor(settingsService: SettingsService) {
        super();
        this.settingsService = settingsService;
        this.porcupine = new PorcupineWrapper();
        this.audioCapture = audioCaptureService;
    }

    async startListening(): Promise<void> {
        if (this.isListening) {
            return;
        }

        try {
            // Get settings
            const voiceSettings = await this.settingsService.get('voice');

            // Initialize Porcupine with keyword and sensitivity
            await this.porcupine.initialize(
                this.accessKey,
                voiceSettings.activationPhrase,
                voiceSettings.wakeWordSensitivity
            );

            // Start audio capture
            await this.audioCapture.startCapture();

            // Start detection loop
            this.detectionInterval = setInterval(() => {
                this.detectWakeWord();
            }, 100); // Check every 100ms

            this.isListening = true;
            this.emit('listeningStarted');
        } catch (error) {
            console.error('Failed to start listening:', error);
            throw error;
        }
    }

    async stopListening(): Promise<void> {
        if (!this.isListening) {
            return;
        }

        // Stop detection loop
        if (this.detectionInterval) {
            clearInterval(this.detectionInterval);
            this.detectionInterval = null;
        }

        // Stop audio capture
        await this.audioCapture.stopCapture();

        // Cleanup Porcupine
        await this.porcupine.cleanup();

        this.isListening = false;
        this.emit('listeningStopped');
    }

    async updateKeyword(newKeyword: string, sensitivity: number = 0.5): Promise<void> {
        await this.porcupine.updateKeyword(this.accessKey, newKeyword, sensitivity);
        this.emit('keywordUpdated', newKeyword);
    }

    private async detectWakeWord(): Promise<void> {
        try {
            const audioDataArray = await this.audioCapture.stopCapture();
            const audioData = audioDataArray.length > 0 ? audioDataArray[audioDataArray.length - 1] : new Int16Array(0);
            const detected = await this.porcupine.process(audioData);

            if (detected) {
                this.emit('wakeWordDetected');
            }
        } catch (error) {
            console.error('Error in wake word detection:', error);
        }
    }

    isCurrentlyListening(): boolean {
        return this.isListening;
    }
}

export default WakeWordService;