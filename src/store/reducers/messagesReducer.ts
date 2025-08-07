// src/store/reducers/messagesReducer.ts
// Manages messages and thinking blocks state

const initialState = {
  messages: [],
  thinkingBlocks: [],
  toolCalls: []
};

const messagesReducer = (state = initialState, action: any) => {
  switch (action.type) {
    case 'ADD_MESSAGE':
      // Prevent duplicate messages by checking if message already exists
      const messageExists = state.messages.some(msg => msg.id === action.payload.id);
      if (messageExists) {
        console.warn('Preventing duplicate message:', action.payload.id);
        return state;
      }
      return {
        ...state,
        messages: [...state.messages, action.payload]
      };
    case 'LOAD_MESSAGES':
      // Batch load messages (for conversation history)
      return {
        ...state,
        messages: action.payload || []
      };
    case 'CLEAR_MESSAGES':
      return {
        ...state,
        messages: [],
        thinkingBlocks: [],
        toolCalls: []
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
          ...(typeof action.payload === 'string' 
            ? { content: action.payload } 
            : action.payload
          ),
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
    case 'MARK_MESSAGE_FAILED':
      // Mark a message as failed with error details
      return {
        ...state,
        messages: state.messages.map(msg =>
          msg.id === action.payload.messageId
            ? { 
                ...msg, 
                failed: true, 
                error: action.payload.error,
                isStreaming: false 
              }
            : msg
        )
      };
    case 'RETRY_MESSAGE':
      // Mark message as retrying
      return {
        ...state,
        messages: state.messages.map(msg =>
          msg.id === action.payload.messageId
            ? { 
                ...msg, 
                failed: false, 
                error: null,
                isStreaming: true,
                retryCount: (msg.retryCount || 0) + 1
              }
            : msg
        )
      };
    case 'STREAM_COMPLETE':
      return state;
    case 'STREAM_ERROR':
      return state;
    case 'ADD_THINKING_BLOCK':
      // Prevent duplicate thinking blocks
      const blockExists = state.thinkingBlocks.some(block => block.id === action.payload.id);
      if (blockExists) {
        console.warn('Preventing duplicate thinking block:', action.payload.id);
        return state;
      }

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
    case 'LOAD_THINKING_BLOCKS':
      // Batch load thinking blocks
      return {
        ...state,
        thinkingBlocks: action.payload || []
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

    // Tool Call Actions
    case 'ADD_TOOL_CALL':
      // Prevent duplicate tool calls
      const toolCallExists = state.toolCalls.some(call => call.id === action.payload.id);
      if (toolCallExists) {
        console.warn('Preventing duplicate tool call:', action.payload.id);
        return state;
      }

      // Associate tool call with the current assistant message if available
      const currentAssistantMsg = state.messages.length > 0 && state.messages[state.messages.length - 1].role === 'assistant'
        ? state.messages[state.messages.length - 1]
        : null;

      const enhancedToolCall = currentAssistantMsg
        ? { ...action.payload, messageId: currentAssistantMsg.id }
        : action.payload;

      return {
        ...state,
        toolCalls: [...state.toolCalls, enhancedToolCall]
      };

    case 'UPDATE_TOOL_CALL':
      return {
        ...state,
        toolCalls: state.toolCalls.map(call =>
          call.id === action.payload.id ? { ...call, ...action.payload } : call
        )
      };

    case 'COMPLETE_TOOL_CALL':
      return {
        ...state,
        toolCalls: state.toolCalls.map(call =>
          call.id === action.payload.toolId
            ? { ...call, status: 'completed', result: action.payload.result, endTime: Date.now() }
            : call
        )
      };

    case 'FAIL_TOOL_CALL':
      return {
        ...state,
        toolCalls: state.toolCalls.map(call =>
          call.id === action.payload.toolId
            ? { ...call, status: 'failed', error: action.payload.error, endTime: Date.now() }
            : call
        )
      };

    case 'LOAD_TOOL_CALLS':
      // Batch load tool calls
      return {
        ...state,
        toolCalls: action.payload || []
      };

    case 'CLEAR_TOOL_CALLS':
      return {
        ...state,
        toolCalls: []
      };

    case 'ADD_INCOMPLETE_TOOL_CALLS':
      // Add incomplete tool calls (for showing before </tool> tag)
      const incompleteCalls = action.payload || [];
      const newToolCalls = incompleteCalls.filter(incompleteCall => 
        !state.toolCalls.some(existingCall => existingCall.id === incompleteCall.id)
      );

      if (newToolCalls.length > 0) {
        return {
          ...state,
          toolCalls: [...state.toolCalls, ...newToolCalls]
        };
      }
      return state;

    case 'REMOVE_INCOMPLETE_TOOL_CALLS':
      // Remove incomplete tool calls when they're completed or replaced
      return {
        ...state,
        toolCalls: state.toolCalls.filter(call => 
          !call.id.startsWith('incomplete-tool-')
        )
      };

    default:
      return state;
  }
};

export { messagesReducer };