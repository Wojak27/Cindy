import 'dotenv/config'; // same as: import { config } from 'dotenv'; config();
import { app, BrowserWindow, Menu, nativeImage, ipcMain, desktopCapturer, shell, session } from 'electron';
import type { NativeImage } from 'electron';
import * as path from 'path';
import * as os from 'os';
import { DuckDBSettingsService } from './services/DuckDBSettingsService.ts';
import type { Settings } from './services/SettingsService.ts';
import { TrayService } from './services/TrayService.ts';
import axios from 'axios';
import { ChatStorageService } from './services/ChatStorageService.ts';
// Re-enable core LLM functionality
import { LLMProvider } from './services/LLMProvider.ts';

import { createDuckDBVectorStore, DuckDBVectorStore } from './services/DuckDBVectorStore.ts';
import { ServiceManager } from './services/ServiceManager.ts';
import { SpeechToTextService } from './services/SpeechToTextService.ts';
import RealTimeTranscriptionService from './services/RealTimeTranscriptionService.ts';
import { LinkPreviewService } from './services/LinkPreviewService.ts';
import { TextToSpeechService } from './services/TextToSpeechService.ts';
import { ConnectorManagerService } from './services/ConnectorManagerService.ts';
import { generateStepDescription } from '../shared/AgentFlowStandard.ts';
import { IPC_CHANNELS } from '../shared/ipcChannels.ts';

import installExtension, {
    REDUX_DEVTOOLS,
    REACT_DEVELOPER_TOOLS
} from 'electron-devtools-installer';

// Set the application name to ensure it shows as "Cindy" instead of "Electron"
app.setName('Cindy');

// Utility function to get MIME type from file extension
const getMimeType = (filePath: string): string => {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.txt': 'text/plain',
        '.md': 'text/markdown',
        '.json': 'application/json',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.html': 'text/html',
        '.htm': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.ts': 'application/typescript',
        '.xml': 'application/xml',
        '.zip': 'application/zip',
        '.mp3': 'audio/mpeg',
        '.mp4': 'video/mp4',
        '.wav': 'audio/wav'
    };
    return mimeTypes[ext] || 'application/octet-stream';
};

