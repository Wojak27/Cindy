/**
 * Unit tests for main process IPC handlers related to chat creation
 */

import { ipcMain } from 'electron';

// Mock dependencies
const mockChatStorageService = {
    createConversation: jest.fn(),
    getConversations: jest.fn(),
};

// Mock Electron
jest.mock('electron', () => ({
    ipcMain: {
        handle: jest.fn(),
        removeHandler: jest.fn(),
    },
    app: {
        whenReady: jest.fn(),
        getPath: jest.fn().mockReturnValue('/tmp/test-app-data'),
        on: jest.fn(),
        quit: jest.fn(),
        dock: {
            hide: jest.fn(),
        },
    },
    BrowserWindow: jest.fn(),
    Menu: {
        setApplicationMenu: jest.fn(),
    },
    Tray: jest.fn(),
}));

describe('Main Process IPC Handlers', () => {
    let createConversationHandler: Function;
    let getConversationsHandler: Function;

    beforeAll(() => {
        // Simulate the IPC handler registration from main.ts
        // We'll capture the handlers for testing
        (ipcMain.handle as jest.Mock).mockImplementation((channel: string, handler: Function) => {
            if (channel === 'create-conversation') {
                createConversationHandler = handler;
            } else if (channel === 'get-conversations') {
                getConversationsHandler = handler;
            }
        });

        // Import main after mocking to trigger handler registration
        require('../main');
    });

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset mock implementations
        mockChatStorageService.createConversation.mockReset();
        mockChatStorageService.getConversations.mockReset();
    });

    describe('create-conversation IPC handler', () => {
        beforeEach(() => {
            // Mock the chatStorageService global variable
            (global as any).chatStorageService = mockChatStorageService;
        });

        afterEach(() => {
            delete (global as any).chatStorageService;
        });

        it('should create a conversation and return its ID', async () => {
            const mockConversationId = '1609459200000';
            mockChatStorageService.createConversation.mockResolvedValueOnce(mockConversationId);

            const result = await createConversationHandler();

            expect(mockChatStorageService.createConversation).toHaveBeenCalledTimes(1);
            expect(result).toBe(mockConversationId);
        });

        it('should handle missing chatStorageService gracefully', async () => {
            delete (global as any).chatStorageService;
            
            // Mock Date.now for fallback ID
            jest.spyOn(Date, 'now').mockReturnValueOnce(1609459200000);

            const result = await createConversationHandler();

            expect(result).toBe('1609459200000');
            expect(mockChatStorageService.createConversation).not.toHaveBeenCalled();
            
            (Date.now as jest.Mock).mockRestore();
        });

        it('should handle chatStorageService errors gracefully', async () => {
            const mockError = new Error('Database connection failed');
            mockChatStorageService.createConversation.mockRejectedValueOnce(mockError);
            
            // Mock Date.now for fallback ID
            jest.spyOn(Date, 'now').mockReturnValueOnce(1609459200000);

            const result = await createConversationHandler();

            expect(result).toBe('1609459200000');
            expect(mockChatStorageService.createConversation).toHaveBeenCalledTimes(1);
            
            (Date.now as jest.Mock).mockRestore();
        });

        it('should log errors when chatStorageService fails', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            const mockError = new Error('Database connection failed');
            mockChatStorageService.createConversation.mockRejectedValueOnce(mockError);
            
            jest.spyOn(Date, 'now').mockReturnValueOnce(1609459200000);

            await createConversationHandler();

            expect(consoleSpy).toHaveBeenCalledWith(
                'Main process - create-conversation: error creating conversation:', 
                mockError
            );
            
            consoleSpy.mockRestore();
            (Date.now as jest.Mock).mockRestore();
        });

        it('should log successful conversation creation', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            const mockConversationId = '1609459200000';
            mockChatStorageService.createConversation.mockResolvedValueOnce(mockConversationId);

            await createConversationHandler();

            expect(consoleSpy).toHaveBeenCalledWith('Main process - create-conversation IPC called');
            expect(consoleSpy).toHaveBeenCalledWith(
                'Main process - create-conversation: created new conversation with ID:', 
                mockConversationId
            );
            
            consoleSpy.mockRestore();
        });

        it('should handle concurrent conversation creation requests', async () => {
            const mockIds = ['1609459200001', '1609459200002', '1609459200003'];
            mockChatStorageService.createConversation
                .mockResolvedValueOnce(mockIds[0])
                .mockResolvedValueOnce(mockIds[1])
                .mockResolvedValueOnce(mockIds[2]);

            const promises = [
                createConversationHandler(),
                createConversationHandler(),
                createConversationHandler()
            ];

            const results = await Promise.all(promises);

            expect(mockChatStorageService.createConversation).toHaveBeenCalledTimes(3);
            expect(results).toEqual(mockIds);
            expect(new Set(results).size).toBe(3); // All results are unique
        });
    });

    describe('get-conversations IPC handler', () => {
        beforeEach(() => {
            (global as any).chatStorageService = mockChatStorageService;
        });

        afterEach(() => {
            delete (global as any).chatStorageService;
        });

        it('should retrieve conversations from chatStorageService', async () => {
            const mockConversations = [
                { id: '1', title: 'Conversation 1', lastMessageAt: 1609459200000 },
                { id: '2', title: 'Conversation 2', lastMessageAt: 1609459300000 }
            ];
            mockChatStorageService.getConversations.mockResolvedValueOnce(mockConversations);

            const result = await getConversationsHandler();

            expect(mockChatStorageService.getConversations).toHaveBeenCalledTimes(1);
            expect(result).toEqual(mockConversations);
        });

        it('should return empty array when chatStorageService is not available', async () => {
            delete (global as any).chatStorageService;

            const result = await getConversationsHandler();

            expect(result).toEqual([]);
            expect(mockChatStorageService.getConversations).not.toHaveBeenCalled();
        });

        it('should return empty array on chatStorageService error', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            const mockError = new Error('Database query failed');
            mockChatStorageService.getConversations.mockRejectedValueOnce(mockError);

            const result = await getConversationsHandler();

            expect(result).toEqual([]);
            expect(consoleSpy).toHaveBeenCalledWith(
                'Main process - get-conversations: error getting conversations:', 
                mockError
            );
            
            consoleSpy.mockRestore();
        });
    });

    describe('IPC handler registration', () => {
        it('should register create-conversation handler', () => {
            expect(ipcMain.handle).toHaveBeenCalledWith('create-conversation', expect.any(Function));
        });

        it('should register get-conversations handler', () => {
            expect(ipcMain.handle).toHaveBeenCalledWith('get-conversations', expect.any(Function));
        });
    });
});