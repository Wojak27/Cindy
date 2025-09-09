// SettingsService is imported but not used directly
// It's used through the settingsService variable

// SettingsService will be initialized in main.ts
// This file will use the instance created there
// The settings service is now available through the main process via IPC
// We'll check for its availability using a global flag set by main process
import { ipcRenderer } from 'electron';

// Function to check if settings service is available
export const isSettingsServiceAvailable = (): boolean => {
    // Check both the global flag and ipcRenderer availability
    return (window as any).__electronSettingsService === true && !!ipcRenderer;
};

// Function to wait for settings service to be available
export const waitForSettingsService = async (timeout: number = 10000): Promise<boolean> => {
    console.log('🔧 DEBUG: waitForSettingsService called with timeout:', timeout, 'ms');
    const checkInterval = 100;
    let waitedTime = 0;
    let attemptCount = 0;

    while (!isSettingsServiceAvailable() && waitedTime < timeout) {
        attemptCount++;
        console.log(`🔧 DEBUG: waitForSettingsService attempt ${attemptCount}, waited: ${waitedTime}ms`);

        await new Promise(resolve => setTimeout(resolve, checkInterval));
        waitedTime += checkInterval;

        try {
            // Try to get settings service status from main process
            console.log('🔧 DEBUG: Invoking get-settings-service via IPC...');
            const serviceAvailable = await ipcRenderer.invoke('get-settings-service');
            console.log('🔧 DEBUG: get-settings-service response:', serviceAvailable);
            if (serviceAvailable) {
                console.log('🔧 DEBUG: Settings service confirmed available via IPC');
                return true;
            }
        } catch (error) {
            // Log errors but keep trying
            console.warn('🚨 DEBUG: waitForSettingsService IPC attempt failed:', error);
            console.warn('🚨 DEBUG: IPC error details:', {
                name: error.name,
                message: error.message,
                waitedTime,
                attemptCount
            });
        }
    }

    const finalResult = isSettingsServiceAvailable();
    console.log('🔧 DEBUG: waitForSettingsService timeout reached, final result:', finalResult);
    console.log('🔧 DEBUG: Total attempts:', attemptCount, 'Total time waited:', waitedTime, 'ms');
    return finalResult;
};

// Function to set the settings service instance
// This function is maintained for backward compatibility
// but is no longer used in the IPC-based implementation
export const setSettingsService = (service: any) => {
    console.log('Setting settings service instance (ignored in IPC mode)');
    // No longer needed with IPC-based implementation
};

/**
 * Middleware to persist Redux store changes to disk
 * Synchronizes settings between Redux store and SettingsService
 */
