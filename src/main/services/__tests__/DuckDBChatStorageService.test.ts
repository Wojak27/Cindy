/**
 * Unit tests for DuckDBChatStorageService
 */

import { DuckDBChatStorageService, ChatMessage } from '../DuckDBChatStorageService';
import * as fs from 'fs';
import * as path from 'path';

// Mock Electron app
jest.mock('electron', () => ({
    app: {
        getPath: jest.fn().mockReturnValue('/tmp/test-app-data')
    }
}));

// Mock fs
const mockFs = {
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn()
};

jest.mock('fs', () => mockFs);

// Mock DuckDB
const mockDatabase = {
    exec: jest.fn().mockResolvedValue(undefined),
    all: jest.fn().mockResolvedValue([]),
    run: jest.fn().mockResolvedValue({ lastInsertRowid: 1 }),
    prepare: jest.fn().mockResolvedValue({
        run: jest.fn().mockResolvedValue(undefined),
        all: jest.fn().mockResolvedValue([]),
        finalize: jest.fn().mockResolvedValue(undefined)
    }),
    close: jest.fn().mockResolvedValue(undefined)
};

jest.mock('duckdb-async', () => ({
    Database: {
        create: jest.fn().mockResolvedValue(mockDatabase)
    }
}));

describe('DuckDBChatStorageService', () => {
    let chatService: DuckDBChatStorageService;

    beforeEach(() => {
        jest.clearAllMocks();
        chatService = new DuckDBChatStorageService();

        // Reset mock responses
        mockDatabase.all.mockResolvedValue([]);
        mockDatabase.run.mockResolvedValue({ lastInsertRowid: 1 });
        mockFs.existsSync.mockReturnValue(false);
        mockFs.readFileSync.mockReturnValue('{}');
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should create DuckDBChatStorageService with default config', () => {
            expect(chatService).toBeInstanceOf(DuckDBChatStorageService);
        });
    });

    describe('initialize', () => {
        it('should initialize database and create tables', async () => {
            await chatService.initialize();

            const { Database } = require('duckdb-async');
            expect(Database.create).toHaveBeenCalledWith('/tmp/test-app-data/cindy-chat.db');
            
            // Should create tables and indexes
            expect(mockDatabase.exec).toHaveBeenCalledWith(
                expect.stringContaining('CREATE TABLE IF NOT EXISTS messages')
            );
            expect(mockDatabase.exec).toHaveBeenCalledWith(
                expect.stringContaining('CREATE INDEX IF NOT EXISTS')
            );
        });

        it('should not initialize twice', async () => {
            await chatService.initialize();
            await chatService.initialize(); // Second call

            const { Database } = require('duckdb-async');
            expect(Database.create).toHaveBeenCalledTimes(1);
        });

        it('should load existing config file', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({
                conversations: { 'test-conv': 'test-data' },
                lastCleanup: 123456789
            }));

            await chatService.initialize();

            expect(mockFs.readFileSync).toHaveBeenCalledWith(
                '/tmp/test-app-data/chat-storage.json',
                'utf-8'
            );
        });

        it('should handle config loading errors gracefully', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockImplementation(() => {
                throw new Error('File read error');
            });

            // Should not throw
            await expect(chatService.initialize()).resolves.not.toThrow();
        });

        it('should perform maintenance cleanup if needed', async () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(JSON.stringify({
                conversations: {},
                lastCleanup: Date.now() - (25 * 60 * 60 * 1000) // 25 hours ago
            }));

            mockDatabase.all
                .mockResolvedValueOnce([{ id: 'conv1', title: 'Test', lastMessageAt: Date.now(), message_count: 2 }])
                .mockResolvedValueOnce([
                    { id: 1, role: 'user', content: 'Hello', timestamp: Date.now() },
                    { id: 2, role: 'user', content: 'Hello', timestamp: Date.now() } // Duplicate
                ]);

            await chatService.initialize();

            expect(mockFs.writeFileSync).toHaveBeenCalled(); // Config saved with new cleanup time
        });

        it('should handle database initialization errors', async () => {
            const { Database } = require('duckdb-async');
            Database.create.mockRejectedValueOnce(new Error('DB creation failed'));

            await expect(chatService.initialize()).rejects.toThrow('DB creation failed');
        });
    });

    describe('saveMessage', () => {
        beforeEach(async () => {
            await chatService.initialize();
        });

        it('should save message and return ID', async () => {
            const message: Omit<ChatMessage, 'id'> = {
                conversationId: 'conv-123',
                role: 'user',
                content: 'Hello world',
                timestamp: Date.now()
            };

            mockDatabase.run.mockResolvedValueOnce({ lastInsertRowid: 42 });

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

        it('should update conversation metadata', async () => {
            const message: Omit<ChatMessage, 'id'> = {
                conversationId: 'conv-123',
                role: 'user',
                content: 'Hello',
                timestamp: Date.now()
            };

            await chatService.saveMessage(message);

            // Should upsert conversation metadata
            expect(mockDatabase.run).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO conversations'),
                expect.arrayContaining([
                    'conv-123',
                    expect.any(String), // title
                    expect.any(Number), // created_at
                    expect.any(Number)  // updated_at
                ])
            );
        });

        it('should initialize database if not already done', async () => {
            const uninitializedService = new DuckDBChatStorageService();
            
            const message: Omit<ChatMessage, 'id'> = {
                conversationId: 'conv-123',
                role: 'user',
                content: 'Hello',
                timestamp: Date.now()
            };

            await uninitializedService.saveMessage(message);

            const { Database } = require('duckdb-async');
            expect(Database.create).toHaveBeenCalled();
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

        it('should generate appropriate titles for conversations', async () => {
            const userMessage: Omit<ChatMessage, 'id'> = {
                conversationId: 'conv-123',
                role: 'user',
                content: 'What is the weather like?',
                timestamp: Date.now()
            };

            await chatService.saveMessage(userMessage);

            // Should generate title based on first user message
            expect(mockDatabase.run).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO conversations'),
                expect.arrayContaining([
                    'conv-123',
                    'What is the weather like?',
                    expect.any(Number),
                    expect.any(Number)
                ])
            );
        });
    });

    describe('getConversationHistory', () => {
        beforeEach(async () => {
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

            mockDatabase.all.mockResolvedValueOnce(mockMessages);

            const messages = await chatService.getConversationHistory('conv-123', 10);

            expect(mockDatabase.all).toHaveBeenCalledWith(
                expect.stringContaining('LIMIT 10'),
                ['conv-123']
            );
        });

        it('should clean up and fix message order', async () => {
            const messagesWithDuplicates = [
                { id: 1, conversationId: 'conv-123', role: 'user', content: 'Hello', timestamp: 1000 },
                { id: 2, conversationId: 'conv-123', role: 'user', content: 'Hello', timestamp: 1000 }, // Duplicate
                { id: 3, conversationId: 'conv-123', role: 'assistant', content: 'Hi!', timestamp: 2000 }
            ];

            mockDatabase.all.mockResolvedValueOnce(messagesWithDuplicates);

            const messages = await chatService.getConversationHistory('conv-123');

            // Should remove duplicate and maintain alternation
            expect(messages).toHaveLength(2);
            expect(messages[0].role).toBe('user');
            expect(messages[1].role).toBe('assistant');
        });

        it('should return empty array for non-existent conversation', async () => {
            mockDatabase.all.mockResolvedValueOnce([]);

            const messages = await chatService.getConversationHistory('non-existent');

            expect(messages).toEqual([]);
        });
    });

    describe('getLatestHumanMessage', () => {
        beforeEach(async () => {
            await chatService.initialize();
        });

        it('should retrieve latest user message', async () => {
            const latestUserMessage = {
                id: 5,
                conversationId: 'conv-123',
                role: 'user',
                content: 'Latest message',
                timestamp: 5000
            };

            mockDatabase.all.mockResolvedValueOnce([latestUserMessage]);

            const message = await chatService.getLatestHumanMessage('conv-123');

            expect(message).toMatchObject({
                id: 5,
                role: 'user',
                content: 'Latest message'
            });

            expect(mockDatabase.all).toHaveBeenCalledWith(
                expect.stringContaining("role = 'user'"),
                ['conv-123']
            );
        });

        it('should return null when no user messages exist', async () => {
            mockDatabase.all.mockResolvedValueOnce([]);

            const message = await chatService.getLatestHumanMessage('conv-123');

            expect(message).toBeNull();
        });
    });

    describe('clearConversation', () => {
        beforeEach(async () => {
            await chatService.initialize();
        });

        it('should delete all messages in conversation', async () => {
            await chatService.clearConversation('conv-123');

            expect(mockDatabase.run).toHaveBeenCalledWith(
                'DELETE FROM messages WHERE conversationId = ?',
                ['conv-123']
            );
            expect(mockDatabase.run).toHaveBeenCalledWith(
                'DELETE FROM conversations WHERE id = ?',
                ['conv-123']
            );
        });

        it('should handle deletion errors gracefully', async () => {
            mockDatabase.run.mockRejectedValueOnce(new Error('Delete failed'));

            await expect(chatService.clearConversation('conv-123')).rejects.toThrow('Delete failed');
        });
    });

    describe('getConversations', () => {
        beforeEach(async () => {
            await chatService.initialize();
        });

        it('should retrieve all conversations with metadata', async () => {
            const mockConversations = [
                {
                    id: 'conv-1',
                    title: 'First conversation',
                    lastMessageAt: 2000,
                    message_count: 5
                },
                {
                    id: 'conv-2',
                    title: 'Second conversation',
                    lastMessageAt: 1000,
                    message_count: 3
                }
            ];

            mockDatabase.all.mockResolvedValueOnce(mockConversations);

            const conversations = await chatService.getConversations();

            expect(conversations).toHaveLength(2);
            expect(conversations[0]).toMatchObject({
                id: 'conv-1',
                title: 'First conversation',
                lastMessageAt: 2000
            });

            expect(mockDatabase.all).toHaveBeenCalledWith(
                expect.stringContaining('ORDER BY c.updated_at DESC')
            );
        });

        it('should return empty array when no conversations exist', async () => {
            mockDatabase.all.mockResolvedValueOnce([]);

            const conversations = await chatService.getConversations();

            expect(conversations).toEqual([]);
        });
    });

    describe('getFirstMessage', () => {
        beforeEach(async () => {
            await chatService.initialize();
        });

        it('should retrieve first message content', async () => {
            mockDatabase.all.mockResolvedValueOnce([
                { content: 'First message content' }
            ]);

            const firstMessage = await chatService.getFirstMessage('conv-123');

            expect(firstMessage).toBe('First message content');
            expect(mockDatabase.all).toHaveBeenCalledWith(
                expect.stringContaining('ORDER BY timestamp ASC LIMIT 1'),
                ['conv-123']
            );
        });

        it('should return null when no messages exist', async () => {
            mockDatabase.all.mockResolvedValueOnce([]);

            const firstMessage = await chatService.getFirstMessage('conv-123');

            expect(firstMessage).toBeNull();
        });
    });

    describe('createConversation', () => {
        beforeEach(async () => {
            await chatService.initialize();
        });

        it('should create new conversation with system message', async () => {
            const conversationId = await chatService.createConversation();

            expect(conversationId).toMatch(/^conv-\d+$/);
            
            // Should save initial system message
            expect(mockDatabase.run).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO messages'),
                expect.arrayContaining([
                    conversationId,
                    'system',
                    expect.stringContaining('helpful assistant'),
                    expect.any(Number)
                ])
            );
        });

        it('should generate unique conversation IDs', async () => {
            const id1 = await chatService.createConversation();
            const id2 = await chatService.createConversation();

            expect(id1).not.toBe(id2);
        });
    });

    describe('getThinkingBlocks', () => {
        beforeEach(async () => {
            await chatService.initialize();
        });

        it('should retrieve thinking blocks for conversation', async () => {
            const mockThinkingBlocks = [
                { id: 1, content: 'Thinking about the problem...' }
            ];

            mockDatabase.all.mockResolvedValueOnce(mockThinkingBlocks);

            const blocks = await chatService.getThinkingBlocks('conv-123');

            expect(blocks).toEqual(mockThinkingBlocks);
            expect(mockDatabase.all).toHaveBeenCalledWith(
                expect.stringContaining('thinking_blocks'),
                ['conv-123']
            );
        });

        it('should return empty array when no thinking blocks exist', async () => {
            mockDatabase.all.mockResolvedValueOnce([]);

            const blocks = await chatService.getThinkingBlocks('conv-123');

            expect(blocks).toEqual([]);
        });
    });

    describe('migrateFromSQLite', () => {
        beforeEach(async () => {
            await chatService.initialize();
        });

        it('should migrate conversations and messages from SQLite', async () => {
            const mockSQLiteService = {
                getConversations: jest.fn().mockResolvedValue([
                    { id: 'old-conv-1', title: 'Migrated Conv', lastMessageAt: 1000 }
                ]),
                getConversationHistory: jest.fn().mockResolvedValue([
                    { id: 1, conversationId: 'old-conv-1', role: 'user', content: 'Hello', timestamp: 1000 },
                    { id: 2, conversationId: 'old-conv-1', role: 'assistant', content: 'Hi!', timestamp: 2000 }
                ])
            };

            await chatService.migrateFromSQLite(mockSQLiteService);

            expect(mockSQLiteService.getConversations).toHaveBeenCalled();
            expect(mockSQLiteService.getConversationHistory).toHaveBeenCalledWith('old-conv-1', 1000);
            
            // Should save migrated messages
            expect(mockDatabase.run).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO messages'),
                expect.arrayContaining(['old-conv-1', 'user', 'Hello', 1000])
            );
        });

        it('should handle migration errors gracefully', async () => {
            const mockSQLiteService = {
                getConversations: jest.fn().mockRejectedValue(new Error('SQLite error'))
            };

            await expect(chatService.migrateFromSQLite(mockSQLiteService)).rejects.toThrow('SQLite error');
        });
    });

    describe('cleanup and configuration', () => {
        beforeEach(async () => {
            await chatService.initialize();
        });

        it('should save configuration to file', () => {
            // Trigger config save by setting a value
            (chatService as any).setConfigValue('testKey', 'testValue');

            expect(mockFs.writeFileSync).toHaveBeenCalledWith(
                '/tmp/test-app-data/chat-storage.json',
                expect.stringContaining('"testKey":"testValue"')
            );
        });

        it('should get configuration values with defaults', () => {
            const value = (chatService as any).getConfigValue('nonexistent', 'default');
            expect(value).toBe('default');
        });

        it('should handle configuration save errors', () => {
            mockFs.writeFileSync.mockImplementation(() => {
                throw new Error('Write error');
            });

            // Should not throw
            expect(() => {
                (chatService as any).setConfigValue('testKey', 'testValue');
            }).not.toThrow();
        });
    });

    describe('cleanupAndFixMessageOrder', () => {
        it('should remove duplicate messages', () => {
            const messagesWithDuplicates = [
                { id: 1, conversationId: 'conv', role: 'user', content: 'Hello', timestamp: 1000 },
                { id: 2, conversationId: 'conv', role: 'user', content: 'Hello', timestamp: 1000 }, // Duplicate
                { id: 3, conversationId: 'conv', role: 'assistant', content: 'Hi!', timestamp: 2000 }
            ] as ChatMessage[];

            const cleaned = (chatService as any).cleanupAndFixMessageOrder(messagesWithDuplicates);

            expect(cleaned).toHaveLength(2);
            expect(cleaned[0].id).toBe(1);
            expect(cleaned[1].id).toBe(3);
        });

        it('should maintain proper user-assistant alternation', () => {
            const messagesWithBadOrder = [
                { id: 1, conversationId: 'conv', role: 'user', content: 'Hello', timestamp: 1000 },
                { id: 2, conversationId: 'conv', role: 'user', content: 'Again', timestamp: 1500 },
                { id: 3, conversationId: 'conv', role: 'assistant', content: 'Hi!', timestamp: 2000 }
            ] as ChatMessage[];

            const cleaned = (chatService as any).cleanupAndFixMessageOrder(messagesWithBadOrder);

            expect(cleaned).toHaveLength(2);
            expect(cleaned[0].role).toBe('user');
            expect(cleaned[1].role).toBe('assistant');
        });

        it('should handle system messages correctly', () => {
            const messagesWithSystem = [
                { id: 1, conversationId: 'conv', role: 'system', content: 'System', timestamp: 500 },
                { id: 2, conversationId: 'conv', role: 'user', content: 'Hello', timestamp: 1000 },
                { id: 3, conversationId: 'conv', role: 'assistant', content: 'Hi!', timestamp: 2000 }
            ] as ChatMessage[];

            const cleaned = (chatService as any).cleanupAndFixMessageOrder(messagesWithSystem);

            expect(cleaned).toHaveLength(3);
            expect(cleaned[0].role).toBe('system');
            expect(cleaned[1].role).toBe('user');
            expect(cleaned[2].role).toBe('assistant');
        });
    });

    describe('close', () => {
        beforeEach(async () => {
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

    describe('error handling', () => {
        it('should handle database query errors', async () => {
            await chatService.initialize();
            mockDatabase.all.mockRejectedValueOnce(new Error('Query failed'));

            await expect(chatService.getConversationHistory('conv-123'))
                .rejects.toThrow('Query failed');
        });

        it('should handle database initialization failures', async () => {
            const { Database } = require('duckdb-async');
            Database.create.mockRejectedValueOnce(new Error('Database creation failed'));

            await expect(chatService.initialize()).rejects.toThrow('Database creation failed');
        });
    });
});