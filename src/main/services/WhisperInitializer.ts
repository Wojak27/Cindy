import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class WhisperInitializer {
    private static whisperDir: string = path.join(__dirname, '../../../node_modules/whisper-node');
    private static whisperCppDir: string = path.join(WhisperInitializer.whisperDir, 'whisper');

    /**
     * Checks if whisper.cpp is properly initialized
     */
    static async isInitialized(): Promise<boolean> {
        try {
            // Check if whisper directory exists and contains the main executable
            const whisperExecutable = path.join(this.whisperCppDir, 'main');
            const whisperExecutableWin = path.join(this.whisperCppDir, 'main.exe');
            
            const hasExecutable = await fs.promises.access(whisperExecutable).then(() => true).catch(() => false);
            const hasExecutableWin = await fs.promises.access(whisperExecutableWin).then(() => true).catch(() => false);
            
            return hasExecutable || hasExecutableWin;
        } catch (error) {
            console.log('[WhisperInitializer] Error checking initialization:', error);
            return false;
        }
    }

    /**
     * Fix whisper-node configuration for node binary path issues
     */
    static async fixWhisperNodeConfig(): Promise<boolean> {
        try {
            console.log('[WhisperInitializer] Fixing whisper-node configuration...');
            
            // Import shelljs to configure execPath
            const shell = require('shelljs');
            
            // Set the execPath for shelljs to use the current Node.js binary
            shell.config.execPath = process.execPath;
            shell.config.verbose = false;
            
            console.log('[WhisperInitializer] Set shell execPath to:', process.execPath);
            
            // Also try to configure the whisper-node module directly
            try {
                const whisperNodePath = path.join(__dirname, '../../../node_modules/whisper-node');
                const whisperNodeExists = await fs.promises.access(whisperNodePath).then(() => true).catch(() => false);
                
                if (whisperNodeExists) {
                    // Set environment variables that whisper-node might use
                    process.env.NODE_PATH = process.execPath;
                    process.env.NODE_BINARY = process.execPath;
                    process.env.SHELL_EXEC_PATH = process.execPath;
                    
                    console.log('[WhisperInitializer] Set environment variables for whisper-node');
                }
            } catch (configError) {
                console.log('[WhisperInitializer] Could not configure whisper-node directly:', configError);
            }
            
            return true;
        } catch (error) {
            console.error('[WhisperInitializer] Failed to fix whisper-node configuration:', error);
            return false;
        }
    }

    /**
     * Automatically initializes whisper-node by running make command
     */
    static async initialize(): Promise<boolean> {
        try {
            console.log('[WhisperInitializer] Starting automatic whisper-node initialization...');

            // First, fix whisper-node configuration
            await this.fixWhisperNodeConfig();

            // Ensure whisper-node directory exists
            if (!await fs.promises.access(this.whisperDir).then(() => true).catch(() => false)) {
                throw new Error('whisper-node directory not found. Please install whisper-node package.');
            }

            // Check if whisper subdirectory exists
            if (!await fs.promises.access(this.whisperCppDir).then(() => true).catch(() => false)) {
                console.log('[WhisperInitializer] whisper subdirectory not found, attempting to clone...');
                await this.cloneWhisperCpp();
            }

            // Change to whisper directory and run make
            const originalCwd = process.cwd();
            
            try {
                process.chdir(this.whisperCppDir);
                
                console.log('[WhisperInitializer] Running make command in whisper directory...');
                console.log('[WhisperInitializer] Current directory:', process.cwd());
                
                // Set PATH to include common locations for make and other build tools
                // Also set NODE_PATH to ensure node binary is found
                const env = { 
                    ...process.env,
                    PATH: process.env.PATH + ':/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/local/share/npm/bin',
                    NODE_PATH: process.execPath,
                    NODE_BINARY: process.execPath
                };

                // Try different make commands depending on the platform
                let makeResult: any;
                try {
                    makeResult = await execAsync('make', { env, timeout: 120000 }); // 2 minute timeout
                } catch (error: any) {
                    console.log('[WhisperInitializer] Standard make failed, trying with CC=clang...');
                    makeResult = await execAsync('CC=clang make', { env, timeout: 120000 });
                }

                console.log('[WhisperInitializer] Make command output:', makeResult.stdout);
                if (makeResult.stderr) {
                    console.log('[WhisperInitializer] Make command stderr:', makeResult.stderr);
                }

                // Verify the build was successful
                const isNowInitialized = await this.isInitialized();
                if (isNowInitialized) {
                    console.log('[WhisperInitializer] ✅ whisper-node successfully initialized!');
                    return true;
                } else {
                    console.log('[WhisperInitializer] ❌ Make command completed but executable not found');
                    return false;
                }

            } finally {
                // Always restore original working directory
                process.chdir(originalCwd);
            }

        } catch (error: any) {
            console.error('[WhisperInitializer] Failed to initialize whisper-node:', error);
            
            // Provide helpful error messages
            if (error.message.includes('make: command not found')) {
                console.error('[WhisperInitializer] 💡 Solution: Install build tools:');
                console.error('  - macOS: xcode-select --install');
                console.error('  - Linux: sudo apt-get install build-essential');
                console.error('  - Windows: Install Visual Studio Build Tools');
            }

            return false;
        }
    }

    /**
     * Clone whisper.cpp repository if it doesn't exist
     */
    private static async cloneWhisperCpp(): Promise<void> {
        try {
            const parentDir = path.dirname(this.whisperCppDir);
            const originalCwd = process.cwd();
            
            process.chdir(parentDir);
            
            console.log('[WhisperInitializer] Cloning whisper.cpp repository...');
            await execAsync('git clone https://github.com/ggerganov/whisper.cpp.git whisper', { timeout: 60000 });
            
            process.chdir(originalCwd);
            
            console.log('[WhisperInitializer] whisper.cpp cloned successfully');
        } catch (error) {
            console.error('[WhisperInitializer] Failed to clone whisper.cpp:', error);
            throw error;
        }
    }

    /**
     * Get initialization status and helpful information
     */
    static async getStatus(): Promise<{
        initialized: boolean;
        whisperDir: string;
        whisperCppDir: string;
        hasGit: boolean;
        hasMake: boolean;
        suggestions: string[];
    }> {
        const initialized = await this.isInitialized();
        
        // Check for required tools
        const hasGit = await execAsync('git --version').then(() => true).catch(() => false);
        const hasMake = await execAsync('make --version').then(() => true).catch(() => false);
        
        const suggestions: string[] = [];
        
        if (!initialized) {
            suggestions.push('Run automatic initialization');
            
            if (!hasGit) {
                suggestions.push('Install Git');
            }
            
            if (!hasMake) {
                suggestions.push('Install build tools (make, gcc/clang)');
            }
        }

        return {
            initialized,
            whisperDir: this.whisperDir,
            whisperCppDir: this.whisperCppDir,
            hasGit,
            hasMake,
            suggestions
        };
    }
}