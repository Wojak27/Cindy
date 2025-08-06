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
    const checkInterval = 100;
    let waitedTime = 0;

    while (!isSettingsServiceAvailable() && waitedTime < timeout) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        waitedTime += checkInterval;

        try {
            // Try to get settings service status from main process
            const serviceAvailable = await ipcRenderer.invoke('get-settings-service');
            if (serviceAvailable) {
                return true;
            }
        } catch (error) {
            // Ignore errors, we'll keep trying
            console.debug('Waiting for settings service, attempt failed:', error);
        }
    }

    return isSettingsServiceAvailable();
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
        try {
            // Extract settings sections from the action payload
            const { llm, ...generalSettings } = action.payload;

            // Use IPC to persist settings to main process
            try {
                // Retry mechanism for ipcRenderer
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
                            // Wait before retry
                            await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
                        }
                    }
                };

                // Update general settings
                if (Object.keys(generalSettings).length > 0) {
                    await invokeWithRetry('settings-set', 'general', generalSettings);
                }

                // Update LLM settings
                if (llm) {
                    await invokeWithRetry('settings-set', 'llm', llm);
                }
            } catch (error) {
                console.error('Failed to persist settings:', error);
                throw error; // Re-throw to propagate the error
            }
        } catch (error) {
            console.error('Failed to persist settings:', error);
            throw error; // Re-throw to propagate the error
        }
    }

    return result;
};

/**
 * Load initial settings from SettingsService into Redux store
 */
export const loadInitialSettings = async () => {
    try {
        // Wait for settings service to be available
        const serviceAvailable = await waitForSettingsService();

        if (!serviceAvailable) {
            console.error('Timeout waiting for settings service');
            return {
                theme: 'light',
                voice: 'cindy',
                wakeWord: 'cindy',
                autoStart: false,
                notifications: true,
                llm: {
                    provider: 'ollama',
                    ollama: {
                        model: 'qwen3:8b',
                        baseUrl: 'http://127.0.0.1:11434',
                        temperature: 0.7
                    },
                    openai: {
                        model: 'gpt-3.5-turbo',
                        apiKey: '',
                        temperature: 0.7
                    }
                }
            };
        }

        // Use IPC to get settings from main process with retry mechanism
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
                    // Wait before retry
                    await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
                }
            }
        };

        const settings = await invokeWithRetry('settings-get-all');

        // Transform Settings interface to match Redux store structure
        return {
            theme: 'light', // Theme is not in the Settings interface
            voice: settings.voice?.activationPhrase || 'cindy',
            wakeWord: settings.voice?.activationPhrase || 'cindy',
            autoStart: settings.general.startAtLogin || false,
            notifications: settings.general.notifications || true,
            llm: {
                provider: settings.llm.provider || 'ollama',
                ollama: {
                    model: settings.llm.ollama?.model || 'qwen3:8b',
                    baseUrl: settings.llm.ollama?.baseUrl || 'http://127.0.0.1:11434',
                    temperature: settings.llm.ollama?.temperature || 0.7
                },
                openai: {
                    model: settings.llm.openai?.model || 'gpt-3.5-turbo',
                    apiKey: settings.llm.openai?.apiKey || '',
                    temperature: settings.llm.openai?.temperature || 0.7
                }
            },
            // Include other settings sections that might be needed
            general: {
                ...settings.general
            },
            privacy: {
                ...settings.privacy
            },
            system: {
                ...settings.system
            }
        };
    } catch (error) {
        console.error('Failed to load initial settings:', error);
        return {
            theme: 'light',
            voice: 'cindy',
            wakeWord: 'cindy',
            autoStart: false,
            notifications: true,
            llm: {
                provider: 'ollama',
                ollama: {
                    model: 'qwen3:8b',
                    baseUrl: 'http://127.0.0.1:11434',
                    temperature: 0.7
                },
                openai: {
                    model: 'gpt-3.5-turbo',
                    apiKey: '',
                    temperature: 0.7
                }
            }
        };
    }
};
