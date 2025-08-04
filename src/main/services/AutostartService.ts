import { app } from 'electron';
import AutoLaunch from 'auto-launch';
import { PlatformDetector } from '../utils/PlatformDetector';

class AutostartService {
    private autoLauncher: AutoLaunch;
    private isInitialized: boolean = false;

    constructor() {
        this.autoLauncher = new AutoLaunch({
            name: 'Cindy',
            isHidden: true,
            path: app.getPath('exe'),
        });
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            // Check if autostart is supported on this platform
            if (!PlatformDetector.supportsAutostart()) {
                console.log('Autostart is not supported on this platform');
                return;
            }

            this.isInitialized = true;
            console.log('Autostart service initialized');
        } catch (error) {
            console.error('Failed to initialize autostart service:', error);
            throw error;
        }
    }

    async isEnabled(): Promise<boolean> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            return await this.autoLauncher.isEnabled();
        } catch (error) {
            console.error('Failed to check autostart status:', error);
            return false;
        }
    }

    async enable(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            await this.autoLauncher.enable();
            console.log('Autostart enabled');
        } catch (error) {
            console.error('Failed to enable autostart:', error);
            throw error;
        }
    }

    async disable(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            await this.autoLauncher.disable();
            console.log('Autostart disabled');
        } catch (error) {
            console.error('Failed to disable autostart:', error);
            throw error;
        }
    }

    async toggle(): Promise<boolean> {
        const isEnabled = await this.isEnabled();
        if (isEnabled) {
            await this.disable();
            return false;
        } else {
            await this.enable();
            return true;
        }
    }
}

export { AutostartService };