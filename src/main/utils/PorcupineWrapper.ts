import { Porcupine } from '@picovoice/porcupine-node';

class PorcupineWrapper {
    private porcupine: Porcupine | null = null;
    private isInitialized: boolean = false;

    async initialize(accessKey: string, keyword: string, sensitivity: number = 0.5): Promise<void> {
        try {
            // Load custom keyword file or use built-in
            this.porcupine = new Porcupine(
                accessKey,
                [keyword], // keyword paths
                [sensitivity] // sensitivities
            );
            this.isInitialized = true;
        } catch (error) {
            console.error('Failed to initialize Porcupine:', error);
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