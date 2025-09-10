import { SpeechToTextService } from '../services/SpeechToTextService.ts';

class WhisperWakeWordDetector {
    private sttService: SpeechToTextService;
    private isInitialized: boolean = false;
    private wakeWordPhrases: string[] = [];
    private confidenceThreshold: number = 0.7;

    constructor() {
        // Initialize STT service with optimized config for wake word detection
        const sttConfig = {
            provider: 'offline' as const,
            language: 'en-US',
            autoPunctuation: false,
            profanityFilter: false,
            offlineModel: 'tiny' as const // Use fastest model for real-time detection
        };
        this.sttService = new SpeechToTextService(sttConfig);
    }

    async initialize(wakeWordPhrase: string, sensitivity: number = 0.5): Promise<void> {
        try {
            console.log('WhisperWakeWordDetector: Initializing with phrase:', wakeWordPhrase);

            // Convert sensitivity (0-1) to confidence threshold (higher sensitivity = lower threshold)
            this.confidenceThreshold = Math.max(0.3, 1.0 - sensitivity);

            // Prepare wake word variations for better matching
            this.wakeWordPhrases = this.generateWakeWordVariations(wakeWordPhrase);
            console.log('WhisperWakeWordDetector: Wake word variations:', this.wakeWordPhrases);

            this.isInitialized = true;
            console.log('WhisperWakeWordDetector: Initialized successfully');
        } catch (error) {
            console.error('WhisperWakeWordDetector: Failed to initialize:', error);
            throw error;
        }
    }

    async process(audioData: Int16Array): Promise<boolean> {
        if (!this.isInitialized || !audioData || audioData.length === 0) {
            return false;
        }

        try {
            // Use STT service to transcribe the audio (pass Int16Array directly)
            const transcriptionText = await this.sttService.transcribe([audioData]);

            if (transcriptionText && transcriptionText.trim()) {
                console.log('WhisperWakeWordDetector: Transcribed:', transcriptionText);

                // Check if any wake word phrase matches (assume high confidence for Whisper)
                const detected = this.matchesWakeWord(transcriptionText, 1.0);

                if (detected) {
                    console.log('WhisperWakeWordDetector: Wake word detected!');
                }

                return detected;
            }

            return false;
        } catch (error) {
            // Don't log every transcription error to avoid spam
            if (Math.random() < 0.01) { // Log 1% of errors
                console.warn('WhisperWakeWordDetector: Transcription error (sampled):', error.message);
            }
            return false;
        }
    }

    async updateKeyword(newKeyword: string, sensitivity: number): Promise<void> {
        console.log('WhisperWakeWordDetector: Updating keyword to:', newKeyword);
        await this.initialize(newKeyword, sensitivity);
    }

    async cleanup(): Promise<void> {
        console.log('WhisperWakeWordDetector: Cleaning up');
        this.isInitialized = false;
        this.wakeWordPhrases = [];
    }

    private generateWakeWordVariations(phrase: string): string[] {
        const variations = [phrase.toLowerCase().trim()];

        // Add common variations
        const cleanPhrase = phrase.replace(/[^\w\s]/g, '').toLowerCase().trim();
        if (cleanPhrase !== variations[0]) {
            variations.push(cleanPhrase);
        }

        // Add individual words for partial matching
        const words = cleanPhrase.split(/\s+/);
        if (words.length > 1) {
            // Add each significant word (longer than 2 characters)
            words.forEach(word => {
                if (word.length > 2 && !variations.includes(word)) {
                    variations.push(word);
                }
            });

            // Add last word (often the name)
            const lastName = words[words.length - 1];
            if (lastName.length > 2 && !variations.includes(lastName)) {
                variations.push(lastName);
            }
        }

        return variations;
    }

    private matchesWakeWord(transcription: string, confidence: number): boolean {
        if (confidence < this.confidenceThreshold) {
            return false;
        }

        const transcript = transcription.toLowerCase().trim();

        // Check for exact or partial matches
        return this.wakeWordPhrases.some(phrase => {
            // Exact match
            if (transcript.includes(phrase)) {
                return true;
            }

            // Fuzzy match for single words
            if (phrase.length > 3 && transcript.length > 0) {
                const similarity = this.calculateSimilarity(transcript, phrase);
                return similarity > 0.8; // 80% similarity threshold
            }

            return false;
        });
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

}

export { WhisperWakeWordDetector };