export const persistenceMiddleware = () => (next: any) => async (action: any) => {
    // Process the action first
    const result = next(action);

    // Handle settings updates
    if (action.type === 'UPDATE_SETTINGS') {
        console.log('🔧 DEBUG: UPDATE_SETTINGS action detected');

        // IMMEDIATELY save to localStorage for persistence
        try {
            localStorage.setItem('voice-assistant-settings', JSON.stringify(action.payload));
            console.log('🔧 DEBUG: Settings saved to localStorage successfully');
        } catch (localStorageError) {
            console.error('🚨 DEBUG: Failed to save settings to localStorage:', localStorageError);
            console.error('🚨 DEBUG: localStorage error details:', {
                name: localStorageError.name,
                message: localStorageError.message,
                stack: localStorageError.stack
            });
        }

        // Also save to main process (background, non-blocking)
        try {
            // Transform UI format to SettingsService format
            const transformedForService = {
                general: {
                    startAtLogin: action.payload.autoStart || false,
                    minimizeToTray: true,
                    notifications: action.payload.notifications || true,
                    language: 'en-US',
                    blobSensitivity: action.payload.blobSensitivity || 0.5,
                    blobStyle: action.payload.blobStyle || 'moderate'
                },
                voice: {
                    activationPhrase: action.payload.voice?.activationPhrase || action.payload.voice || action.payload.wakeWord || 'cindy',
                    wakeWordSensitivity: action.payload.voice?.wakeWordSensitivity || 0.5,
                    audioThreshold: action.payload.voice?.audioThreshold || 0.01,
                    voiceSpeed: 1.0,
                    voicePitch: 1.0,
                    sttProvider: action.payload.voice?.sttProvider || 'auto',
                    ttsProvider: 'auto'
                },
                llm: action.payload.llm || {
                    provider: 'ollama',
                    ollama: {
                        model: 'qwen3:1.7b',
                        baseUrl: 'http://127.0.0.1:11435',
                        temperature: 0.7
                    },
                    openai: {
                        model: 'gpt-3.5-turbo',
                        organizationId: '',
                        apiKey: '',
                        temperature: 0.7,
                        maxTokens: 1500
                    }
                },
                vault: {
                    path: '',
                    autoIndex: true,
                    indexSchedule: '0 * * * *'
                },
                research: {
                    enabled: true,
                    maxConcurrentTasks: 3,
                    dailySummaryTime: '0 9 * * *',
                    researchInterval: '0 0 * * 1',
                    maxSourcesPerResearch: 10,
                    outputPath: './Research'
                },
                privacy: {
                    offlineOnlyMode: false,
                    autoDeleteHistory: false,
                    autoDeleteHistoryAfterDays: 30,
                    encryptLocalStorage: true,
                    disableAnalytics: false
                },
                system: {
                    maxMemoryUsage: 1024,
                    logLevel: 'info',
                    autoUpdate: true
                },
                profile: {
                    name: action.payload.profile?.name || '',
                    surname: action.payload.profile?.surname || '',
                    hasCompletedSetup: action.payload.profile?.hasCompletedSetup || false
                },
                database: {
                    path: action.payload.database?.path || '',
                    embeddingModel: action.payload.database?.embeddingModel || 'qwen3:1.7b',
                    chunkSize: action.payload.database?.chunkSize || 1000,
                    chunkOverlap: action.payload.database?.chunkOverlap || 200,
                    autoIndex: action.payload.database?.autoIndex || true,
                    notesPath: action.payload.database?.notesPath || ''
                },
                search: {
                    preferredProvider: action.payload.search?.preferredProvider || 'auto',
                    braveApiKey: action.payload.search?.braveApiKey || '',
                    tavilyApiKey: action.payload.search?.tavilyApiKey || '',
                    serpApiKey: action.payload.search?.serpApiKey || '',
                    fallbackProviders: action.payload.search?.fallbackProviders || ['duckduckgo', 'brave', 'tavily', 'serp'],
                    rateLimit: action.payload.search?.rateLimit || {
                        enabled: true,
                        requestsPerMinute: 10,
                        cooldownSeconds: 5
                    }
                }
            };

            // Use IPC to persist settings to main process with enhanced retry logic
            const invokeWithRetry = async (channel: string, ...args: any[]) => {
                const maxRetries = 5;
                let lastError: any = null;

                for (let i = 0; i < maxRetries; i++) {
                    try {
                        console.log(`🔧 DEBUG: IPC attempt ${i + 1}/${maxRetries} for channel:`, channel);
                        if (ipcRenderer) {
                            const result = await ipcRenderer.invoke(channel, ...args);
                            console.log(`🔧 DEBUG: IPC success on attempt ${i + 1} for channel:`, channel);
                            return result;
                        } else {
                            throw new Error('ipcRenderer not available');
                        }
                    } catch (error) {
                        lastError = error;
                        console.warn(`🚨 DEBUG: IPC attempt ${i + 1}/${maxRetries} failed for channel ${channel}:`, error);
                        if (i === maxRetries - 1) {
                            console.error(`🚨 DEBUG: All ${maxRetries} IPC attempts failed for channel ${channel}, last error:`, error);
                            throw error;
                        }
                        // Exponential backoff with jitter
                        const delay = Math.min(1000, 100 * Math.pow(2, i)) + Math.random() * 100;
                        console.log(`🔧 DEBUG: Waiting ${delay}ms before retry...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
                throw lastError;
            };

            // Try to save all settings at once using new IPC method, fallback to old method
            try {
                await invokeWithRetry('settings-set-all', transformedForService);
                console.log('🔧 DEBUG: Settings saved successfully using atomic method');
            } catch (newMethodError) {
                console.log('🔧 DEBUG: Falling back to individual IPC calls');

                // Fallback: Update settings in individual sections (old method)
                await invokeWithRetry('settings-set', 'general', transformedForService.general);
                await invokeWithRetry('settings-set', 'voice', transformedForService.voice);
                await invokeWithRetry('settings-set', 'llm', transformedForService.llm);
                await invokeWithRetry('settings-set', 'profile', transformedForService.profile);
                await invokeWithRetry('settings-set', 'database', transformedForService.database);
                await invokeWithRetry('settings-set', 'search', transformedForService.search);
                await invokeWithRetry('settings-set', 'vault', transformedForService.vault);
                await invokeWithRetry('settings-set', 'research', transformedForService.research);
                await invokeWithRetry('settings-set', 'privacy', transformedForService.privacy);
                await invokeWithRetry('settings-set', 'system', transformedForService.system);
                // Storage section temporarily disabled until app restart

                // Force save to disk
                await invokeWithRetry('settings-save');
                console.log('🔧 DEBUG: Settings saved successfully using individual calls');
            }

        } catch (error) {
            console.error('🚨 DEBUG: CRITICAL - Failed to persist settings to main process after all retries:', error);
            console.error('🚨 DEBUG: Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });

            // Fallback: Store a flag to indicate settings need to be re-synced
            try {
                localStorage.setItem('voice-assistant-settings-needs-sync', 'true');
                console.log('🔧 DEBUG: Set needs-sync flag for later recovery');
            } catch (flagError) {
                console.error('🚨 DEBUG: Failed to set needs-sync flag:', flagError);
            }

            // Don't throw here - localStorage already succeeded, but log the critical failure
            console.error('🚨 DEBUG: Settings persistence to main process failed, but localStorage succeeded');
        }
    }

    // Handle message persistence (ADD_MESSAGE actions)
    if (action.type === 'ADD_MESSAGE') {
        console.log('🔧 DEBUG: ADD_MESSAGE action detected, attempting to persist to ChatStorageService');
        console.log('🔧 DEBUG: Message payload keys:', Object.keys(action.payload || {}));

        // Only persist non-streaming messages immediately (streaming messages will be persisted when complete)
        if (!action.payload?.isStreaming) {
            console.log('🔧 DEBUG: Processing non-streaming message for persistence');

            // Enhanced retry logic for message persistence
            const persistMessageWithRetry = async (messageData: any, maxRetries = 3) => {
                for (let i = 0; i < maxRetries; i++) {
                    try {
                        console.log(`🔧 DEBUG: Message persistence attempt ${i + 1}/${maxRetries}`);
                        if (ipcRenderer && messageData) {
                            const result = await ipcRenderer.invoke('save-message', {
                                conversationId: messageData.conversationId || 'default',
                                role: messageData.role,
                                content: messageData.content,
                                timestamp: messageData.timestamp ?
                                    (typeof messageData.timestamp === 'string' ?
                                        new Date(messageData.timestamp).getTime() :
                                        messageData.timestamp
                                    ) : Date.now()
                            });
                            console.log('🔧 DEBUG: Message persisted successfully:', result);
                            return result;
                        } else {
                            throw new Error('ipcRenderer not available or invalid message data');
                        }
                    } catch (error) {
                        console.warn(`🚨 DEBUG: Message persistence attempt ${i + 1}/${maxRetries} failed:`, error);
                        if (i === maxRetries - 1) {
                            console.error('🚨 DEBUG: All message persistence attempts failed:', error);
                            // Store message for later retry
                            try {
                                const failedMessages = JSON.parse(localStorage.getItem('voice-assistant-failed-messages') || '[]');
                                failedMessages.push({
                                    ...messageData,
                                    timestamp: messageData.timestamp ?
                                        (typeof messageData.timestamp === 'string' ?
                                            new Date(messageData.timestamp).getTime() :
                                            messageData.timestamp
                                        ) : Date.now(),
                                    failedAt: Date.now(),
                                    retryCount: 0
                                });
                                localStorage.setItem('voice-assistant-failed-messages', JSON.stringify(failedMessages));
                                console.log('🔧 DEBUG: Stored failed message for later retry');
                            } catch (storageError) {
                                console.error('🚨 DEBUG: Failed to store failed message:', storageError);
                            }
                            throw error;
                        }
                        // Wait before retry
                        await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
                    }
                }
            };

            try {
                await persistMessageWithRetry(action.payload);
                console.log('🔧 DEBUG: Non-streaming message persisted to ChatStorageService successfully');
            } catch (error) {
                console.error('🚨 DEBUG: Failed to persist message to ChatStorageService after all retries:', error);
                // Don't throw - allow the action to continue even if persistence fails
            }
        } else {
            console.log('🔧 DEBUG: Streaming message detected, will persist when complete');
        }
    }

    // Handle completion of assistant streaming messages
    if (action.type === 'COMPLETE_ASSISTANT_MESSAGE') {
        console.log('🔧 DEBUG: COMPLETE_ASSISTANT_MESSAGE action detected, persisting final assistant message');

        // Get the current state to find the last assistant message
        // Note: This is a bit of a hack since we don't have access to getState in middleware
        // In a real implementation, you'd want to pass the completed message in the action payload
        try {
            if (ipcRenderer) {
                // For now, we'll handle this in the streaming completion logic in the main process
                console.log('🔧 DEBUG: Assistant message completion will be handled by main process');
            }
        } catch (error) {
            console.error('🚨 DEBUG: Failed to persist completed assistant message:', error);
        }
    }

    return result;
};

/**
 * Load initial settings from SettingsService into Redux store
 */
const getDefaultSettings = () => ({
    theme: 'light',
    voice: 'cindy',
    wakeWord: 'cindy',
    autoStart: false,
    notifications: true,
    llm: {
        provider: 'ollama',
        ollama: {
            model: 'qwen3:1.7b',
            baseUrl: 'http://127.0.0.1:11435',
            temperature: 0.7
        },
        openai: {
            model: 'gpt-3.5-turbo',
            apiKey: '',
            temperature: 0.7
        }
    }
});

export const loadInitialSettings = async () => {
    console.log('🔧 DEBUG: loadInitialSettings called at:', new Date().toISOString());
    console.log('🔧 DEBUG: Current window location:', window.location.href);
    console.log('🔧 DEBUG: ipcRenderer available:', !!ipcRenderer);

    // Check if there's a pending sync flag
    let needsSync = false;
    try {
        const syncFlag = localStorage.getItem('voice-assistant-settings-needs-sync');
        if (syncFlag === 'true') {
            console.log('🔧 DEBUG: Found needs-sync flag - settings may be out of sync with main process');
            needsSync = true;
        }
    } catch (error) {
        console.warn('🚨 DEBUG: Failed to check sync flag:', error);
    }

    // FIRST: Try to load from localStorage (fastest and most reliable)
    let localStorageSettings = null;
    try {
        console.log('🔧 DEBUG: Attempting to load from localStorage');
        const localStorageData = localStorage.getItem('voice-assistant-settings');
        if (localStorageData) {
            localStorageSettings = JSON.parse(localStorageData);
            console.log('🔧 DEBUG: Loaded settings from localStorage:', localStorageSettings);
            console.log('🔧 DEBUG: localStorage settings size:', JSON.stringify(localStorageSettings).length, 'chars');

            if (!needsSync) {
                // If no sync needed, return localStorage settings immediately
                console.log('🔧 DEBUG: No sync needed, returning localStorage settings');
                return localStorageSettings;
            } else {
                console.log('🔧 DEBUG: Sync needed, will attempt to sync with main process');
            }
        } else {
            console.log('🔧 DEBUG: No settings found in localStorage - this could indicate first run or localStorage clear');
        }
    } catch (localStorageError) {
        console.error('🚨 DEBUG: Failed to load settings from localStorage:', localStorageError);
        console.error('🚨 DEBUG: localStorage error details:', {
            name: localStorageError.name,
            message: localStorageError.message,
            stack: localStorageError.stack
        });
    }

    // FALLBACK: Try to load from main process
    try {
        console.log('🔧 DEBUG: Falling back to main process settings service');
        console.log('🔧 DEBUG: Calling waitForSettingsService with 10s timeout');
        const serviceAvailable = await waitForSettingsService();
        console.log('🔧 DEBUG: waitForSettingsService result:', serviceAvailable);
        if (!serviceAvailable) {
            console.error('🚨 DEBUG: Timeout waiting for settings service - this indicates main process is not ready');
            console.error('🚨 DEBUG: Falling back to default settings');
            return getDefaultSettings();
        }
        console.log('🔧 DEBUG: Settings service is available, proceeding to load from main process');

        const invokeWithRetry = async (channel: string, ...args: any[]) => {
            const maxRetries = 3;
            for (let i = 0; i < maxRetries; i++) {
                try {
                    if (ipcRenderer) {
                        return await ipcRenderer.invoke(channel, ...args);
                    } else {
                        throw new Error('ipcRenderer not available');
                    }
                } catch (error) {
                    if (i === maxRetries - 1) throw error;
                    await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
                }
            }
        };

        console.log('🔧 DEBUG: Calling settings-get-all via IPC');
        const settings = await invokeWithRetry('settings-get-all');
        console.log('🔧 DEBUG: Received settings from main process:', settings);
        console.log('🔧 DEBUG: Main process settings size:', JSON.stringify(settings).length, 'chars');

        const transformedSettings = {
            theme: 'light',
            voice: settings.voice || {
                activationPhrase: 'Hi Cindy!',
                wakeWordSensitivity: 0.5,
                audioThreshold: 0.01,
                voiceSpeed: 1.0,
                voicePitch: 1.0,
                sttProvider: 'auto',
                ttsProvider: 'auto'
            },
            wakeWord: settings.voice?.activationPhrase || 'cindy',
            autoStart: settings.general?.startAtLogin || false,
            notifications: settings.general?.notifications || true,
            llm: {
                provider: settings.llm?.provider || 'ollama',
                ollama: {
                    model: settings.llm?.ollama?.model || 'qwen3:1.7b',
                    baseUrl: settings.llm?.ollama?.baseUrl || 'http://127.0.0.1:11435',
                    temperature: settings.llm?.ollama?.temperature || 0.7
                },
                openai: {
                    model: settings.llm?.openai?.model || 'gpt-3.5-turbo',
                    apiKey: settings.llm?.openai?.apiKey || '',
                    temperature: settings.llm?.openai?.temperature || 0.7
                }
            },
            // Profile data mapping
            profile: {
                name: settings.profile?.name || '',
                surname: settings.profile?.surname || '',
                hasCompletedSetup: settings.profile?.hasCompletedSetup || false
            },
            // Database settings mapping
            database: {
                path: settings.database?.path || '',
                embeddingModel: settings.database?.embeddingModel || 'qwen3:1.7b',
                chunkSize: settings.database?.chunkSize || 1000,
                chunkOverlap: settings.database?.chunkOverlap || 200,
                autoIndex: settings.database?.autoIndex || true,
                notesPath: settings.database?.notesPath || ''
            },
            // Include all other sections
            general: { ...settings.general },
            privacy: { ...settings.privacy },
            system: { ...settings.system },
            // Search settings
            search: {
                preferredProvider: settings.search?.preferredProvider || 'auto',
                braveApiKey: settings.search?.braveApiKey || '',
                tavilyApiKey: settings.search?.tavilyApiKey || '',
                serpApiKey: settings.search?.serpApiKey || '',
                fallbackProviders: settings.search?.fallbackProviders || ['duckduckgo', 'brave', 'tavily', 'serp'],
                rateLimit: settings.search?.rateLimit || {
                    enabled: true,
                    requestsPerMinute: 10,
                    cooldownSeconds: 5
                }
            },
            // Blob settings
            blobSensitivity: settings.general?.blobSensitivity || 0.5,
            blobStyle: settings.general?.blobStyle || 'moderate'
        };

        // Save to localStorage for future use
        try {
            console.log('🔧 DEBUG: Saving transformed settings to localStorage for future use');
            localStorage.setItem('voice-assistant-settings', JSON.stringify(transformedSettings));
            console.log('🔧 DEBUG: Successfully saved transformed settings to localStorage');
        } catch (localStorageError) {
            console.error('🚨 DEBUG: Failed to save transformed settings to localStorage:', localStorageError);
        }

        console.log('🔧 DEBUG: Returning transformed settings from main process');

        // Clear the sync flag since we successfully synced
        if (needsSync) {
            try {
                localStorage.removeItem('voice-assistant-settings-needs-sync');
                console.log('🔧 DEBUG: Cleared needs-sync flag after successful sync');
            } catch (error) {
                console.warn('🚨 DEBUG: Failed to clear sync flag:', error);
            }
        }

        return transformedSettings;
    } catch (error) {
        console.error('🚨 DEBUG: Failed to load initial settings from main process:', error);
        console.error('🚨 DEBUG: Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });

        // If we have localStorage settings as fallback, use them
        if (localStorageSettings) {
            console.log('🔧 DEBUG: Using localStorage settings as fallback after main process failure');
            return localStorageSettings;
        }

        console.log('🔧 DEBUG: Falling back to default settings due to main process error and no localStorage');
        return getDefaultSettings();
    }
};
