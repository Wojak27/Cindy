import { EventEmitter } from 'events';
import { WhisperWakeWordDetector } from '../utils/WhisperWakeWordDetector';
import { SettingsService } from './SettingsService';

class WakeWordService extends EventEmitter {
    private whisperDetector: WhisperWakeWordDetector;
    private settingsService: SettingsService;
    private isListening: boolean = false;
    private detectionInterval: NodeJS.Timeout | null = null;
    private mainWindow: Electron.BrowserWindow | null;
    private audioThreshold: number = 0.01; // Minimum audio level to trigger detection

    constructor(settingsService: SettingsService, mainWindow: Electron.BrowserWindow) {
        super();
        this.settingsService = settingsService;
        this.whisperDetector = new WhisperWakeWordDetector();
        this.mainWindow = mainWindow;
        
        console.log('WakeWordService: Initialized with Whisper-based wake word detection');
    }

    async startListening(): Promise<void> {
        console.log('WakeWordService: Starting Whisper-based wake word listening');
        if (this.isListening) {
            console.log('WakeWordService: Already listening, aborting start');
            return;
        }

        try {
            // Get settings
            const voiceSettings = await this.settingsService.get('voice');
            
            // Set audio threshold from settings (default 0.01 if not specified)
            this.audioThreshold = voiceSettings.audioThreshold || 0.01;

            // Initialize Whisper detector with keyword and sensitivity
            console.log('WakeWordService: Initializing Whisper detector with keyword:', voiceSettings.activationPhrase);
            await this.whisperDetector.initialize(
                voiceSettings.activationPhrase,
                voiceSettings.wakeWordSensitivity
            );

            // Start continuous audio capture for wake word detection via IPC
            console.log('WakeWordService: Starting audio capture via IPC');
            if (this.mainWindow && this.mainWindow.webContents) {
                this.mainWindow.webContents.send('start-recording');
            }

            // Start detection loop with proper audio gating
            this.detectionInterval = setInterval(() => {
                this.detectWakeWord();
            }, 1000); // Check every 1 second for Whisper (slower but more accurate)

            this.isListening = true;
            this.emit('listeningStarted');
            console.log(`WakeWordService: Started listening with audio threshold: ${this.audioThreshold}`);
        } catch (error) {
            console.error('WakeWordService: Failed to start listening:', error);
            // Clean up on failure
            if (this.detectionInterval) {
                clearInterval(this.detectionInterval);
                this.detectionInterval = null;
            }
            this.isListening = false;
            throw error;
        }
    }

    async stopListening(): Promise<void> {
        console.log('WakeWordService: Stopping wake word listening');
        if (!this.isListening) {
            console.log('WakeWordService: Not currently listening, aborting stop');
            return;
        }

        // Stop detection loop
        if (this.detectionInterval) {
            clearInterval(this.detectionInterval);
            this.detectionInterval = null;
        }

        // Stop audio capture via IPC
        if (this.mainWindow && this.mainWindow.webContents) {
            this.mainWindow.webContents.send('get-audio-data');
        }

        // Cleanup Whisper detector
        await this.whisperDetector.cleanup();

        this.isListening = false;
        this.emit('listeningStopped');
    }

    async updateKeyword(newKeyword: string, sensitivity: number = 0.5): Promise<void> {
        await this.whisperDetector.updateKeyword(newKeyword, sensitivity);
        this.emit('keywordUpdated', newKeyword);
    }

    private async detectWakeWord(): Promise<void> {
        try {
            // Check if main window and web contents are available and not destroyed
            if (!this.mainWindow || !this.mainWindow.webContents || this.mainWindow.webContents.isDestroyed()) {
                return;
            }

            // TODO: Implement IPC-based audio data retrieval for wake word detection
            // For now, this is disabled to prevent the import error
            // The wake word detection will need to be refactored to use IPC communication
            // instead of direct access to the renderer process AudioCaptureService
            
            console.log('WakeWordService: Wake word detection temporarily disabled - needs IPC refactoring');
            
        } catch (error) {
            console.error('WakeWordService: Error in wake word detection:', error);
        }
    }

    /**
     * Calculate the RMS (Root Mean Square) audio level
     * @param audioData Int16Array of audio samples
     * @returns number between 0 and 1 representing audio level
     */
    // @ts-ignore - temporarily unused during IPC refactoring
    private calculateAudioLevel(audioData: Int16Array): number {
        if (!audioData || audioData.length === 0) {
            return 0;
        }

        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
            const normalized = audioData[i] / 32768; // Normalize to -1 to 1
            sum += normalized * normalized;
        }

        const rms = Math.sqrt(sum / audioData.length);
        return Math.min(rms, 1.0); // Clamp to maximum of 1.0
    }

    isCurrentlyListening(): boolean {
        return this.isListening;
    }
}

export default WakeWordService;