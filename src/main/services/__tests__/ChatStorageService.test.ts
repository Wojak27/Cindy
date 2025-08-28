/**
 * Unit tests for ChatStorageService
 */

import { ChatStorageService, ChatMessage, ThinkingBlock } from '../ChatStorageService';
import * as path from 'path';

// Mock Electron app
jest.mock('electron', () => ({
    app: {
        getPath: jest.fn().mockReturnValue('/tmp/test-app-data')
    }
}));

// Mock SQLite
const mockDatabase = {
    exec: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(undefined),
    all: jest.fn().mockResolvedValue([]),
    run: jest.fn().mockResolvedValue({ lastID: 1 }),
    close: jest.fn().mockResolvedValue(undefined)
};

jest.mock('sqlite', () => ({
    open: jest.fn().mockResolvedValue(mockDatabase)
}));

jest.mock('sqlite3', () => ({
    Database: jest.fn()
}));

describe('ChatStorageService', () => {
    let chatService: ChatStorageService;

    beforeEach(() => {
        jest.clearAllMocks();
        chatService = new ChatStorageService();

        // Reset mock responses
        mockDatabase.all.mockResolvedValue([]);
        mockDatabase.get.mockResolvedValue(undefined);
        mockDatabase.run.mockResolvedValue({ lastID: 1 });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should create ChatStorageService', () => {
            expect(chatService).toBeInstanceOf(ChatStorageService);
        });
    });

    describe('initialize', () => {
        it('should initialize database and create tables', async () => {
            mockDatabase.get.mockResolvedValueOnce({ name: 'messages' }); // Table exists

            await chatService.initialize();

            const { open } = require('sqlite');
            expect(open).toHaveBeenCalledWith({
                filename: '/tmp/test-app-data/chat-history.db',
                driver: expect.any(Function)
            });
            
            // Should create tables and indexes
            expect(mockDatabase.exec).toHaveBeenCalledWith(
                expect.stringContaining('CREATE TABLE IF NOT EXISTS messages')
            );
            expect(mockDatabase.exec).toHaveBeenCalledWith(
                expect.stringContaining('CREATE TABLE IF NOT EXISTS thinking_blocks')
            );
        });

        it('should not initialize twice', async () => {
            mockDatabase.get.mockResolvedValue({ name: 'messages' });

            await chatService.initialize();
            await chatService.initialize(); // Second call

            const { open } = require('sqlite');
            expect(open).toHaveBeenCalledTimes(1);
        });

        it('should handle database initialization error', async () => {
            const { open } = require('sqlite');
            open.mockRejectedValueOnce(new Error('Database creation failed'));

            await expect(chatService.initialize()).rejects.toThrow('Database creation failed');
        });

        it('should verify database is working after initialization', async () => {
            mockDatabase.get.mockResolvedValueOnce({ name: 'messages' });

            await chatService.initialize();

            expect(mockDatabase.get).toHaveBeenCalledWith(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='messages'"
            );
        });

        it('should handle table verification failure', async () => {
            mockDatabase.get.mockResolvedValueOnce(null); // Table doesn't exist

            // Should not throw, just log error
            await expect(chatService.initialize()).resolves.not.toThrow();
        });
    });

    describe('saveMessage', () => {
        beforeEach(async () => {
            mockDatabase.get.mockResolvedValue({ name: 'messages' });
            await chatService.initialize();
        });

        it('should save message and return ID', async () => {
            const message: Omit<ChatMessage, 'id'> = {
                conversationId: 'conv-123',
                role: 'user',
                content: 'Hello world',
                timestamp: Date.now()
            };

            mockDatabase.run.mockResolvedValueOnce({ lastID: 42 });
            mockDatabase.get.mockResolvedValueOnce({ count: 1 }); // Verification query

            const messageId = await chatService.saveMessage(message);

            expect(messageId).toBe(42);
            expect(mockDatabase.run).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO messages'),
                expect.arrayContaining([
                    'conv-123',
                    'user',
                    'Hello world',
                    expect.any(Number)
                ])
            );
        });

        it('should initialize database if not already done', async () => {
            const uninitializedService = new ChatStorageService();
            mockDatabase.get.mockResolvedValue({ name: 'messages' });
            
            const message: Omit<ChatMessage, 'id'> = {
                conversationId: 'conv-123',
                role: 'user',
                content: 'Hello',
                timestamp: Date.now()
            };

            mockDatabase.run.mockResolvedValueOnce({ lastID: 1 });
            mockDatabase.get.mockResolvedValueOnce({ count: 1 });

            await uninitializedService.saveMessage(message);

            const { open } = require('sqlite');
            expect(open).toHaveBeenCalled();
        });

        it('should handle save errors', async () => {
            mockDatabase.run.mockRejectedValueOnce(new Error('Database error'));

            const message: Omit<ChatMessage, 'id'> = {
                conversationId: 'conv-123',
                role: 'user',
                content: 'Hello',
                timestamp: Date.now()
            };

            await expect(chatService.saveMessage(message)).rejects.toThrow('Database error');
        });

        it('should verify message count after save', async () => {
            const message: Omit<ChatMessage, 'id'> = {
                conversationId: 'conv-123',
                role: 'user',
                content: 'Hello',
                timestamp: Date.now()
            };

            mockDatabase.run.mockResolvedValueOnce({ lastID: 1 });
            mockDatabase.get.mockResolvedValueOnce({ count: 5 });

            await chatService.saveMessage(message);

            expect(mockDatabase.get).toHaveBeenCalledWith(
                expect.stringContaining('COUNT(*)'),
                ['conv-123']
            );
        });
    });

    describe('getConversationHistory', () => {
        beforeEach(async () => {
            mockDatabase.get.mockResolvedValue({ name: 'messages' });
            await chatService.initialize();
        });

        it('should retrieve conversation messages', async () => {
            const mockMessages = [
                { id: 1, conversationId: 'conv-123', role: 'user', content: 'Hello', timestamp: 1000 },
                { id: 2, conversationId: 'conv-123', role: 'assistant', content: 'Hi!', timestamp: 2000 }
            ];

            mockDatabase.all.mockResolvedValueOnce(mockMessages);

            const messages = await chatService.getConversationHistory('conv-123');

            expect(messages).toHaveLength(2);
            expect(messages[0]).toMatchObject({
                id: 1,
                role: 'user',
                content: 'Hello'
            });
            expect(messages[1]).toMatchObject({
                id: 2,
                role: 'assistant',
                content: 'Hi!'
            });
        });

        it('should limit number of messages returned', async () => {
            const mockMessages = Array.from({ length: 50 }, (_, i) => ({
                id: i + 1,
                conversationId: 'conv-123',
                role: i % 2 === 0 ? 'user' : 'assistant',
                content: `Message ${i + 1}`,
                timestamp: 1000 + i
            }));

            mockDatabase.all.mockResolvedValueOnce(mockMessages.slice(-10)); // Last 10

            const messages = await chatService.getConversationHistory('conv-123', 10);

            expect(mockDatabase.all).toHaveBeenCalledWith(
                expect.stringContaining('LIMIT 10'),
                ['conv-123']
            );
        });

        it('should return empty array for non-existent conversation', async () => {
            mockDatabase.all.mockResolvedValueOnce([]);

            const messages = await chatService.getConversationHistory('non-existent');

            expect(messages).toEqual([]);
        });

        it('should handle database query errors', async () => {
            mockDatabase.all.mockRejectedValueOnce(new Error('Query failed'));

            await expect(chatService.getConversationHistory('conv-123'))
                .rejects.toThrow('Query failed');
        });
    });

    describe('getAllConversationMessages', () => {
        beforeEach(async () => {
            mockDatabase.get.mockResolvedValue({ name: 'messages' });
            await chatService.initialize();
        });

        it('should retrieve all messages for conversation without limit', async () => {
            const mockMessages = Array.from({ length: 100 }, (_, i) => ({
                id: i + 1,
                conversationId: 'conv-123',
                role: i % 2 === 0 ? 'user' : 'assistant',
                content: `Message ${i + 1}`,
                timestamp: 1000 + i
            }));

            mockDatabase.all.mockResolvedValueOnce(mockMessages);

            const messages = await chatService.getAllConversationMessages('conv-123');

            expect(messages).toHaveLength(100);
            expect(mockDatabase.all).toHaveBeenCalledWith(
                expect.not.stringContaining('LIMIT'),
                ['conv-123']
            );
        });
    });

    describe('getMessagesForChat', () => {
        beforeEach(async () => {
            mockDatabase.get.mockResolvedValue({ name: 'messages' });
            await chatService.initialize();
        });

        it('should retrieve single message for conversation', async () => {
            const mockMessage = {
                id: 1,
                conversationId: 'conv-123',
                role: 'user',
                content: 'Hello',
                timestamp: 1000
            };

            mockDatabase.get.mockResolvedValueOnce(mockMessage);

            const message = await chatService.getMessagesForChat('conv-123');

            expect(message).toMatchObject({
                id: 1,
                role: 'user',
                content: 'Hello'
            });
        });

        it('should return null when no messages exist', async () => {
            mockDatabase.get.mockResolvedValueOnce(null);

            const message = await chatService.getMessagesForChat('conv-123');

            expect(message).toBeNull();
        });
    });

    describe('getIncompleteConversations', () => {
        beforeEach(async () => {
            mockDatabase.get.mockResolvedValue({ name: 'messages' });
            await chatService.initialize();
        });

        it('should identify conversations ending with user messages', async () => {
            const incompleteConversations = [
                { conversationId: 'conv-1' },
                { conversationId: 'conv-3' }
            ];

            mockDatabase.all.mockResolvedValueOnce(incompleteConversations);

            const conversations = await chatService.getIncompleteConversations();

            expect(conversations).toEqual(['conv-1', 'conv-3']);
            
            // Should query for conversations where last message is from user
            expect(mockDatabase.all).toHaveBeenCalledWith(
                expect.stringContaining("role = 'user'")
            );
        });

        it('should return empty array when all conversations are complete', async () => {
            mockDatabase.all.mockResolvedValueOnce([]);

            const conversations = await chatService.getIncompleteConversations();

            expect(conversations).toEqual([]);
        });
    });

    describe('getConversationHealth', () => {
        beforeEach(async () => {
            mockDatabase.get.mockResolvedValue({ name: 'messages' });
            await chatService.initialize();
        });

        it('should provide conversation statistics', async () => {
            const mockStats = {
                totalMessages: 10,
                userMessages: 5,
                assistantMessages: 5,
                systemMessages: 0
            };

            const mockLastMessage = {
                role: 'assistant',
                timestamp: 1234567890
            };

            mockDatabase.get
                .mockResolvedValueOnce(mockStats)
                .mockResolvedValueOnce(mockLastMessage);

            const health = await chatService.getConversationHealth('conv-123');

            expect(health).toEqual({
                totalMessages: 10,
                userMessages: 5,
                assistantMessages: 5,
                systemMessages: 0,
                lastMessageRole: 'assistant',
                lastMessageTimestamp: 1234567890,
                isComplete: true // Ends with assistant message
            });
        });

        it('should identify incomplete conversations', async () => {
            const mockStats = {
                totalMessages: 3,
                userMessages: 2,
                assistantMessages: 1,
                systemMessages: 0
            };

            const mockLastMessage = {
                role: 'user',
                timestamp: 1234567890
            };

            mockDatabase.get
                .mockResolvedValueOnce(mockStats)
                .mockResolvedValueOnce(mockLastMessage);

            const health = await chatService.getConversationHealth('conv-123');

            expect(health.isComplete).toBe(false);
            expect(health.lastMessageRole).toBe('user');
        });
    });

    describe('getConversations', () => {
        beforeEach(async () => {
            mockDatabase.get.mockResolvedValue({ name: 'messages' });
            await chatService.initialize();
        });

        it('should retrieve all conversations with metadata', async () => {
            const mockConversations = [
                { conversationId: 'conv-1', lastMessageAt: 2000 },
                { conversationId: 'conv-2', lastMessageAt: 1000 }
            ];

            mockDatabase.all.mockResolvedValueOnce(mockConversations);
            
            // Mock first messages for titles
            mockDatabase.get
                .mockResolvedValueOnce({ content: 'First conversation' })
                .mockResolvedValueOnce({ content: 'Second conversation' });

            const conversations = await chatService.getConversations();

            expect(conversations).toHaveLength(2);
            expect(conversations[0]).toMatchObject({
                id: 'conv-1',
                title: 'First conversation',
                lastMessageAt: 2000
            });
            expect(conversations[1]).toMatchObject({
                id: 'conv-2',
                title: 'Second conversation',
                lastMessageAt: 1000
            });
        });

        it('should use default title when first message not found', async () => {
            const mockConversations = [
                { conversationId: 'conv-1', lastMessageAt: 1000 }
            ];

            mockDatabase.all.mockResolvedValueOnce(mockConversations);
            mockDatabase.get.mockResolvedValueOnce(null); // No first message

            const conversations = await chatService.getConversations();

            expect(conversations[0].title).toBe('New Conversation');
        });

        it('should return empty array when no conversations exist', async () => {
            mockDatabase.all.mockResolvedValueOnce([]);

            const conversations = await chatService.getConversations();

            expect(conversations).toEqual([]);
        });
    });

    describe('getFirstMessage', () => {
        beforeEach(async () => {
            mockDatabase.get.mockResolvedValue({ name: 'messages' });
            await chatService.initialize();
        });

        it('should retrieve first message content', async () => {
            mockDatabase.get.mockResolvedValueOnce({ content: 'First message content' });

            const firstMessage = await chatService.getFirstMessage('conv-123');

            expect(firstMessage).toBe('First message content');
            expect(mockDatabase.get).toHaveBeenCalledWith(
                expect.stringContaining('ORDER BY timestamp ASC LIMIT 1'),
                ['conv-123']
            );
        });

        it('should return null when no messages exist', async () => {
            mockDatabase.get.mockResolvedValueOnce(null);

            const firstMessage = await chatService.getFirstMessage('conv-123');

            expect(firstMessage).toBeNull();
        });
    });

    describe('ThinkingBlock operations', () => {
        beforeEach(async () => {
            mockDatabase.get.mockResolvedValue({ name: 'messages' });
            await chatService.initialize();
        });

        describe('saveThinkingBlock', () => {
            it('should save thinking block', async () => {
                const thinkingBlock: ThinkingBlock = {
                    id: 'thinking-123',
                    conversationId: 'conv-123',
                    messageId: 'msg-456',
                    content: 'Thinking about the problem...',
                    startTime: 1000,
                    endTime: 2000,
                    duration: '1s',
                    timestamp: 1500
                };

                await chatService.saveThinkingBlock(thinkingBlock);

                expect(mockDatabase.run).toHaveBeenCalledWith(
                    expect.stringContaining('INSERT OR REPLACE INTO thinking_blocks'),
                    expect.arrayContaining([
                        'thinking-123',
                        'conv-123',
                        'msg-456',
                        'Thinking about the problem...',
                        1000,
                        2000,
                        '1s',
                        1500
                    ])
                );
            });

            it('should handle thinking block without optional fields', async () => {
                const thinkingBlock: ThinkingBlock = {
                    id: 'thinking-123',
                    conversationId: 'conv-123',
                    content: 'Thinking...',
                    startTime: 1000,
                    timestamp: 1000
                };

                await chatService.saveThinkingBlock(thinkingBlock);

                expect(mockDatabase.run).toHaveBeenCalledWith(
                    expect.stringContaining('INSERT OR REPLACE INTO thinking_blocks'),
                    expect.arrayContaining([
                        'thinking-123',
                        'conv-123',
                        undefined, // messageId
                        'Thinking...',
                        1000,
                        undefined, // endTime
                        undefined, // duration
                        1000
                    ])
                );
            });

            it('should handle uninitialized database', async () => {
                const uninitializedService = new ChatStorageService();
                
                const thinkingBlock: ThinkingBlock = {
                    id: 'thinking-123',
                    conversationId: 'conv-123',
                    content: 'Thinking...',
                    startTime: 1000,
                    timestamp: 1000
                };

                await expect(uninitializedService.saveThinkingBlock(thinkingBlock))
                    .rejects.toThrow('Database not initialized');
            });

            it('should handle save errors', async () => {
                mockDatabase.run.mockRejectedValueOnce(new Error('Save failed'));

                const thinkingBlock: ThinkingBlock = {
                    id: 'thinking-123',
                    conversationId: 'conv-123',
                    content: 'Thinking...',
                    startTime: 1000,
                    timestamp: 1000
                };

                await expect(chatService.saveThinkingBlock(thinkingBlock))
                    .rejects.toThrow('Save failed');
            });
        });

        describe('getThinkingBlocks', () => {
            it('should retrieve thinking blocks for conversation', async () => {
                const mockThinkingBlocks = [
                    {
                        id: 'thinking-1',
                        conversationId: 'conv-123',
                        messageId: 'msg-1',
                        content: 'First thought',
                        startTime: 1000,
                        endTime: 1500,
                        duration: '500ms',
                        timestamp: 1250
                    },
                    {
                        id: 'thinking-2',
                        conversationId: 'conv-123',
                        messageId: 'msg-2',
                        content: 'Second thought',
                        startTime: 2000,
                        endTime: 2300,
                        duration: '300ms',
                        timestamp: 2150
                    }
                ];

                mockDatabase.all.mockResolvedValueOnce(mockThinkingBlocks);

                const blocks = await chatService.getThinkingBlocks('conv-123');

                expect(blocks).toHaveLength(2);
                expect(blocks[0]).toMatchObject({
                    id: 'thinking-1',
                    content: 'First thought'
                });
                expect(blocks[1]).toMatchObject({
                    id: 'thinking-2',
                    content: 'Second thought'
                });

                expect(mockDatabase.all).toHaveBeenCalledWith(
                    expect.stringContaining('ORDER BY timestamp ASC'),
                    ['conv-123']
                );
            });

            it('should return empty array when no thinking blocks exist', async () => {
                mockDatabase.all.mockResolvedValueOnce([]);

                const blocks = await chatService.getThinkingBlocks('conv-123');

                expect(blocks).toEqual([]);
            });

            it('should handle uninitialized database', async () => {
                const uninitializedService = new ChatStorageService();

                const blocks = await uninitializedService.getThinkingBlocks('conv-123');

                expect(blocks).toEqual([]);
            });

            it('should handle query errors', async () => {
                mockDatabase.all.mockRejectedValueOnce(new Error('Query failed'));

                const blocks = await chatService.getThinkingBlocks('conv-123');

                expect(blocks).toEqual([]);
            });
        });

        describe('deleteThinkingBlocks', () => {
            it('should delete thinking blocks for conversation', async () => {
                await chatService.deleteThinkingBlocks('conv-123');

                expect(mockDatabase.run).toHaveBeenCalledWith(
                    'DELETE FROM thinking_blocks WHERE conversationId = ?',
                    ['conv-123']
                );
            });

            it('should handle uninitialized database', async () => {
                const uninitializedService = new ChatStorageService();

                await expect(uninitializedService.deleteThinkingBlocks('conv-123'))
                    .rejects.toThrow('Database not initialized');
            });

            it('should handle deletion errors', async () => {
                mockDatabase.run.mockRejectedValueOnce(new Error('Delete failed'));

                await expect(chatService.deleteThinkingBlocks('conv-123'))
                    .rejects.toThrow('Delete failed');
            });
        });
    });

    describe('close', () => {
        beforeEach(async () => {
            mockDatabase.get.mockResolvedValue({ name: 'messages' });
            await chatService.initialize();
        });

        it('should close database connection', async () => {
            await chatService.close();

            expect(mockDatabase.close).toHaveBeenCalled();
        });

        it('should handle close errors gracefully', async () => {
            mockDatabase.close.mockRejectedValueOnce(new Error('Close failed'));

            // Should not throw
            await expect(chatService.close()).resolves.not.toThrow();
        });

        it('should reset database reference after close', async () => {
            await chatService.close();

            // Database should be null after close
            expect((chatService as any).db).toBeNull();
        });
    });

    describe('error handling and edge cases', () => {
        it('should handle database initialization failure gracefully', async () => {
            const { open } = require('sqlite');
            open.mockRejectedValueOnce(new Error('Cannot open database'));

            await expect(chatService.initialize()).rejects.toThrow('Cannot open database');
        });

        it('should handle methods called with null database', async () => {
            // Test saveMessage without initialization
            const uninitializedService = new ChatStorageService();
            mockDatabase.get.mockResolvedValue({ name: 'messages' });

            const message: Omit<ChatMessage, 'id'> = {
                conversationId: 'conv-123',
                role: 'user',
                content: 'Hello',
                timestamp: Date.now()
            };

            mockDatabase.run.mockResolvedValueOnce({ lastID: 1 });
            mockDatabase.get.mockResolvedValueOnce({ count: 1 });

            // Should initialize automatically
            await expect(uninitializedService.saveMessage(message)).resolves.toBe(1);
        });

        it('should handle SQLite-specific error conditions', async () => {
            mockDatabase.get.mockResolvedValue({ name: 'messages' });
            await chatService.initialize();

            // Test constraint violation
            mockDatabase.run.mockRejectedValueOnce(new Error('UNIQUE constraint failed'));

            const message: Omit<ChatMessage, 'id'> = {
                conversationId: 'conv-123',
                role: 'user',
                content: 'Hello',
                timestamp: Date.now()
            };

            await expect(chatService.saveMessage(message))
                .rejects.toThrow('UNIQUE constraint failed');
        });

        it('should handle large message content', async () => {
            mockDatabase.get.mockResolvedValue({ name: 'messages' });
            await chatService.initialize();

            const largeContent = 'x'.repeat(10000);
            const message: Omit<ChatMessage, 'id'> = {
                conversationId: 'conv-123',
                role: 'user',
                content: largeContent,
                timestamp: Date.now()
            };

            mockDatabase.run.mockResolvedValueOnce({ lastID: 1 });
            mockDatabase.get.mockResolvedValueOnce({ count: 1 });

            const messageId = await chatService.saveMessage(message);

            expect(messageId).toBe(1);
            expect(mockDatabase.run).toHaveBeenCalledWith(
                expect.any(String),
                expect.arrayContaining([
                    'conv-123',
                    'user',
                    largeContent,
                    expect.any(Number)
                ])
            );
        });
    });
});