import { app, BrowserWindow, Menu, nativeImage, NativeImage, ipcMain } from 'electron';
import * as path from 'path';
import { CindyMenu } from './menu';
import { SettingsService, Settings } from './services/SettingsService';
import { TrayService } from './services/TrayService';
import axios from 'axios';
import { ChatStorageService } from './services/ChatStorageService';
import { LLMRouterService } from './services/LLMRouterService';

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
// eslint-disable-next-line @typescript-eslint/no-unused-vars

const createWindow = async (): Promise<void> => {
    // Ensure settings service is initialized
    if (!settingsService) {
        settingsService = new SettingsService();
        await settingsService.initialize();
    }

    // Create the browser window.
    mainWindow = new BrowserWindow({
        height: 600,
        minWidth: 800,
        maxWidth: 1200,
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
        width: 800,
        show: false, // Start hidden, show only when needed
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
        const basePath = path.join(__dirname, 'assets/icons/');
        if (process.platform === 'win32') {
            return path.join(basePath, 'tray-icon.ico');
        }

        if (process.platform === 'darwin') {
            const iconPath = path.join(basePath, 'tray-icon.png');
            try {
                const icon = nativeImage.createFromPath(iconPath);
                if (icon.isEmpty()) {
                    throw new Error('Loaded image is empty');
                }
                const { width, height } = icon.getSize();
                if (width < 16 || height < 16) {
                    console.warn(`Icon too small (${width}x${height}), using default`);
                    const fallbackIcon = nativeImage.createFromPath(
                        path.join(basePath, 'tray-icon-connected.png')
                    ).resize({ width: 16, height: 16 });
                    fallbackIcon.setTemplateImage(true);
                    return fallbackIcon;
                }
                const resizedIcon = icon.resize({ width: 16, height: 16 });
                resizedIcon.setTemplateImage(true);
                return resizedIcon;
            } catch (error) {
                console.error('Tray icon error:', error);
                const smallIcon = nativeImage.createFromPath(
                    path.join(basePath, 'tray-icon-connected.png')
                ).resize({ width: 16, height: 16 });
                smallIcon.setTemplateImage(true);
                return smallIcon;
            }
        } else {
            // Linux and other platforms
            return path.join(basePath, 'tray-icon.png');
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
    // Add 2-second timeout at startup
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Initialize settings service first
    if (!settingsService) {
        settingsService = new SettingsService();
        await settingsService.initialize();
    }

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

    // Set up IPC handlers for settings service methods immediately after initialization
    // This allows the renderer process to access the settings service through IPC
    // Remove any existing handler first to prevent duplicate registration
    try {
        ipcMain.removeHandler('get-settings-service');
    } catch (error) {
        // Ignore error if handler doesn't exist
        console.debug('No existing handler for get-settings-service to remove');
    }
    ipcMain.handle('get-settings-service', () => {
        console.log('Settings service requested by renderer');
        return true; // Indicate service is available
    });

    // IPC handler for granting storage permission
    // Remove any existing handler first to prevent duplicate registration
    try {
        ipcMain.removeHandler('grant-storage-permission');
    } catch (error) {
        // Ignore error if handler doesn't exist
        console.debug('No existing handler for grant-storage-permission to remove');
    }
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

    // IPC handler for checking storage permission
    // Remove any existing handler first to prevent duplicate registration
    try {
        ipcMain.removeHandler('has-storage-permission');
    } catch (error) {
        // Ignore error if handler doesn't exist
        console.debug('No existing handler for has-storage-permission to remove');
    }
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

    // IPC handlers for settings service methods
    ipcMain.handle('settings-get', async (event, section: string) => {
        if (!settingsService) {
            throw new Error('SettingsService not initialized');
        }

        // Validate section is a valid settings section
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

        // Validate section is a valid settings section
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

    // IPC handler for starting audio recording
    ipcMain.handle('start-recording', async () => {
        console.log('Main process - start-recording IPC called');
        if (!mainWindow) {
            console.error('Main process - start-recording: mainWindow not available');
            return { success: false, error: 'Main window not available' };
        }
        try {
            console.log('Main process - start-recording: sending start-recording to renderer');
            await mainWindow.webContents.send('start-recording');
            console.log('Main process - start-recording: successfully sent to renderer');
            return { success: true };
        } catch (error) {
            console.error('Main process - start-recording: error sending to renderer:', error);
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
        try {
            console.log('Main process - stop-recording: sending get-audio-data to renderer');
            // Send message to renderer to get audio data
            await mainWindow.webContents.send('get-audio-data');

            // We'll get the audio data back via a response event
            // Return a promise that resolves when we receive the audio data
            return new Promise((resolve) => {
                const listener = (event: Electron.IpcMainEvent, audioData: Int16Array[]) => {
                    console.log('Main process - stop-recording: received audio data from renderer');
                    ipcMain.removeListener('audio-data', listener);
                    resolve(audioData);
                };
                ipcMain.on('audio-data', listener);

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
    ipcMain.handle('transcribe-audio', async (event, audioBuffer: ArrayBuffer) => {
        console.log('Main process - transcribe-audio IPC called');
        try {
            // This would normally send the audio to a speech-to-text service
            // For now, return a mock transcription
            return "Hello, this is a test transcription";
        } catch (error) {
            console.error('Main process - transcribe-audio: error transcribing audio:', error);
            return null;
        }
    });

    // IPC handler for processing messages
    ipcMain.handle('process-message', async (event, message: string, conversationId: string) => {
        console.log('Main process - process-message IPC called with:', message);
        try {
            // This would normally send the message to the LLM agent
            // For now, return a mock response
            return "I heard you say: " + message;
        } catch (error) {
            console.error('Main process - process-message: error processing message:', error);
            return "Sorry, I encountered an error processing your request.";
        }
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
    ipcMain.handle('load-conversation', async (event, conversationId: string) => {
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

    ipcMain.handle('settings-save', async () => {
        if (!settingsService) {
            throw new Error('SettingsService not initialized');
        }
        return await settingsService.save();
    });

    // Create window and tray after setting up IPC handlers
    await createWindow();
    await createTray();

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
