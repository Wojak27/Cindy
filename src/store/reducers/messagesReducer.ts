// src/store/reducers/messagesReducer.ts
// Manages messages and thinking blocks state

const initialState = {
  messages: [],
  thinkingBlocks: []
};

const messagesReducer = (state = initialState, action: any) => {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, action.payload]
      };
    case 'CLEAR_MESSAGES':
      return {
        ...state,
        messages: []
      };
    case 'APPEND_TO_LAST_MESSAGE':
      if (state.messages.length === 0) {
        return {
          ...state,
          messages: [...state.messages, { role: 'assistant', content: action.payload }]
        };
      }
      const lastMessageIndex = state.messages.length - 1;
      const updatedLastMessage = {
        ...state.messages[lastMessageIndex],
        content: state.messages[lastMessageIndex].content + action.payload
      };
      return {
        ...state,
        messages: [
          ...state.messages.slice(0, lastMessageIndex),
          updatedLastMessage
        ]
      };
    case 'STREAM_COMPLETE':
      return state;
    case 'STREAM_ERROR':
      return state;
    case 'ADD_THINKING_BLOCK':
      return {
        ...state,
        thinkingBlocks: [...state.thinkingBlocks, action.payload]
      };
    case 'UPDATE_THINKING_BLOCK':
      return {
        ...state,
        thinkingBlocks: state.thinkingBlocks.map(block =>
          block.id === action.payload.id ? { ...block, ...action.payload } : block
        )
      };
    case 'COMPLETE_THINKING_BLOCK':
      return {
        ...state,
        thinkingBlocks: state.thinkingBlocks.map(block =>
          block.id === action.payload.blockId
            ? { ...block, endTime: action.payload.endTime }
            : block
        )
      };
    case 'CLEAR_THINKING_BLOCKS':
      return {
        ...state,
        thinkingBlocks: []
      };
    default:
      return state;
  }
};

export { messagesReducer };