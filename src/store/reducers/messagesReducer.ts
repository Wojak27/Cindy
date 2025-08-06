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
        messages: [],
        thinkingBlocks: []
      };
    case 'APPEND_TO_LAST_MESSAGE':
      // This should only append to the last assistant message, never user messages
      const lastMsgIndex = state.messages.length - 1;
      if (lastMsgIndex >= 0 && state.messages[lastMsgIndex].role === 'assistant') {
        const updatedMsg = {
          ...state.messages[lastMsgIndex],
          content: state.messages[lastMsgIndex].content + action.payload
        };
        return {
          ...state,
          messages: [
            ...state.messages.slice(0, lastMsgIndex),
            updatedMsg
          ]
        };
      }
      // If no assistant message exists, create one
      return {
        ...state,
        messages: [...state.messages, {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: action.payload,
          timestamp: new Date().toISOString(),
          isStreaming: true
        }]
      };
    case 'APPEND_TO_LAST_ASSISTANT_MESSAGE':
      // Find the last assistant message specifically
      for (let i = state.messages.length - 1; i >= 0; i--) {
        if (state.messages[i].role === 'assistant') {
          const updatedAssistantMessage = {
            ...state.messages[i],
            content: state.messages[i].content + action.payload
          };
          return {
            ...state,
            messages: [
              ...state.messages.slice(0, i),
              updatedAssistantMessage,
              ...state.messages.slice(i + 1)
            ]
          };
        }
      }
      // If no assistant message found, create one
      return {
        ...state,
        messages: [...state.messages, {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: action.payload,
          timestamp: new Date().toISOString(),
          isStreaming: true
        }]
      };
    case 'UPDATE_LAST_ASSISTANT_MESSAGE':
      const lastAssistantIdx = state.messages.length - 1;
      if (lastAssistantIdx >= 0 && state.messages[lastAssistantIdx].role === 'assistant') {
        const updatedMessage = {
          ...state.messages[lastAssistantIdx],
          content: action.payload,
          isStreaming: false
        };
        return {
          ...state,
          messages: [
            ...state.messages.slice(0, lastAssistantIdx),
            updatedMessage
          ]
        };
      }
      return state;
    case 'COMPLETE_ASSISTANT_MESSAGE':
      const completeIdx = state.messages.length - 1;
      if (completeIdx >= 0 && state.messages[completeIdx].role === 'assistant') {
        const completedMessage = {
          ...state.messages[completeIdx],
          isStreaming: false
        };
        return {
          ...state,
          messages: [
            ...state.messages.slice(0, completeIdx),
            completedMessage
          ]
        };
      }
      return state;
    case 'STREAM_COMPLETE':
      return state;
    case 'STREAM_ERROR':
      return state;
    case 'ADD_THINKING_BLOCK':
      // Associate thinking block with the current assistant message if available
      const currentAssistantMessage = state.messages.length > 0 && state.messages[state.messages.length - 1].role === 'assistant'
        ? state.messages[state.messages.length - 1]
        : null;

      const enhancedBlock = currentAssistantMessage
        ? { ...action.payload, messageId: currentAssistantMessage.id }
        : action.payload;

      return {
        ...state,
        thinkingBlocks: [...state.thinkingBlocks, enhancedBlock]
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