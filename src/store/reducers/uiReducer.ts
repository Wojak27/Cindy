// src/store/reducers/uiReducer.ts
// Removed unused import

const initialState = {
  showSettings: false,
  showDatabase: false,
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