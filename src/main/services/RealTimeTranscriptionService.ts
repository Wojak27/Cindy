import { EventEmitter } from 'events';
import { SpeechToTextService } from './SpeechToTextService';

class RealTimeTranscriptionService extends EventEmitter {
    // @ts-ignore - temporarily unused during IPC refactoring
    private sttService: SpeechToTextService;
    private isTranscribing: boolean = false;
    private transcriptionInterval: NodeJS.Timeout | null = null;
    private mainWindow: Electron.BrowserWindow | null;
    private lastTranscription: string = '';
    private speechDetectionTimeout: NodeJS.Timeout | null = null;
    private silenceCount: number = 0;
    private readonly MAX_SILENCE_COUNT = 3; // 3 seconds of silence to auto-stop

    constructor(mainWindow: Electron.BrowserWindow) {
        super();
        this.mainWindow = mainWindow;
        
        // Initialize STT service optimized for real-time transcription
        const sttConfig = {
            provider: 'offline' as const,
            language: 'en-US',
            autoPunctuation: true,
            profanityFilter: false,
            offlineModel: 'tiny' as const // Fast model for real-time
        };
        this.sttService = new SpeechToTextService(sttConfig);
    }

    async startTranscription(): Promise<void> {
        console.log('RealTimeTranscriptionService: Starting real-time transcription');
        
        if (this.isTranscribing) {
            console.log('RealTimeTranscriptionService: Already transcribing');
            return;
        }

        try {
            // TODO: Implement IPC-based audio capture for real-time transcription
            // Start audio capture via IPC
            if (this.mainWindow && this.mainWindow.webContents) {
                this.mainWindow.webContents.send('start-recording');
            }
            
            // Start transcription loop
            this.isTranscribing = true;
            this.lastTranscription = '';
            this.silenceCount = 0;
            
            // TODO: Real-time transcription needs IPC refactoring - temporarily disabled
            console.log('RealTimeTranscriptionService: Started (audio processing disabled - needs IPC refactoring)');
            
        } catch (error) {
            console.error('RealTimeTranscriptionService: Failed to start:', error);
            throw error;
        }
    }

    async stopTranscription(): Promise<void> {
        console.log('RealTimeTranscriptionService: Stopping real-time transcription');
        
        if (!this.isTranscribing) {
            return;
        }

        // Clean up intervals and timeouts
        if (this.transcriptionInterval) {
            clearInterval(this.transcriptionInterval);
            this.transcriptionInterval = null;
        }
        
        if (this.speechDetectionTimeout) {
            clearTimeout(this.speechDetectionTimeout);
            this.speechDetectionTimeout = null;
        }

        // Stop audio capture via IPC
        if (this.mainWindow && this.mainWindow.webContents) {
            this.mainWindow.webContents.send('get-audio-data');
        }

        this.isTranscribing = false;
        this.silenceCount = 0;
        
        // Send final transcription if we have one
        if (this.lastTranscription.trim()) {
            this.sendTranscriptionUpdate(this.lastTranscription, true);
        }
        
        console.log('RealTimeTranscriptionService: Stopped successfully');
    }

    // @ts-ignore - temporarily unused during IPC refactoring
    private async processAudioForTranscription(): Promise<void> {
        if (!this.isTranscribing || !this.mainWindow?.webContents) {
            return;
        }

        // TODO: Implement IPC-based audio data retrieval for real-time transcription
        // For now, this is disabled to prevent import errors
        console.log('RealTimeTranscriptionService: Audio processing temporarily disabled - needs IPC refactoring');
        this.handleSilence();
    }

    private handleSilence(): void {
        this.silenceCount++;
        
        // Send silence update to UI
        this.sendTranscriptionUpdate('', false);
        
        // Auto-stop after prolonged silence
        if (this.silenceCount >= this.MAX_SILENCE_COUNT) {
            console.log('RealTimeTranscriptionService: Auto-stopping due to silence');
            this.stopTranscription();
        }
    }

    // @ts-ignore - temporarily unused during IPC refactoring
    private hasSignificantChange(newText: string, oldText: string): boolean {
        // Consider it significant if:
        // 1. Length difference is substantial (more than 10 characters)
        // 2. Or if it's completely different content
        const lengthDiff = Math.abs(newText.length - oldText.length);
        const similarity = this.calculateSimilarity(newText.toLowerCase(), oldText.toLowerCase());
        
        return lengthDiff > 10 || similarity < 0.7;
    }

    private calculateSimilarity(str1: string, str2: string): number {
        if (str1 === str2) return 1.0;
        if (str1.length === 0 || str2.length === 0) return 0;
        
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
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

    // @ts-ignore - temporarily unused during IPC refactoring
    private calculateAudioLevel(audioData: Int16Array): number {
        if (!audioData || audioData.length === 0) {
            return 0;
        }

        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
            const normalized = audioData[i] / 32768;
            sum += normalized * normalized;
        }

        const rms = Math.sqrt(sum / audioData.length);
        return Math.min(rms, 1.0);
    }

    private sendTranscriptionUpdate(text: string, isFinal: boolean): void {
        if (this.mainWindow && this.mainWindow.webContents && !this.mainWindow.webContents.isDestroyed()) {
            this.mainWindow.webContents.send('real-time-transcription', {
                text: text,
                isFinal: isFinal
            });
        }
    }

    isCurrentlyTranscribing(): boolean {
        return this.isTranscribing;
    }
}

export default RealTimeTranscriptionService;