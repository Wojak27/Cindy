// Thinking block actions
export const addThinkingBlock = (block: any) => ({
  type: 'ADD_THINKING_BLOCK',
  payload: block
});

export const updateThinkingBlock = (block: any) => ({
  type: 'UPDATE_THINKING_BLOCK',
  payload: block
});

export const completeThinkingBlock = (blockId: string, endTime: number) => ({
  type: 'COMPLETE_THINKING_BLOCK',
  payload: { blockId, endTime }
});

export const clearThinkingBlocks = () => ({
  type: 'CLEAR_THINKING_BLOCKS'
});

// Existing actions
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

export const toggleDocumentPanel = () => ({
    type: 'TOGGLE_DOCUMENT_PANEL'
});

export const showDocument = (document: any) => ({
    type: 'SHOW_DOCUMENT',
    payload: document
});

export const hideDocument = () => ({
    type: 'HIDE_DOCUMENT'
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

// Streaming actions
export const appendToLastMessage = (content: string) => ({
    type: 'APPEND_TO_LAST_MESSAGE',
    payload: content
});

export const streamComplete = () => ({
    type: 'STREAM_COMPLETE'
});

export const streamError = (error: string) => ({
    type: 'STREAM_ERROR',
    payload: error
});