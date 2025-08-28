/**
 * Unit tests for messagesReducer focusing on new chat creation functionality
 */

import { messagesReducer } from '../reducers/messagesReducer';
import { v4 as uuidv4 } from 'uuid';

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(),
}));

const mockUuid = uuidv4 as jest.MockedFunction<typeof uuidv4>;

describe('messagesReducer - New Chat Creation', () => {
  const initialState = {
    messages: [],
    thinkingBlocks: [],
    toolCalls: [],
    currentConversationId: 'initial-conversation-id',
    currentAssistantIdByConversation: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUuid.mockReturnValue('mock-uuid-value');
  });

  describe('SET_CURRENT_CONVERSATION_ID action', () => {
    it('should update the current conversation ID', () => {
      const action = {
        type: 'SET_CURRENT_CONVERSATION_ID',
        payload: 'new-conversation-id',
      };

      const newState = messagesReducer(initialState, action);

      expect(newState).toEqual({
        ...initialState,
        currentConversationId: 'new-conversation-id',
      });
    });

    it('should generate new UUID when payload is null', () => {
      mockUuid.mockReturnValue('generated-uuid-123');

      const action = {
        type: 'SET_CURRENT_CONVERSATION_ID',
        payload: null,
      };

      const newState = messagesReducer(initialState, action);

      expect(mockUuid).toHaveBeenCalled();
      expect(newState).toEqual({
        ...initialState,
        currentConversationId: 'generated-uuid-123',
      });
    });

    it('should generate new UUID when payload is undefined', () => {
      mockUuid.mockReturnValue('generated-uuid-456');

      const action = {
        type: 'SET_CURRENT_CONVERSATION_ID',
        payload: undefined,
      };

      const newState = messagesReducer(initialState, action);

      expect(mockUuid).toHaveBeenCalled();
      expect(newState).toEqual({
        ...initialState,
        currentConversationId: 'generated-uuid-456',
      });
    });

    it('should generate new UUID when payload is empty string', () => {
      mockUuid.mockReturnValue('generated-uuid-789');

      const action = {
        type: 'SET_CURRENT_CONVERSATION_ID',
        payload: '',
      };

      const newState = messagesReducer(initialState, action);

      expect(mockUuid).toHaveBeenCalled();
      expect(newState).toEqual({
        ...initialState,
        currentConversationId: 'generated-uuid-789',
      });
    });

    it('should not mutate the original state', () => {
      const originalState = { ...initialState };
      const action = {
        type: 'SET_CURRENT_CONVERSATION_ID',
        payload: 'new-conversation-id',
      };

      const newState = messagesReducer(initialState, action);

      expect(initialState).toEqual(originalState);
      expect(newState).not.toBe(initialState);
    });
  });

  describe('CLEAR_MESSAGES action', () => {
    it('should clear all messages, thinking blocks, and tool calls', () => {
      const stateWithData = {
        ...initialState,
        messages: [
          {
            id: 1,
            role: 'user',
            content: 'Hello',
            timestamp: Date.now(),
            conversationId: 'test-conversation',
          },
          {
            id: 2,
            role: 'assistant',
            content: 'Hi there!',
            timestamp: Date.now(),
            conversationId: 'test-conversation',
          },
        ],
        thinkingBlocks: [
          {
            id: 'thinking-1',
            content: 'Thinking...',
            conversationId: 'test-conversation',
            startTime: Date.now(),
            timestamp: Date.now(),
          },
        ],
        toolCalls: [
          {
            id: 'tool-1',
            name: 'web_search',
            status: 'running',
            conversationId: 'test-conversation',
          },
        ],
      };

      const action = {
        type: 'CLEAR_MESSAGES',
      };

      const newState = messagesReducer(stateWithData, action);

      expect(newState).toEqual({
        ...stateWithData,
        messages: [],
        thinkingBlocks: [],
        toolCalls: [],
      });
    });

    it('should preserve current conversation ID when clearing messages', () => {
      const stateWithMessages = {
        ...initialState,
        currentConversationId: 'important-conversation-id',
        messages: [
          {
            id: 1,
            role: 'user',
            content: 'Test message',
            timestamp: Date.now(),
            conversationId: 'important-conversation-id',
          },
        ],
      };

      const action = {
        type: 'CLEAR_MESSAGES',
      };

      const newState = messagesReducer(stateWithMessages, action);

      expect(newState.currentConversationId).toBe('important-conversation-id');
      expect(newState.messages).toHaveLength(0);
    });

    it('should preserve currentAssistantIdByConversation when clearing messages', () => {
      const stateWithAssistantIds = {
        ...initialState,
        currentAssistantIdByConversation: {
          'conversation-1': 'assistant-msg-1',
          'conversation-2': 'assistant-msg-2',
        },
        messages: [
          {
            id: 1,
            role: 'user',
            content: 'Test',
            timestamp: Date.now(),
            conversationId: 'conversation-1',
          },
        ],
      };

      const action = {
        type: 'CLEAR_MESSAGES',
      };

      const newState = messagesReducer(stateWithAssistantIds, action);

      expect(newState.currentAssistantIdByConversation).toEqual({
        'conversation-1': 'assistant-msg-1',
        'conversation-2': 'assistant-msg-2',
      });
      expect(newState.messages).toHaveLength(0);
    });
  });

  describe('LOAD_MESSAGES action', () => {
    it('should load messages for new conversation', () => {
      const newMessages = [
        {
          id: 1,
          role: 'user',
          content: 'Hello in new conversation',
          timestamp: 1609459200000,
          conversationId: 'new-conversation-id',
        },
        {
          id: 2,
          role: 'assistant',
          content: 'Hi there in new conversation!',
          timestamp: 1609459200001,
          conversationId: 'new-conversation-id',
        },
      ];

      const action = {
        type: 'LOAD_MESSAGES',
        payload: newMessages,
      };

      const newState = messagesReducer(initialState, action);

      expect(newState.messages).toEqual(newMessages);
      expect(newState.messages).toHaveLength(2);
    });

    it('should handle empty message array for new conversation', () => {
      const action = {
        type: 'LOAD_MESSAGES',
        payload: [],
      };

      const newState = messagesReducer(initialState, action);

      expect(newState.messages).toEqual([]);
      expect(newState.messages).toHaveLength(0);
    });

    it('should handle null payload for new conversation', () => {
      const action = {
        type: 'LOAD_MESSAGES',
        payload: null,
      };

      const newState = messagesReducer(initialState, action);

      expect(newState.messages).toEqual([]);
    });

    it('should sort loaded messages chronologically', () => {
      const unsortedMessages = [
        {
          id: 3,
          role: 'assistant',
          content: 'Third message',
          timestamp: 1609459200002,
          conversationId: 'new-conversation-id',
        },
        {
          id: 1,
          role: 'user',
          content: 'First message',
          timestamp: 1609459200000,
          conversationId: 'new-conversation-id',
        },
        {
          id: 2,
          role: 'user',
          content: 'Second message',
          timestamp: 1609459200001,
          conversationId: 'new-conversation-id',
        },
      ];

      const action = {
        type: 'LOAD_MESSAGES',
        payload: unsortedMessages,
      };

      const newState = messagesReducer(initialState, action);

      expect(newState.messages[0].content).toBe('First message');
      expect(newState.messages[1].content).toBe('Second message');
      expect(newState.messages[2].content).toBe('Third message');
    });

    it('should deduplicate messages by ID during load', () => {
      const duplicateMessages = [
        {
          id: 1,
          role: 'user',
          content: 'Original message',
          timestamp: 1609459200000,
          conversationId: 'new-conversation-id',
        },
        {
          id: 1,
          role: 'user',
          content: 'Duplicate message with same ID',
          timestamp: 1609459200001,
          conversationId: 'new-conversation-id',
        },
        {
          id: 2,
          role: 'assistant',
          content: 'Different message',
          timestamp: 1609459200002,
          conversationId: 'new-conversation-id',
        },
      ];

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const action = {
        type: 'LOAD_MESSAGES',
        payload: duplicateMessages,
      };

      const newState = messagesReducer(initialState, action);

      expect(newState.messages).toHaveLength(2);
      expect(newState.messages[0].content).toBe('Original message');
      expect(newState.messages[1].content).toBe('Different message');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Skipping duplicate message during load:',
        1
      );

      consoleWarnSpy.mockRestore();
    });

    it('should deduplicate messages by content hash', () => {
      const duplicateContentMessages = [
        {
          id: 1,
          role: 'user',
          content: 'Hello world',
          timestamp: 1609459200000,
          conversationId: 'new-conversation-id',
        },
        {
          id: 2,
          role: 'user',
          content: 'Hello world', // Same content, role, and conversationId
          timestamp: 1609459200001,
          conversationId: 'new-conversation-id',
        },
        {
          id: 3,
          role: 'assistant',
          content: 'Hello world', // Same content but different role - should be kept
          timestamp: 1609459200002,
          conversationId: 'new-conversation-id',
        },
      ];

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const action = {
        type: 'LOAD_MESSAGES',
        payload: duplicateContentMessages,
      };

      const newState = messagesReducer(initialState, action);

      expect(newState.messages).toHaveLength(2);
      expect(newState.messages[0].role).toBe('user');
      expect(newState.messages[1].role).toBe('assistant');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Skipping duplicate message during load:',
        'user-Hello world-new-conversation-id'
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('New Chat Creation Integration', () => {
    it('should handle complete new chat flow', () => {
      let state = initialState;

      // Step 1: Set new conversation ID
      state = messagesReducer(state, {
        type: 'SET_CURRENT_CONVERSATION_ID',
        payload: 'new-chat-123',
      });

      expect(state.currentConversationId).toBe('new-chat-123');

      // Step 2: Clear any existing messages
      state = messagesReducer(state, {
        type: 'CLEAR_MESSAGES',
      });

      expect(state.messages).toHaveLength(0);
      expect(state.thinkingBlocks).toHaveLength(0);
      expect(state.toolCalls).toHaveLength(0);

      // Step 3: Load empty conversation history (typical for new chat)
      state = messagesReducer(state, {
        type: 'LOAD_MESSAGES',
        payload: [],
      });

      expect(state.messages).toHaveLength(0);
      expect(state.currentConversationId).toBe('new-chat-123');
    });

    it('should handle switching between conversations', () => {
      // Start with conversation 1
      let state = messagesReducer(initialState, {
        type: 'SET_CURRENT_CONVERSATION_ID',
        payload: 'conversation-1',
      });

      // Load messages for conversation 1
      state = messagesReducer(state, {
        type: 'LOAD_MESSAGES',
        payload: [
          {
            id: 1,
            role: 'user',
            content: 'Message in conversation 1',
            timestamp: Date.now(),
            conversationId: 'conversation-1',
          },
        ],
      });

      expect(state.currentConversationId).toBe('conversation-1');
      expect(state.messages).toHaveLength(1);

      // Switch to new conversation
      state = messagesReducer(state, {
        type: 'SET_CURRENT_CONVERSATION_ID',
        payload: 'new-conversation-2',
      });

      // Clear and load new conversation messages
      state = messagesReducer(state, {
        type: 'CLEAR_MESSAGES',
      });

      state = messagesReducer(state, {
        type: 'LOAD_MESSAGES',
        payload: [], // New conversation has no messages
      });

      expect(state.currentConversationId).toBe('new-conversation-2');
      expect(state.messages).toHaveLength(0);
    });

    it('should preserve assistant tracking across conversation switches', () => {
      const stateWithAssistantIds = {
        ...initialState,
        currentAssistantIdByConversation: {
          'old-conversation': 'assistant-msg-123',
        },
      };

      // Switch to new conversation
      let state = messagesReducer(stateWithAssistantIds, {
        type: 'SET_CURRENT_CONVERSATION_ID',
        payload: 'new-conversation',
      });

      // Clear messages for new conversation
      state = messagesReducer(state, {
        type: 'CLEAR_MESSAGES',
      });

      // Assistant tracking for other conversations should be preserved
      expect(state.currentAssistantIdByConversation).toEqual({
        'old-conversation': 'assistant-msg-123',
      });
      expect(state.currentConversationId).toBe('new-conversation');
      expect(state.messages).toHaveLength(0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle undefined action', () => {
      const newState = messagesReducer(initialState, undefined);
      expect(newState).toBe(initialState);
    });

    it('should handle unknown action type', () => {
      const action = {
        type: 'UNKNOWN_ACTION',
        payload: 'some data',
      };

      const newState = messagesReducer(initialState, action);
      expect(newState).toBe(initialState);
    });

    it('should handle SET_CURRENT_CONVERSATION_ID with non-string payload', () => {
      mockUuid.mockReturnValue('fallback-uuid');

      const action = {
        type: 'SET_CURRENT_CONVERSATION_ID',
        payload: 123, // Non-string payload should trigger UUID generation
      };

      const newState = messagesReducer(initialState, action);

      expect(newState.currentConversationId).toBe(123);
    });

    it('should not lose state immutability with rapid actions', () => {
      const originalState = { ...initialState };
      let state = initialState;

      // Rapid sequence of actions
      state = messagesReducer(state, {
        type: 'SET_CURRENT_CONVERSATION_ID',
        payload: 'rapid-1',
      });

      state = messagesReducer(state, {
        type: 'CLEAR_MESSAGES',
      });

      state = messagesReducer(state, {
        type: 'SET_CURRENT_CONVERSATION_ID',
        payload: 'rapid-2',
      });

      // Original state should be unchanged
      expect(initialState).toEqual(originalState);

      // Final state should reflect last changes
      expect(state.currentConversationId).toBe('rapid-2');
      expect(state.messages).toHaveLength(0);
    });
  });
});