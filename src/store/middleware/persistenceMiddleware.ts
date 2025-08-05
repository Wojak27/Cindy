import { SettingsService } from '../../main/services/SettingsService';

// Create a single instance of SettingsService
const settingsService = new SettingsService();

// Initialize the settings service
settingsService.initialize().catch(console.error);

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

            // Update general settings
            if (Object.keys(generalSettings).length > 0) {
                await settingsService.set('general', generalSettings);
            }

            // Update LLM settings
            if (llm) {
                await settingsService.set('llm', llm);
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
            }
        };
    } catch (error) {
        console.error('Failed to load initial settings:', error);
        return {};
    }
};
