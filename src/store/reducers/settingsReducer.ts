// src/store/reducers/settingsReducer.ts
// Updated to align with Settings interface from SettingsService

const initialState = {
    theme: 'light',
    voice: 'female',
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
    },
    // Database settings
    database: {
        path: '',
        embeddingModel: 'qwen3:1.7b',
        chunkSize: 1000,
        chunkOverlap: 200,
        autoIndex: true
    },
    // Profile settings
    profile: {
        name: '',
        surname: '',
        hasCompletedSetup: false
    },
    // Search settings
    search: {
        preferredProvider: 'auto',
        braveApiKey: '',
        tavilyApiKey: '',
        serpApiKey: '',
        fallbackProviders: ['duckduckgo', 'brave', 'tavily', 'serp'],
        rateLimit: {
            enabled: true,
            requestsPerMinute: 10,
            cooldownSeconds: 5
        }
    },
    // UI settings
    ui: {
        retrievedDocuments: {
            maxDocuments: 5,
            showInSidePanel: true,
            autoExpand: false
        },
        agentEvents: {
            showEventBlocks: true,
            autoCollapse: true,
            showTimestamps: true
        }
    },
    // Blob animation settings
    blobSensitivity: 0.5,
    blobStyle: 'moderate'
};

const settingsReducer = (state = initialState, action: any) => {
    switch (action.type) {
        case 'UPDATE_SETTINGS':
            // Deep merge for nested objects
            const newState = { ...state } as any;

            // Handle each top-level key
            Object.keys(action.payload).forEach(key => {
                if (typeof action.payload[key] === 'object' && action.payload[key] !== null && !Array.isArray(action.payload[key])) {
                    // For nested objects, merge them properly
                    newState[key] = {
                        ...((state as any)[key] || {}),
                        ...action.payload[key]
                    };
                } else {
                    // For primitive values, just replace
                    newState[key] = action.payload[key];
                }
            });

            return newState;
        default:
            return state;
    }
};

export { settingsReducer };