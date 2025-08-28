/**
 * Unit tests for App component's new chat creation functionality
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { ipcRenderer } from 'electron';
import App from '../../../App';
import messagesReducer from '../../../../store/slices/messagesSlice';
import settingsReducer from '../../../../store/slices/settingsSlice';

// Mock Electron IPC
const mockIpcRenderer = {
  invoke: jest.fn(),
  on: jest.fn(),
  removeAllListeners: jest.fn(),
  send: jest.fn(),
};

jest.mock('electron', () => ({
  ipcRenderer: mockIpcRenderer,
}));

// Mock other dependencies
jest.mock('../../../services/AudioCaptureService', () => ({
  AudioCaptureService: jest.fn(() => ({
    initialize: jest.fn(),
    startRecording: jest.fn(),
    stopRecording: jest.fn(),
    cleanup: jest.fn(),
  })),
}));

jest.mock('../../../services/ThinkingTokenHandler', () => ({
  ThinkingTokenHandler: jest.fn(() => ({
    handleThinkingToken: jest.fn(),
    cleanup: jest.fn(),
  })),
}));

jest.mock('../../../services/ToolTokenHandler', () => ({
  ToolTokenHandler: jest.fn(() => ({
    handleToolToken: jest.fn(),
    cleanup: jest.fn(),
  })),
}));

// Mock ChatList component to focus on new chat functionality
jest.mock('../../ChatList', () => {
  return function MockChatList({ onCreateNewChat, onSelectConversation, currentConversationId }: any) {
    return (
      <div data-testid="chat-list">
        <button
          data-testid="new-chat-button"
          onClick={onCreateNewChat}
        >
          New Chat
        </button>
        <div data-testid="current-conversation-id">
          {currentConversationId}
        </div>
      </div>
    );
  };
});

// Create a test store
const createTestStore = (preloadedState = {}) => {
  return configureStore({
    reducer: {
      messages: messagesReducer,
      settings: settingsReducer,
    },
    preloadedState,
  });
};

describe('App - New Chat Creation', () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    jest.clearAllMocks();
    store = createTestStore({
      messages: {
        messages: [],
        currentConversationId: 'test-conversation-1',
        isLoading: false,
        error: null,
      },
      settings: {
        apiKey: '',
        llmProvider: 'openai',
        model: 'gpt-4',
        isLoading: false,
        error: null,
      },
    });

    // Setup default IPC mocks
    mockIpcRenderer.invoke.mockImplementation((channel: string) => {
      switch (channel) {
        case 'create-conversation':
          return Promise.resolve('1609459200000');
        case 'get-conversations':
          return Promise.resolve([]);
        case 'get-conversation-history':
          return Promise.resolve([]);
        case 'get-settings':
          return Promise.resolve({});
        default:
          return Promise.resolve();
      }
    });

    mockIpcRenderer.on.mockImplementation(() => mockIpcRenderer);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('New Chat Button Functionality', () => {
    it('should render new chat button', async () => {
      render(
        <Provider store={store}>
          <App />
        </Provider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('new-chat-button')).toBeInTheDocument();
      });
    });

    it('should call IPC create-conversation when new chat button is clicked', async () => {
      const mockConversationId = '1609459200000';
      mockIpcRenderer.invoke.mockImplementation((channel: string) => {
        if (channel === 'create-conversation') {
          return Promise.resolve(mockConversationId);
        }
        return Promise.resolve([]);
      });

      render(
        <Provider store={store}>
          <App />
        </Provider>
      );

      const newChatButton = await waitFor(() => 
        screen.getByTestId('new-chat-button')
      );

      fireEvent.click(newChatButton);

      await waitFor(() => {
        expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('create-conversation');
      });
    });

    it('should update current conversation ID after creating new chat', async () => {
      const mockConversationId = '1609459200001';
      mockIpcRenderer.invoke.mockImplementation((channel: string) => {
        if (channel === 'create-conversation') {
          return Promise.resolve(mockConversationId);
        }
        return Promise.resolve([]);
      });

      render(
        <Provider store={store}>
          <App />
        </Provider>
      );

      const newChatButton = await waitFor(() => 
        screen.getByTestId('new-chat-button')
      );

      fireEvent.click(newChatButton);

      await waitFor(() => {
        const currentConversationElement = screen.getByTestId('current-conversation-id');
        expect(currentConversationElement).toHaveTextContent(mockConversationId);
      });
    });

    it('should clear current messages when creating new chat', async () => {
      // Start with some messages in the store
      store = createTestStore({
        messages: {
          messages: [
            {
              id: 1,
              conversationId: 'old-conversation',
              role: 'user',
              content: 'Hello',
              timestamp: Date.now(),
            },
            {
              id: 2,
              conversationId: 'old-conversation',
              role: 'assistant',
              content: 'Hi there!',
              timestamp: Date.now(),
            },
          ],
          currentConversationId: 'old-conversation',
          isLoading: false,
          error: null,
        },
        settings: {
          apiKey: '',
          llmProvider: 'openai',
          model: 'gpt-4',
          isLoading: false,
          error: null,
        },
      });

      const mockConversationId = '1609459200002';
      mockIpcRenderer.invoke.mockImplementation((channel: string) => {
        if (channel === 'create-conversation') {
          return Promise.resolve(mockConversationId);
        }
        if (channel === 'get-conversation-history') {
          return Promise.resolve([]); // New conversation has no messages
        }
        return Promise.resolve([]);
      });

      render(
        <Provider store={store}>
          <App />
        </Provider>
      );

      const newChatButton = await waitFor(() => 
        screen.getByTestId('new-chat-button')
      );

      fireEvent.click(newChatButton);

      await waitFor(() => {
        // Verify the conversation ID changed
        const currentConversationElement = screen.getByTestId('current-conversation-id');
        expect(currentConversationElement).toHaveTextContent(mockConversationId);
      });

      // Verify that get-conversation-history was called for the new conversation
      await waitFor(() => {
        expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(
          'get-conversation-history',
          mockConversationId,
          100
        );
      });
    });

    it('should handle create-conversation IPC errors gracefully', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockError = new Error('Failed to create conversation');
      
      mockIpcRenderer.invoke.mockImplementation((channel: string) => {
        if (channel === 'create-conversation') {
          return Promise.reject(mockError);
        }
        return Promise.resolve([]);
      });

      render(
        <Provider store={store}>
          <App />
        </Provider>
      );

      const newChatButton = await waitFor(() => 
        screen.getByTestId('new-chat-button')
      );

      fireEvent.click(newChatButton);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error creating new conversation:', mockError);
      });

      consoleErrorSpy.mockRestore();
    });

    it('should handle concurrent new chat creation requests', async () => {
      let callCount = 0;
      const mockConversationIds = ['1609459200001', '1609459200002', '1609459200003'];
      
      mockIpcRenderer.invoke.mockImplementation((channel: string) => {
        if (channel === 'create-conversation') {
          const id = mockConversationIds[callCount];
          callCount++;
          return Promise.resolve(id);
        }
        return Promise.resolve([]);
      });

      render(
        <Provider store={store}>
          <App />
        </Provider>
      );

      const newChatButton = await waitFor(() => 
        screen.getByTestId('new-chat-button')
      );

      // Click multiple times rapidly
      fireEvent.click(newChatButton);
      fireEvent.click(newChatButton);
      fireEvent.click(newChatButton);

      await waitFor(() => {
        expect(mockIpcRenderer.invoke).toHaveBeenCalledTimes(6); // 3 create calls + 3 get-conversation-history calls
      });

      // The last conversation ID should be the final one
      await waitFor(() => {
        const currentConversationElement = screen.getByTestId('current-conversation-id');
        expect(currentConversationElement).toHaveTextContent(mockConversationIds[2]);
      });
    });
  });

  describe('Redux State Management', () => {
    it('should dispatch setCurrentConversationId action when creating new chat', async () => {
      const mockConversationId = '1609459200003';
      mockIpcRenderer.invoke.mockImplementation((channel: string) => {
        if (channel === 'create-conversation') {
          return Promise.resolve(mockConversationId);
        }
        return Promise.resolve([]);
      });

      render(
        <Provider store={store}>
          <App />
        </Provider>
      );

      const newChatButton = await waitFor(() => 
        screen.getByTestId('new-chat-button')
      );

      // Get initial state
      const initialState = store.getState();
      expect(initialState.messages.currentConversationId).toBe('test-conversation-1');

      fireEvent.click(newChatButton);

      await waitFor(() => {
        const finalState = store.getState();
        expect(finalState.messages.currentConversationId).toBe(mockConversationId);
      });
    });

    it('should dispatch clearMessages action when creating new chat', async () => {
      // Start with messages in the store
      store = createTestStore({
        messages: {
          messages: [
            {
              id: 1,
              conversationId: 'old-conversation',
              role: 'user',
              content: 'Test message',
              timestamp: Date.now(),
            },
          ],
          currentConversationId: 'old-conversation',
          isLoading: false,
          error: null,
        },
        settings: {
          apiKey: '',
          llmProvider: 'openai',
          model: 'gpt-4',
          isLoading: false,
          error: null,
        },
      });

      const mockConversationId = '1609459200004';
      mockIpcRenderer.invoke.mockImplementation((channel: string) => {
        if (channel === 'create-conversation') {
          return Promise.resolve(mockConversationId);
        }
        if (channel === 'get-conversation-history') {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      render(
        <Provider store={store}>
          <App />
        </Provider>
      );

      // Verify initial state has messages
      expect(store.getState().messages.messages).toHaveLength(1);

      const newChatButton = await waitFor(() => 
        screen.getByTestId('new-chat-button')
      );

      fireEvent.click(newChatButton);

      await waitFor(() => {
        // Messages should be cleared after conversation history is loaded (empty for new conversation)
        const finalState = store.getState();
        expect(finalState.messages.messages).toHaveLength(0);
      });
    });
  });

  describe('Component Integration', () => {
    it('should pass correct props to ChatList component', async () => {
      render(
        <Provider store={store}>
          <App />
        </Provider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('chat-list')).toBeInTheDocument();
        expect(screen.getByTestId('current-conversation-id')).toHaveTextContent('test-conversation-1');
      });
    });

    it('should trigger ChatList refresh when conversation ID changes', async () => {
      const mockConversationId = '1609459200005';
      let getConversationsCallCount = 0;
      
      mockIpcRenderer.invoke.mockImplementation((channel: string) => {
        if (channel === 'create-conversation') {
          return Promise.resolve(mockConversationId);
        }
        if (channel === 'get-conversations') {
          getConversationsCallCount++;
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });

      render(
        <Provider store={store}>
          <App />
        </Provider>
      );

      const initialGetConversationsCalls = getConversationsCallCount;

      const newChatButton = await waitFor(() => 
        screen.getByTestId('new-chat-button')
      );

      fireEvent.click(newChatButton);

      await waitFor(() => {
        // ChatList should call get-conversations when currentConversationId changes
        expect(getConversationsCallCount).toBeGreaterThan(initialGetConversationsCalls);
      });
    });
  });

  describe('Error Scenarios', () => {
    it('should maintain previous conversation ID if create-conversation fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const originalConversationId = store.getState().messages.currentConversationId;
      
      mockIpcRenderer.invoke.mockImplementation((channel: string) => {
        if (channel === 'create-conversation') {
          return Promise.reject(new Error('Database error'));
        }
        return Promise.resolve([]);
      });

      render(
        <Provider store={store}>
          <App />
        </Provider>
      );

      const newChatButton = await waitFor(() => 
        screen.getByTestId('new-chat-button')
      );

      fireEvent.click(newChatButton);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      // Should maintain original conversation ID
      expect(store.getState().messages.currentConversationId).toBe(originalConversationId);

      consoleErrorSpy.mockRestore();
    });

    it('should handle undefined/null conversation ID from IPC', async () => {
      mockIpcRenderer.invoke.mockImplementation((channel: string) => {
        if (channel === 'create-conversation') {
          return Promise.resolve(null);
        }
        return Promise.resolve([]);
      });

      render(
        <Provider store={store}>
          <App />
        </Provider>
      );

      const newChatButton = await waitFor(() => 
        screen.getByTestId('new-chat-button')
      );

      fireEvent.click(newChatButton);

      // Should not crash and should maintain original conversation ID
      await waitFor(() => {
        expect(store.getState().messages.currentConversationId).toBe('test-conversation-1');
      });
    });
  });
});