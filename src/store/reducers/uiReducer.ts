// src/store/reducers/uiReducer.ts
// Removed unused import

const initialState = {
  showSettings: false,
  isSpeaking: false,
  isListening: false
};

const uiReducer = (state = initialState, action: any) => {
  switch (action.type) {
    case 'TOGGLE_SETTINGS':
      return {
        ...state,
        showSettings: !state.showSettings
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
    default:
      return state;
  }
};

export { uiReducer };