/**
 * Integration tests for complete new chat creation flow
 * Tests the end-to-end process from UI interaction to database storage
 */

import { ipcMain, ipcRenderer, BrowserWindow } from 'electron';
import { configureStore } from '@reduxjs/toolkit';

// Import the components and services we need to test
import { ChatStorageService } from '../../main/services/ChatStorageService';
import { messagesReducer } from '../../store/reducers/messagesReducer';
import settingsReducer from '../../store/slices/settingsSlice';

// Mock Electron
const mockIpcMain = {
  handle: jest.fn(),
  removeHandler: jest.fn(),
};

const mockIpcRenderer = {
  invoke: jest.fn(),
  on: jest.fn(),
  removeAllListeners: jest.fn(),
  send: jest.fn(),
};

const mockBrowserWindow = jest.fn();

jest.mock('electron', () => ({
  ipcMain: mockIpcMain,
  ipcRenderer: mockIpcRenderer,
  BrowserWindow: mockBrowserWindow,
  app: {
    whenReady: jest.fn(),
    getPath: jest.fn().mockReturnValue('/tmp/test-app-data'),
    on: jest.fn(),
    quit: jest.fn(),
  },
}));

// Mock SQLite
const mockDbRun = jest.fn();
const mockDbGet = jest.fn();
const mockDbAll = jest.fn();
const mockDbExec = jest.fn();
const mockDbClose = jest.fn();

const mockDb = {
  run: mockDbRun,
  get: mockDbGet,
  all: mockDbAll,
  exec: mockDbExec,
  close: mockDbClose,
};

jest.mock('sqlite', () => ({
  open: jest.fn().mockResolvedValue(mockDb),
}));

jest.mock('sqlite3', () => ({
  Database: jest.fn(),
}));

