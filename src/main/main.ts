import { app, BrowserWindow, Menu, nativeImage, NativeImage, ipcMain, desktopCapturer } from 'electron';
import * as path from 'path';
import { CindyMenu } from './menu';
import { SettingsService, Settings } from './services/SettingsService';
import { TrayService } from './services/TrayService';
import axios from 'axios';
import { ChatStorageService } from './services/ChatStorageService';
import { LLMRouterService } from './services/LLMRouterService';
// Re-enable core LLM functionality
import { LangChainLLMRouterService } from './services/LangChainLLMRouterService';
// Re-enable tool executor for web search
import { LangChainToolExecutorService } from './services/LangChainToolExecutorService';
// Keep other complex services disabled for now
// import { LangChainCindyAgent } from './agents/LangChainCindyAgent';
// import { LangChainMemoryService } from './services/LangChainMemoryService';
// import { LangChainVectorStoreService } from './services/LangChainVectorStoreService';
import { VectorStoreService } from './services/VectorStoreService';
import { DuckDBVectorStore } from './services/DuckDBVectorStore';
import { SpeechToTextService } from './services/SpeechToTextService';
import RealTimeTranscriptionService from './services/RealTimeTranscriptionService';
import { LinkPreviewService } from './services/LinkPreviewService';

// Function to set up all settings-related IPC handlers
const setupSettingsIPC = () => {
    console.log('🔧 DEBUG: Setting up settings IPC handlers');

    // Remove any existing handlers first to prevent duplicate registration
    const handlersToRemove = [
        'get-settings-service',
        'settings-get',
        'settings-set',
        'settings-get-all',
        'settings-save',
        'settings-set-all',
        'wake-word:start',
        'wake-word:stop',
        'wake-word:update-keyword',
        'wake-word:status',
        'get-link-preview'
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

    ipcMain.handle('settings-set-all', async (event, settings: any) => {
        if (!settingsService) {
            throw new Error('SettingsService not initialized');
        }
        console.log('🔧 DEBUG: settings-set-all called with:', Object.keys(settings));
        
        // Replace the entire settings object and save
        settingsService['settings'] = settings;
        await settingsService.save();
        
        console.log('🔧 DEBUG: settings-set-all completed successfully');
        return { success: true };
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
    
    // Link preview handler
    ipcMain.handle('get-link-preview', async (event, url: string) => {
        if (!linkPreviewService) {
            throw new Error('LinkPreviewService not initialized');
        }
        return await linkPreviewService.getPreview(url);
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
        'create-vector-store',
        'vector-store:get-indexed-items'
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

    // Create vector store handler
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

            // Create and initialize DuckDB vector store
            const apiKey = await settingsService?.getApiKey();
            
            if (!apiKey) {
                return { 
                    success: false, 
                    message: 'OpenAI API key required for DuckDB vector store'
                };
            }
            
            const vectorStore = new DuckDBVectorStore({
                databasePath: path.join(options.databasePath, 'duckdb-vector-store.db'),
                openaiApiKey: apiKey,
                embeddingModel: 'text-embedding-3-small',
                chunkSize: 1000,
                chunkOverlap: 200
            });
            
            await vectorStore.initialize();
            
            // Set up progress event forwarding
            vectorStore.on('progress', (data) => {
                if (mainWindow) {
                    mainWindow.webContents.send('vector-store:indexing-progress', data);
                }
            });
            
            // Start indexing using DuckDB implementation
            const result = await vectorStore.indexFolder(options.databasePath);
            
            console.log('[IPC] DuckDB vector store creation completed successfully');
            return { 
                success: true, 
                message: `DuckDB vector store created successfully. Indexed ${result.success} files with ${result.errors} errors.`,
                indexedFiles: await vectorStore.getIndexedFiles()
            };
        } catch (error) {
            console.error('[IPC] Error creating vector store:', error);
            return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
        }
    });
    
    // Get indexed items handler
    ipcMain.handle('vector-store:get-indexed-items', async (event, databasePath) => {
        console.log('[IPC] Getting indexed items for path:', databasePath);
        try {
            // Use DuckDB vector store if available
            if (duckDBVectorStore) {
                const items = await duckDBVectorStore.getIndexedFiles();
                return { success: true, items };
            }
            
            // Use LangChain vector store if available
            if (langChainVectorStoreService) {
                const items = langChainVectorStoreService.getIndexedFiles();
                return { success: true, items };
            }
            
            // Fallback to legacy index file
            const indexFile = path.join(databasePath, '.vector_store', 'index.json');
            if (fs.existsSync(indexFile)) {
                const indexData = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
                return { success: true, items: indexData.files || [] };
            }
            return { success: true, items: [] };
        } catch (error) {
            console.error('[IPC] Error getting indexed items:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
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
let langChainLLMRouterService: LangChainLLMRouterService | null = null;
let vectorStoreService: VectorStoreService | null = null;
let duckDBVectorStore: DuckDBVectorStore | null = null;
// let langChainVectorStoreService: LangChainVectorStoreService | null = null;
// @ts-ignore - temporarily unused
let langChainVectorStoreService: any = null; // Type as any for now
// let langChainMemoryService: LangChainMemoryService | null = null;
// @ts-ignore - temporarily unused
let langChainMemoryService: any = null; // Type as any for now
// let langChainToolExecutorService: LangChainToolExecutorService | null = null;
let langChainToolExecutorService: LangChainToolExecutorService | null = null;
// let langChainCindyAgent: LangChainCindyAgent | null = null;
// @ts-ignore - temporarily unused
let langChainCindyAgent: any = null; // Type as any for now
let wakeWordService: any = null;
let speechToTextService: SpeechToTextService | null = null;
let realTimeTranscriptionService: RealTimeTranscriptionService | null = null;
let linkPreviewService: LinkPreviewService | null = null;

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
        show: true, // Show immediately for debugging
        backgroundColor: '#ffffff' // Set background to match theme
    });

    // and load the index.html of the app.
    if (process.env.NODE_ENV === 'development') {
        const serverReady = await waitForDevServer();
        if (serverReady) {
            console.log('Loading from dev server at http://localhost:3004');
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

    // Log when content is loaded
    mainWindow.webContents.on('did-finish-load', () => {
        console.log('Window content finished loading');
    });
    
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('Window failed to load:', errorCode, errorDescription);
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
            
            // Also initialize LangChain version
            langChainLLMRouterService = new LangChainLLMRouterService(llmConfig);
            await langChainLLMRouterService.initialize();
            console.log('🔧 DEBUG: LangChain LLMRouterService initialized');
        }
    }

    // Initialize ChatStorageService
    try {
        chatStorageService = new ChatStorageService();
        await chatStorageService.initialize();
    } catch (error) {
        console.error('Failed to initialize ChatStorageService:', error);
    }

    // Initialize DuckDB Vector Store
    if (!duckDBVectorStore) {
        const databaseSettings = (await settingsService?.get('database') || {}) as any;
        const apiKey = await settingsService?.getApiKey();
        
        if (apiKey) {
            duckDBVectorStore = new DuckDBVectorStore({
                databasePath: path.join(app.getPath('userData'), 'duckdb-vector-store.db'),
                openaiApiKey: apiKey,
                embeddingModel: 'text-embedding-3-small',
                chunkSize: databaseSettings.chunkSize || 1000,
                chunkOverlap: databaseSettings.chunkOverlap || 200
            });
            
            try {
                await duckDBVectorStore.initialize();
                console.log('🔧 DEBUG: DuckDB VectorStore initialized successfully');
            } catch (error) {
                console.error('Failed to initialize DuckDB VectorStore:', error);
                // Fall back to legacy vector store if DuckDB fails
                duckDBVectorStore = null;
            }
        } else {
            console.log('🔧 DEBUG: No OpenAI API key available, skipping DuckDB VectorStore initialization');
        }
    }
    
    // Initialize VectorStoreService (legacy) as fallback
    if (!vectorStoreService && !duckDBVectorStore) {
        const databaseSettings = (await settingsService?.get('database') || {}) as any;
        vectorStoreService = new VectorStoreService({
            databasePath: databaseSettings.path || path.join(app.getPath('userData'), 'vector-store.db'),
            embeddingModel: databaseSettings.embeddingModel || 'qwen3:8b',
            chunkSize: databaseSettings.chunkSize || 1000,
            chunkOverlap: databaseSettings.chunkOverlap || 200,
            autoIndex: databaseSettings.autoIndex || true
        });
        await vectorStoreService.initialize();
        console.log('🔧 DEBUG: VectorStoreService (legacy) initialized as fallback');
    }

    // Initialize LangChain VectorStoreService - DISABLED FOR DEBUGGING
    // if (!langChainVectorStoreService) {
    //     const databaseSettings = (await settingsService?.get('database') || {}) as any;
    //     const apiKey = await settingsService?.getApiKey();
    //     langChainVectorStoreService = new LangChainVectorStoreService({
    //         databasePath: databaseSettings.path || path.join(app.getPath('userData'), 'vector-store'),
    //         embeddingModel: 'text-embedding-3-small',
    //         chunkSize: databaseSettings.chunkSize || 1000,
    //         chunkOverlap: databaseSettings.chunkOverlap || 200,
    //         autoIndex: databaseSettings.autoIndex || true,
    //         openaiApiKey: apiKey || ''
    //     });
    //     await langChainVectorStoreService.initialize();
    //     console.log('🔧 DEBUG: LangChain VectorStoreService initialized');
    // }

    // Initialize LangChain MemoryService - DISABLED FOR DEBUGGING
    // if (!langChainMemoryService && langChainVectorStoreService && langChainLLMRouterService) {
    //     const llmProvider = await langChainLLMRouterService.getCurrentProvider();
    //     let llmModel = null;
    //     if (llmProvider && typeof llmProvider === 'object' && 'chatModel' in llmProvider) {
    //         llmModel = (llmProvider as any).chatModel;
    //     }
    //     langChainMemoryService = new LangChainMemoryService({}, langChainVectorStoreService, llmModel);
    //     await langChainMemoryService.initialize();
    //     console.log('🔧 DEBUG: LangChain MemoryService initialized');
    // }

    // Initialize LangChain ToolExecutorService for web search
    if (!langChainToolExecutorService) {
        // Pass null for now since we're not using the vector store parameter
        langChainToolExecutorService = new LangChainToolExecutorService(null as any);
        await langChainToolExecutorService.initialize();
        console.log('🔧 DEBUG: LangChain ToolExecutorService initialized');
    }
    
    // Initialize LinkPreviewService
    if (!linkPreviewService) {
        linkPreviewService = new LinkPreviewService();
        console.log('🔧 DEBUG: LinkPreviewService initialized');
    }

    // Initialize LangChain CindyAgent after other services - DISABLED FOR DEBUGGING
    // if (!langChainCindyAgent && langChainLLMRouterService && settingsService && chatStorageService && langChainMemoryService && langChainToolExecutorService) {
    //     // Get agent config from settings
    //     const agentConfig = await settingsService.get('general') || {};

    //     // Initialize LangChain agent with LangChain services
    //     langChainCindyAgent = new LangChainCindyAgent({
    //         store: {},
    //         memoryService: langChainMemoryService as any, // Type cast for compatibility
    //         toolExecutor: langChainToolExecutorService as any, // Type cast for compatibility
    //         config: {
    //             enableStreaming: true,
    //             ...agentConfig
    //         },
    //         llmRouter: langChainLLMRouterService
    //     });
    //     console.log('🔧 DEBUG: LangChain CindyAgent initialized with full LangChain services integration');
    // }

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

    // Initialize real-time transcription service
    if (mainWindow && !realTimeTranscriptionService) {
        realTimeTranscriptionService = new RealTimeTranscriptionService(mainWindow);
        console.log('🎤 Real-time transcription service initialized');
    }

    // Initialize wake word service after settings service
    if (settingsService && mainWindow && !wakeWordService) {
        try {
            const WakeWordService = require('./services/WakeWordService').default;
            if (!WakeWordService) {
                console.error('🎤 WakeWordService import failed - default export not found');
                console.log('🎤 Available exports:', Object.keys(require('./services/WakeWordService')));
            } else {
                wakeWordService = new WakeWordService(settingsService, mainWindow);
            }
        } catch (importError) {
            console.error('🎤 Failed to import WakeWordService:', importError);
        }
        
        // Listen for wake word detection events only if service was successfully created
        if (wakeWordService) {
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
                console.log('🎤 Whisper-based wake word service started successfully');
            } catch (error) {
                console.error('🎤 Failed to start wake word service:', error);
            }
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

    // IPC handlers for real-time transcription
    ipcMain.handle('start-real-time-transcription', async () => {
        console.log('Main process - start-real-time-transcription IPC called');
        try {
            if (realTimeTranscriptionService) {
                await realTimeTranscriptionService.startTranscription();
                return { success: true };
            }
            return { success: false, error: 'Real-time transcription service not available' };
        } catch (error) {
            console.error('Main process - start-real-time-transcription error:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    });

    ipcMain.handle('stop-real-time-transcription', async () => {
        console.log('Main process - stop-real-time-transcription IPC called');
        try {
            if (realTimeTranscriptionService) {
                await realTimeTranscriptionService.stopTranscription();
                return { success: true };
            }
            return { success: false, error: 'Real-time transcription service not available' };
        } catch (error) {
            console.error('Main process - stop-real-time-transcription error:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
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
            // Use LangChain LLM router directly as fallback
            if (!langChainLLMRouterService) {
                console.error('Main process - process-message: LangChain LLM router not initialized');
                return "Sorry, I encountered an error processing your request. The LLM service is not properly initialized.";
            }
            
            console.log('Main process - using direct LangChain LLM router');

            // Save user message first
            if (chatStorageService) {
                try {
                    await chatStorageService.saveMessage({
                        conversationId,
                        role: 'user',
                        content: message,
                        timestamp: Date.now()
                    });
                    console.log('🔧 DEBUG: User message persisted to ChatStorageService');
                } catch (saveError) {
                    console.error('🚨 DEBUG: Failed to persist user message:', saveError);
                }
            }

            // Get recent conversation history for context
            let conversationHistory: Array<{role: 'system' | 'user' | 'assistant', content: string}> = [];
            if (chatStorageService) {
                try {
                    const history = await chatStorageService.getConversationHistory(conversationId);
                    conversationHistory = history.slice(-10).map(msg => ({
                        role: msg.role as 'system' | 'user' | 'assistant',
                        content: msg.content
                    }));
                } catch (error) {
                    console.error('Failed to get conversation history:', error);
                }
            }

            // Add current message to conversation
            conversationHistory.push({
                role: 'user',
                content: message
            });

            // Check if the message might need web search
            const needsWebSearch = message.toLowerCase().includes('search') || 
                                  message.toLowerCase().includes('latest') || 
                                  message.toLowerCase().includes('current') ||
                                  message.toLowerCase().includes('recent') ||
                                  message.toLowerCase().includes('news') ||
                                  message.toLowerCase().includes('web');

            let response;
            
            if (needsWebSearch && langChainToolExecutorService) {
                // Add a system message to encourage tool use
                const toolAwareHistory = [
                    {
                        role: 'system' as const,
                        content: 'You have access to a web_search tool. Use it when users ask for current, recent, or latest information. Always search the web for queries about current events, news, or recent developments.'
                    },
                    ...conversationHistory
                ];
                
                console.log('🔧 DEBUG: Message appears to need web search, using tool-aware processing');
                response = await langChainLLMRouterService.chat(toolAwareHistory);
                
                // If the response looks like it should have used a tool but didn't, manually trigger web search
                if (typeof response === 'string' && response.includes('based on my training data')) {
                    console.log('🔧 DEBUG: Response indicates limitations, attempting web search');
                    try {
                        const searchResult = await langChainToolExecutorService.executeTool('web_search', { query: message });
                        if (searchResult.success) {
                            // Combine search results with AI response
                            const enhancedHistory = [
                                ...conversationHistory,
                                {
                                    role: 'system' as const,
                                    content: `Web search results for "${message}":\n${searchResult.result}\n\nPlease provide a helpful response based on this current information.`
                                }
                            ];
                            response = await langChainLLMRouterService.chat(enhancedHistory);
                        }
                    } catch (searchError) {
                        console.error('Web search failed:', searchError);
                        // Continue with original response
                    }
                }
            } else {
                // Process message through LangChain LLM router normally
                response = await langChainLLMRouterService.chat(conversationHistory);
            }

            let assistantContent = '';

            // Handle streaming response
            if (typeof response === 'object' && Symbol.asyncIterator in response) {
                // Stream chunks to renderer process
                for await (const chunk of response as AsyncGenerator<string>) {
                    assistantContent += chunk;
                    event.sender.send('stream-chunk', { chunk, conversationId });
                }
            } else {
                // Non-streaming response
                assistantContent = typeof response === 'string' ? response : (response as any).content || '';
                event.sender.send('stream-chunk', { chunk: assistantContent, conversationId });
            }

            // Save assistant message to ChatStorageService
            if (chatStorageService && assistantContent.trim()) {
                try {
                    await chatStorageService.saveMessage({
                        conversationId,
                        role: 'assistant',
                        content: assistantContent,
                        timestamp: Date.now()
                    });
                    console.log('🔧 DEBUG: Assistant message persisted to ChatStorageService');
                } catch (saveError) {
                    console.error('🚨 DEBUG: Failed to persist assistant message:', saveError);
                }
            }

            event.sender.send('stream-complete', { conversationId });
            return assistantContent; // Return the full response

        } catch (error) {
            console.error('Main process - process-message: error processing message:', error);
            // Send error to renderer
            event.sender.send('stream-error', {
                error: error instanceof Error ? error.message : 'Unknown error',
                conversationId
            });
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

    // IPC handler for getting latest human message in a conversation
    ipcMain.handle('get-latest-human-message', async (_, conversationId: string) => {
        console.log('Main process - get-latest-human-message IPC called for:', conversationId);
        try {
            if (!chatStorageService) {
                console.error('Main process - get-latest-human-message: chatStorageService not available');
                return null;
            }
            return await chatStorageService.getLatestHumanMessage(conversationId);
        } catch (error) {
            console.error('Main process - get-latest-human-message: error getting latest human message:', error);
            return null;
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
