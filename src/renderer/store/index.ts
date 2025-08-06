import { createStore, applyMiddleware } from 'redux';
import { persistenceMiddleware, loadInitialSettings, setSettingsService, waitForSettingsService } from '../../store/middleware/persistenceMiddleware';
import { rootReducer } from '../../store/reducers';

// Create a placeholder store that will be replaced once settings service is available
let store = createStore(
    rootReducer,
    {
        settings: {
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
            },
            blobSensitivity: 0.5,
            blobStyle: 'moderate'
        },
        messages: [],
        ui: {
            showSettings: false,
            showDatabase: false,
            isSpeaking: false,
            isListening: false,
            thinkingStartTime: null
        }
    },
    applyMiddleware(persistenceMiddleware)
);

// Flag to track if store has been initialized
let isStoreInitialized = false;

// Function to safely replace the store
const initializeStore = async () => {
    if (isStoreInitialized) return;

    try {
        // Wait for settings service to be available before loading settings
        const serviceAvailable = await waitForSettingsService(10000); // 10 second timeout

        if (!serviceAvailable) {
            console.error('Timeout waiting for settings service during store initialization');
            // Continue with default settings
        }

        // Load initial settings which waits for settings service
        const settings = await loadInitialSettings();

        // Create a fresh store with the loaded settings
        const newStore = createStore(
            rootReducer,
            {
                settings: {
                    ...settings,
                    blobSensitivity: settings.general?.blobSensitivity || 0.5,
                    blobStyle: settings.general?.blobStyle || 'moderate'
                },
                messages: [],
                ui: {
                    showSettings: false,
                    showDatabase: false,
                    isSpeaking: false,
                    isListening: false,
                    thinkingStartTime: null
                }
            },
            applyMiddleware(persistenceMiddleware)
        );

        // Replace the placeholder store
        store = newStore;
        isStoreInitialized = true;
    } catch (error) {
        console.error('Failed to initialize store:', error);
        // Use default settings if initialization fails
        const defaultSettings = {
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
            },
            blobSensitivity: 0.5,
            blobStyle: 'moderate'
        };

        store = createStore(
            rootReducer,
            {
                settings: defaultSettings,
                messages: [],
                ui: {
                    showSettings: false,
                    showDatabase: false,
                    isSpeaking: false,
                    isListening: false,
                    thinkingStartTime: null
                }
            },
            applyMiddleware(persistenceMiddleware)
        );
        isStoreInitialized = true;
    }
};

// Initialize the store asynchronously
initializeStore();

// Export the store (which will be updated when initialization completes)
export default store;
export { setSettingsService };


