// src/store/reducers/messagesReducer.ts
// Manages messages and thinking blocks state

import { v4 as uuidv4 } from 'uuid';

const initialState = {
  messages: [],
  thinkingBlocks: [],
  toolCalls: [],
  currentConversationId: uuidv4(), // Unique ID for the current conversation
  currentAssistantIdByConversation: {}, // Track current assistant message ID per conversation
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
      // Batch load messages (for conversation history) with deduplication
      const newMessages = action.payload || [];

      // Remove duplicates based on message ID and content
      const uniqueMessages = [];
      const seenIds = new Set();
      const seenContentHashes = new Set();

      for (const msg of newMessages) {
        const contentHash = `${msg.role}-${msg.content}-${msg.conversationId}`;

        if (!seenIds.has(msg.id) && !seenContentHashes.has(contentHash)) {
          seenIds.add(msg.id);
          seenContentHashes.add(contentHash);
          uniqueMessages.push(msg);
        } else {
          console.warn('Skipping duplicate message during load:', msg.id || contentHash);
        }
      }

      // Sort by timestamp to ensure proper chronological order
      uniqueMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      return {
        ...state,
        messages: uniqueMessages
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
          isStreaming: false,
          isIncomplete: false,
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

    case 'FINALIZE_STREAMING_MESSAGE':
      console.log('🔧 DEBUG: Processing FINALIZE_STREAMING_MESSAGE action for messageId:', action.payload.messageId);
      const updatedMessages = state.messages.map(message => {
        if (message.id === action.payload.messageId && message.conversationId === action.payload.conversationId) {
          console.log('🔧 DEBUG: Setting isStreaming to false for message:', message.id);
          return { ...message, isStreaming: false, isIncomplete: false };
        }
        return message;
      });
      const updatedThinking = state.thinkingBlocks.map(block => {
        if (block.messageId === action.payload.messageId && block.conversationId === action.payload.conversationId) {
          console.log('🔧 DEBUG: Setting isStreaming to false for message:', block.id);
          return { ...block, isStreaming: false, isIncomplete: false };
        }
        return block;
      });
      console.log('🔧 DEBUG: Messages after finalization:', updatedMessages.filter(m => m.role === 'assistant').map(m => ({ id: m.id, isStreaming: m.isStreaming })));
      return {
        ...state,
        messages: updatedMessages,
        thinkingBlocks: updatedThinking
      };
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

      // Associate thinking block with the current assistant message if available
      const currentAssistantMessage = state.messages.length > 0 && state.messages[state.messages.length - 1].role === 'assistant'
        ? state.messages[state.messages.length - 1]
        : null;

      const enhancedBlock = currentAssistantMessage
        ? { ...action.payload, messageId: currentAssistantMessage.id }
        : action.payload;
      if (blockExists) {
        // If the block already exists, we can either update it or ignore
        console.warn('Preventing duplicate thinking block:', enhancedBlock.id);
        return {
          ...state,
          thinkingBlocks: state.thinkingBlocks.map(block =>
            block.id === enhancedBlock.id ? { ...block, ...enhancedBlock } : block
          )
        };
      }
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

    case 'SET_CURRENT_CONVERSATION_ID':
      return {
        ...state,
        currentConversationId: action.payload || uuidv4() // Reset to a new ID if payload is null
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
    case 'REMOVE_STREAMING_THINKING_BLOCKS':
      return {
        ...state,
        thinkingBlocks: state.thinkingBlocks.filter(block => !block.isStreaming)
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

    case 'SET_CURRENT_ASSISTANT_ID':
      // Track the current assistant message ID for a conversation
      return {
        ...state,
        currentAssistantIdByConversation: {
          ...state.currentAssistantIdByConversation,
          [action.payload.conversationId]: action.payload.messageId
        }
      };

    default:
      return state;
  }
};

export { messagesReducer };