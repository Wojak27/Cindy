import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join, dirname } from 'path';
import { app } from 'electron';
import { constants } from 'fs';
import os from 'os';

class ConfigManager {
    private configPath: string;

    constructor() {
        // Determine config path based on platform
        const userDataPath = app?.getPath('userData') ||
            join(os.homedir(), '.cindy');
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
            console.log('🔧 DEBUG: ConfigManager.save() - Starting save process at:', new Date().toISOString());
            console.log('🔧 DEBUG: ConfigManager.save() - Config directory:', configDir);
            console.log('🔧 DEBUG: ConfigManager.save() - Config file path:', this.configPath);
            console.log('🔧 DEBUG: ConfigManager.save() - Config object keys:', Object.keys(config));
            console.log('🔧 DEBUG: ConfigManager.save() - Config content size:', JSON.stringify(config, null, 2).length, 'chars');

            // Check if config file already exists
            try {
                await access(this.configPath, constants.F_OK);
                console.log('🔧 DEBUG: ConfigManager.save() - Config file already exists, will overwrite');
            } catch (fileNotFoundError) {
                console.log('🔧 DEBUG: ConfigManager.save() - Config file does not exist, will create new');
            }

            // Ensure directory exists
            console.log('🔧 DEBUG: ConfigManager.save() - Ensuring directory exists:', configDir);
            await mkdir(configDir, { recursive: true });
            console.log('🔧 DEBUG: ConfigManager.save() - Directory ensured successfully');

            // Check if directory is writable
            try {
                console.log('🔧 DEBUG: ConfigManager.save() - Checking directory write permissions...');
                await access(configDir, constants.W_OK);
                console.log('🔧 DEBUG: ConfigManager.save() - Directory is writable');
            } catch (accessError) {
                console.error('🚨 DEBUG: ConfigManager.save() - Directory is not writable:', configDir);
                console.error('🚨 DEBUG: ConfigManager.save() - Access error details:', {
                    name: accessError.name,
                    message: accessError.message,
                    code: (accessError as any).code
                });
                throw new Error(`Directory not writable: ${configDir}`);
            }

            // Write config file
            console.log('🔧 DEBUG: ConfigManager.save() - Writing config file...');
            const configContent = JSON.stringify(config, null, 2);
            await writeFile(this.configPath, configContent, 'utf8');
            console.log('🔧 DEBUG: ConfigManager.save() - Config file written successfully');

            // Verify the file was written correctly
            try {
                console.log('🔧 DEBUG: ConfigManager.save() - Verifying file write...');
                const writtenContent = await readFile(this.configPath, 'utf8');
                console.log('🔧 DEBUG: ConfigManager.save() - Verification: written file size:', writtenContent.length, 'chars');
                const parsedVerification = JSON.parse(writtenContent);
                console.log('🔧 DEBUG: ConfigManager.save() - Verification: parsed successfully, keys:', Object.keys(parsedVerification));
            } catch (verificationError) {
                console.error('🚨 DEBUG: ConfigManager.save() - File write verification failed:', verificationError);
            }

        } catch (error: any) {
            console.error('🚨 DEBUG: ConfigManager.save() - Failed to save config:', error);
            console.error('🚨 DEBUG: ConfigManager.save() - Error details:', {
                name: error.name,
                message: error.message,
                code: error.code,
                stack: error.stack
            });

            if (error.code === 'EACCES') {
                console.error('🚨 DEBUG: ConfigManager.save() - PERMISSION DENIED when writing to:', this.configPath);
            } else if (error.code === 'ENOENT') {
                console.error('🚨 DEBUG: ConfigManager.save() - DIRECTORY NOT FOUND:', dirname(this.configPath));
            } else if (error.code === 'ENOSPC') {
                console.error('🚨 DEBUG: ConfigManager.save() - NO SPACE LEFT on device');
            } else if (error.message?.includes('writable')) {
                console.error('🚨 DEBUG: ConfigManager.save() - INSUFFICIENT PERMISSIONS to write to directory:', dirname(this.configPath));
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