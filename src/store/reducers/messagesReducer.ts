// src/store/reducers/messagesReducer.ts
// Removed unused import

const initialState = [];

const messagesReducer = (state = initialState, action: any) => {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return [...state, action.payload];
    default:
      return state;
  }
};

export { messagesReducer };