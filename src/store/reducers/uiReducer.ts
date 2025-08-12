// src/store/reducers/uiReducer.ts
// Removed unused import

const initialState = {
  showSettings: false,
  showDatabase: false,
  showDocumentPanel: false,
  currentDocument: null,
  isSpeaking: false,
  isListening: false,
  thinkingStartTime: null
};

const uiReducer = (state = initialState, action: any) => {
  switch (action.type) {
    case 'TOGGLE_SETTINGS':
      return {
        ...state,
        showSettings: !state.showSettings
      };
    case 'TOGGLE_DATABASE_SIDEBAR':
      return {
        ...state,
        showDatabase: !state.showDatabase
      };
    case 'TOGGLE_DOCUMENT_PANEL':
      return {
        ...state,
        showDocumentPanel: !state.showDocumentPanel
      };
    case 'SHOW_DOCUMENT':
      return {
        ...state,
        showDocumentPanel: true,
        currentDocument: action.payload
      };
    case 'HIDE_DOCUMENT':
      return {
        ...state,
        showDocumentPanel: false,
        currentDocument: null
      };
    case 'SET_SPEAKING':
      return {
        ...state,
        isSpeaking: action.payload
      };
    case 'SET_LISTENING':
      return {
        ...state,
        isListening: action.payload
      };
    case 'START_THINKING':
      return {
        ...state,
        thinkingStartTime: action.payload
      };
    case 'STOP_THINKING':
      return {
        ...state,
        thinkingStartTime: null
      };
    default:
      return state;
  }
};

export { uiReducer };