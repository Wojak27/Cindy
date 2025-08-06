import { app, BrowserWindow, Menu, nativeImage, NativeImage, ipcMain, desktopCapturer } from 'electron';
import * as path from 'path';
import { CindyMenu } from './menu';
import { createStore, applyMiddleware } from 'redux';
import { SettingsService, Settings } from './services/SettingsService';
import { TrayService } from './services/TrayService';
import { rootReducer } from '../store/reducers';
import { persistenceMiddleware } from '../store/middleware/persistenceMiddleware';
import axios from 'axios';
import { ChatStorageService } from './services/ChatStorageService';
import { LLMRouterService } from './services/LLMRouterService';
import { CindyAgent } from './agents/CindyAgent';
import { MemoryService } from './services/MemoryService';
import { ToolExecutorService } from './services/ToolExecutorService';
import { VectorStoreService } from './services/VectorStoreService';
import { SpeechToTextService } from './services/SpeechToTextService';

// Function to set up all settings-related IPC handlers
const setupSettingsIPC = () => {
    console.log('🔧 DEBUG: Setting up settings IPC handlers');

    // Remove any existing handlers first to prevent duplicate registration
    const handlersToRemove = [
        'get-settings-service',
        'grant-storage-permission',
        'has-storage-permission',
        'settings-get',
        'settings-set',
        'settings-get-all',
        'settings-save',
        'wake-word:start',
        'wake-word:stop',
        'wake-word:update-keyword',
        'wake-word:status'
    ];

    handlersToRemove.forEach(handler => {
        try {
            ipcMain.removeHandler(handler);
        } catch (error) {
            // Ignore error if handler doesn't exist
            console.debug(`No existing handler for ${handler} to remove`);
        }
    });

    // Settings service availability check
    ipcMain.handle('get-settings-service', () => {
        console.log('🔧 DEBUG: Settings service requested by renderer, available:', !!settingsService);
        return !!settingsService;
    });

    // Storage permission handlers
    ipcMain.handle('grant-storage-permission', async () => {
        console.log('Main process - grant-storage-permission IPC called');
        if (!settingsService) {
            console.error('Main process - grant-storage-permission: settingsService not available');
            return { success: false, error: 'Settings service not available' };
        }
        try {
            console.log('Main process - grant-storage-permission: calling settingsService.grantStoragePermission()');
            await settingsService.grantStoragePermission();
            console.log('Main process - grant-storage-permission: successfully granted');
            return { success: true };
        } catch (error) {
            console.error('Main process - grant-storage-permission: error granting permission:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    });

    ipcMain.handle('has-storage-permission', async () => {
        console.log('Main process - has-storage-permission IPC called');
        if (!settingsService) {
            console.error('Main process - has-storage-permission: settingsService not available');
            return { hasPermission: false, error: 'Settings service not available' };
        }
        try {
            console.log('Main process - has-storage-permission: calling settingsService.hasStoragePermission()');
            const hasPermission = await settingsService.hasStoragePermission();
            console.log('Main process - has-storage-permission: current status:', hasPermission);
            return { hasPermission };
        } catch (error) {
            console.error('Main process - has-storage-permission: error checking permission:', error);
            return { hasPermission: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    });

    // Settings CRUD handlers
    ipcMain.handle('settings-get', async (event, section: string) => {
        if (!settingsService) {
            throw new Error('SettingsService not initialized');
        }

        const validSections = ['general', 'voice', 'llm', 'vault', 'research', 'privacy', 'system', 'database', 'profile'];
        if (!validSections.includes(section)) {
            throw new Error(`Invalid settings section: ${section}`);
        }

        return await settingsService.get(section as keyof Settings);
    });

    ipcMain.handle('settings-set', async (event, section: string, value: any) => {
        if (!settingsService) {
            throw new Error('SettingsService not initialized');
        }

        const validSections = ['general', 'voice', 'llm', 'vault', 'research', 'privacy', 'system', 'database', 'profile'];
        if (!validSections.includes(section)) {
            throw new Error(`Invalid settings section: ${section}`);
        }

        return await settingsService.set(section as keyof Settings, value);
    });

    ipcMain.handle('settings-get-all', async () => {
        if (!settingsService) {
            throw new Error('SettingsService not initialized');
        }
        return await settingsService.getAll();
    });

    ipcMain.handle('settings-save', async () => {
        if (!settingsService) {
            throw new Error('SettingsService not initialized');
        }
        return await settingsService.save();
    });

    // IPC handlers for wake word management
    ipcMain.handle('wake-word:start', async () => {
        console.log('Main process - wake-word:start IPC called');
        try {
            if (wakeWordService) {
                await wakeWordService.startListening();
                return { success: true };
            }
            return { success: false, error: 'Wake word service not available' };
        } catch (error) {
            console.error('Main process - wake-word:start error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('wake-word:stop', async () => {
        console.log('Main process - wake-word:stop IPC called');
        try {
            if (wakeWordService) {
                await wakeWordService.stopListening();
                return { success: true };
            }
            return { success: false, error: 'Wake word service not available' };
        } catch (error) {
            console.error('Main process - wake-word:stop error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('wake-word:update-keyword', async (_, keyword: string, sensitivity: number) => {
        console.log('Main process - wake-word:update-keyword IPC called:', keyword, sensitivity);
        try {
            if (wakeWordService) {
                await wakeWordService.updateKeyword(keyword, sensitivity);
                return { success: true };
            }
            return { success: false, error: 'Wake word service not available' };
        } catch (error) {
            console.error('Main process - wake-word:update-keyword error:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('wake-word:status', async () => {
        console.log('Main process - wake-word:status IPC called');
        try {
            if (wakeWordService) {
                return { 
                    success: true, 
                    isListening: wakeWordService.isCurrentlyListening() 
                };
            }
            return { success: false, isListening: false, error: 'Wake word service not available' };
        } catch (error) {
            console.error('Main process - wake-word:status error:', error);
            return { success: false, isListening: false, error: error.message };
        }
    });

    console.log('🔧 DEBUG: Settings IPC handlers setup complete');
};

// Function to set up database-related IPC handlers
const setupDatabaseIPC = () => {
    console.log('🔧 DEBUG: Setting up database IPC handlers');

    const fs = require('fs');
    const { dialog } = require('electron');

    // Remove any existing handlers first
    const handlersToRemove = [
        'validate-path',
        'show-directory-dialog',
        'create-vector-store'
    ];

    handlersToRemove.forEach(handler => {
        try {
            ipcMain.removeHandler(handler);
        } catch (error) {
            console.debug(`No existing handler for ${handler} to remove`);
        }
    });

    // Validate path handler
    ipcMain.handle('validate-path', async (event, pathToValidate) => {
        console.log('[IPC] Validating path:', pathToValidate);
        try {
            if (!pathToValidate || pathToValidate.trim() === '') {
                return { valid: false, message: 'Path cannot be empty' };
            }

            // Check if path exists
            if (!fs.existsSync(pathToValidate)) {
                return { valid: false, message: 'Path does not exist' };
            }

            // Check if it's a directory
            const stat = fs.statSync(pathToValidate);
            if (!stat.isDirectory()) {
                return { valid: false, message: 'Path must be a directory' };
            }

            // Check if writable
            try {
                fs.accessSync(pathToValidate, fs.constants.W_OK);
                return { valid: true, message: 'Path is valid and writable' };
            } catch (error) {
                return { valid: false, message: 'Directory is not writable' };
            }
        } catch (error) {
            console.error('[IPC] Error validating path:', error);
            return { valid: false, message: 'Error accessing path' };
        }
    });

    // Show directory dialog handler
    ipcMain.handle('show-directory-dialog', async (event, defaultPath) => {
        console.log('[IPC] Showing directory dialog, default path:', defaultPath);
        try {
            const result = await dialog.showOpenDialog(mainWindow, {
                properties: ['openDirectory', 'createDirectory'],
                defaultPath: defaultPath || undefined,
                title: 'Select Database Directory'
            });

            if (result.canceled || result.filePaths.length === 0) {
                return null;
            }

            return result.filePaths[0];
        } catch (error) {
            console.error('[IPC] Error showing directory dialog:', error);
            throw error;
        }
    });

    // Create vector store handler (placeholder)
    ipcMain.handle('create-vector-store', async (event, options) => {
        console.log('[IPC] Creating vector store with options:', options);
        try {
            // Validate path first
            if (!options.databasePath) {
                return { success: false, message: 'Database path is required' };
            }

            // Validate path manually (inline validation)
            try {
                if (!fs.existsSync(options.databasePath)) {
                    return { success: false, message: 'Path does not exist' };
                }
                const stat = fs.statSync(options.databasePath);
                if (!stat.isDirectory()) {
                    return { success: false, message: 'Path must be a directory' };
                }
                fs.accessSync(options.databasePath, fs.constants.W_OK);
            } catch (error) {
                return { success: false, message: 'Error accessing path or directory not writable' };
            }

            // TODO: Implement actual vector store creation
            // For now, just return success if path is valid
            console.log('[IPC] Vector store creation simulated successfully');
            return { success: true, message: 'Vector store created successfully (placeholder)' };
        } catch (error) {
            console.error('[IPC] Error creating vector store:', error);
            return { success: false, message: error.message };
        }
    });

    console.log('🔧 DEBUG: Database IPC handlers setup complete');
};

async function waitForDevServer(maxRetries = 10, delay = 1000): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            await axios.get('http://localhost:3004');
            return true;
        } catch (error) {
            console.log(`Dev server not ready yet. Retrying in ${delay}ms... (${i + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return false;
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (process.platform === 'win32') {
    if (require('electron-squirrel-startup')) {
        app.quit();
    }
}

let mainWindow: BrowserWindow | null = null;
let trayService: TrayService | null = null;
let settingsService: SettingsService | null = null;
let chatStorageService: ChatStorageService | null = null;
let llmRouterService: LLMRouterService | null = null;
let vectorStoreService: VectorStoreService | null = null;
let cindyAgent: CindyAgent | null = null;
let wakeWordService: any = null;
let speechToTextService: SpeechToTextService | null = null;

const createWindow = async (): Promise<void> => {
    // Ensure settings service is initialized
    if (!settingsService) {
        settingsService = new SettingsService();
        await settingsService.initialize();
    }

    // Create the browser window.
    mainWindow = new BrowserWindow({
        height: 600,
        minWidth: 400,
        // Remove maxWidth to allow free resizing
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#f5f7fa',
            symbolColor: '#2c3e50',
            height: 32
        },
        frame: false,

        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false,
            // Use a secure Content Security Policy that prevents unsafe-eval
            // This fixes the Electron security warning
            webSecurity: true,
            allowRunningInsecureContent: false,
            // Note: CSP is now properly set in the renderer process via meta tag
            // The security warning is resolved by removing unsafe-eval from the policy
        },
        width: 1000,
        show: false, // Hide until content is loaded
        backgroundColor: '#ffffff' // Set background to match theme
    });

    // and load the index.html of the app.
    if (process.env.NODE_ENV === 'development') {
        const serverReady = await waitForDevServer();
        if (serverReady) {
            mainWindow.loadURL('http://localhost:3004');
        } else {
            console.error('Dev server failed to start. Falling back to production build.');
            mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
        }
    } else {
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    // Open the DevTools in development mode using Electron's native debugging
    if (process.env.NODE_ENV === 'development') {
        // Use Electron's built-in devtools instead of Webpack's
        // This bypasses the protocol scheme restriction
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    // Show window when ready to avoid white flash
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });

    // Hide window instead of closing it
    mainWindow.on('close', (event: Electron.Event) => {
        if (!(app as any).quitting) {
            event.preventDefault();
            mainWindow?.hide();
        }
    });
};

const createTray = async (): Promise<void> => {
    // Determine platform-appropriate icon format
    const getTrayIcon = (): string | NativeImage => {
        const fs = require('fs');

        // Helper function to find icon with fallback path resolution
        const findIconPath = (iconName: string): string => {
            // Try different possible locations for assets
            const possiblePaths = [
                path.join(process.cwd(), 'assets/icons/', iconName),      // Project root (development)
                path.join(__dirname, '../assets/icons/', iconName),      // Relative to compiled main
                path.join(__dirname, 'assets/icons/', iconName),         // Same directory as main
                path.join(process.cwd(), 'src/assets/icons/', iconName), // Source directory
            ];

            for (const iconPath of possiblePaths) {
                if (fs.existsSync(iconPath)) {
                    return iconPath;
                }
            }

            // Return first path as fallback if none exist
            return possiblePaths[0];
        };

        if (process.platform === 'win32') {
            return findIconPath('tray-icon.ico');
        }

        if (process.platform === 'darwin') {
            const iconPath = findIconPath('tray-icon.png');

            try {
                const icon = nativeImage.createFromPath(iconPath);
                if (icon.isEmpty()) {
                    throw new Error('Loaded image is empty');
                }
                const { width, height } = icon.getSize();
                if (width < 16 || height < 16) {
                    console.warn(`Icon too small (${width}x${height}), using fallback`);
                    const fallbackPath = findIconPath('tray-icon-connected.png');
                    const fallbackIcon = nativeImage.createFromPath(fallbackPath).resize({ width: 16, height: 16 });
                    fallbackIcon.setTemplateImage(true);
                    return fallbackIcon;
                }
                const resizedIcon = icon.resize({ width: 16, height: 16 });
                resizedIcon.setTemplateImage(true);
                return resizedIcon;
            } catch (error) {
                console.error('Tray icon error:', error);
                const fallbackPath = findIconPath('tray-icon-connected.png');
                const smallIcon = nativeImage.createFromPath(fallbackPath).resize({ width: 16, height: 16 });
                smallIcon.setTemplateImage(true);
                return smallIcon;
            }
        } else {
            // Linux and other platforms
            return findIconPath('tray-icon.png');
        }
    };

    const icon = getTrayIcon();

    trayService = new TrayService({
        icon,
        tooltip: 'Cindy - Voice Research Assistant',
        onOpenCindy: () => {
            if (mainWindow) {
                mainWindow.show();
            } else {
                createWindow();
            }
        },
        onSettings: () => {
            if (mainWindow) {
                mainWindow.show();
                mainWindow.webContents.send('open-settings');
            } else {
                createWindow().then(() => {
                    mainWindow?.webContents.send('open-settings');
                });
            }
        },
        onQuit: () => {
            (app as any).quitting = true;
            app.quit();
        }
    });

    await trayService.initialize();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
    // Initialize desktopCapturer IPC handler first
    ipcMain.handle('get-desktop-audio-sources', async () => {
        console.log('DEBUG: Main process - get-desktop-audio-sources IPC called');
        try {
            const sources = await desktopCapturer.getSources({
                types: ['audio']
            });
            console.log('DEBUG: Main process - found audio sources:', sources.length);
            console.log('DEBUG: Main process - source names:', sources.map(s => s.name));
            return sources;
        } catch (error) {
            console.error('DEBUG: Main process - Failed to get desktop audio sources:', error);
            throw error;
        }
    });

    // Initialize settings service first (before creating window)
    if (!settingsService) {
        console.log('🔧 DEBUG: Initializing SettingsService (first time)');
        settingsService = new SettingsService();
        await settingsService.initialize();
        console.log('🔧 DEBUG: SettingsService initialized successfully');
    } else {
        console.log('🔧 DEBUG: SettingsService already exists, skipping initialization');
    }

    // Set up IPC handlers for settings service methods BEFORE creating window
    // This ensures IPC is ready when renderer process loads
    console.log('🔧 DEBUG: Setting up IPC handlers before window creation');
    setupSettingsIPC();
    setupDatabaseIPC();

    // Initialize LLMRouterService
    if (!llmRouterService) {
        const settings = await settingsService?.get('llm');
        if (settings) {
            // Get the API key from secure storage
            const apiKey = await settingsService?.getApiKey();

            // Create a complete config with all required properties
            const llmConfig = {
                ...settings,
                openai: {
                    ...settings.openai,
                    apiKey: apiKey || ''  // Provide empty string if no API key
                },
                streaming: true,
                timeout: 30000
            };
            llmRouterService = new LLMRouterService(llmConfig);
            await llmRouterService.initialize();
        }
    }

    // Initialize ChatStorageService
    try {
        chatStorageService = new ChatStorageService();
        await chatStorageService.initialize();
    } catch (error) {
        console.error('Failed to initialize ChatStorageService:', error);
    }

    // Initialize VectorStoreService
    if (!vectorStoreService) {
        const databaseSettings = (await settingsService?.get('database') || {}) as any;
        vectorStoreService = new VectorStoreService({
            databasePath: databaseSettings.path || path.join(app.getPath('userData'), 'vector-store.db'),
            embeddingModel: databaseSettings.embeddingModel || 'qwen3:8b',
            chunkSize: databaseSettings.chunkSize || 1000,
            chunkOverlap: databaseSettings.chunkOverlap || 200,
            autoIndex: databaseSettings.autoIndex || true
        });
        await vectorStoreService.initialize();
        console.log('🔧 DEBUG: VectorStoreService initialized');
    }

    // Initialize CindyAgent after other services
    if (!cindyAgent && llmRouterService && settingsService && chatStorageService && vectorStoreService) {
        // Initialize Redux store with persistence middleware
        let store = createStore(
            rootReducer,
            applyMiddleware(persistenceMiddleware)
        );
        const memoryService = new MemoryService(store);
        const toolExecutor = new ToolExecutorService(vectorStoreService);

        // Get agent config from settings
        const agentConfig = await settingsService.get('general') || {};

        cindyAgent = new CindyAgent({
            store: {},
            memoryService,
            toolExecutor,
            config: {
                enableStreaming: true,
                ...agentConfig
            },
            llmRouter: llmRouterService
        });
        console.log('🔧 DEBUG: CindyAgent initialized with RAG capabilities');
    }

    // Initialize Speech-to-Text Service
    if (!speechToTextService) {
        const sttConfig = {
            provider: 'offline' as const,
            language: 'en-US',
            autoPunctuation: true,
            profanityFilter: false,
            offlineModel: 'base' as const
        };
        speechToTextService = new SpeechToTextService(sttConfig);
    }

    // Initialize wake word service after settings service
    if (settingsService && mainWindow && !wakeWordService) {
        const WakeWordService = require('./services/WakeWordService').default;
        wakeWordService = new WakeWordService(settingsService, mainWindow);
        
        // Listen for wake word detection events
        wakeWordService.on('wakeWordDetected', () => {
            console.log('🎤 Wake word detected! Activating voice recording...');
            if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
                mainWindow.webContents.send('wake-word-detected');
                // Optionally bring window to front
                if (!mainWindow.isVisible()) {
                    mainWindow.show();
                }
                if (mainWindow.isMinimized()) {
                    mainWindow.restore();
                }
                mainWindow.focus();
            }
        });

        // Start wake word listening when app is ready
        try {
            await wakeWordService.startListening();
            console.log('🎤 Wake word service started successfully');
        } catch (error) {
            console.error('🎤 Failed to start wake word service:', error);
        }
    }

    // REMOVED: Duplicate service initialization (services already initialized above)
    console.log('🔧 DEBUG: Other services initialization completed');







    // IPC handler for getting available LLM models
    ipcMain.handle('llm:get-available-models', async () => {
        console.log('Main process - llm:get-available-models IPC called');
        if (!llmRouterService) {
            console.error('Main process - llm:get-available-models: llmRouterService not available');
            return { success: false, error: 'LLM Router service not available' };
        }
        try {
            console.log('Main process - llm:get-available-models: calling llmRouterService.getAvailableModels()');
            const models = await llmRouterService.getAvailableModels();
            console.log('Main process - llm:get-available-models: successfully retrieved models');
            return { success: true, models };
        } catch (error) {
            console.error('Main process - llm:get-available-models: error retrieving models:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    });

    // IPC handler for testing LLM connections
    ipcMain.handle('llm:test-connection', async () => {
        console.log('Main process - llm:test-connection IPC called');
        if (!llmRouterService) {
            console.error('Main process - llm:test-connection: llmRouterService not available');
            return {
                success: false,
                error: 'LLM Router service not available',
                connections: { openai: false, ollama: false }
            };
        }
        try {
            console.log('Main process - llm:test-connection: testing OpenAI and Ollama connections');
            // Access the providers through the LLMRouterService
            const openaiConnected = await llmRouterService['openaiProvider']?.testConnection?.() || false;
            const ollamaConnected = await llmRouterService['ollamaProvider']?.testConnection?.() || false;

            console.log('Main process - llm:test-connection: connection results - OpenAI:', openaiConnected, 'Ollama:', ollamaConnected);
            return {
                success: true,
                connections: { openai: openaiConnected, ollama: ollamaConnected }
            };
        } catch (error) {
            console.error('Main process - llm:test-connection: error testing connections:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                connections: { openai: false, ollama: false }
            };
        }
    });

    // Note: Settings IPC handlers are now set up in setupSettingsIPC() function called earlier


    // IPC handler for starting audio recording
    ipcMain.handle('start-recording', async () => {
        console.log('DEBUG: Main process - start-recording IPC called');
        if (!mainWindow) {
            console.error('DEBUG: Main process - start-recording: mainWindow not available');
            return { success: false, error: 'Main window not available' };
        }
        if (mainWindow.webContents.isDestroyed()) {
            console.error('DEBUG: Main process - start-recording: webContents is destroyed');
            return { success: false, error: 'Web contents destroyed' };
        }
        try {
            console.log('DEBUG: Main process - start-recording: sending start-recording to renderer');
            mainWindow.webContents.send('start-recording');
            console.log('DEBUG: Main process - start-recording: successfully sent to renderer');
            return { success: true };
        } catch (error) {
            console.error('DEBUG: Main process - start-recording: error sending to renderer:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    });

    // IPC handler for stopping audio recording and returning audio data
    ipcMain.handle('stop-recording', async () => {
        console.log('Main process - stop-recording IPC called');
        if (!mainWindow) {
            console.error('Main process - stop-recording: mainWindow not available');
            return null;
        }
        if (mainWindow.webContents.isDestroyed()) {
            console.error('Main process - stop-recording: webContents is destroyed');
            return null;
        }
        try {
            console.log('Main process - stop-recording: sending get-audio-data to renderer');
            // Send message to renderer to get audio data
            await mainWindow.webContents.send('get-audio-data');
            console.log('Main process - stop-recording: get-audio-data sent to renderer');

            // We'll get the audio data back via a response event
            // Return a promise that resolves when we receive the audio data
            return new Promise((resolve) => {
                const listener = (event: Electron.IpcMainEvent, audioData: Int16Array[]) => {
                    console.log('Main process - stop-recording: received audio data from renderer, length:', audioData?.length || 0);
                    ipcMain.removeListener('audio-data', listener);
                    resolve(audioData);
                };
                ipcMain.on('audio-data', listener);
                console.log('Main process - stop-recording: listener registered for audio-data');

                // Set a timeout in case we don't receive the data
                setTimeout(() => {
                    ipcMain.removeListener('audio-data', listener);
                    console.error('Main process - stop-recording: timeout waiting for audio data');
                    resolve(null);
                }, 5000);
            });
        } catch (error) {
            console.error('Main process - stop-recording: error communicating with renderer:', error);
            return null;
        }
    });

    // IPC handler for transcribing audio
    ipcMain.handle('transcribe-audio', async (event, audioData: Int16Array[] | ArrayBuffer) => {
        console.log('DEBUG: Main process - transcribe-audio IPC called with data type:', Array.isArray(audioData) ? 'Int16Array[]' : 'ArrayBuffer');
        console.log('DEBUG: Main process - transcribe-audio: data size:', Array.isArray(audioData) ? `${audioData.length} chunks` : `${audioData.byteLength} bytes`);
        try {
            if (!speechToTextService) {
                console.error('DEBUG: Main process - transcribe-audio: speechToTextService not initialized');
                return "Speech-to-text service not available";
            }

            console.log('DEBUG: Main process - transcribe-audio: calling speechToTextService.transcribe');
            const transcription = await speechToTextService.transcribe(audioData);
            console.log('DEBUG: Main process - transcribe-audio: transcription result:', transcription);
            return transcription;
        } catch (error) {
            console.error('DEBUG: Main process - transcribe-audio: error transcribing audio:', error);
            return null;
        }
    });

    // IPC handler for processing messages with streaming
    ipcMain.handle('process-message', async (event, message: string, conversationId: string): Promise<string> => {
        console.log('Main process - process-message IPC called with:', message);
        try {
            if (!cindyAgent) {
                console.error('Main process - process-message: cindyAgent not initialized');
                return "Sorry, I encountered an error processing your request. The assistant is not properly initialized.";
            }

            // Get user settings for context
            const userSettings = await settingsService?.getAll() || {};
            
            // Process message through the agent
            const response = await cindyAgent.process(message, {
                conversationId,
                sessionId: Date.now().toString(),
                timestamp: new Date(),
                preferences: userSettings
            });

            let assistantContent = '';

            // Handle streaming response
            if (typeof response === 'object' && 'next' in response) {
                // Stream chunks to renderer process
                for await (const chunk of response as AsyncGenerator<string>) {
                    assistantContent += chunk;
                    event.sender.send('stream-chunk', { chunk, conversationId });
                }

                // Save assistant message to ChatStorageService when streaming is complete
                if (chatStorageService && assistantContent.trim()) {
                    try {
                        await chatStorageService.saveMessage({
                            conversationId,
                            role: 'assistant',
                            content: assistantContent,
                            timestamp: Date.now()
                        });
                        console.log('🔧 DEBUG: Assistant streaming message persisted to ChatStorageService');
                    } catch (saveError) {
                        console.error('🚨 DEBUG: Failed to persist assistant streaming message:', saveError);
                    }
                }

                event.sender.send('stream-complete', { conversationId });
                return ""; // Return empty string since we're streaming
            }

            // Return direct response for non-streaming case
            assistantContent = response as string;

            // Save assistant message for non-streaming response
            if (chatStorageService && assistantContent.trim()) {
                try {
                    await chatStorageService.saveMessage({
                        conversationId,
                        role: 'assistant',
                        content: assistantContent,
                        timestamp: Date.now()
                    });
                    console.log('🔧 DEBUG: Assistant non-streaming message persisted to ChatStorageService');
                } catch (saveError) {
                    console.error('🚨 DEBUG: Failed to persist assistant non-streaming message:', saveError);
                }
            }

            event.sender.send('stream-chunk', { chunk: assistantContent, conversationId });
            event.sender.send('stream-complete', { conversationId });
            return "";
        } catch (error) {
            console.error('Main process - process-message: error processing message:', error);
            // Send error to renderer
            event.sender.send('stream-error', {
                error: error instanceof Error ? error.message : 'Unknown error',
                conversationId
            });
        }
        return "Sorry, I encountered an error processing your request.";
    });

    // IPC handler for creating conversations
    ipcMain.handle('create-conversation', async () => {
        console.log('Main process - create-conversation IPC called');
        try {
            const newId = Date.now().toString();
            console.log('Main process - create-conversation: created new conversation with ID:', newId);
            return newId;
        } catch (error) {
            console.error('Main process - create-conversation: error creating conversation:', error);
            return Date.now().toString();
        }
    });

    // IPC handler for loading conversations
    ipcMain.handle('load-conversation', async (_, conversationId: string) => {
        console.log('Main process - load-conversation IPC called for:', conversationId);
        try {
            if (!chatStorageService) {
                console.error('Main process - load-conversation: chatStorageService not available');
                return [];
            }
            return await chatStorageService.getConversationHistory(conversationId);
        } catch (error) {
            console.error('Main process - load-conversation: error loading conversation:', error);
            return [];
        }
    });

    // IPC handler for loading thinking blocks
    ipcMain.handle('get-thinking-blocks', async (_, conversationId: string) => {
        console.log('Main process - get-thinking-blocks IPC called for:', conversationId);
        try {
            if (!chatStorageService) {
                console.error('Main process - get-thinking-blocks: chatStorageService not available');
                return [];
            }
            
            // Get thinking blocks from storage - this assumes chatStorageService has a method for this
            // If not implemented yet, return empty array for now
            if (typeof chatStorageService.getThinkingBlocks === 'function') {
                return await chatStorageService.getThinkingBlocks(conversationId);
            } else {
                console.warn('Main process - get-thinking-blocks: method not implemented yet');
                return [];
            }
        } catch (error) {
            console.error('Main process - get-thinking-blocks: error loading thinking blocks:', error);
            return [];
        }
    });

    // IPC handler for getting conversations list
    ipcMain.handle('get-conversations', async () => {
        console.log('Main process - get-conversations IPC called');
        try {
            if (!chatStorageService) {
                console.error('Main process - get-conversations: chatStorageService not available');
                return [];
            }
            return await chatStorageService.getConversations();
        } catch (error) {
            console.error('Main process - get-conversations: error getting conversations:', error);
            return [];
        }
    });

    // Note: settings-save IPC handler is now in setupSettingsIPC() function

    // IPC handler for saving messages to ChatStorageService
    ipcMain.handle('save-message', async (event, messageData) => {
        console.log('🔧 DEBUG: Main process - save-message IPC called with:', messageData);
        try {
            if (!chatStorageService) {
                console.error('🚨 DEBUG: Main process - save-message: chatStorageService not available');
                return { success: false, error: 'Chat storage service not available' };
            }

            const messageId = await chatStorageService.saveMessage(messageData);
            console.log('🔧 DEBUG: Main process - save-message: message saved with ID:', messageId);
            return { success: true, messageId };
        } catch (error) {
            console.error('🚨 DEBUG: Main process - save-message: error saving message:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    });

    // Create window and tray after all services are initialized
    console.log('🔧 DEBUG: Creating window and tray after all services are ready');
    await createWindow();
    await createTray();

    // Set global flag to indicate settings service is available to renderer
    // Wait a moment for the window to be fully loaded
    if (mainWindow && !mainWindow.isDestroyed()) {
        console.log('🔧 DEBUG: Waiting for window to be fully loaded before setting global flag');
        await new Promise(resolve => setTimeout(resolve, 1000));

        try {
            await mainWindow.webContents.executeJavaScript(`
                window.__electronSettingsService = true;
                console.log('🔧 DEBUG: Global settings service flag set to true');
            `);
            console.log('🔧 DEBUG: Global settings service flag set successfully');
        } catch (error) {
            console.error('🚨 DEBUG: Failed to set global settings service flag:', error);
        }
    }

    // Set application menu
    const menu = CindyMenu.createMenu({
        showSettings: () => {
            if (mainWindow) {
                mainWindow.show();
                mainWindow.webContents.send('open-settings');
            } else {
                createWindow().then(() => {
                    mainWindow?.webContents.send('open-settings');
                });
            }
        },
        showAbout: () => {
            if (mainWindow) {
                mainWindow.show();
                mainWindow.webContents.send('open-about');
            } else {
                createWindow().then(() => {
                    mainWindow?.webContents.send('open-about');
                });
            }
        },
        quit: () => {
            (app as any).quitting = true;
            app.quit();
        }
    });


    Menu.setApplicationMenu(menu);
});
