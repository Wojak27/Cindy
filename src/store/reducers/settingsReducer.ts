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
    // Blob animation settings
    blobSensitivity: 0.5,
    blobStyle: 'moderate'
};

const settingsReducer = (state = initialState, action: any) => {
    switch (action.type) {
        case 'UPDATE_SETTINGS':
            return {
                ...state,
                ...action.payload
            };
        default:
            return state;
    }
};

export { settingsReducer };