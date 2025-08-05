export const getSettings = () => ({
    type: 'GET_SETTINGS'
});

export const updateSettings = (settings: any) => ({
    type: 'UPDATE_SETTINGS',
    payload: settings
});

export const addMessage = (message: any) => ({
    type: 'ADD_MESSAGE',
    payload: message
});

export const sendMessage = (text: string) => ({
    type: 'SEND_MESSAGE',
    payload: text
});

export const toggleSettings = () => ({
    type: 'TOGGLE_SETTINGS'
});

export const setSpeaking = (isSpeaking: boolean) => ({
    type: 'SET_SPEAKING',
    payload: isSpeaking
});

export const setListening = (isListening: boolean) => ({
    type: 'SET_LISTENING',
    payload: isListening
});

export const startThinking = () => ({
    type: 'START_THINKING',
    payload: Date.now()
});

export const stopThinking = () => ({
    type: 'STOP_THINKING'
});