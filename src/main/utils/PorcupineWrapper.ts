import { Porcupine } from '@picovoice/porcupine-node';

class PorcupineWrapper {
    private porcupine: Porcupine | null = null;
    private isInitialized: boolean = false;

    async initialize(accessKey: string, keyword: string, sensitivity: number = 0.5): Promise<void> {
        try {
            // Map common phrases to Porcupine built-in keywords
            const keywordMap: { [key: string]: string } = {
                'Hi Cindy!': 'picovoice',  // Use picovoice as fallback
                'Hey Cindy': 'hey google', // If available
                'Cindy': 'alexa',          // If available
                'Computer': 'computer'     // If available
            };
            
            // Use built-in keyword if available, otherwise use picovoice as default
            const porcupineKeyword = keywordMap[keyword] || 'picovoice';
            
            console.log(`PorcupineWrapper: Mapping "${keyword}" to built-in keyword "${porcupineKeyword}"`);
            
            // Initialize with built-in keyword
            this.porcupine = new Porcupine(
                accessKey,
                [porcupineKeyword], // Use built-in keyword names
                [sensitivity] // sensitivities
            );
            this.isInitialized = true;
            console.log(`PorcupineWrapper: Initialized successfully with keyword "${porcupineKeyword}"`);
        } catch (error) {
            console.error('PorcupineWrapper: Failed to initialize Porcupine:', error);
            console.error('PorcupineWrapper: Make sure you have a valid Porcupine access key');
            throw error;
        }
    }

    async process(audioData: Int16Array): Promise<boolean> {
        if (!this.porcupine || !this.isInitialized) {
            return false;
        }

        try {
            const result = await this.porcupine.process(audioData);
            return result !== -1; // -1 means no detection
        } catch (error) {
            console.error('Error processing audio:', error);
            return false;
        }
    }

    async updateKeyword(accessKey: string, newKeyword: string, sensitivity: number): Promise<void> {
        // Clean up existing instance
        if (this.porcupine) {
            this.porcupine.release();
        }

        // Initialize with new keyword
        await this.initialize(accessKey, newKeyword, sensitivity);
    }

    async cleanup(): Promise<void> {
        if (this.porcupine) {
            this.porcupine.release();
            this.porcupine = null;
            this.isInitialized = false;
        }
    }
}

export { PorcupineWrapper };