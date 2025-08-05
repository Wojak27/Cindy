// SettingsService is imported but not used directly
// It's used through the settingsService variable

// SettingsService will be initialized in main.ts
// This file will use the instance created there
let settingsService: any = null;

// Function to set the settings service instance
export const setSettingsService = (service: any) => {
    settingsService = service;
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

            // Check if settingsService is available
            if (!settingsService) {
                console.error('Settings service not available for persistence');
                return result;
            }

            // Update general settings
            if (Object.keys(generalSettings).length > 0) {
                try {
                    await settingsService.set('general', generalSettings);
                } catch (error) {
                    console.error('Failed to persist general settings:', error);
                }
            }

            // Update LLM settings
            if (llm) {
                try {
                    await settingsService.set('llm', llm);
                } catch (error) {
                    console.error('Failed to persist LLM settings:', error);
                }
            }
        } catch (error) {
            console.error('Failed to persist settings:', error);
        }
    }

    return result;
};

/**
 * Load initial settings from SettingsService into Redux store
 */
export const loadInitialSettings = async () => {
    try {
        // Wait for settingsService to be set
        while (!settingsService) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        const settings = await settingsService.getAll();

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
