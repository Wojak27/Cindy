import { app, BrowserWindow, Menu, nativeImage, NativeImage, ipcMain } from 'electron';
import * as path from 'path';
import { CindyMenu } from './menu';
import { SettingsService } from './services/SettingsService';
import { TrayService } from './services/TrayService';
import OllamaProvider from './services/OllamaProvider';
import axios from 'axios';
import { LLMRouterService } from './services/LLMRouterService';
import { SpeechToTextService } from './services/SpeechToTextService';
import { AgentService } from './services/AgentService';
import { ChatStorageService } from './services/ChatStorageService';

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
let llmRouterService: LLMRouterService | null = null;
let speechToTextService: SpeechToTextService | null = null;
let agentService: AgentService | null = null;

const createWindow = async (): Promise<void> => {
    // Initialize settings service
    settingsService = new SettingsService();
    await settingsService.initialize();

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
            // Add Content Security Policy to fix Electron security warning
            sandbox: false,
            // Use a secure CSP that prevents unsafe-eval
            additionalArguments: [
                '--csp="default-src \'self\'; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: https:; font-src \'self\' data:; object-src \'none\'; frame-ancestors \'none\';"'
            ]
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
        const basePath = path.join(__dirname, '../../assets/icons/');
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
    await createWindow();
    await createTray();

    // Ensure settings service is fully initialized
    if (settingsService) {
        await settingsService.initialize();
    }

    // Initialize OllamaProvider for connection monitoring
    const config = await settingsService?.getAll();
    const ollamaConfig = {
        model: config?.llm?.ollama?.model || 'qwen3:8b',
        baseUrl: config?.llm?.ollama?.baseUrl || 'http://127.0.0.1:11434',
        temperature: config?.llm?.ollama?.temperature || 0.7
    };
    const ollamaProvider = new OllamaProvider(ollamaConfig);

    // Start connection monitoring
    const startConnectionMonitor = () => {
        setInterval(async () => {
            try {
                const isConnected = await ollamaProvider.testConnection();
                trayService?.updateTrayIcon(isConnected);
                if (!isConnected) {
                    console.warn('Ollama connection lost. Trying to reconnect...');
                }
            } catch (error) {
                console.error('Connection monitor error:', error);
                trayService?.updateTrayIcon(false);
            }
        }, 30000);
    };
    startConnectionMonitor();

    // Initialize LLMRouterService
    const llmConfig = await settingsService?.get('llm');
    if (llmConfig) {
        // Add default values for required LLMConfig properties
        const completeLlmConfig = {
            ...llmConfig,
            streaming: true,
            timeout: 30000,
            // Ensure openai.apiKey is always present (empty string if not set)
            openai: {
                ...llmConfig.openai,
                apiKey: llmConfig.openai.apiKey || ''
            }
        };

        llmRouterService = new LLMRouterService(completeLlmConfig);
        await llmRouterService.initialize();

        // Initialize AgentService
        agentService = new AgentService(
            {
                maxIterations: 10,
                timeout: 30000,
                memorySize: 100,
                enableStreaming: true
            },
            llmRouterService
        );
    } else {
        console.warn('LLM configuration not found. AgentService will be initialized on first message.');
    }

    // Initialize audio services
    // Get STT settings from voice section
    const voiceSettings = await settingsService?.get('voice');
    if (voiceSettings) {
        // Create default STT config based on voice settings
        const sttConfig = {
            provider: voiceSettings.sttProvider,
            language: 'en-US',
            autoPunctuation: true,
            profanityFilter: false,
            offlineModel: 'base' as const,
            whisperBaseUrl: 'http://localhost:5000'
        };

        speechToTextService = new SpeechToTextService(sttConfig);
    }

    // Set up IPC handlers for audio recording
    // Renderer will handle audio capture and send data to main process
    ipcMain.handle('start-recording', async () => {
        if (!speechToTextService) {
            throw new Error('SpeechToTextService not initialized');
        }
        // Just acknowledge the start request - audio capture happens in renderer
        return true;
    });

    ipcMain.handle('stop-recording', async (event) => {
        if (!speechToTextService) {
            throw new Error('SpeechToTextService not initialized');
        }
        // Wait for audio data from renderer
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                console.error('Timeout waiting for audio data from renderer');
                resolve(null);
            }, 5000);

            // Listen for audio data from renderer
            const handler = (event: any, audioData: Int16Array[]) => {
                clearTimeout(timeout);
                resolve(audioData);
            };

            // Listen for audio data from renderer
            const audioDataListener = (event: any, audioData: Int16Array[]) => {
                // Remove listener after receiving data
                ipcMain.removeListener('audio-data', audioDataListener);
                // Forward to the handler
                handler(event, audioData);
            };

            ipcMain.on('audio-data', audioDataListener);

            // Request audio data from renderer
            event.sender.send('get-audio-data');
        });
    });

    ipcMain.handle('transcribe-audio', async (event, audioData: ArrayBuffer) => {
        if (!speechToTextService) {
            throw new Error('SpeechToTextService not initialized');
        }
        return await speechToTextService.transcribe(audioData);
    });

    // Set up IPC handlers for LLM service
    ipcMain.handle('llm:get-available-models', async () => {
        if (!llmRouterService) {
            return {
                openai: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo'],
                ollama: ['qwen3:8b', 'mistral', 'codellama']
            };
        }

        try {
            return await llmRouterService.getAvailableModels();
        } catch (error) {
            console.error('Failed to get available models:', error);
            return {
                openai: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo'],
                ollama: ['qwen3:8b', 'mistral', 'codellama']
            };
        }
    });

    // Set up IPC handler for message processing
    ipcMain.handle('process-message', async (event, message: string) => {
        // Ensure agentService is initialized
        if (!agentService) {
            // Try to initialize agentService if not already done
            const llmConfig = await settingsService?.get('llm');
            if (llmConfig && !agentService) {
                // Add default values for required LLMConfig properties
                const completeLlmConfig = {
                    ...llmConfig,
                    streaming: true,
                    timeout: 30000,
                    // Ensure openai.apiKey is always present (empty string if not set)
                    openai: {
                        ...llmConfig.openai,
                        apiKey: llmConfig.openai.apiKey || ''
                    }
                };

                llmRouterService = new LLMRouterService(completeLlmConfig);
                await llmRouterService.initialize();

                // Initialize AgentService
                agentService = new AgentService(
                    {
                        maxIterations: 10,
                        timeout: 30000,
                        memorySize: 100,
                        enableStreaming: true
                    },
                    llmRouterService
                );
            } else {
                throw new Error('AgentService not initialized and could not initialize');
            }
        }

        try {
            const response = await agentService.execute(message);

            // Handle both string and AsyncGenerator responses
            let responseText: string;

            if (typeof response === 'string') {
                responseText = response;
            } else if (response && typeof response[Symbol.asyncIterator] === 'function') {
                // Handle AsyncGenerator response
                responseText = '';
                for await (const chunk of response) {
                    responseText += chunk;
                }
            } else {
                // Fallback for any other type
                responseText = String(response);
            }

            // Ensure the response is serializable
            return responseText;
        } catch (error) {
            console.error('Error processing message:', error);
            throw error;
        }
    });

    // Set up IPC handler for testing LLM connections
    ipcMain.handle('llm:test-connection', async (event, provider: string) => {
        if (!llmRouterService) {
            return false;
        }

        try {
            if (provider === 'openai') {
                // Use the getConfig method to access provider config
                const config = llmRouterService.getConfig();
                if (!config.openai.apiKey) {
                    return false;
                }
                // Test connection through the router service
                return await llmRouterService.chat(
                    [{ role: 'user', content: 'test' }],
                    { streaming: false }
                ).then(() => true).catch(() => false);
            } else if (provider === 'ollama') {
                // Use the getConfig method to access provider config
                const config = llmRouterService.getConfig();
                if (!config.ollama.baseUrl) {
                    return false;
                }
                // Test connection through the router service
                return await llmRouterService.chat(
                    [{ role: 'user', content: 'test' }],
                    { streaming: false }
                ).then(() => true).catch(() => false);
            }
            return false;
        } catch (error) {
            console.error(`Connection test failed for ${provider}:`, error);
            return false;
        }
    });

    // Set up IPC handler for chat storage
    ipcMain.handle('get-conversations', async () => {
        try {
            if (!settingsService) {
                throw new Error('SettingsService not initialized');
            }

            const chatStorage = new ChatStorageService();
            await chatStorage.initialize();

            const conversations = await chatStorage.getConversations();
            return conversations;
        } catch (error) {
            console.error('Failed to get conversations:', error);
            return [];
        }
    });

    // Set up IPC handler for loading conversation history
    ipcMain.handle('load-conversation', async (event, conversationId: string) => {
        try {
            // In a real implementation, this would use the ChatStorageService
            // For now, we'll return a mock response
            return [
                {
                    id: 1,
                    conversationId: conversationId,
                    role: 'user',
                    content: 'Hello, how are you?',
                    timestamp: Date.now() - 3600000
                },
                {
                    id: 2,
                    conversationId: conversationId,
                    role: 'assistant',
                    content: "I'm doing well, thank you for asking!",
                    timestamp: Date.now() - 3500000
                }
            ];
        } catch (error) {
            console.error('Failed to load conversation:', error);
            return [];
        }
    });

    // Set application menu
    const menu = CindyMenu.createMenu({
        showSettings: () => {
            console.log('Show settings');
        },
        showAbout: () => {
            console.log('Show about');
        },
        quit: () => {
            (app as any).quitting = true;
            app.quit();
        }
    });

    Menu.setApplicationMenu(menu);
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Handle app quit
app.on('before-quit', () => {
    (app as any).quitting = true;
});
