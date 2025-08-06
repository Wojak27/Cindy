import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join, dirname } from 'path';
import { app } from 'electron';
import { constants } from 'fs';

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
            console.log('ConfigManager.load() - Attempting to read config from:', this.configPath);

            // Check if file exists first
            try {
                await access(this.configPath, constants.F_OK);
                console.log('ConfigManager.load() - Config file exists');
            } catch (accessError) {
                console.log('ConfigManager.load() - Config file does not exist at:', this.configPath);
                return null;
            }

            const data = await readFile(this.configPath, 'utf8');
            console.log('ConfigManager.load() - Successfully read config file, length:', data.length);

            const parsed = JSON.parse(data);
            console.log('ConfigManager.load() - Successfully parsed config data');
            return parsed;
        } catch (error: any) {
            console.error('ConfigManager.load() - Error loading config:', error);
            if (error.code === 'ENOENT') {
                console.log('ConfigManager.load() - File not found (ENOENT):', this.configPath);
                return null;
            } else if (error.code === 'EACCES') {
                console.error('ConfigManager.load() - Permission denied (EACCES):', this.configPath);
            } else if (error instanceof SyntaxError) {
                console.error('ConfigManager.load() - Invalid JSON syntax in config file:', this.configPath);
            }
            throw error;
        }
    }

    async save(config: any): Promise<void> {
        try {
            const configDir = dirname(this.configPath);
            console.log('ConfigManager.save() - Starting save process');
            console.log('ConfigManager.save() - Config directory:', configDir);
            console.log('ConfigManager.save() - Config file path:', this.configPath);

            // Ensure directory exists
            console.log('ConfigManager.save() - Ensuring directory exists:', configDir);
            await mkdir(configDir, { recursive: true });
            console.log('ConfigManager.save() - Directory ensured successfully');

            // Check if directory is writable
            try {
                await access(configDir, constants.W_OK);
                console.log('ConfigManager.save() - Directory is writable');
            } catch (accessError) {
                console.error('ConfigManager.save() - Directory is not writable:', configDir);
                throw new Error(`Directory not writable: ${configDir}`);
            }

            // Write config file
            console.log('ConfigManager.save() - Writing config file with content length:', JSON.stringify(config, null, 2).length);
            await writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf8');
            console.log('ConfigManager.save() - Config file written successfully');
        } catch (error: any) {
            console.error('ConfigManager.save() - Failed to save config:', error);
            if (error.code === 'EACCES') {
                console.error('ConfigManager.save() - Permission denied when writing to:', this.configPath);
            } else if (error.code === 'ENOENT') {
                console.error('ConfigManager.save() - Directory not found:', dirname(this.configPath));
            } else if (error.message?.includes('writable')) {
                console.error('ConfigManager.save() - Insufficient permissions to write to directory:', dirname(this.configPath));
            }
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