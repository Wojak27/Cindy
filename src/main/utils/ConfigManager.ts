import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { app } from 'electron';

class ConfigManager {
    private configPath: string;

    constructor() {
        // Determine config path based on platform
        const userDataPath = app?.getPath('userData') ||
            join(require('os').homedir(), '.cindy');
        this.configPath = join(userDataPath, 'config.json');
    }

    async load(): Promise<any> {
        try {
            const data = await readFile(this.configPath, 'utf8');
            return JSON.parse(data);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                // File doesn't exist, return null
                return null;
            }
            console.error('Failed to load config:', error);
            throw error;
        }
    }

    async save(config: any): Promise<void> {
        try {
            // Ensure directory exists
            await mkdir(dirname(this.configPath), { recursive: true });

            // Write config file
            await writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf8');
        } catch (error) {
            console.error('Failed to save config:', error);
            throw error;
        }
    }

    async reset(): Promise<void> {
        try {
            await writeFile(this.configPath, '{}', 'utf8');
        } catch (error) {
            console.error('Failed to reset config:', error);
            throw error;
        }
    }

    getConfigPath(): string {
        return this.configPath;
    }
}

export { ConfigManager };