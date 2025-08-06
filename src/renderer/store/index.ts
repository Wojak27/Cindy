import { createStore, applyMiddleware } from 'redux';
import { persistenceMiddleware, loadInitialSettings, setSettingsService, waitForSettingsService } from '../../store/middleware/persistenceMiddleware';
import { rootReducer } from '../../store/reducers';

// Function to get default state
const getDefaultState = () => ({
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
    messages: {
        messages: [],
        thinkingBlocks: []
    },
    ui: {
        showSettings: false,
        showDatabase: false,
        isSpeaking: false,
        isListening: false,
        thinkingStartTime: null
    }
});

// Store reference that will be properly initialized
let storeInstance: any = null;
let isStoreInitialized = false;
let initPromise: Promise<any> | null = null;

// Function to initialize the store with loaded settings
const initializeStore = async () => {
    if (isStoreInitialized) {
        console.log('🔧 DEBUG: Store already initialized, returning existing store');
        return storeInstance;
    }

    console.log('🔧 DEBUG: Starting store initialization');
    try {
        // Wait for settings service to be available before loading settings
        console.log('🔧 DEBUG: Waiting for settings service...');
        const serviceAvailable = await waitForSettingsService(10000); // 10 second timeout

        if (!serviceAvailable) {
            console.error('🚨 DEBUG: Timeout waiting for settings service during store initialization');
            // Continue with default settings
        } else {
            console.log('🔧 DEBUG: Settings service is available');
        }

        // Load initial settings which waits for settings service
        console.log('🔧 DEBUG: Loading initial settings...');
        const settings = await loadInitialSettings();
        console.log('🔧 DEBUG: Initial settings loaded:', settings);

        // Update the existing store with loaded settings instead of creating a new one
        console.log('🔧 DEBUG: Dispatching loaded settings to existing store');
        storeInstance.dispatch({
            type: 'UPDATE_SETTINGS',
            payload: {
                ...settings,
                blobSensitivity: settings.general?.blobSensitivity || 0.5,
                blobStyle: settings.general?.blobStyle || 'moderate'
            }
        });

        isStoreInitialized = true;
        console.log('🔧 DEBUG: Store initialization completed successfully');
        console.log('🔧 DEBUG: Store state after loading settings:', storeInstance.getState().settings);
        return storeInstance;

    } catch (error) {
        console.error('🚨 DEBUG: Failed to initialize store:', error);

        // Create store with default settings if initialization fails
        storeInstance = createStore(
            rootReducer,
            getDefaultState(),
            applyMiddleware(persistenceMiddleware)
        );

        isStoreInitialized = true;
        console.log('🔧 DEBUG: Store initialized with default settings due to error');
        return storeInstance;
    }
};

// Create the store immediately with default state
storeInstance = createStore(
    rootReducer,
    getDefaultState(),
    applyMiddleware(persistenceMiddleware)
);

// Start initialization asynchronously to load saved settings
initPromise = initializeStore().catch((error) => {
    console.error('🚨 DEBUG: Store initialization failed, keeping default store:', error);
    return storeInstance;
});

// Export the store directly (starts with defaults, gets updated when initialization completes)
export default storeInstance;
export { setSettingsService, initPromise };