// Utility function to filter out internal content from user responses
const filterInternalContent = (chunk: string): string => {
    if (!chunk || typeof chunk !== 'string') {
        return '';
    }

    let filtered = chunk;

    // Remove tool execution blocks
    filtered = filtered.replace(/<tool>.*?<\/tool>/gs, '');

    // Remove todo list blocks  
    filtered = filtered.replace(/TODO List:.*?(?=\n\n|\n$|$)/gs, '');
    filtered = filtered.replace(/\*\*TODO List:\*\*.*?(?=\n\n|\n$|$)/gs, '');

    // Remove markdown todo lists (- [ ] or 1. [ ])
    filtered = filtered.replace(/^[\s]*[-*]?\s*\[[ x]\].*$/gm, '');
    filtered = filtered.replace(/^\d+\.\s*\[[ x]\].*$/gm, '');

    // Remove structured todo blocks
    filtered = filtered.replace(/\[[\w\s]+\]\s*\*\*.*?\*\*.*?(?=\n\n|\n$|$)/gs, '');

    // Remove status indicators like ✅ ❌ ⏳ etc. at start of lines
    filtered = filtered.replace(/^[\s]*[✅❌⏳📝🔄⭐️]\s+.*$/gm, '');

    // Remove "Plan:" or "Planning:" sections
    filtered = filtered.replace(/\*\*Plan[^:]*:\*\*.*?(?=\n\n|\n$|$)/gs, '');
    filtered = filtered.replace(/Plan[^:]*:.*?(?=\n\n|\n$|$)/gs, '');

    // Remove debug/internal markers
    filtered = filtered.replace(/🔧.*?(?=\n|\s)/g, '');
    filtered = filtered.replace(/📊.*?(?=\n|\s)/g, '');

    // Clean up multiple newlines
    filtered = filtered.replace(/\n\s*\n\s*\n/g, '\n\n');
    filtered = filtered.trim();

    return filtered;
};

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
        'get-link-preview',
        'fetch-provider-models'
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
    ipcMain.handle(IPC_CHANNELS.GET_SETTINGS_SERVICE, () => {
        console.log('🔧 DEBUG: Settings service requested by renderer, available:', !!settingsService);
        return !!settingsService;
    });


    // Settings CRUD handlers
    ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async (event, section: string) => {
        if (!settingsService) {
            throw new Error('SettingsService not initialized');
        }

        const validSections = ['general', 'voice', 'llm', 'vault', 'research', 'privacy', 'system', 'database', 'profile', 'search'];
        if (!validSections.includes(section)) {
            throw new Error(`Invalid settings section: ${section}`);
        }

        return await settingsService.get(section as keyof Settings);
    });

    ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (event, section: string, value: any) => {
        if (!settingsService) {
            throw new Error('SettingsService not initialized');
        }

        const validSections = ['general', 'voice', 'llm', 'vault', 'research', 'privacy', 'system', 'database', 'profile', 'search'];
        if (!validSections.includes(section)) {
            throw new Error(`Invalid settings section: ${section}`);
        }

        return await settingsService.set(section as keyof Settings, value);
    });

    ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, async () => {
        if (!settingsService) {
            throw new Error('SettingsService not initialized');
        }
        return await settingsService.getAll();
    });

    ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE, async () => {
        if (!settingsService) {
            throw new Error('SettingsService not initialized');
        }
        return await settingsService.save();
    });

    ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_ALL, async (event, settings: any) => {
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
    ipcMain.handle(IPC_CHANNELS.WAKE_WORD_START, async () => {
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

    ipcMain.handle(IPC_CHANNELS.WAKE_WORD_STOP, async () => {
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

    ipcMain.handle(IPC_CHANNELS.WAKE_WORD_UPDATE_KEYWORD, async (_, keyword: string, sensitivity: number) => {
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

    ipcMain.handle(IPC_CHANNELS.WAKE_WORD_STATUS, async () => {
        console.log('Main process - wake-word:status IPC called');
        // Wake word functionality disabled by default
        return { success: false, isListening: false, error: 'Wake word service disabled' };
    });

    // Link preview handler
    ipcMain.handle(IPC_CHANNELS.GET_LINK_PREVIEW, async (event, url: string) => {
        if (!linkPreviewService) {
            throw new Error('LinkPreviewService not initialized');
        }
        return await linkPreviewService.getPreview(url);
    });

    // IPC handler for fetching models from provider APIs
    ipcMain.handle(IPC_CHANNELS.FETCH_PROVIDER_MODELS, async (event, { provider, config }) => {
        console.log(`Main process - fetch-provider-models called for provider: ${provider}`);

        try {
            let models: string[] = [];

            switch (provider) {
                case 'openai':
                    if (config?.apiKey) {
                        const response = await axios.get('https://api.openai.com/v1/models', {
                            headers: { 'Authorization': `Bearer ${config.apiKey}` },
                            timeout: 10000
                        });
                        models = response.data.data
                            .filter((model: any) => model.id.includes('gpt') || model.id.includes('text-davinci'))
                            .map((model: any) => model.id)
                            .sort();
                    }
                    break;

                case 'anthropic':
                    // Anthropic doesn't have a public models API, return known models
                    models = [

                    ];
                    break;

                case 'openrouter':
                    if (config?.apiKey) {
                        const response = await axios.get('https://openrouter.ai/api/v1/models', {
                            headers: {
                                'Authorization': `Bearer ${config.apiKey}`,
                                'HTTP-Referer': config?.siteUrl || 'https://localhost:3000',
                                'X-Title': config?.appName || 'Cindy Voice Assistant'
                            },
                            timeout: 10000
                        });
                        models = response.data.data.map((model: any) => model.id).sort();
                    }
                    break;

                case 'groq':
                    if (config?.apiKey) {
                        const response = await axios.get('https://api.groq.com/openai/v1/models', {
                            headers: { 'Authorization': `Bearer ${config.apiKey}` },
                            timeout: 10000
                        });
                        models = response.data.data.map((model: any) => model.id).sort();
                    }
                    break;

                case 'google':
                    // Google Gemini models - static list since no public API for model list
                    models = [

                    ];
                    break;

                case 'cohere':
                    if (config?.apiKey) {
                        const response = await axios.get('https://api.cohere.ai/v1/models', {
                            headers: { 'Authorization': `Bearer ${config.apiKey}` },
                            timeout: 10000
                        });
                        models = response.data.models
                            .filter((model: any) => model.name)
                            .map((model: any) => model.name)
                            .sort();
                    }
                    break;

                case 'ollama':
                    try {
                        const baseUrl = config?.baseUrl || 'http://127.0.0.1:11435';
                        const response = await axios.get(`${baseUrl}/api/tags`, { timeout: 5000 });
                        models = response.data.models.map((model: any) => model.name).sort();
                    } catch (error) {
                        console.warn('Failed to fetch Ollama models, using defaults:', error.message);
                        models = [];
                    }
                    break;

                case 'huggingface':
                    // HuggingFace has many models, provide common ones
                    models = [

                    ];
                    break;

                case 'azure':
                    // Azure OpenAI models depend on deployment, return common ones
                    models = [

                    ];
                    break;

                default:
                    console.warn(`Unknown provider: ${provider}`);
                    models = [];
            }

            console.log(`Fetched ${models.length} models for ${provider}:`, models);
            return models;

        } catch (error) {
            console.error(`Error fetching models for ${provider}:`, error);
            return []; // Return empty array on error, component will use defaults
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
        'create-vector-store',
        'vector-store:get-indexed-items',
        'resolve-document-path',
        'detect-and-resolve-documents'
    ];

    handlersToRemove.forEach(handler => {
        try {
            ipcMain.removeHandler(handler);
        } catch (error) {
            console.debug(`No existing handler for ${handler} to remove`);
        }
    });

    // Validate path handler
    ipcMain.handle(IPC_CHANNELS.VALIDATE_PATH, async (event, pathToValidate) => {
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
    ipcMain.handle(IPC_CHANNELS.SHOW_DIRECTORY_DIALOG, async (event, defaultPath) => {
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
    ipcMain.handle(IPC_CHANNELS.CREATE_VECTOR_STORE, async (event, options) => {
        console.log('[IPC] Creating vector store with options:', options);
        try {

            // Create and initialize DuckDB vector store
            // Detect embedding provider based on current LLM provider
            const generalSettings = (await settingsService?.get('general') || {}) as any;
            const llmProvider = generalSettings.llmProvider || 'auto';
            console.log('[IPC] DEBUG: Detected LLM provider:', llmProvider);
            console.log('[IPC] DEBUG: General settings:', generalSettings);
            // Store database in app data directory, not in the folder being indexed
            const appDataPath = app.getPath('userData');

            let vectorStoreConfig: { embeddingProvider: string, embeddingModel: string, apiKey?: string };

            // Choose embedding provider based on LLM provider
            // Use Ollama embeddings if LLM provider is 'ollama'
            if (llmProvider === 'ollama') {
                vectorStoreConfig.embeddingProvider = 'ollama';
                vectorStoreConfig.embeddingModel = 'granite-embedding:278m'; // Smallest Qwen model
                console.log('[IPC] Using Ollama embeddings with smallest Qwen model (0.5b)');
            } else {
                // For 'openai' and 'auto' providers, try to use OpenAI embeddings
                // But first check if we actually have an API key
                const apiKey = await settingsService?.getApiKey();

                if (!apiKey && llmProvider === 'auto') {
                    // If no API key and auto mode, fallback to Ollama
                    console.log('[IPC] No OpenAI API key found in auto mode, falling back to Ollama embeddings with smallest Qwen model');
                    vectorStoreConfig.embeddingProvider = 'ollama';
                    vectorStoreConfig.embeddingModel = 'granite-embedding:278m'; // Smallest Qwen model
                } else if (!apiKey) {
                    return {
                        success: false,
                        message: 'OpenAI API key required for OpenAI embeddings. Please set your API key or switch to Ollama provider.'
                    };
                } else {
                    vectorStoreConfig.embeddingProvider = 'openai';
                    vectorStoreConfig.apiKey = apiKey;
                    vectorStoreConfig.embeddingModel = 'text-embedding-ada-002'; // Use Ada model as requested
                    console.log('[IPC] Using OpenAI embeddings with Ada model');
                }
            }
            const vectorStore = await createDuckDBVectorStore(options.databasePath, llmProvider, appDataPath);

            // Assign to global variable so IPC handlers can access it
            duckDBVectorStore = vectorStore;

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

    // Index directory handler
    ipcMain.handle(IPC_CHANNELS.VECTOR_STORE_INDEX_DIRECTORY, async (event, directoryPath, options = {}) => {
        console.log('[IPC] Indexing directory:', directoryPath);
        try {
            if (!directoryPath) {
                return { success: false, message: 'Directory path is required' };
            }

            // Validate directory exists
            if (!fs.existsSync(directoryPath)) {
                return { success: false, message: 'Directory does not exist' };
            }

            // Use DuckDB vector store if available
            if (duckDBVectorStore) {
                // Set up progress event forwarding
                const progressListener = (data: any) => {
                    console.log('[IPC] Forwarding progress event to renderer:', data);
                    if (mainWindow) {
                        mainWindow.webContents.send('vector-store:indexing-progress', data);
                    }
                };

                const fileIndexedListener = (data: any) => {
                    if (mainWindow) {
                        mainWindow.webContents.send('vector-store:file-indexed', data);
                    }
                };

                const indexingCompletedListener = (data: any) => {
                    if (mainWindow) {
                        mainWindow.webContents.send('vector-store:indexing-completed', data);
                    }
                };

                duckDBVectorStore.on('progress', progressListener);
                duckDBVectorStore.on('fileIndexed', fileIndexedListener);
                duckDBVectorStore.on('indexingCompleted', indexingCompletedListener);

                try {
                    const result = await duckDBVectorStore.indexFolder(directoryPath);
                    return {
                        success: true,
                        message: `Directory indexed successfully. ${result.success} files indexed, ${result.errors} errors.`,
                        indexed: result.success,
                        errors: result.errors
                    };
                } finally {
                    // Clean up event listeners
                    duckDBVectorStore.off('progress', progressListener);
                    duckDBVectorStore.off('fileIndexed', fileIndexedListener);
                    duckDBVectorStore.off('indexingCompleted', indexingCompletedListener);
                }
            }

            return { success: false, message: 'No vector store available' };

        } catch (error) {
            console.error('[IPC] Error indexing directory:', error);
            return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
        }
    });

    // Check directory indexing status
    ipcMain.handle(IPC_CHANNELS.VECTOR_STORE_CHECK_STATUS, async (event, directoryPath) => {
        console.log('[IPC] Checking directory status:', directoryPath);
        try {
            if (!directoryPath) {
                return { success: false, message: 'Directory path is required' };
            }

            // Use DuckDB vector store if available
            if (duckDBVectorStore) {
                await duckDBVectorStore.initialize();
                const status = await duckDBVectorStore.checkDirectoryStatus(directoryPath);
                return { success: true, status };
            } else {
                return { success: false, message: 'Vector store not available' };
            }
        } catch (error) {
            console.error('[IPC] Error checking directory status:', error);
            return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
        }
    });

    // Get indexed items handler
    ipcMain.handle(IPC_CHANNELS.VECTOR_STORE_GET_INDEXED_ITEMS, async (event, databasePath) => {
        console.log('[IPC] Getting indexed items for path:', databasePath);
        console.log('[IPC] DuckDB vector store available:', !!duckDBVectorStore);
        try {
            // Initialize DuckDB vector store if not available but database exists
            if (!duckDBVectorStore && databasePath) {
                console.log('[IPC] Vector store not initialized, checking for existing database...');
                const dbPath = path.join(databasePath, '.vector_store', 'duckdb_vectors.db');
                if (fs.existsSync(dbPath)) {
                    console.log('[IPC] Found existing vector database, initializing...');

                    // Get settings for provider configuration
                    const llmSettings: any = await settingsService?.get('llm') || {};
                    const provider = llmSettings.provider || 'ollama';

                    // Configure vector store based on provider
                    const vectorStoreConfig: any = {
                        databasePath: dbPath,
                        chunkSize: 1000,
                        chunkOverlap: 200,
                    };

                    if (provider === 'openai' || provider === 'auto') {
                        const apiKey = llmSettings.openaiApiKey;
                        if (apiKey) {
                            vectorStoreConfig.embeddingProvider = 'openai';
                            vectorStoreConfig.openaiApiKey = apiKey;
                        } else {
                            vectorStoreConfig.embeddingProvider = 'ollama';
                        }
                    } else {
                        vectorStoreConfig.embeddingProvider = 'ollama';
                    }

                    try {
                        duckDBVectorStore = await createDuckDBVectorStore(databasePath, vectorStoreConfig, app.getPath('userData'));
                        await duckDBVectorStore.initialize();
                        console.log('[IPC] Vector store initialized successfully for reading');
                    } catch (error) {
                        console.warn('[IPC] Could not initialize vector store:', error);
                    }
                }
            }

            // Use DuckDB vector store if available
            if (duckDBVectorStore) {
                console.log('[IPC] Fetching indexed files from DuckDB...');
                const items = await duckDBVectorStore.getIndexedFiles();
                console.log('[IPC] Found', items.length, 'indexed files');
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

    // Document resolution for auto-detection from AI responses
    ipcMain.handle(IPC_CHANNELS.RESOLVE_DOCUMENT_PATH, async (event, documentPath: string) => {
        console.log('[IPC] Resolving document path:', documentPath);
        try {
            // Check if it's already an absolute path
            if (path.isAbsolute(documentPath)) {
                if (fs.existsSync(documentPath)) {
                    const stats = fs.statSync(documentPath);
                    return {
                        success: true,
                        document: {
                            path: documentPath,
                            name: path.basename(documentPath),
                            size: stats.size,
                            mtime: stats.mtime.toISOString(),
                            chunks: 1
                        }
                    };
                }
                return { success: false, error: 'File not found at absolute path' };
            }

            // For relative paths, search in indexed documents
            if (duckDBVectorStore) {
                const indexedFiles = await duckDBVectorStore.getIndexedFiles();
                const matchingFile = indexedFiles.find(file =>
                    file.path.includes(documentPath) ||
                    path.basename(file.path) === documentPath ||
                    path.basename(file.path) === path.basename(documentPath)
                );

                if (matchingFile) {
                    console.log('[IPC] Found document in index:', matchingFile.path);
                    return {
                        success: true,
                        document: {
                            path: matchingFile.path,
                            name: path.basename(matchingFile.path),
                            size: matchingFile.size || 0,
                            mtime: matchingFile.mtime || new Date().toISOString(),
                            chunks: matchingFile.chunks || 1
                        }
                    };
                }
            }

            // Search in common locations (user documents, downloads, etc.)
            const commonPaths = [
                path.join(os.homedir(), 'Documents'),
                path.join(os.homedir(), 'Downloads'),
                path.join(os.homedir(), 'Desktop'),
                process.cwd()
            ];

            for (const basePath of commonPaths) {
                const fullPath = path.join(basePath, documentPath);
                if (fs.existsSync(fullPath)) {
                    const stats = fs.statSync(fullPath);
                    console.log('[IPC] Found document at:', fullPath);
                    return {
                        success: true,
                        document: {
                            path: fullPath,
                            name: path.basename(fullPath),
                            size: stats.size,
                            mtime: stats.mtime.toISOString(),
                            chunks: 1
                        }
                    };
                }
            }

            return { success: false, error: 'Document not found in any known location' };
        } catch (error) {
            console.error('[IPC] Error resolving document path:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    });

    // Auto-detect and resolve documents from AI response text
    ipcMain.handle(IPC_CHANNELS.DETECT_AND_RESOLVE_DOCUMENTS, async (event, responseText: string) => {
        console.log('[IPC] Detecting documents in AI response');
        try {
            // Simple document detection patterns (main process implementation)
            const documentPatterns = [
                // File paths with extensions
                /(?:file|document|path)?\s*["`']([^"`']+\.(?:pdf|doc|docx|txt|md|json|csv|xlsx|py|js|ts|html|css))["`']/gi,
                // Markdown-style file references
                /\[([^\]]+\.(?:pdf|doc|docx|txt|md|json|csv|xlsx|py|js|ts|html|css))\]/gi,
                // File names mentioned in text
                /(?:In|From|File|Document|Found in|Based on|According to)\s+["`']?([^"`'\s]+\.(?:pdf|doc|docx|txt|md|json|csv|xlsx|py|js|ts|html|css))["`']?/gi,
                // Simple file mentions
                /\b([a-zA-Z0-9_\-./]+\.(?:pdf|doc|docx|txt|md|json|csv|xlsx|py|js|ts|html|css))\b/gi
            ];

            const detectedPaths = new Set<string>();

            for (const pattern of documentPatterns) {
                let match;
                pattern.lastIndex = 0; // Reset regex state

                while ((match = pattern.exec(responseText)) !== null) {
                    const filePath = match[1];
                    if (filePath && !detectedPaths.has(filePath)) {
                        detectedPaths.add(filePath);
                    }
                }
            }

            console.log('[IPC] Detected', detectedPaths.size, 'potential documents');

            const resolvedDocuments = [];

            // Try to resolve each detected document
            for (const detectedPath of detectedPaths) {
                try {
                    // Manually resolve using the same logic as resolve-document-path
                    let resolvedDocument = null;

                    // Check if it's already an absolute path
                    if (path.isAbsolute(detectedPath)) {
                        if (fs.existsSync(detectedPath)) {
                            const stats = fs.statSync(detectedPath);
                            resolvedDocument = {
                                path: detectedPath,
                                name: path.basename(detectedPath),
                                size: stats.size,
                                mtime: stats.mtime.toISOString(),
                                chunks: 1
                            };
                        }
                    } else {
                        // Search in indexed documents
                        if (duckDBVectorStore) {
                            const indexedFiles = await duckDBVectorStore.getIndexedFiles();
                            const matchingFile = indexedFiles.find(file =>
                                file.path.includes(detectedPath) ||
                                path.basename(file.path) === detectedPath ||
                                path.basename(file.path) === path.basename(detectedPath)
                            );

                            if (matchingFile) {
                                resolvedDocument = {
                                    path: matchingFile.path,
                                    name: path.basename(matchingFile.path),
                                    size: matchingFile.size || 0,
                                    mtime: matchingFile.mtime || new Date().toISOString(),
                                    chunks: matchingFile.chunks || 1
                                };
                            }
                        }
                    }

                    if (resolvedDocument) {
                        resolvedDocuments.push({
                            ...resolvedDocument,
                            confidence: 0.8 // Default confidence for detected documents
                        });
                    }
                } catch (resolveError) {
                    console.warn('[IPC] Failed to resolve detected document:', detectedPath, resolveError);
                }
            }

            console.log('[IPC] Successfully resolved', resolvedDocuments.length, 'documents');
            return { success: true, documents: resolvedDocuments };
        } catch (error) {
            console.error('[IPC] Error detecting/resolving documents:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    });

    // File reading for document viewer
    ipcMain.handle(IPC_CHANNELS.READ_FILE_BUFFER, async (event, filePath) => {
        console.log('[IPC] Reading file buffer for:', filePath);
        console.log('[IPC] DuckDB vector store available for file access:', !!duckDBVectorStore);
        try {
            if (!fs.existsSync(filePath)) {
                return { success: false, error: 'File not found' };
            }

            // Security check - only allow reading files that are indexed
            let isAllowed = false;

            // Check if file is in indexed files (DuckDB)
            if (duckDBVectorStore) {
                try {
                    console.log('[IPC] Checking if file is indexed in DuckDB...');
                    const indexedFiles = await duckDBVectorStore.getIndexedFiles();
                    console.log('[IPC] DuckDB has', indexedFiles.length, 'indexed files');
                    console.log('[IPC] Looking for file:', filePath);
                    console.log('[IPC] Indexed file paths:', indexedFiles.map(f => f.path));
                    isAllowed = indexedFiles.some(file => file.path === filePath);
                    console.log('[IPC] File access allowed from DuckDB check:', isAllowed);
                } catch (error) {
                    console.warn('[IPC] Could not check DuckDB indexed files:', error);
                }
            }

            // Check if file is in indexed files (LangChain)
            if (!isAllowed && langChainVectorStoreService) {
                try {
                    const indexedFiles = langChainVectorStoreService.getIndexedFiles();
                    isAllowed = indexedFiles.some((file: any) => file.path === filePath);
                } catch (error) {
                    console.warn('[IPC] Could not check LangChain indexed files:', error);
                }
            }

            if (!isAllowed) {
                return { success: false, error: 'File access not allowed - file must be indexed first' };
            }

            const buffer = fs.readFileSync(filePath);
            const base64 = buffer.toString('base64');
            const stats = fs.statSync(filePath);

            return {
                success: true,
                data: base64,
                size: stats.size,
                mimeType: getMimeType(filePath)
            };
        } catch (error) {
            console.error('[IPC] Error reading file buffer:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    });

    console.log('🔧 DEBUG: Database IPC handlers setup complete');
};

// Function to set up TTS-related IPC handlers
const setupTTSIPC = () => {
    console.log('🔧 DEBUG: Setting up TTS IPC handlers');

    // Remove any existing handlers first
    const handlersToRemove = [
        'tts-synthesize',
        'tts-synthesize-and-play',
        'tts-stop',
        'tts-get-options',
        'tts-update-options',
        'tts-is-ready',
        'tts-cleanup'
    ];

    handlersToRemove.forEach(handler => {
        try {
            ipcMain.removeHandler(handler);
        } catch (error) {
            console.debug(`No existing handler for ${handler} to remove`);
        }
    });

    // Synthesize text to audio file
    ipcMain.handle(IPC_CHANNELS.TTS_SYNTHESIZE, async (event, text: string, outputPath?: string) => {
        console.log('Main process - tts-synthesize IPC called with text:', text.substring(0, 50) + '...');
        try {
            if (!textToSpeechService) {
                return { success: false, error: 'TextToSpeechService not available' };
            }

            if (!text || typeof text !== 'string' || text.trim().length === 0) {
                return { success: false, error: 'Invalid text input' };
            }

            // Lazy initialization on first use
            if (!textToSpeechService.isReady()) {
                console.log('Main process - Initializing TTS on first use...');
                try {
                    await textToSpeechService.initialize();
                } catch (initError) {
                    console.error('Main process - TTS initialization failed:', initError);
                    return { success: false, error: 'Failed to initialize TTS service: ' + initError.message };
                }
            }

            const result = await textToSpeechService.synthesize(text, outputPath);
            console.log('Main process - tts-synthesize result:', result.success ? 'success' : result.error);
            return result;
        } catch (error) {
            console.error('Main process - tts-synthesize error:', error);
            return { success: false, error: error.message };
        }
    });

    // Synthesize text and play audio immediately
    ipcMain.handle(IPC_CHANNELS.TTS_SYNTHESIZE_AND_PLAY, async (event, text: string) => {
        console.log('Main process - tts-synthesize-and-play IPC called with text:', text.substring(0, 50) + '...');
        try {
            if (!textToSpeechService) {
                return { success: false, error: 'TextToSpeechService not available' };
            }

            if (!text || typeof text !== 'string' || text.trim().length === 0) {
                return { success: false, error: 'Invalid text input' };
            }

            // Lazy initialization on first use
            if (!textToSpeechService.isReady()) {
                console.log('Main process - Initializing TTS on first use...');
                try {
                    await textToSpeechService.initialize();
                } catch (initError) {
                    console.error('Main process - TTS initialization failed:', initError);
                    return { success: false, error: 'Failed to initialize TTS service: ' + initError.message };
                }
            }

            const result = await textToSpeechService.synthesizeAndPlay(text);
            console.log('Main process - tts-synthesize-and-play result:', result.success ? 'SUCCESS' : `FAILED: ${result.error}`);
            return result;
        } catch (error) {
            console.error('Main process - tts-synthesize-and-play error:', error);
            return { success: false, error: error.message };
        }
    });

    // Get current TTS options
    ipcMain.handle(IPC_CHANNELS.TTS_GET_OPTIONS, async () => {
        try {
            if (!textToSpeechService) {
                return { success: false, error: 'TextToSpeechService not initialized' };
            }

            const options = textToSpeechService.getOptions();
            return { success: true, options };
        } catch (error) {
            console.error('Main process - tts-get-options error:', error);
            return { success: false, error: error.message };
        }
    });

    // Update TTS options
    ipcMain.handle(IPC_CHANNELS.TTS_UPDATE_OPTIONS, async (event, options: any) => {
        console.log('Main process - tts-update-options IPC called with provider:', options.provider);
        try {
            if (!textToSpeechService) {
                return { success: false, error: 'TextToSpeechService not initialized' };
            }

            // Handle 'auto' provider resolution before passing to TTS service
            const resolvedOptions = { ...options };
            if (resolvedOptions.provider === 'auto') {
                // For auto, use system TTS for reliable, high-quality audio
                resolvedOptions.provider = 'kokoro';
                console.log('Main process - Auto TTS provider resolved to:', resolvedOptions.provider);
            }

            await textToSpeechService.updateOptions(resolvedOptions);
            console.log('Main process - TTS options updated successfully with provider:', resolvedOptions.provider);
            return { success: true };
        } catch (error) {
            console.error('Main process - tts-update-options error:', error);
            return { success: false, error: error.message };
        }
    });

    // Check if TTS service is ready
    ipcMain.handle(IPC_CHANNELS.TTS_IS_READY, async () => {
        try {
            // Service is available if it exists (even if not initialized yet)
            const available = !!textToSpeechService;
            const initialized = textToSpeechService?.isReady() || false;
            return {
                success: true,
                ready: initialized,
                available: available,
                requiresInitialization: available && !initialized
            };
        } catch (error) {
            console.error('Main process - tts-is-ready error:', error);
            return { success: false, error: error.message };
        }
    });

    // Stop current TTS playback
    ipcMain.handle(IPC_CHANNELS.TTS_STOP, async () => {
        console.log('Main process - tts-stop IPC called');
        try {
            if (!textToSpeechService) {
                return { success: false, error: 'TextToSpeechService not available' };
            }

            await textToSpeechService.stopPlayback();
            return { success: true };
        } catch (error) {
            console.error('Main process - tts-stop error:', error);
            return { success: false, error: error.message };
        }
    });

    // Cleanup TTS resources
    ipcMain.handle(IPC_CHANNELS.TTS_CLEANUP, async () => {
        console.log('Main process - tts-cleanup IPC called');
        try {
            if (textToSpeechService) {
                await textToSpeechService.cleanup();
                return { success: true };
            }
            return { success: false, error: 'TextToSpeechService not initialized' };
        } catch (error) {
            console.error('Main process - tts-cleanup error:', error);
            return { success: false, error: error.message };
        }
    });

    // TTS Model Download Permission Handler
    ipcMain.handle(IPC_CHANNELS.TTS_REQUEST_MODEL_DOWNLOAD_PERMISSION, async (event, request) => {
        console.log('[IPC] TTS model download permission requested:', request.modelName);

        try {
            const { dialog } = require('electron');
            const mainWindow = global.mainWindow;

            if (!mainWindow) {
                console.error('[IPC] Main window not available for permission dialog');
                return { granted: false, error: 'Main window not available' };
            }

            // Check if user has previously granted permission for this model
            const settings = await settingsService?.getAll();
            const modelPermissions = settings?.tts?.modelPermissions || {};

            if (modelPermissions[request.modelName] === 'granted') {
                console.log('[IPC] Model download permission already granted:', request.modelName);
                return { granted: true };
            }

            // AUTO-GRANT: If no explicit denial, allow model downloads by default
            if (!modelPermissions[request.modelName]) {
                console.log(`[IPC] No explicit permission set for "${request.modelName}", auto-granting download permission for smoother UX`);
                return { granted: true };
            }

            if (modelPermissions[request.modelName] === 'denied') {
                console.log('[IPC] Model download permission previously denied:', request.modelName);
                return {
                    granted: false,
                    error: `Model download was previously denied for "${request.modelName}". You can enable it in TTS settings.`
                };
            }

            // Show permission dialog
            const result = await dialog.showMessageBox(mainWindow, {
                type: 'question',
                title: 'TTS Model Download Permission',
                message: `Download TTS Model: ${request.modelName}`,
                detail: `Cindy needs to download the text-to-speech model "${request.modelName}" (${request.estimatedSize}) to generate voice output.\n\n` +
                    `This will:\n` +
                    `• Download ~${request.estimatedSize} of data\n` +
                    `• Require internet connection\n` +
                    `• Store the model locally for offline use\n` +
                    `• Enable local voice synthesis\n\n` +
                    `Would you like to download this model?`,
                buttons: ['Download Model', 'Cancel', 'Always Allow for TTS'],
                defaultId: 0,
                cancelId: 1
            });

            let granted = false;
            let savePermission = false;

            if (result.response === 0) { // Download Model
                granted = true;
            } else if (result.response === 2) { // Always Allow
                granted = true;
                savePermission = true;
            }

            // Save permission if requested
            if (savePermission && settingsService) {
                const currentSettings = await settingsService.getAll();
                const updatedTtsSettings = {
                    ...currentSettings.tts,
                    modelPermissions: {
                        ...modelPermissions,
                        [request.modelName]: 'granted'
                    }
                };
                await settingsService.set('tts', updatedTtsSettings);
                console.log('[IPC] Saved permanent permission for model:', request.modelName);
            }

            console.log('[IPC] Model download permission result:', { granted, modelName: request.modelName });
            return { granted };

        } catch (error) {
            console.error('[IPC] Error showing permission dialog:', error);
            return { granted: false, error: error.message };
        }
    });

    // TTS Download Progress Handler
    ipcMain.on('tts-download-progress', (event, progress) => {
        console.log(`[IPC] TTS download progress: ${progress.file} - ${progress.progress}% (${progress.status})`);

        // Forward progress to renderer process for UI updates
        const mainWindow = global.mainWindow;
        if (mainWindow) {
            mainWindow.webContents.send('tts-download-progress-update', progress);
        }
    });

    // TTS Worker IPC Handlers for renderer process communication
    ipcMain.on('tts-worker-response', (event, response) => {
        console.log('[IPC] TTS worker response received:', response.id);
        // Emit the response to any waiting promises
        ipcMain.emit(`tts-response-${response.id}`, response);
    });

    console.log('🔧 DEBUG: TTS IPC handlers setup complete');
};

// Function to set up Connector-related IPC handlers
const setupConnectorIPC = () => {
    console.log('🔧 DEBUG: Setting up Connector IPC handlers');

    // Remove any existing handlers first
    const handlersToRemove = [
        'connector-get-status',
        'connector-start-oauth',
        'connector-configure-zotero',
        'connector-disconnect',
        'connector-test',
        'connector-get-connected'
    ];

    handlersToRemove.forEach(handler => {
        try {
            ipcMain.removeHandler(handler);
        } catch (error) {
            console.debug(`No existing handler for ${handler} to remove`);
        }
    });

    // Get connector status
    ipcMain.handle(IPC_CHANNELS.CONNECTOR_GET_STATUS, async () => {
        try {
            if (!connectorManagerService) {
                return { success: false, error: 'ConnectorManagerService not available' };
            }

            const status = connectorManagerService.getConnectorStatus();
            return { success: true, data: status };
        } catch (error: any) {
            console.error('[IPC] Error getting connector status:', error);
            return { success: false, error: error.message };
        }
    });

    // OAuth credential management handlers
    ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_OAUTH_CREDENTIALS, async (event, provider: string) => {
        try {
            if (!settingsService) {
                return { success: false, error: 'Settings service not available' };
            }
            const credentials = await (settingsService as any).getOAuthCredentials(provider);
            return credentials;
        } catch (error: any) {
            console.error(`[IPC] Error getting OAuth credentials for ${provider}:`, error);
            return null;
        }
    });

    ipcMain.handle(IPC_CHANNELS.SETTINGS_SET_OAUTH_CREDENTIALS, async (event, provider: string, clientId: string, clientSecret: string) => {
        try {
            if (!settingsService) {
                return { success: false, error: 'Settings service not available' };
            }
            await (settingsService as any).setOAuthCredentials(provider, clientId, clientSecret);
            return { success: true };
        } catch (error: any) {
            console.error(`[IPC] Error setting OAuth credentials for ${provider}:`, error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle(IPC_CHANNELS.SETTINGS_DELETE_OAUTH_CREDENTIALS, async (event, provider: string) => {
        try {
            if (!settingsService) {
                return { success: false, error: 'Settings service not available' };
            }
            await (settingsService as any).deleteOAuthCredentials(provider);
            return { success: true };
        } catch (error: any) {
            console.error(`[IPC] Error deleting OAuth credentials for ${provider}:`, error);
            return { success: false, error: error.message };
        }
    });

    // Start OAuth flow for a connector
    ipcMain.handle(IPC_CHANNELS.CONNECTOR_START_OAUTH, async (event, provider: string, oauthConfig?: any) => {
        try {
            if (!connectorManagerService) {
                return { success: false, error: 'ConnectorManagerService not available' };
            }

            const authUrl = await connectorManagerService.startOAuthFlow(provider as any, oauthConfig);
            return { success: true, data: { authUrl } };
        } catch (error: any) {
            console.error(`[IPC] Error starting OAuth for ${provider}:`, error);
            return { success: false, error: error.message };
        }
    });

    // Configure Zotero with API key
    ipcMain.handle(IPC_CHANNELS.CONNECTOR_CONFIGURE_ZOTERO, async (event, apiKey: string, userId: string, workspaceId?: string) => {
        try {
            if (!connectorManagerService) {
                return { success: false, error: 'ConnectorManagerService not available' };
            }

            await connectorManagerService.configureZotero(apiKey, userId, workspaceId);
            return { success: true };
        } catch (error: any) {
            console.error('[IPC] Error configuring Zotero:', error);
            return { success: false, error: error.message };
        }
    });

    // Disconnect a connector
    ipcMain.handle(IPC_CHANNELS.CONNECTOR_DISCONNECT, async (event, provider: string) => {
        try {
            if (!connectorManagerService) {
                return { success: false, error: 'ConnectorManagerService not available' };
            }

            await connectorManagerService.disconnectConnector(provider as any);
            return { success: true };
        } catch (error: any) {
            console.error(`[IPC] Error disconnecting ${provider}:`, error);
            return { success: false, error: error.message };
        }
    });

    // Test a connector
    ipcMain.handle(IPC_CHANNELS.CONNECTOR_TEST, async (event, provider: string) => {
        try {
            if (!connectorManagerService) {
                return { success: false, error: 'ConnectorManagerService not available' };
            }

            const result = await connectorManagerService.testConnector(provider as any);
            return result;
        } catch (error: any) {
            console.error(`[IPC] Error testing ${provider}:`, error);
            return { success: false, error: error.message };
        }
    });

    // Get connected connectors for tool loading
    ipcMain.handle(IPC_CHANNELS.CONNECTOR_GET_CONNECTED, async () => {
        try {
            if (!connectorManagerService) {
                return { success: false, error: 'ConnectorManagerService not available' };
            }

            const connectors = connectorManagerService.getConnectedConnectors();
            return { success: true, data: connectors };
        } catch (error: any) {
            console.error('[IPC] Error getting connected connectors:', error);
            return { success: false, error: error.message };
        }
    });

    // Developer Tools control
    ipcMain.handle(IPC_CHANNELS.TOGGLE_DEV_TOOLS, async (event) => {
        try {
            if (mainWindow && mainWindow.webContents) {
                if (mainWindow.webContents.isDevToolsOpened()) {
                    mainWindow.webContents.closeDevTools();
                } else {
                    mainWindow.webContents.openDevTools({ mode: 'detach' });
                }
                return { success: true, isOpen: mainWindow.webContents.isDevToolsOpened() };
            }
            return { success: false, error: 'Main window not available' };
        } catch (error: any) {
            console.error('[IPC] Error toggling DevTools:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle(IPC_CHANNELS.DEV_TOOLS_IS_OPEN, async (event) => {
        try {
            if (mainWindow && mainWindow.webContents) {
                return { success: true, isOpen: mainWindow.webContents.isDevToolsOpened() };
            }
            return { success: false, error: 'Main window not available' };
        } catch (error: any) {
            console.error('[IPC] Error checking DevTools status:', error);
            return { success: false, error: error.message };
        }
    });

    // Open external URL in default browser
    ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, async (event, url: string) => {
        try {
            await shell.openExternal(url);
            return { success: true };
        } catch (error: any) {
            console.error('[IPC] Error opening external URL:', error);
            return { success: false, error: error.message };
        }
    });

    console.log('🔧 DEBUG: Connector IPC handlers setup complete');
};

async function waitForDevServer(maxRetries = 10, delay = 1000): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await axios.get('http://localhost:3004');
            return true;
        } catch (error: any) {
            // If we get a 404, that means the server is responding, just no content at root
            if (error.response && error.response.status === 404) {
                console.log('🔧 DEBUG: Dev server responding (404 is expected at root)');
                return true;
            }
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
let settingsService: DuckDBSettingsService | null = null;
let chatStorageService: ChatStorageService | null = null;
// let duckDBChatStorageService: DuckDBChatStorageService | null = null;
let llmProvider: LLMProvider | null = null;
let duckDBVectorStore: DuckDBVectorStore | null = null;
// let langChainVectorStoreService: LangChainVectorStoreService | null = null;
// @ts-ignore - temporarily unused
let langChainVectorStoreService: any = null; // Type as any for now
// Dynamic loading - no static types, will be loaded on-demand
let serviceManager: ServiceManager | null = null;
let langChainMemoryService: any = null;
let agenticMemoryService: any = null; // A-Mem service
let globalTodoListState: any[] = []; // Global todo list state
let toolRegistry: any = null;
let langChainCindyAgent: any = null;
let wakeWordService: any = null;
let speechToTextService: SpeechToTextService | null = null;
let realTimeTranscriptionService: RealTimeTranscriptionService | null = null;
let linkPreviewService: LinkPreviewService | null = null;
let textToSpeechService: TextToSpeechService | null = null;
let connectorManagerService: ConnectorManagerService | null = null;

const createWindow = async (): Promise<void> => {
    console.log('🔧 DEBUG: Creating simplified window for testing');

    try {
        // Install Redux DevTools in development
        if (!app.isPackaged) {
            try {
                await installExtension([REDUX_DEVTOOLS, REACT_DEVELOPER_TOOLS], {
                    loadExtensionOptions: { allowFileAccess: true }
                });
                console.log('✅ Redux DevTools and React DevTools installed');
            } catch (error) {
                console.error('Failed to install DevTools extensions:', error);
            }
        }

        console.log('🔧 DEBUG: About to create BrowserWindow...');

        // Helper function to find app icon with fallback path resolution
        const findAppIconPath = (): string => {
            const fs = require('fs');
            const iconName = 'cindy-icon-v1.png';

            // Try different possible locations for the Cindy app icon
            const possiblePaths = [
                path.join(process.cwd(), 'assets/icons/', iconName),                    // Source directory
                path.join(__dirname, '../assets/icons/', iconName),                    // Relative to compiled main
                path.join(__dirname, '../../assets/icons/', iconName),                 // From dist directory
                path.join(process.cwd(), 'src/renderer/assets/icons/', iconName),      // Alternative source location
                path.join(__dirname, '../renderer/assets/icons/', iconName),           // Alternative compiled location
            ];

            for (const iconPath of possiblePaths) {
                if (fs.existsSync(iconPath)) {
                    console.log('🎨 Found Cindy app icon at:', iconPath);
                    return iconPath;
                }
            }

            console.warn('⚠️ Cindy app icon not found, using default');
            return ''; // Will use default Electron icon
        };

        const appIconPath = findAppIconPath();

        // Create the simplest possible browser window with forced visibility
        mainWindow = new BrowserWindow({
            width: 1000,
            height: 700,
            x: 100,    // Force position on screen
            y: 100,
            show: false, // Start hidden, show after loading
            alwaysOnTop: false,  // Allow normal window behavior
            titleBarStyle: 'hidden', // Hide the title bar
            icon: appIconPath || undefined, // Use Cindy icon if found
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                // Note: To use the more secure preload script approach, change to:
                // nodeIntegration: false,
                // contextIsolation: true,
                // preload: path.join(__dirname, 'preload.js')
            }
        });

        console.log('🔧 DEBUG: BrowserWindow created successfully!');

        // Make mainWindow globally accessible for tools like MapsDisplayTool
        (global as any).mainWindow = mainWindow;
        console.log('🔧 DEBUG: MainWindow assigned to global scope');

        // Show the window once it's ready
        mainWindow.once('ready-to-show', () => {
            console.log('🔧 DEBUG: Window ready-to-show event fired');
            mainWindow?.show();
            mainWindow?.focus();
            console.log('🔧 DEBUG: Window shown and focused');

            // Auto-open DevTools in development mode
            if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
                console.log('🔧 DEBUG: Opening DevTools automatically in development mode');
                mainWindow?.webContents.openDevTools({ mode: 'detach' });
            }
        });

        // Load content
        if (process.env.NODE_ENV === 'development') {
            console.log('🔧 DEBUG: Checking dev server...');
            const serverReady = await waitForDevServer();
            if (serverReady) {
                console.log('🔧 DEBUG: Loading from dev server at http://localhost:3004');
                await mainWindow.loadURL('http://localhost:3004');
            } else {
                console.log('🔧 DEBUG: Dev server not ready, loading static file');
                await mainWindow.loadFile(path.join(__dirname, './renderer/index.html'));
            }
        } else {
            console.log('🔧 DEBUG: Loading static file for production');
            await mainWindow.loadFile(path.join(__dirname, './renderer/index.html'));
        }

        console.log('🔧 DEBUG: Content loading initiated');

        // Log loading events
        mainWindow.webContents.on('did-finish-load', () => {
            console.log('🔧 DEBUG: Window content finished loading successfully');
        });

        mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
            console.error('🔧 DEBUG: Window failed to load:', errorCode, errorDescription);
        });

        // Simple close handling
        mainWindow.on('close', (event: Electron.Event) => {
            if (!(app as any).quitting) {
                event.preventDefault();
                mainWindow?.hide();
            }
        });

        console.log('🔧 DEBUG: Window setup complete');

    } catch (error) {
        console.error('🚨 DEBUG: Error creating window:', error);
        throw error;
    }
};

const createTray = async (): Promise<void> => {
    // Determine platform-appropriate icon format
    const getTrayIcon = (): string | NativeImage => {
        const fs = require('fs');

        // Helper function to find icon with fallback path resolution
        const findIconPath = (iconName: string): string => {
            // Try different possible locations for assets
            const possiblePaths = [
                path.join(process.cwd(), 'src/renderer/assets/icons/', iconName),  // Source directory
                path.join(__dirname, '../renderer/assets/icons/', iconName),       // Relative to compiled main
                path.join(__dirname, '../../src/renderer/assets/icons/', iconName), // From dist directory
                path.join(process.cwd(), 'renderer/assets/icons/', iconName),       // Production build
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
            // Use Cindy tray icons instead of generic tray-icon.png
            const iconPath = path.join(process.cwd(), 'assets/icons/cindy-tray-16.png');

            try {
                const icon = nativeImage.createFromPath(iconPath);
                if (icon.isEmpty()) {
                    throw new Error('Loaded image is empty');
                }
                const { width, height } = icon.getSize();
                if (width < 16 || height < 16) {
                    console.warn(`Icon too small (${width}x${height}), using fallback`);
                    const fallbackPath = path.join(process.cwd(), 'assets/icons/cindy-tray-32.png');
                    const fallbackIcon = nativeImage.createFromPath(fallbackPath).resize({ width: 16, height: 16 });
                    fallbackIcon.setTemplateImage(true);
                    return fallbackIcon;
                }
                const resizedIcon = icon.resize({ width: 16, height: 16 });
                resizedIcon.setTemplateImage(true);
                return resizedIcon;
            } catch (error) {
                console.error('Tray icon error:', error);
                const fallbackPath = path.join(process.cwd(), 'assets/icons/cindy-tray-32.png');
                const smallIcon = nativeImage.createFromPath(fallbackPath).resize({ width: 16, height: 16 });
                smallIcon.setTemplateImage(true);
                return smallIcon;
            }
        } else {
            // Linux and other platforms
            return path.join(process.cwd(), 'assets/icons/cindy-tray-32.png');
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
    debugger;
    // Initialize desktopCapturer IPC handler first
    ipcMain.handle(IPC_CHANNELS.GET_DESKTOP_AUDIO_SOURCES, async () => {
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

    // Test SettingsService initialization
    console.log('🔧 DEBUG: Testing SettingsService initialization');

    // Initialize SettingsService
    if (!settingsService) {
        try {
            console.log('🔧 DEBUG: Initializing SettingsService...');
            settingsService = new DuckDBSettingsService();
            await settingsService.initialize();
            console.log('🔧 DEBUG: SettingsService initialized successfully');
        } catch (error) {
            console.error('🚨 DEBUG: Failed to initialize SettingsService:', error);
            console.error('🚨 DEBUG: Error stack:', error.stack);
            // Continue without settings service for now
        }
    }

    // Set up IPC handlers for settings service methods BEFORE creating window
    // This ensures IPC is ready when renderer process loads
    console.log('🔧 DEBUG: Setting up IPC handlers before window creation');
    setupSettingsIPC();
    setupDatabaseIPC();
    setupTTSIPC();
    setupConnectorIPC();

    // Skip LLM services for now - will initialize them later
    console.log('🔧 DEBUG: Skipping LLM services initialization for startup speed');

    // Initialize ChatStorageService
    if (!chatStorageService) {
        try {
            console.log('🔧 DEBUG: Initializing ChatStorageService...');
            chatStorageService = new ChatStorageService();
            await chatStorageService.initialize();
            console.log('🔧 DEBUG: ChatStorageService initialized successfully');
        } catch (error) {
            console.error('🚨 DEBUG: Failed to initialize ChatStorageService:', error);
            // Continue without chat storage for now
        }
    }


    // Initialize SpeechToTextService for audio transcription
    if (!speechToTextService) {
        try {
            console.log('🔧 DEBUG: Initializing SpeechToTextService...');
            const voiceSettings = (await settingsService?.get('voice') || {}) as any;
            const sttConfig = {
                provider: voiceSettings.sttProvider || 'auto',
                language: 'en-US',
                autoPunctuation: true,
                profanityFilter: false,
                offlineModel: 'base' as const
            };
            speechToTextService = new SpeechToTextService(sttConfig);
            console.log('🔧 DEBUG: SpeechToTextService initialized successfully');
        } catch (error) {
            console.error('🚨 DEBUG: Failed to initialize SpeechToTextService:', error);
        }
    }

    // Initialize TextToSpeechService with voice settings
    if (!textToSpeechService) {
        try {
            console.log('🔧 DEBUG: Initializing TextToSpeechService...');
            const voiceSettings = (await settingsService?.get('voice') || {}) as any;
            console.log('🔧 DEBUG: Loaded voice settings:', JSON.stringify(voiceSettings, null, 2));

            // Handle 'auto' ttsProvider - AUTO MIGRATE TO KOKORO (local AI TTS) 
            let selectedProvider = voiceSettings.ttsProvider || 'auto';
            console.log('🔧 DEBUG: Initial TTS provider from settings:', selectedProvider);

            // Validate provider - only kokoro is supported
            if (selectedProvider !== 'kokoro') {
                console.warn(`🔧 WARNING: Unsupported TTS provider "${selectedProvider}", auto-migrating to kokoro`);
                selectedProvider = 'kokoro';
                // Update settings to persist the change
                if (settingsService) {
                    try {
                        const updatedVoiceSettings = { ...voiceSettings, ttsProvider: 'kokoro' };
                        await settingsService.set('voice', updatedVoiceSettings);
                        console.log('🔧 DEBUG: Settings updated to kokoro provider');
                    } catch (settingsError) {
                        console.warn('Failed to update TTS provider setting:', settingsError);
                    }
                }
            }

            console.log('🔧 DEBUG: Final TTS provider for initialization:', selectedProvider);

            const ttsConfig = {
                provider: selectedProvider as 'kokoro',
                enableStreaming: voiceSettings.enableStreaming !== false, // Default to true for micro-streaming
                // Kokoro options
                kokoroVoice: voiceSettings.kokoroVoice || 'af_sky',
            };
            textToSpeechService = new TextToSpeechService(ttsConfig);
            // Don't initialize now - will initialize lazily on first use to avoid memory issues
            console.log('🔧 DEBUG: TextToSpeechService created with provider:', selectedProvider);
        } catch (error) {
            console.error('🚨 DEBUG: Failed to create TextToSpeechService:', error);
            // Don't block app startup if TTS fails
            textToSpeechService = null;
        }
    }

    // Initialize LinkPreviewService
    if (!linkPreviewService) {
        try {
            console.log('🔧 DEBUG: Initializing LinkPreviewService...');
            linkPreviewService = new LinkPreviewService();
            console.log('🔧 DEBUG: LinkPreviewService initialized successfully');
        } catch (error) {
            console.error('🚨 DEBUG: Failed to initialize LinkPreviewService:', error);
            // Continue without link preview service
            linkPreviewService = null;
        }
    }

    // Initialize ConnectorManagerService
    if (!connectorManagerService) {
        try {
            console.log('🔧 DEBUG: Initializing ConnectorManagerService...');
            connectorManagerService = new ConnectorManagerService();
            await connectorManagerService.initialize();
            console.log('🔧 DEBUG: ConnectorManagerService initialized successfully');
        } catch (error) {
            console.error('🚨 DEBUG: Failed to initialize ConnectorManagerService:', error);
            // Continue without connector manager service
            connectorManagerService = null;
        }
    }

    // Initialize ServiceManager for dynamic loading of heavy services
    serviceManager = new ServiceManager(settingsService, llmProvider);
    console.log('🔧 DEBUG: ServiceManager initialized for dynamic service loading');

    // Initialize tools immediately to ensure maps tool is available
    setTimeout(async () => {
        try {
            console.log('🔧 DEBUG: Early tool initialization...');

            // Get connected connectors for tool loading
            const connectors = connectorManagerService?.getConnectedConnectors() || {};
            console.log('🔧 DEBUG: Connected connectors for tool loading:', Object.keys(connectors));
            const llmSettings = settingsService.settings.database
            const databasePath = llmSettings.path
            const appDataPath = app.getPath('userData')

            duckDBVectorStore = await createDuckDBVectorStore(databasePath, llmSettings, appDataPath);
            await duckDBVectorStore.initialize();
            console.log('🔧 DEBUG: DuckDBVectorStore initialized for tool loading');
            await serviceManager?.initializeTools(duckDBVectorStore, connectors);
            console.log('✅ DEBUG: Early tool initialization completed');
        } catch (error) {
            console.error('❌ DEBUG: Early tool initialization failed:', error);
        }
    }, 1000);

    // Skip speech and wake word services for testing
    console.log('🔧 DEBUG: Minimal services initialization completed');







    // IPC handler for getting available LLM models
    ipcMain.handle(IPC_CHANNELS.LLM_GET_AVAILABLE_MODELS, async () => {
        console.log('Main process - llm:get-available-models IPC called');
        if (!llmProvider) {
            console.error('Main process - llm:get-available-models: llmRouterService not available');
            return { success: false, error: 'LLM Router service not available' };
        }
        try {
            console.log('Main process - llm:get-available-models: calling llmRouterService.getAvailableModels()');
            const models = await llmProvider.getAvailableModels();
            console.log('Main process - llm:get-available-models: successfully retrieved models');
            return { success: true, models };
        } catch (error) {
            console.error('Main process - llm:get-available-models: error retrieving models:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    });

    // IPC handler for testing LLM connections
    ipcMain.handle(IPC_CHANNELS.LLM_TEST_CONNECTION, async () => {
        console.log('Main process - llm:test-connection IPC called');
        if (!llmProvider) {
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
            // Get connection status from the unified provider
            const connectionStatus = llmProvider.getConnectionStatus();
            const openaiConnected = connectionStatus.openai;
            const ollamaConnected = connectionStatus.ollama;

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

    // IPC handler for full indexing (database + notes) - simplified version
    ipcMain.handle(IPC_CHANNELS.START_FULL_INDEXING, async (_, databasePath: string, notesPath?: string) => {
        console.log('[IPC] Full indexing called - Database:', databasePath, 'Notes:', notesPath);

        const fs = require('fs');

        if (!databasePath) {
            return { success: false, message: 'Database path is required' };
        }

        // Validate database directory exists
        if (!fs.existsSync(databasePath)) {
            return { success: false, message: 'Database directory does not exist' };
        }

        try {
            // Create a new vector store instance for indexing if global one doesn't exist
            let vectorStore = duckDBVectorStore;

            if (!vectorStore) {
                console.log('[IPC] Creating new DuckDB vector store for indexing...');

                // Get current LLM settings to determine embedding provider
                const llmSettings = await settingsService?.get('llm') || { provider: 'ollama' };
                const provider = llmSettings.provider || 'ollama';

                // Create vector store config based on provider
                let vectorStoreConfig: any = {
                    databasePath: path.join(databasePath, '.vector_store', 'duckdb_vectors.db')
                };

                if (provider === 'ollama') {
                    vectorStoreConfig.embeddingProvider = 'ollama';
                    vectorStoreConfig.embeddingModel = 'granite-embedding:278m'; // Smallest Qwen model
                    vectorStoreConfig.ollamaBaseUrl = 'http://localhost:11435';
                    console.log('[IPC] Using Ollama embeddings with smallest Qwen model (0.5b)');
                } else if (provider === 'openai') {
                    const openaiApiKey = await settingsService?.getApiKey();
                    if (openaiApiKey) {
                        vectorStoreConfig.embeddingProvider = 'openai';
                        vectorStoreConfig.openaiApiKey = openaiApiKey;
                        vectorStoreConfig.embeddingModel = 'text-embedding-3-small';
                        console.log('[IPC] Using OpenAI embeddings');
                    } else {
                        // Fall back to Ollama if no OpenAI key
                        vectorStoreConfig.embeddingProvider = 'ollama';
                        vectorStoreConfig.embeddingModel = 'granite-embedding:278m';
                        vectorStoreConfig.ollamaBaseUrl = 'http://localhost:11435';
                        console.log('[IPC] No OpenAI API key, falling back to Ollama with smallest Qwen model');
                    }
                } else {
                    // Default to Ollama with smallest Qwen model
                    vectorStoreConfig.embeddingProvider = 'ollama';
                    vectorStoreConfig.embeddingModel = 'granite-embedding:278m';
                    vectorStoreConfig.ollamaBaseUrl = 'http://localhost:11435';
                    console.log('[IPC] Using default Ollama embeddings with smallest Qwen model');
                }

                vectorStore = await createDuckDBVectorStore(vectorStoreConfig.databasePath, vectorStoreConfig);

                // Assign to global variable so IPC handlers can access it
                duckDBVectorStore = vectorStore;

                await vectorStore.initialize();

                // Set up progress event forwarding
                vectorStore.on('progress', (data) => {
                    console.log('[IPC] Full indexing progress event:', data);
                    if (mainWindow) {
                        mainWindow.webContents.send('vector-store:indexing-progress', data);
                    }
                });

                vectorStore.on('indexingCompleted', (data) => {
                    console.log('[IPC] Full indexing completed event:', data);
                    if (mainWindow) {
                        mainWindow.webContents.send('vector-store:indexing-completed', data);
                    }
                });

                // Update global reference
                duckDBVectorStore = vectorStore;
                console.log('[IPC] DuckDB vector store initialized for indexing');
            }

            let totalIndexed = 0;
            let totalErrors = 0;

            // Index database directory first
            console.log('[IPC] Indexing database directory:', databasePath);
            const dbResult = await vectorStore.indexFolder(databasePath);
            totalIndexed += dbResult.success;
            totalErrors += dbResult.errors;

            // Index notes directory if provided
            if (notesPath && notesPath.trim() && fs.existsSync(notesPath)) {
                console.log('[IPC] Indexing notes directory:', notesPath);
                const notesResult = await vectorStore.indexFolder(notesPath);
                totalIndexed += notesResult.success;
                totalErrors += notesResult.errors;
            }

            return {
                success: true,
                message: `Full indexing completed. ${totalIndexed} files indexed, ${totalErrors} errors.`,
                indexed: totalIndexed,
                errors: totalErrors
            };
        } catch (error) {
            console.error('[IPC] Full indexing error:', error);
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    });

    // IPC handlers for Ollama model management
    ipcMain.handle(IPC_CHANNELS.OLLAMA_LIST_MODELS, async () => {
        console.log('Main process - ollama-list-models IPC called');
        try {
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);

            const result = await execAsync('ollama list');
            const output = result.stdout;

            // Parse the output to extract model names
            const lines = output.split('\n').filter((line: string) => line.trim() && !line.startsWith('NAME'));
            const models = lines.map((line: string) => {
                const parts = line.trim().split(/\s+/);
                return parts[0]; // First column is the model name
            }).filter((name: string) => name);

            console.log('Main process - ollama-list-models: found models:', models);
            return models;
        } catch (error) {
            console.error('Main process - ollama-list-models error:', error);
            return [];
        }
    });

    ipcMain.handle(IPC_CHANNELS.OLLAMA_PULL_MODEL, async (_, modelName: string) => {
        console.log('Main process - ollama-pull-model IPC called for model:', modelName);
        try {
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);

            // Pull the model with timeout
            await execAsync(`ollama pull ${modelName}`, { timeout: 600000 }); // 10 minute timeout

            console.log('Main process - ollama-pull-model: successfully pulled model:', modelName);
            return { success: true };
        } catch (error) {
            console.error('Main process - ollama-pull-model error:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    });

    ipcMain.handle(IPC_CHANNELS.OLLAMA_REMOVE_MODEL, async (_, modelName: string) => {
        console.log('Main process - ollama-remove-model IPC called for model:', modelName);
        try {
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);

            await execAsync(`ollama rm ${modelName}`);

            console.log('Main process - ollama-remove-model: successfully removed model:', modelName);
            return { success: true };
        } catch (error) {
            console.error('Main process - ollama-remove-model error:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    });

    // IPC handlers for real-time transcription
    ipcMain.handle(IPC_CHANNELS.START_REAL_TIME_TRANSCRIPTION, async () => {
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

    ipcMain.handle(IPC_CHANNELS.STOP_REAL_TIME_TRANSCRIPTION, async () => {
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
    ipcMain.handle(IPC_CHANNELS.START_RECORDING, async () => {
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
    ipcMain.handle(IPC_CHANNELS.STOP_RECORDING, async () => {
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
    ipcMain.handle(IPC_CHANNELS.TRANSCRIBE_AUDIO, async (event, audioData: Int16Array[] | ArrayBuffer) => {
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

    // Extracted initialization logic that can be called from both IPC and background
    async function initializeLLMServices(): Promise<{ success: boolean; message: string }> {
        console.log('🔧 DEBUG: initializeLLMServices() called');
        console.log('🔧 DEBUG: Current duckDBVectorStore status:', !!duckDBVectorStore);
        console.log('🔧 DEBUG: Current duckDBVectorStore type:', duckDBVectorStore?.constructor?.name);
        console.log('🔧 DEBUG: Current duckDBVectorStore has initialize method:', typeof duckDBVectorStore?.initialize === 'function');

        try {
            // Track whether this is a reinitialization
            let wasReinitialization = false;

            // If LLM provider already exists, we need to reinitialize it with new settings
            if (llmProvider) {
                console.log('Main process - LLM provider exists, reinitializing with updated settings');
                llmProvider = null; // Reset the provider to force reinitialization
                wasReinitialization = true;
            }

            if (!settingsService) {
                return { success: false, message: 'Settings service not available' };
            }

            const settings = await settingsService.get('llm');
            const selectedProvider = settings.provider || 'ollama';
            let apiKey = await settingsService.getApiKey();

            // Fallback: if no API key in keychain but there's one in settings, use it
            if (!apiKey && settings.openai?.apiKey && settings.openai.apiKey !== '***') {
                console.log('🔧 DEBUG: No API key in keychain, but found in settings - using settings API key');
                apiKey = settings.openai.apiKey;
            }

            // For non-OpenAI providers, check their settings for API keys
            if (!apiKey && selectedProvider !== 'openai' && selectedProvider !== 'ollama') {
                const providerSettings = (settings as any)[selectedProvider];
                if (providerSettings?.apiKey && providerSettings.apiKey !== '***') {
                    console.log(`🔧 DEBUG: Using API key from ${selectedProvider} settings`);
                    apiKey = providerSettings.apiKey;
                }
            }

            // Check if API key is required for the selected provider
            const providersRequiringApiKey = ['openai', 'anthropic', 'openrouter', 'groq', 'google', 'cohere', 'azure', 'huggingface'];

            console.log(`🔧 DEBUG: Provider ${selectedProvider}, API key available: ${apiKey ? 'Yes (' + apiKey.length + ' chars)' : 'No'}`);

            if (providersRequiringApiKey.includes(selectedProvider) && !apiKey) {
                return { success: false, message: `API key is required for ${selectedProvider} provider` };
            }

            const llmConfig = {
                provider: settings.provider || 'ollama',
                openai: settings.openai ? {
                    ...settings.openai,
                    apiKey: apiKey,
                    maxTokens: settings.openai.maxTokens || 1500
                } : undefined,
                ollama: settings.ollama || {
                    model: 'llama3:8b',
                    baseUrl: 'http://127.0.0.1:11435',
                    temperature: 0.7
                },
                anthropic: (settings as any).anthropic,
                openrouter: (settings as any).openrouter,
                groq: (settings as any).groq,
                google: (settings as any).google,
                cohere: (settings as any).cohere,
                azure: (settings as any).azure,
                huggingface: (settings as any).huggingface,
                streaming: true,
                timeout: 15000
            };

            // Initialize LangChain services using ServiceManager (dynamic loading)
            console.log('🔧 DEBUG: Initializing LangChain services with ServiceManager');

            if (!serviceManager) {
                return { success: false, message: 'Service manager not available' };
            }

            // Update ServiceManager with current providers
            serviceManager.updateCoreServices(settingsService, llmProvider);

            // Ensure vector store is available for tool registration
            if (!duckDBVectorStore) {
                try {
                    console.log('🔧 DEBUG: Initializing DuckDB vector store for tool registration...');

                    // Get database path from settings, with fallback to default
                    const settingsData = await settingsService?.getAll();
                    let databasePath = settingsData?.database?.path;

                    // If no database path configured, use default app data directory
                    if (!databasePath) {
                        const { app } = require('electron');
                        databasePath = path.join(app.getPath('userData'), 'default-database');
                        console.log('🔧 DEBUG: No database path configured, using default:', databasePath);
                    }

                    // Get current LLM settings to determine embedding provider
                    const llmSettings = settingsData?.llm || { provider: 'ollama' };
                    const provider = llmSettings.provider || 'ollama';

                    // Create vector store config based on provider
                    let vectorStoreConfig: any = {
                        databasePath: path.join(databasePath, '.vector_store', 'duckdb_vectors.db')
                    };

                    if (provider === 'ollama') {
                        vectorStoreConfig.embeddingProvider = 'ollama';
                        vectorStoreConfig.embeddingModel = 'granite-embedding:278m';
                        vectorStoreConfig.ollamaBaseUrl = 'http://localhost:11435';
                        console.log('[DEBUG] Using Ollama embeddings for tool registration');
                    } else if (provider === 'openai') {
                        const openaiApiKey = await settingsService?.getApiKey();
                        if (openaiApiKey) {
                            vectorStoreConfig.embeddingProvider = 'openai';
                            vectorStoreConfig.openaiApiKey = openaiApiKey;
                            vectorStoreConfig.embeddingModel = 'text-embedding-3-small';
                            console.log('[DEBUG] Using OpenAI embeddings for tool registration');
                        } else {
                            // Fall back to Ollama if no OpenAI key
                            vectorStoreConfig.embeddingProvider = 'ollama';
                            vectorStoreConfig.embeddingModel = 'granite-embedding:278m';
                            vectorStoreConfig.ollamaBaseUrl = 'http://localhost:11435';
                            console.log('[DEBUG] No OpenAI API key, using Ollama for tool registration');
                        }
                    } else {
                        // Default to Ollama
                        vectorStoreConfig.embeddingProvider = 'ollama';
                        vectorStoreConfig.embeddingModel = 'granite-embedding:278m';
                        vectorStoreConfig.ollamaBaseUrl = 'http://localhost:11435';
                        console.log('[DEBUG] Using default Ollama embeddings for tool registration');
                    }

                    console.log('🔧 DEBUG: Vector store config:', {
                        databasePath: vectorStoreConfig.databasePath,
                        embeddingProvider: vectorStoreConfig.embeddingProvider,
                        embeddingModel: vectorStoreConfig.embeddingModel
                    });

                    // Create the vector store for tool registration
                    duckDBVectorStore = await createDuckDBVectorStore(vectorStoreConfig.databasePath, vectorStoreConfig, "/Users/karwo09/code/voice-assistant/data/appDataPathTest");
                    await duckDBVectorStore.initialize();
                    console.log('✅ DEBUG: DuckDB vector store initialized for tool registration');
                } catch (vectorStoreError) {
                    console.error('❌ DEBUG: Failed to initialize vector store for tool registration:', vectorStoreError);
                    console.error('❌ DEBUG: Vector store error details:', vectorStoreError.message);
                    console.error('❌ DEBUG: Vector store error stack:', vectorStoreError.stack);
                    duckDBVectorStore = null;
                }
            }

            try {
                console.log('🔧 DEBUG: Initializing tools via ServiceManager ToolRegistry');
                console.log('🔧 DEBUG: DuckDB vector store available:', !!duckDBVectorStore);
                console.log('🔧 DEBUG: Vector store being passed to ServiceManager:', {
                    exists: !!duckDBVectorStore,
                    type: duckDBVectorStore?.constructor?.name,
                    hasInitialize: typeof duckDBVectorStore?.initialize === 'function'
                });
                toolRegistry = await serviceManager.getToolRegistry(duckDBVectorStore);
                console.log('✅ DEBUG: ToolRegistry initialized successfully');
            } catch (toolRegistryError) {
                console.error('❌ DEBUG: Failed to initialize ToolRegistry:', toolRegistryError);
                console.error('Continuing without tool registry');
                toolRegistry = null;
            }

            try {
                console.log('🔧 DEBUG: Loading LangChain MemoryService via ServiceManager');
                langChainMemoryService = await serviceManager.getMemoryService();
                console.log('✅ DEBUG: LangChain MemoryService loaded successfully');
            } catch (memoryServiceError) {
                console.error('❌ DEBUG: Failed to load LangChain MemoryService:', memoryServiceError);
                console.error('Continuing without memory service');
                langChainMemoryService = null;
            }

            try {
                console.log('🔧 DEBUG: Creating LLM Provider');
                console.log('🔧 DEBUG: LLM Config OpenAI API Key:', llmConfig.openai?.apiKey ? 'Yes (' + llmConfig.openai.apiKey.length + ' chars)' : 'No');
                llmProvider = new LLMProvider(llmConfig);

                console.log('🔧 DEBUG: Initializing LLM Provider');
                await llmProvider.initialize();
                console.log('✅ DEBUG: LLM Provider initialized successfully');

                // Update ServiceManager with the new LLM provider
                console.log('🔧 DEBUG: Updating ServiceManager with initialized LLM Provider');
                serviceManager.updateCoreServices(settingsService, llmProvider);
            } catch (llmProviderError) {
                console.error('❌ DEBUG: Failed to initialize LLM Provider:', llmProviderError);
                return { success: false, message: `LLM Provider initialization failed: ${llmProviderError.message}` };
            }

            // Initialize Cindy Agent after LLM and tools are ready (with error handling)
            try {
                if (!langChainCindyAgent && langChainMemoryService && toolRegistry && llmProvider) {
                    console.log('🔧 DEBUG: Loading LangChain CindyAgent via ServiceManager');
                    langChainCindyAgent = await serviceManager.getCindyAgent(duckDBVectorStore);
                    console.log('✅ DEBUG: LangChain CindyAgent loaded successfully');
                } else {
                    console.warn('⚠️ DEBUG: Skipping Cindy Agent - required services not available');
                    console.warn(`Memory service: ${!!langChainMemoryService}, Tool registry: ${!!toolRegistry}, LLM: ${!!llmProvider}`);
                }
            } catch (agentError) {
                console.error('❌ DEBUG: Failed to load Cindy Agent:', agentError);
                console.error('Continuing without Cindy Agent');
                langChainCindyAgent = null;
            }

            // Attach tools to the LLM for automatic tool calling (with error handling)
            try {
                if (serviceManager && llmProvider) {
                    console.log('🔧 DEBUG: Attaching tools to LLM model');
                    const tools = await serviceManager.getToolsForAgent(duckDBVectorStore);
                    console.log(`🔧 DEBUG: Found ${tools.length} tools:`, tools.map(t => t.name));

                    const modelWithTools = llmProvider.withTools(tools);
                    if (modelWithTools) {
                        console.log('✅ DEBUG: Tools successfully attached to LLM model');
                    } else {
                        console.warn('⚠️ DEBUG: Failed to attach tools - model may not support tool binding');
                    }
                } else {
                    console.warn('⚠️ DEBUG: ServiceManager or LLM provider not available, skipping tool attachment');
                }
            } catch (toolAttachmentError) {
                console.error('❌ DEBUG: Failed to attach tools to LLM:', toolAttachmentError);
                console.error('Continuing without tool attachment');
            }

            const action = wasReinitialization ? 'reinitialized' : 'initialized';
            console.log(`✅ DEBUG: LLM service ${action} successfully`);
            return { success: true, message: `LLM service ${action} successfully with provider: ${llmConfig.provider}` };

        } catch (error) {
            console.error('🚨 DEBUG: LLM initialization failed:', error);
            return { success: false, message: `Failed to initialize: ${error.message}` };
        }
    }

    // IPC handler for manually initializing LLM services
    ipcMain.handle(IPC_CHANNELS.INITIALIZE_LLM, async () => {
        console.log('Main process - initialize-llm IPC called');
        return await initializeLLMServices();
    });

    // IPC handler for immediate LLM provider switching (bypasses async persistence)
    ipcMain.handle(IPC_CHANNELS.UPDATE_LLM_PROVIDER, async (event, providerConfig) => {
        console.log('Main process - update-llm-provider IPC called with:', providerConfig);

        try {
            if (!settingsService) {
                return { success: false, message: 'Settings service not available' };
            }

            // Get existing LLM settings to preserve them
            console.log('🔧 DEBUG: Getting existing LLM settings to preserve configurations');
            const existingLlmSettings = await settingsService.get('llm');
            console.log('🔧 DEBUG: Existing LLM settings:', Object.keys(existingLlmSettings || {}));

            // Merge configurations more safely using dynamic approach
            const updatedConfig: any = {
                ...existingLlmSettings,
                ...providerConfig,
            };

            // Preserve individual provider configurations by merging them
            const providerKeys = ['openai', 'anthropic', 'openrouter', 'groq', 'google', 'cohere', 'azure', 'huggingface', 'ollama'];
            providerKeys.forEach(key => {
                if (existingLlmSettings && (existingLlmSettings as any)[key]) {
                    updatedConfig[key] = {
                        ...(existingLlmSettings as any)[key],
                        ...(providerConfig && (providerConfig as any)[key])
                    };
                } else if (providerConfig && (providerConfig as any)[key]) {
                    updatedConfig[key] = (providerConfig as any)[key];
                }
            });

            console.log('🔧 DEBUG: Updating LLM settings with preserved configurations');
            console.log('🔧 DEBUG: Provider switching from', existingLlmSettings?.provider, 'to', providerConfig.provider);

            await settingsService.set('llm', updatedConfig);

            // Force immediate LLM reinitialization with new settings
            console.log('🔧 DEBUG: Forcing immediate LLM reinitialization');
            const initResult = await initializeLLMServices();

            if (initResult.success) {
                console.log('✅ DEBUG: Provider switched successfully to:', providerConfig.provider);
                return {
                    success: true,
                    message: `Provider switched to ${providerConfig.provider}`,
                    activeProvider: llmProvider?.getCurrentProvider()
                };
            } else {
                return initResult;
            }

        } catch (error) {
            console.error('❌ DEBUG: Failed to switch provider:', error);
            return { success: false, message: `Provider switch failed: ${error.message}` };
        }
    });

    // Flow tracking helper function
    const emitFlowEvent = (type: string, data: any) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('agent-flow-event', { type, data });
        }
    };

    // Make flow emitter globally available
    (global as any).emitFlowEvent = emitFlowEvent;

    // IPC handler for processing messages with streaming
    ipcMain.handle(IPC_CHANNELS.PROCESS_MESSAGE, async (event, message: string, conversationId: string): Promise<string> => {
        console.log('Main process - process-message IPC called with:', message);

        // Save user message to backend storage (frontend already shows it immediately)
        if (chatStorageService) {
            try {
                const userMessage = {
                    conversationId,
                    role: 'user' as const,
                    content: message,
                    timestamp: Date.now()
                };
                await chatStorageService.saveMessage(userMessage);
                console.log('🔧 DEBUG: User message saved to backend storage');
                // NOTE: No longer emitting to frontend - frontend adds message immediately for better UX
            } catch (saveError) {
                console.error('🚨 DEBUG: Failed to persist user message at start:', saveError);
            }
        }

        try {
            // Check current settings and update LLM provider if needed

            if (settingsService) {
                const currentSettings = await settingsService.get('llm');
                const currentProvider = (currentSettings?.provider || 'ollama') as string;
                console.log('🔍 DEBUG: Current provider from settings:', currentProvider);

                // Check if we need to reinitialize the LLM provider with new settings
                // This ensures each message uses the currently selected provider
                if (llmProvider) {
                    const activeProvider = llmProvider.getCurrentProvider() || 'unknown';
                    console.log(`🔍 DEBUG: Provider check - Active: ${activeProvider}, Settings: ${currentProvider}`);

                    if (activeProvider !== currentProvider) {
                        console.log(`🔄 Provider mismatch detected! Active: ${activeProvider}, Settings: ${currentProvider}`);
                        console.log('🔄 Reinitializing LLM provider with current settings...');

                        // Reset and reinitialize the LLM provider
                        llmProvider = null;

                        // Reinitialize with current settings by calling the initialization logic directly
                        try {
                            // Get API key based on provider
                            let apiKeyForProvider = '';
                            if (currentProvider === 'openai') {
                                apiKeyForProvider = await settingsService.getApiKey();
                            } else if (currentProvider !== 'ollama') {
                                // For other providers, get the API key from their settings
                                apiKeyForProvider = (currentSettings as any)[currentProvider]?.apiKey || '';
                            }

                            // Check if API key is required for the selected provider
                            const providersRequiringApiKey = ['openai', 'anthropic', 'openrouter', 'groq', 'google', 'cohere', 'azure', 'huggingface'];

                            if (providersRequiringApiKey.includes(currentProvider) && !apiKeyForProvider) {
                                console.error(`API key is required for ${currentProvider} provider but not found`);
                            } else {
                                // Create LLM configuration from current settings
                                const llmConfig = {
                                    provider: currentProvider,
                                    openai: currentSettings.openai ? {
                                        ...currentSettings.openai,
                                        apiKey: currentProvider === 'openai' ? apiKeyForProvider : '',
                                        maxTokens: currentSettings.openai.maxTokens || 1500
                                    } : undefined,
                                    ollama: currentSettings.ollama || {
                                        model: 'llama3:8b',
                                        baseUrl: 'http://127.0.0.1:11435',
                                        temperature: 0.7
                                    },
                                    anthropic: (currentSettings as any).anthropic,
                                    openrouter: (currentSettings as any).openrouter,
                                    groq: (currentSettings as any).groq,
                                    google: (currentSettings as any).google,
                                    cohere: (currentSettings as any).cohere,
                                    azure: (currentSettings as any).azure,
                                    huggingface: (currentSettings as any).huggingface,
                                    streaming: true,
                                    timeout: 15000
                                };

                                // Create new LLM provider instance
                                const { LLMProvider } = require('./services/LLMProvider');
                                llmProvider = new LLMProvider(llmConfig);

                                // Initialize the new LLM provider
                                await llmProvider.initialize();

                                // Update ServiceManager with the new LLM provider
                                if (serviceManager) {
                                    console.log('🔄 Updating ServiceManager with new provider');
                                    serviceManager.updateCoreServices(settingsService, llmProvider);

                                    // Reinitialize Cindy Agent with the new provider
                                    if (langChainMemoryService && toolRegistry) {
                                        console.log('🔄 Reinitializing Cindy Agent with new provider');
                                        console.log('🔄 Clearing old Cindy Agent instance');
                                        langChainCindyAgent = null; // Clear old instance first
                                        try {
                                            langChainCindyAgent = await serviceManager.getCindyAgent(duckDBVectorStore);
                                            console.log('✅ Cindy Agent reinitialized with new provider');
                                        } catch (error) {
                                            console.error('❌ Failed to reinitialize Cindy Agent:', error);
                                        }
                                    } else {
                                        console.log('⚠️  Cannot reinitialize Cindy Agent - missing memory or tool services');
                                    }
                                }

                                console.log('✅ LLM provider reinitialized with:', currentProvider);

                                // Log the model being used for this provider
                                let modelForProvider = 'default';
                                if (currentProvider === 'openai' && llmConfig.openai) {
                                    modelForProvider = llmConfig.openai.model;
                                } else if (currentProvider === 'ollama' && llmConfig.ollama) {
                                    modelForProvider = llmConfig.ollama.model;
                                } else if (currentProvider === 'anthropic' && llmConfig.anthropic) {
                                    modelForProvider = llmConfig.anthropic.model;
                                } else if (currentProvider === 'google' && llmConfig.google) {
                                    modelForProvider = llmConfig.google.model;
                                } else if (currentProvider === 'groq' && llmConfig.groq) {
                                    modelForProvider = llmConfig.groq.model;
                                } else if (currentProvider === 'cohere' && llmConfig.cohere) {
                                    modelForProvider = llmConfig.cohere.model;
                                } else if (currentProvider === 'openrouter' && llmConfig.openrouter) {
                                    modelForProvider = llmConfig.openrouter.model;
                                } else if (currentProvider === 'huggingface' && llmConfig.huggingface) {
                                    modelForProvider = llmConfig.huggingface.model;
                                } else if (currentProvider === 'azure' && llmConfig.azure) {
                                    modelForProvider = llmConfig.azure.deploymentName;
                                }
                                console.log(`📝 Using model: ${modelForProvider} for provider: ${currentProvider}`);
                            }
                        } catch (error) {
                            console.error('Failed to reinitialize LLM provider:', error);
                        }
                    }
                } else {
                    console.log('🔍 DEBUG: llmProvider is null, skipping provider check');
                }
            } else {
                console.log('🔍 DEBUG: settingsService is null, skipping provider switching');
            }

            console.log('🔍 DEBUG: After provider switching - langChainCindyAgent:', !!langChainCindyAgent, 'llmProvider:', !!llmProvider);

            // Try to dynamically load Cindy Agent if not available, fallback to direct LLM
            if (!langChainCindyAgent && !llmProvider) {
                console.error('Main process - process-message: Neither Cindy Agent nor LLM provider initialized');

                // Try to initialize LLM provider now if we have settings
                if (settingsService) {
                    console.log('🔄 Attempting automatic LLM initialization...');
                    const llmSettings = await settingsService.get('llm');
                    const provider = llmSettings?.provider || 'ollama';

                    try {
                        // Get API key based on provider
                        let apiKeyForProvider = '';
                        if (provider === 'openai') {
                            apiKeyForProvider = await settingsService.getApiKey();
                        } else if (provider !== 'ollama' && llmSettings && (llmSettings as any)[provider]) {
                            apiKeyForProvider = (llmSettings as any)[provider]?.apiKey || '';
                        }

                        const providersRequiringApiKey = ['openai', 'anthropic', 'openrouter', 'groq', 'google', 'cohere', 'azure', 'huggingface'];

                        if (!providersRequiringApiKey.includes(provider) || apiKeyForProvider) {
                            // Create LLM configuration
                            const llmConfig = {
                                provider: provider,
                                openai: llmSettings?.openai ? {
                                    ...llmSettings.openai,
                                    apiKey: provider === 'openai' ? apiKeyForProvider : '',
                                    maxTokens: llmSettings.openai.maxTokens || 1500
                                } : undefined,
                                ollama: llmSettings?.ollama || {
                                    model: 'llama3:8b',
                                    baseUrl: 'http://127.0.0.1:11435',
                                    temperature: 0.7
                                },
                                anthropic: (llmSettings as any)?.anthropic,
                                openrouter: (llmSettings as any)?.openrouter,
                                groq: (llmSettings as any)?.groq,
                                google: (llmSettings as any)?.google,
                                cohere: (llmSettings as any)?.cohere,
                                azure: (llmSettings as any)?.azure,
                                huggingface: (llmSettings as any)?.huggingface,
                                streaming: true,
                                timeout: 15000
                            };

                            // Create new LLM provider instance
                            const { LLMProvider } = require('./services/LLMProvider');
                            llmProvider = new LLMProvider(llmConfig);
                            console.log('✅ LLM provider auto-initialized successfully');

                            // Continue processing with the newly initialized provider
                        }
                    } catch (initError) {
                        console.error('Failed to auto-initialize LLM provider:', initError);
                    }
                }
            }

            // Check again if we now have a provider after auto-initialization
            if (!langChainCindyAgent && !llmProvider) {
                console.error('Main process - process-message: Still no LLM provider after auto-init attempt');

                // User message already saved at start of handler

                // Check LLM settings and provider to give appropriate message
                const llmSettings = await settingsService?.get('llm');
                const provider = llmSettings?.provider || 'auto';

                let errorMessage;
                if (provider === 'ollama') {
                    errorMessage = "I'm starting up with Ollama... please wait about 10-15 seconds and try again! ⏳ This only happens on first use.";

                    // Trigger background initialization for Ollama
                    setImmediate(async () => {
                        try {
                            console.log('🔄 Starting background LLM initialization for Ollama...');
                            const result = await initializeLLMServices();
                            console.log('🔄 Background initialization result:', result);
                        } catch (error) {
                            console.error('🔄 Background initialization error:', error);
                        }
                    });
                } else if (provider === 'openai' || provider === 'auto') {
                    const apiKey = await settingsService?.getApiKey();
                    console.log(`🔍 DEBUG: Checking API key for ${provider} provider. Key found: ${apiKey ? 'Yes' : 'No'}`);
                    if (!apiKey) {
                        // Also check if there's an API key in the settings
                        const apiKeyInSettings = llmSettings?.openai?.apiKey;
                        console.log(`🔍 DEBUG: API key in settings: ${apiKeyInSettings ? 'Yes' : 'No'}`);

                        if (!apiKey && !apiKeyInSettings) {
                            errorMessage = "Hi! I need an OpenAI API key to chat with you. Please go to Settings → AI PROVIDERS and add your OpenAI API key, then I'll be ready to help! 🤖";
                        } else {
                            // Try to initialize the LLM provider now
                            console.log('🔄 Attempting to initialize LLM provider with available settings...');
                            errorMessage = "I'm initializing my AI services... please wait about 10-15 seconds and try again! ⏳ This only happens on first use.";

                            // Trigger background initialization
                            setImmediate(async () => {
                                try {
                                    console.log('🔄 Starting background LLM initialization...');
                                    const result = await initializeLLMServices();
                                    console.log('🔄 Background initialization result:', result);
                                } catch (error) {
                                    console.error('🔄 Background initialization error:', error);
                                }
                            });
                        }
                    } else {
                        errorMessage = "I'm still initializing my AI services... please wait about 10-15 seconds and try again! ⏳ This only happens on first use.";

                        // Trigger background initialization
                        setImmediate(async () => {
                            try {
                                console.log('🔄 Starting background LLM initialization for OpenAI/auto...');
                                const result = await initializeLLMServices();
                                console.log('🔄 Background initialization result:', result);
                            } catch (error) {
                                console.error('🔄 Background initialization error:', error);
                            }
                        });
                    }
                } else {
                    errorMessage = "I'm still initializing my AI services... please wait about 10-15 seconds and try again! ⏳ This only happens on first use.";

                    // Trigger background initialization for other providers
                    setImmediate(async () => {
                        try {
                            console.log(`🔄 Starting background LLM initialization for ${provider}...`);
                            const result = await initializeLLMServices();
                            console.log('🔄 Background initialization result:', result);
                        } catch (error) {
                            console.error('🔄 Background initialization error:', error);
                        }
                    });
                }

                // Send error message via streaming system so renderer receives it
                event.sender.send('stream-chunk', { chunk: errorMessage, conversationId });

                // Save assistant error message
                if (chatStorageService) {
                    try {
                        await chatStorageService.saveMessage({
                            conversationId,
                            role: 'assistant',
                            content: errorMessage,
                            timestamp: Date.now()
                        });
                        console.log('🔧 DEBUG: Error message persisted to ChatStorageService');
                    } catch (saveError) {
                        console.error('🚨 DEBUG: Failed to persist error message:', saveError);
                    }
                }

                console.log('🔧 DEBUG: Sending stream-complete event (error path) for conversation:', conversationId);
                event.sender.send('stream-complete', { conversationId });
                return errorMessage;
            }

            // Try to load Cindy Agent dynamically if not available but LLM is ready
            if (!langChainCindyAgent && llmProvider && serviceManager) {
                try {
                    console.log('Main process - attempting to load Cindy Agent dynamically for message processing');
                    serviceManager.updateCoreServices(settingsService, llmProvider);
                    langChainCindyAgent = await serviceManager.getCindyAgent(duckDBVectorStore);
                    console.log('Main process - Cindy Agent loaded dynamically');
                } catch (error) {
                    console.warn('Main process - failed to load Cindy Agent dynamically:', error.message);
                    // Continue without agent, will use direct LLM
                }
            }

            // User message already saved at start of handler

            // Prefer Cindy Agent if available, fallback to direct LLM
            if (langChainCindyAgent) {
                console.log('Main process - using Cindy Agent for intelligent processing');
                console.log('🔍 DEBUG: Cindy Agent LLM provider:', langChainCindyAgent['llmProvider']?.getCurrentProvider());

                // Build enhanced agent context with conversation history and memories
                let conversationHistory: any[] = [];
                let relevantMemories: any[] = [];

                // Get recent conversation history for context
                if (chatStorageService) {
                    try {
                        const history = await chatStorageService.getConversationHistory(conversationId);
                        // Get last 10 messages for context (5 exchanges)
                        conversationHistory = history.slice(-10).map(msg => ({
                            role: msg.role as 'system' | 'user' | 'assistant',
                            content: msg.content
                        }));
                        console.log('🔧 DEBUG: Loaded', conversationHistory.length, 'messages for context');
                    } catch (error) {
                        console.error('Failed to get conversation history:', error);
                    }
                }

                // Retrieve relevant memories from A-Mem
                if (agenticMemoryService) {
                    try {
                        relevantMemories = await agenticMemoryService.retrieveMemories(message, 5);
                        console.log('🧠 DEBUG: Retrieved', relevantMemories.length, 'relevant memories from A-Mem');

                        // Also add this message to memory for future retrieval
                        agenticMemoryService.addMemory(message, conversationId)
                            .then(memoryNote => {
                                console.log('🧠 DEBUG: User message added to A-Mem:', memoryNote.id);
                                // Emit memory saved event to frontend
                                event.sender.send('memory-saved', {
                                    type: 'user_message',
                                    conversationId,
                                    memory: {
                                        id: memoryNote.id,
                                        content: memoryNote.content,
                                        context: memoryNote.context,
                                        keywords: memoryNote.keywords,
                                        tags: memoryNote.tags,
                                        timestamp: memoryNote.timestamp,
                                        evolved: memoryNote.evolved,
                                        links: memoryNote.links
                                    }
                                });
                            })
                            .catch(err =>
                                console.error('Failed to add message to memory:', err)
                            );
                    } catch (error) {
                        console.error('Failed to retrieve memories:', error);
                    }
                }

                const agentContext = {
                    conversationId,
                    userId: undefined,
                    sessionId: conversationId,
                    timestamp: new Date(),
                    preferences: {}, // Could be loaded from settings if needed
                    conversationHistory, // Recent messages for follow-up context
                    relevantMemories, // Cross-chat memories from A-Mem
                    memoryContext: relevantMemories.map(m => m.context).join('\n') // Formatted memory context
                };

                let assistantContent = '';

                try {
                    // Set current conversation ID globally for tools to access
                    (global as any).currentConversationId = conversationId;

                    // Emit flow events for agent processing with context
                    const processingStep = generateStepDescription('PROCESSING_REQUEST', {
                        userQuery: message
                    });

                    emitFlowEvent('step-update', {
                        stepId: 'initial',
                        status: 'completed',
                        title: processingStep.title,
                        details: processingStep.description
                    });

                    const agentStep = generateStepDescription('AGENT_ROUTING', {
                        agentType: 'conversational'
                    });

                    emitFlowEvent('step-add', {
                        stepId: 'agent-processing',
                        title: agentStep.title,
                        details: agentStep.description
                    });

                    // Use streaming processing from the agent
                    for await (const chunk of langChainCindyAgent.processStreaming(message, agentContext)) {
                        // Handle structured action blocks
                        if (typeof chunk === 'object' && chunk !== null && 'stepId' in chunk) {
                            event.sender.send('agent-flow-event', {
                                type: 'step-update',
                                data: chunk
                            });
                            continue;
                        }

                        // Handle raw string chunks (LLM tokens, final content)
                        assistantContent += chunk;

                        // Filter out tool executions and internal data from user-facing content
                        const cleanChunk = filterInternalContent(chunk);

                        // Parse tool calls from chunk and emit tool execution updates (but don't include in user response)
                        const toolRegex = /<tool>(.*?)<\/tool>/gs;
                        let toolMatch;
                        while ((toolMatch = toolRegex.exec(chunk)) !== null) {
                            try {
                                const toolCallData = JSON.parse(toolMatch[1]);
                                console.log('🔧 DEBUG: Emitting tool execution update:', toolCallData);

                                // Check if this is a TodoWrite tool execution
                                if (toolCallData.function?.name === 'TodoWrite' || toolCallData.name === 'TodoWrite') {
                                    try {
                                        const todos = JSON.parse(toolCallData.function?.arguments || toolCallData.arguments || '{}').todos;
                                        if (todos && Array.isArray(todos)) {
                                            globalTodoListState = todos;
                                            console.log('📝 DEBUG: Updated global todo list state with', todos.length, 'todos');
                                            // Broadcast todo list update to frontend
                                            event.sender.send('todo-list:updated', {
                                                todos: todos,
                                                timestamp: new Date(),
                                                conversationId
                                            });
                                        }
                                    } catch (todoError) {
                                        console.error('🔧 DEBUG: Failed to parse TodoWrite arguments:', todoError);
                                    }
                                }

                                event.sender.send('tool-execution-update', {
                                    toolCall: toolCallData,
                                    conversationId
                                });
                            } catch (parseError) {
                                console.error('🔧 DEBUG: Failed to parse tool call JSON:', parseError);
                            }
                        }

                        // Only send clean chunk to user (no tool executions, todo lists, etc.)
                        if (cleanChunk.trim()) {
                            event.sender.send('stream-chunk', { chunk: cleanChunk, conversationId });
                        }
                    }

                    console.log('🔧 DEBUG: Sending stream-complete event for conversation:', conversationId);
                    event.sender.send('stream-complete', { conversationId });

                    // Save assistant message to backend storage
                    if (chatStorageService && assistantContent.trim()) {
                        try {
                            // Clean the final assistant content before saving
                            const cleanedContent = filterInternalContent(assistantContent);

                            const assistantMessage = {
                                conversationId,
                                role: 'assistant' as const,
                                content: cleanedContent,
                                timestamp: Date.now()
                            };
                            await chatStorageService.saveMessage(assistantMessage);
                            console.log('🔧 DEBUG: Assistant message saved to backend storage');
                        } catch (saveError) {
                            console.error('🚨 DEBUG: Failed to persist assistant message:', saveError);
                        }
                    }

                    // Add assistant response to A-Mem for future context
                    if (agenticMemoryService && assistantContent.trim()) {
                        try {
                            const memoryNote = await agenticMemoryService.addMemory(assistantContent, conversationId);
                            console.log('🧠 DEBUG: Assistant response added to A-Mem:', memoryNote.id);

                            // Emit memory saved event to frontend
                            event.sender.send('memory-saved', {
                                type: 'assistant_response',
                                conversationId,
                                memory: {
                                    id: memoryNote.id,
                                    content: memoryNote.content,
                                    context: memoryNote.context,
                                    keywords: memoryNote.keywords,
                                    tags: memoryNote.tags,
                                    timestamp: memoryNote.timestamp,
                                    evolved: memoryNote.evolved,
                                    links: memoryNote.links
                                }
                            });
                        } catch (memoryError) {
                            console.error('Failed to add assistant response to memory:', memoryError);
                        }
                    }

                    // Mark agent processing as complete
                    const completeStep = generateStepDescription('ANALYSIS_COMPLETE', {
                        outputLength: assistantContent.length
                    });

                    emitFlowEvent('step-update', {
                        stepId: 'agent-processing',
                        status: 'completed',
                        title: completeStep.title,
                        details: completeStep.description
                    });

                    return assistantContent;

                } catch (agentError) {
                    console.error('Cindy Agent failed, falling back to direct LLM:', agentError);
                    // Continue to fallback below
                }
            }

            console.log('Main process - using direct LangChain LLM router as fallback');

            // Fallback: Direct LLM processing (legacy behavior)
            // Get recent conversation history for context
            let conversationHistory: Array<{ role: 'system' | 'user' | 'assistant', content: string }> = [];
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

            // Process message through direct LLM
            const response = await llmProvider!.chat(conversationHistory);

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

            // Save assistant message to ChatStorageService (clean up thinking tokens first)
            if (chatStorageService && assistantContent.trim()) {
                try {

                    // Only save if there's actual content after cleaning
                    await chatStorageService.saveMessage({
                        conversationId,
                        role: 'assistant',
                        content: assistantContent,
                        timestamp: Date.now()
                    });
                    console.log('🔧 DEBUG: Assistant message persisted to ChatStorageService (cleaned)');

                } catch (saveError) {
                    console.error('🚨 DEBUG: Failed to persist assistant message:', saveError);
                }
            }

            console.log('🔧 DEBUG: Sending stream-complete event (fallback path) for conversation:', conversationId);
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

    // IPC handler for agent graph generation
    ipcMain.handle(IPC_CHANNELS.AGENT_MERMAID, async () => {
        console.log('Main process - agent:mermaid IPC called');
        try {
            // Check if LLM provider is available first
            if (!llmProvider || !serviceManager) {
                console.log('Main process - agent:mermaid: LLM provider not ready yet, showing initialization diagram');
                return `
graph TD
    Init[Application Starting] --> LLM[Initializing LLM Provider]
    LLM --> Agent[Loading LangGraph Agent]
    Agent --> Ready[Agent Ready]
    Ready --> Graph[Click Refresh to Load Agent Graph]
    
    style Init fill:#e1f5fe
    style LLM fill:#fff3e0
    style Agent fill:#e8f5e8
    style Ready fill:#f3e5f5
    style Graph fill:#fce4ec
`;
            }

            // Try to get the LangGraph agent from service manager
            let langChainCindyAgent;
            try {
                langChainCindyAgent = await serviceManager.getCindyAgent(duckDBVectorStore);
            } catch (error) {
                console.log('Main process - agent:mermaid: Agent not ready yet, error:', error.message);
                return `
graph TD
    Starting[Agent Initialization in Progress] --> Provider[LLM Provider: ${llmProvider?.getCurrentProvider() || 'Loading...'}]
    Provider --> Tools[Loading Tools & Services]
    Tools --> Memory[Initializing Memory Service]
    Memory --> AgentLoad[Loading LangGraph Agent]
    AgentLoad --> Complete[Click Refresh When Ready]
    
    Complete --> Note["The agent is still loading...\\nThis usually takes 10-30 seconds"]
    
    style Starting fill:#fff3e0
    style Provider fill:#e8f5e8
    style Tools fill:#e3f2fd
    style Memory fill:#f3e5f5
    style AgentLoad fill:#fce4ec
    style Complete fill:#e8f5e8
    style Note fill:#fff8e1
`;
            }

            if (!langChainCindyAgent) {
                console.warn('Main process - agent:mermaid: LangGraphAgent not available after initialization attempt');
                return `
graph TD
    Issue[Agent Loading Issue] --> Check[Check Application Logs]
    Check --> Retry[Click Refresh to Retry]
    Retry --> Settings[Verify LLM Settings]
    
    style Issue fill:#ffebee
    style Check fill:#fff3e0
    style Retry fill:#e8f5e8
    style Settings fill:#f3e5f5
`;
            }

            // Check if the agent has Deep Research integration with a graph
            const deepResearchIntegration = langChainCindyAgent.getDeepResearchIntegration();
            if (deepResearchIntegration) {
                try {
                    const deepResearchAgent = deepResearchIntegration.getDeepResearchAgent();
                    if (deepResearchAgent && deepResearchAgent.getMainGraph) {
                        const mainGraph = deepResearchAgent.getMainGraph();
                        if (mainGraph && mainGraph.get_graph) {
                            const graph = mainGraph.get_graph();
                            if (graph.drawMermaid) {
                                console.log('Main process - agent:mermaid: Using LangGraph mermaid generation');
                                const mermaidText = graph.drawMermaid({
                                    withStyles: true,
                                    curveStyle: 'linear',
                                    wrapLabelNWords: 9
                                });
                                return mermaidText;
                            }
                        }
                    }
                } catch (graphError) {
                    console.warn('Main process - agent:mermaid: Failed to get LangGraph mermaid, using fallback:', graphError.message);
                }
            }

            // Fallback: Generate a custom mermaid diagram based on the agent architecture
            console.log('Main process - agent:mermaid: Using fallback mermaid generation');
            const fallbackMermaid = `
graph TD
    Start([User Input]) --> Routing{LangGraph Agent}
    Routing --> |Research Query| DR[Deep Research System]
    Routing --> |Tool Usage| TA[Tool Agent]
    Routing --> |Direct Chat| LLM[Direct LLM Response]
    
    DR --> Clarify[Clarification Node]
    Clarify --> |Needs Info| UserInput[Ask User]
    Clarify --> |Clear Query| Research[Research Process]
    
    Research --> Supervisor[Supervisor Graph]
    Supervisor --> Delegate[Delegate Research]
    Delegate --> Researcher[Researcher Node]
    Researcher --> |Tool Execution| Tools[Search & Analysis Tools]
    Tools --> Researcher
    Researcher --> Supervisor
    Supervisor --> |Complete| Synthesis[Synthesis Node]
    
    TA --> ToolRegistry[Tool Registry]
    ToolRegistry --> SearchTools[Search Tools]
    ToolRegistry --> VectorTools[Vector Tools]  
    ToolRegistry --> WeatherTools[Weather Tools]
    ToolRegistry --> MapTools[Map Tools]
    ToolRegistry --> ConnectorTools[Connector Tools]
    
    Synthesis --> Response[Final Response]
    TA --> Response
    LLM --> Response
    UserInput --> Response
    Response --> End([End])
    
    style Start fill:#e1f5fe
    style End fill:#f3e5f5
    style DR fill:#e8f5e8
    style TA fill:#fff3e0
    style LLM fill:#fce4ec
    style Supervisor fill:#fff8e1
    style Researcher fill:#e0f2f1
    style Tools fill:#f1f8e9
    style Response fill:#fafafa
`;

            return fallbackMermaid;

        } catch (error) {
            console.error('Main process - agent:mermaid: Error generating mermaid:', error);
            // Return a basic error diagram
            return `
graph TD
    Error[Agent Graph Generation Failed] --> Message["${error.message}"]
    Message --> Retry[Try Reloading the Application]
    
    style Error fill:#ffebee
    style Message fill:#fff3e0
    style Retry fill:#e8f5e8
`;
        }
    });

    // IPC handler for creating conversations
    ipcMain.handle(IPC_CHANNELS.CREATE_CONVERSATION, async () => {
        console.log('Main process - create-conversation IPC called');
        try {
            if (!chatStorageService) {
                console.error('Main process - create-conversation: chatStorageService not available');
                return Date.now().toString(); // Fallback ID
            }

            const newId = await chatStorageService.createConversation();
            console.log('Main process - create-conversation: created new conversation with ID:', newId);
            return newId;
        } catch (error) {
            console.error('Main process - create-conversation: error creating conversation:', error);
            return Date.now().toString(); // Fallback ID
        }
    });

    // IPC handler for loading conversations
    ipcMain.handle(IPC_CHANNELS.LOAD_CONVERSATION, async (_, conversationId: string) => {
        console.log('Main process - load-conversation IPC called for:', conversationId);
        try {
            if (!chatStorageService) {
                console.error('Main process - load-conversation: chatStorageService not available');
                return [];
            }
            const loadedMessages = await chatStorageService.getConversationHistory(conversationId)
            return loadedMessages;
        } catch (error) {
            console.error('Main process - load-conversation: error loading conversation:', error);
            return [];
        }
    });

    // IPC handlers for AgenticMemoryService (A-Mem)
    ipcMain.handle(IPC_CHANNELS.MEMORY_GRAPH_GET_DATA, async () => {
        console.log('[IPC] memory-graph:get-data called');
        try {
            if (!agenticMemoryService) {
                // Try to initialize if not already done
                if (llmProvider) {
                    const { AgenticMemoryService } = await import('./services/AgenticMemoryService');
                    agenticMemoryService = new AgenticMemoryService({
                        llmProvider: llmProvider
                    });
                    await agenticMemoryService.initialize();
                } else {
                    return { nodes: [], edges: [] };
                }
            }
            const graphData = await agenticMemoryService.getMemoryGraphData();
            console.log('[IPC] Returning graph data with', graphData.nodes.length, 'nodes and', graphData.edges.length, 'edges');
            return graphData;
        } catch (error) {
            console.error('[IPC] Error getting memory graph data:', error);
            return { nodes: [], edges: [] };
        }
    });

    ipcMain.handle(IPC_CHANNELS.MEMORY_GRAPH_ADD_MEMORY, async (_, content: string, conversationId?: string) => {
        console.log('[IPC] memory-graph:add-memory called');
        try {
            if (!agenticMemoryService) {
                if (llmProvider) {
                    const { AgenticMemoryService } = await import('./services/AgenticMemoryService');
                    agenticMemoryService = new AgenticMemoryService({
                        llmProvider: llmProvider
                    });
                    await agenticMemoryService.initialize();
                } else {
                    throw new Error('LLM provider not available');
                }
            }
            const memory = await agenticMemoryService.addMemory(content, conversationId);

            // Emit update event to frontend
            if (mainWindow) {
                mainWindow.webContents.send('memory-graph:updated', await agenticMemoryService.getMemoryGraphData());
            }

            return memory;
        } catch (error) {
            console.error('[IPC] Error adding memory:', error);
            throw error;
        }
    });

    ipcMain.handle(IPC_CHANNELS.MEMORY_GRAPH_RETRIEVE, async (_, query: string, limit: number = 10) => {
        console.log('[IPC] memory-graph:retrieve called for query:', query);
        try {
            if (!agenticMemoryService) {
                return [];
            }
            const memories = await agenticMemoryService.retrieveMemories(query, limit);
            console.log('[IPC] Retrieved', memories.length, 'memories');
            return memories;
        } catch (error) {
            console.error('[IPC] Error retrieving memories:', error);
            return [];
        }
    });

    // IPC handlers for Todo List Visibility
    ipcMain.handle(IPC_CHANNELS.TODO_LIST_GET_CURRENT, async () => {
        console.log('[IPC] todo-list:get-current called');
        try {
            // Return current todo list state - this will be managed by the agent
            return globalTodoListState || [];
        } catch (error) {
            console.error('[IPC] Error getting current todo list:', error);
            return [];
        }
    });

    ipcMain.handle(IPC_CHANNELS.TODO_LIST_UPDATE, async (_, todos: any[]) => {
        console.log('[IPC] todo-list:update called with', todos.length, 'todos');
        try {
            globalTodoListState = todos;
            // Broadcast update to all renderer processes
            BrowserWindow.getAllWindows().forEach(window => {
                window.webContents.send('todo-list:updated', {
                    todos: todos,
                    timestamp: new Date()
                });
            });
            return { success: true };
        } catch (error) {
            console.error('[IPC] Error updating todo list:', error);
            return { success: false, error: error.message };
        }
    });

    // IPC handler for loading ALL messages without filtering
    ipcMain.handle(IPC_CHANNELS.LOAD_ALL_CONVERSATION_MESSAGES, async (_, conversationId: string) => {
        console.log('Main process - load-all-conversation-messages IPC called for:', conversationId);
        try {
            if (!chatStorageService) {
                console.error('Main process - load-all-conversation-messages: chatStorageService not available');
                return [];
            }
            const allMessages = await chatStorageService.getAllConversationMessages(conversationId);
            console.log('Main process - Returning', allMessages.length, 'unfiltered messages');
            return allMessages;
        } catch (error) {
            console.error('Main process - load-all-conversation-messages: error loading messages:', error);
            return [];
        }
    });

    // IPC handler for checking incomplete conversations
    ipcMain.handle(IPC_CHANNELS.GET_INCOMPLETE_CONVERSATIONS, async () => {
        console.log('Main process - get-incomplete-conversations IPC called');
        try {
            if (!chatStorageService) {
                console.error('Main process - get-incomplete-conversations: chatStorageService not available');
                return [];
            }
            return await chatStorageService.getIncompleteConversations();
        } catch (error) {
            console.error('Main process - get-incomplete-conversations: error:', error);
            return [];
        }
    });

    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
        desktopCapturer.getSources({ types: [''] }).then((sources) => {
            // Grant access to the first screen found.
            callback({ audio: 'loopback' })
        })
        // If true, use the system picker if available.
        // Note: this is currently experimental. If the system picker
        // is available, it will be used and the media request handler
        // will not be invoked.
    })

    // IPC handler for getting conversation health
    ipcMain.handle(IPC_CHANNELS.GET_CONVERSATION_HEALTH, async (_, conversationId: string) => {
        console.log('Main process - get-conversation-health IPC called for:', conversationId);
        try {
            if (!chatStorageService) {
                console.error('Main process - get-conversation-health: chatStorageService not available');
                return null;
            }
            return await chatStorageService.getConversationHealth(conversationId);
        } catch (error) {
            console.error('Main process - get-conversation-health: error:', error);
            return null;
        }
    });

    // IPC handler for loading thinking blocks
    ipcMain.handle(IPC_CHANNELS.GET_THINKING_BLOCKS, async (_, conversationId: string) => {
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
    ipcMain.handle(IPC_CHANNELS.GET_CONVERSATIONS, async () => {
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
    ipcMain.handle(IPC_CHANNELS.GET_LATEST_HUMAN_MESSAGE, async (_, conversationId: string) => {
        console.log('Main process - get-latest-human-message IPC called for:', conversationId);
        try {
            if (!chatStorageService) {
                console.error('Main process - get-latest-human-message: chatStorageService not available');
                return null;
            }
            return await chatStorageService.getMessagesForChat(conversationId);
        } catch (error) {
            console.error('Main process - get-latest-human-message: error getting latest human message:', error);
            return null;
        }
    });

    // Note: settings-save IPC handler is now in setupSettingsIPC() function

    // IPC handler for saving messages to ChatStorageService
    ipcMain.handle(IPC_CHANNELS.SAVE_MESSAGE, async (event, messageData) => {
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

    // Remove application menu for clean interface (per user preference)
    Menu.setApplicationMenu(null);


    // Initialize LLM services AFTER window is created and shown (non-blocking)
    setTimeout(async () => {
        if (!llmProvider && settingsService) {
            try {
                console.log('🔧 DEBUG: Post-startup LLM initialization...');
                const settings = await settingsService.get('llm');
                if (settings) {
                    const provider = settings.provider;
                    let apiKey = await settingsService.getApiKey();

                    // Fallback: if no API key in keychain but there's one in settings, use it
                    if (!apiKey && settings.openai?.apiKey && settings.openai.apiKey !== '***') {
                        console.log('🔧 DEBUG: No API key in keychain, but found in settings - using settings API key');
                        apiKey = settings.openai.apiKey;
                    }

                    // For non-OpenAI providers, check their settings for API keys
                    if (!apiKey && provider !== 'openai' && provider !== 'ollama') {
                        const providerSettings = (settings as any)[provider];
                        if (providerSettings?.apiKey && providerSettings.apiKey !== '***') {
                            console.log(`🔧 DEBUG: Using API key from ${provider} settings`);
                            apiKey = providerSettings.apiKey;
                        }
                    }

                    console.log('🔧 DEBUG: Provider:', provider, 'API key available:', apiKey ? 'yes (length: ' + apiKey.length + ')' : 'no');

                    // Check if we can initialize based on provider
                    let canInitialize = false;
                    if (provider === 'ollama') {
                        canInitialize = true; // Ollama doesn't need API key
                        console.log('🔧 DEBUG: Using Ollama provider, no API key required');
                    } else if (provider === 'openai' || provider === 'auto') {
                        canInitialize = !!apiKey; // OpenAI or auto needs API key
                        if (!apiKey) {
                            console.log('⚠️  DEBUG: OpenAI/auto provider requires API key, user will need to add one in settings');
                        }
                    }

                    if (canInitialize) {
                        console.log('🔧 DEBUG: Starting LLM service initialization...');
                        const llmConfig = {
                            provider: settings.provider || 'ollama',
                            openai: settings.openai ? {
                                ...settings.openai,
                                apiKey: apiKey || '',
                                maxTokens: settings.openai.maxTokens || 1500
                            } : undefined,
                            ollama: settings.ollama || {
                                model: 'llama3:8b',
                                baseUrl: 'http://127.0.0.1:11435',
                                temperature: 0.7
                            },
                            anthropic: (settings as any).anthropic,
                            google: (settings as any).google,
                            cohere: (settings as any).cohere,
                            azure: (settings as any).azure,
                            huggingface: (settings as any).huggingface,
                            streaming: true,
                            timeout: 15000
                        };

                        llmProvider = new LLMProvider(llmConfig);
                        await llmProvider.initialize();
                        console.log('✅ DEBUG: LLM services now available for chat!');

                        // Update ServiceManager with new LLM provider
                        if (serviceManager) {
                            serviceManager.updateCoreServices(settingsService, llmProvider);
                        }

                        // Notify renderer that LLM is ready (optional)
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('llm-ready');
                        }
                    }
                } else {
                    console.log('⚠️  DEBUG: No LLM settings found');
                }
            } catch (error) {
                console.error('🚨 DEBUG: Post-startup LLM init failed:', error);
                console.error('🚨 DEBUG: Error details:', error.stack);
            }
        } else if (llmProvider) {
            console.log('✅ DEBUG: LLM service already initialized');
        }
    }, 5000); // 5 second delay after app startup
});