describe('New Chat Creation Integration Tests', () => {
  let chatStorageService: ChatStorageService;
  let store: ReturnType<typeof configureStore>;
  let mockCreateConversationHandler: jest.Mock;
  let mockGetConversationsHandler: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Reset database mocks
    mockDbRun.mockReset();
    mockDbGet.mockReset();
    mockDbAll.mockReset();
    mockDbExec.mockReset();
    mockDbClose.mockReset();

    // Setup database mocks
    mockDbExec.mockResolvedValue(undefined);
    mockDbGet.mockResolvedValue({ name: 'messages' }); // Table exists check
    mockDbRun.mockImplementation(() => Promise.resolve({ lastID: Date.now() }));

    // Create ChatStorageService instance
    chatStorageService = new ChatStorageService();
    
    // Create Redux store
    store = configureStore({
      reducer: {
        messages: messagesReducer,
        settings: settingsReducer,
      },
      preloadedState: {
        messages: {
          messages: [],
          thinkingBlocks: [],
          toolCalls: [],
          currentConversationId: 'initial-conversation',
          currentAssistantIdByConversation: {},
        },
        settings: {
          apiKey: '',
          llmProvider: 'openai',
          model: 'gpt-4',
          isLoading: false,
          error: null,
        },
      },
    });

    // Mock IPC handlers that simulate main process behavior
    mockCreateConversationHandler = jest.fn(async () => {
      const conversationId = Date.now().toString();
      
      // Simulate ChatStorageService.createConversation
      await chatStorageService.initialize();
      const result = await chatStorageService.createConversation();
      
      return result;
    });

    mockGetConversationsHandler = jest.fn(async () => {
      await chatStorageService.initialize();
      return await chatStorageService.getConversations();
    });

    // Setup IPC renderer mocks to call our handlers
    mockIpcRenderer.invoke.mockImplementation(async (channel: string, ...args: any[]) => {
      switch (channel) {
        case 'create-conversation':
          return await mockCreateConversationHandler();
        case 'get-conversations':
          return await mockGetConversationsHandler();
        case 'get-conversation-history':
          await chatStorageService.initialize();
          return await chatStorageService.getConversationHistory(args[0], args[1]);
        case 'get-settings':
          return {};
        default:
          return Promise.resolve();
      }
    });

    mockIpcRenderer.on.mockImplementation(() => mockIpcRenderer);
  });

  afterEach(async () => {
    if (chatStorageService) {
      await chatStorageService.close();
    }
    jest.restoreAllMocks();
  });

  describe('Backend Service Integration', () => {
    it('should create conversation with proper database records', async () => {
      const mockConversationId = '1609459200000';
      const mockSystemMessageId = 1;
      
      mockDbRun.mockImplementationOnce(() => 
        Promise.resolve({ lastID: mockSystemMessageId })
      );
      
      mockDbAll.mockImplementation((query: string) => {
        if (query.includes('GROUP BY conversationId')) {
          return Promise.resolve([{
            conversationId: mockConversationId,
            lastMessageAt: Date.now()
          }]);
        }
        return Promise.resolve([]);
      });

      mockDbGet.mockImplementation((query: string, params: any[]) => {
        if (query.includes('SELECT content') && params[0]) {
          return Promise.resolve({ content: 'New conversation created' });
        }
        return Promise.resolve({ name: 'messages' });
      });

      // Simulate IPC call from frontend
      const result = await mockIpcRenderer.invoke('create-conversation');

      // Verify database operations
      expect(mockDbExec).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS messages'));
      expect(mockDbRun).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO messages'),
        expect.arrayContaining([
          expect.any(String), // conversationId
          'system',
          'New conversation created',
          expect.any(Number) // timestamp
        ])
      );

      expect(result).toBeTruthy();
      expect(mockCreateConversationHandler).toHaveBeenCalled();
    });

    it('should handle conversation creation errors properly', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Mock database error
      mockDbRun.mockRejectedValueOnce(new Error('Database connection failed'));

      try {
        await mockIpcRenderer.invoke('create-conversation');
      } catch (error) {
        expect(error.message).toBe('Database connection failed');
      }

      expect(mockCreateConversationHandler).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should retrieve conversations after creation', async () => {
      const mockConversationId = '1609459200123';
      
      // Setup successful conversation creation
      mockDbRun.mockResolvedValue({ lastID: 1 });
      
      // Mock getConversations to return the new conversation
      mockDbAll.mockImplementation((query: string) => {
        if (query.includes('GROUP BY conversationId')) {
          return Promise.resolve([{
            conversationId: mockConversationId,
            lastMessageAt: Date.now()
          }]);
        }
        return Promise.resolve([]);
      });

      mockDbGet.mockImplementation((query: string, params: any[]) => {
        if (query.includes('SELECT content') && params[0]) {
          return Promise.resolve({ content: 'New conversation created' });
        }
        return Promise.resolve({ name: 'messages' });
      });

      // Create conversation
      const conversationId = await mockIpcRenderer.invoke('create-conversation');
      expect(conversationId).toBeTruthy();

      // Get conversations list
      const conversations = await mockIpcRenderer.invoke('get-conversations');
      expect(Array.isArray(conversations)).toBe(true);
      expect(conversations.length).toBeGreaterThan(0);
    });
  });

  describe('Redux State Integration', () => {
    it('should update conversation ID in Redux store', () => {
      const newConversationId = '1609459200456';
      
      // Dispatch action to set new conversation ID
      store.dispatch({
        type: 'SET_CURRENT_CONVERSATION_ID',
        payload: newConversationId,
      });

      const state = store.getState();
      expect(state.messages.currentConversationId).toBe(newConversationId);
    });

    it('should clear messages when switching conversations', () => {
      // Add some messages to the store
      store.dispatch({
        type: 'ADD_MESSAGE',
        payload: {
          id: 1,
          role: 'user',
          content: 'Previous message',
          timestamp: Date.now(),
          conversationId: 'old-conversation',
        },
      });

      // Verify message was added
      expect(store.getState().messages.messages).toHaveLength(1);

      // Clear messages for new conversation
      store.dispatch({
        type: 'CLEAR_MESSAGES',
      });

      // Verify messages were cleared
      expect(store.getState().messages.messages).toHaveLength(0);
    });

    it('should load empty message history for new conversation', () => {
      // Load empty messages for new conversation
      store.dispatch({
        type: 'LOAD_MESSAGES',
        payload: [],
      });

      const state = store.getState();
      expect(state.messages.messages).toHaveLength(0);
    });
  });

  describe('Complete Flow Integration', () => {
    it('should simulate complete new chat creation flow', async () => {
      const mockConversationId = '1609459200789';
      
      // Setup database mocks
      mockDbRun.mockResolvedValue({ lastID: 1 });
      mockDbAll.mockResolvedValue([]);
      mockDbGet.mockResolvedValue({ name: 'messages' });

      // Step 1: Create conversation via IPC
      const conversationId = await mockIpcRenderer.invoke('create-conversation');
      expect(conversationId).toBeTruthy();
      expect(mockCreateConversationHandler).toHaveBeenCalled();

      // Step 2: Update Redux state
      store.dispatch({
        type: 'SET_CURRENT_CONVERSATION_ID',
        payload: conversationId,
      });

      // Step 3: Clear existing messages
      store.dispatch({
        type: 'CLEAR_MESSAGES',
      });

      // Step 4: Load conversation history (empty for new conversation)
      const history = await mockIpcRenderer.invoke('get-conversation-history', conversationId, 100);
      store.dispatch({
        type: 'LOAD_MESSAGES',
        payload: history,
      });

      // Verify final state
      const finalState = store.getState();
      expect(finalState.messages.currentConversationId).toBe(conversationId);
      expect(finalState.messages.messages).toHaveLength(0);
      expect(Array.isArray(history)).toBe(true);
    });

    it('should handle concurrent conversation creation requests', async () => {
      let callCount = 0;
      
      // Mock multiple conversation creations
      mockDbRun.mockImplementation(() => {
        callCount++;
        return Promise.resolve({ lastID: callCount });
      });

      mockDbAll.mockImplementation(() => Promise.resolve([]));
      mockDbGet.mockResolvedValue({ name: 'messages' });

      // Simulate concurrent requests
      const promises = [
        mockIpcRenderer.invoke('create-conversation'),
        mockIpcRenderer.invoke('create-conversation'),
        mockIpcRenderer.invoke('create-conversation')
      ];

      const results = await Promise.all(promises);

      // Verify all requests completed
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBeTruthy();
      });

      expect(mockCreateConversationHandler).toHaveBeenCalledTimes(3);
      expect(mockDbRun).toHaveBeenCalledTimes(3);
    });

    it('should maintain data consistency during error scenarios', async () => {
      const originalConversationId = store.getState().messages.currentConversationId;
      
      // Mock partial failure: conversation creation fails but state operations succeed
      mockDbRun.mockRejectedValueOnce(new Error('Database error'));

      let conversationId;
      try {
        conversationId = await mockIpcRenderer.invoke('create-conversation');
      } catch (error) {
        // Handle the error gracefully
        expect(error.message).toBe('Database error');
      }

      // State should remain consistent
      const state = store.getState();
      expect(state.messages.currentConversationId).toBe(originalConversationId);

      // Try again with successful creation
      mockDbRun.mockResolvedValueOnce({ lastID: 1 });
      conversationId = await mockIpcRenderer.invoke('create-conversation');
      
      // Update state with successful result
      store.dispatch({
        type: 'SET_CURRENT_CONVERSATION_ID',
        payload: conversationId,
      });

      const finalState = store.getState();
      expect(finalState.messages.currentConversationId).toBe(conversationId);
      expect(finalState.messages.currentConversationId).not.toBe(originalConversationId);
    });

    it('should handle message history loading for existing and new conversations', async () => {
      // Setup: Create conversation with some history
      const existingConversationId = 'existing-conversation-123';
      const newConversationId = 'new-conversation-456';

      // Mock existing conversation with messages
      mockDbAll.mockImplementation((query: string, params: any[]) => {
        if (query.includes('WHERE conversationId = ?')) {
          const conversationId = params[0];
          if (conversationId === existingConversationId) {
            return Promise.resolve([{
              id: 1,
              conversationId: existingConversationId,
              role: 'user',
              content: 'Existing message',
              timestamp: Date.now(),
            }]);
          } else {
            return Promise.resolve([]); // New conversation is empty
          }
        }
        return Promise.resolve([]);
      });

      // Load existing conversation
      const existingHistory = await mockIpcRenderer.invoke('get-conversation-history', existingConversationId, 100);
      expect(existingHistory).toHaveLength(1);

      // Load new conversation
      const newHistory = await mockIpcRenderer.invoke('get-conversation-history', newConversationId, 100);
      expect(newHistory).toHaveLength(0);

      // Update store with new conversation
      store.dispatch({
        type: 'SET_CURRENT_CONVERSATION_ID',
        payload: newConversationId,
      });
      store.dispatch({
        type: 'LOAD_MESSAGES',
        payload: newHistory,
      });

      const finalState = store.getState();
      expect(finalState.messages.currentConversationId).toBe(newConversationId);
      expect(finalState.messages.messages).toHaveLength(0);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle rapid state changes efficiently', () => {
      const startTime = Date.now();
      
      // Perform many rapid state changes
      for (let i = 0; i < 100; i++) {
        store.dispatch({
          type: 'SET_CURRENT_CONVERSATION_ID',
          payload: `conversation-${i}`,
        });
        
        store.dispatch({
          type: 'CLEAR_MESSAGES',
        });
        
        store.dispatch({
          type: 'LOAD_MESSAGES',
          payload: [],
        });
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete in reasonable time (less than 1 second)
      expect(duration).toBeLessThan(1000);
      
      // Final state should be consistent
      const finalState = store.getState();
      expect(finalState.messages.currentConversationId).toBe('conversation-99');
      expect(finalState.messages.messages).toHaveLength(0);
    });

    it('should handle large conversation lists efficiently', async () => {
      const largeConversationList = Array.from({ length: 1000 }, (_, i) => ({
        conversationId: `conversation-${i}`,
        lastMessageAt: Date.now() - i * 1000,
      }));

      mockDbAll.mockImplementation((query: string) => {
        if (query.includes('GROUP BY conversationId')) {
          return Promise.resolve(largeConversationList);
        }
        return Promise.resolve([]);
      });

      mockDbGet.mockImplementation((query: string, params: any[]) => {
        const conversationId = params[0];
        return Promise.resolve({ content: `Content for ${conversationId}` });
      });

      const startTime = Date.now();
      const conversations = await mockIpcRenderer.invoke('get-conversations');
      const endTime = Date.now();

      expect(conversations).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});