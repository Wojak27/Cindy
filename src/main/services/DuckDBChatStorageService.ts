import { Database } from 'duckdb-async';
import path from 'path';
import { app } from 'electron';
import * as fs from 'fs';

export interface ChatMessage {
    id?: number;
    conversationId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}

interface StorageConfig {
    conversations: Record<string, any>;
    lastCleanup: number;
}

export class DuckDBChatStorageService {
    private db: Database | null = null;
    private DB_PATH: string;
    private configPath: string;
    private config: StorageConfig;

    constructor() {
        // Defer path initialization until Electron app is ready
        this.config = { conversations: {}, lastCleanup: 0 };
    }

    private loadConfig(): StorageConfig {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf-8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.warn('[DuckDBChatStorageService] Failed to load config:', error);
        }
        
        return {
            conversations: {},
            lastCleanup: 0
        };
    }

    private saveConfig(): void {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
        } catch (error) {
            console.error('[DuckDBChatStorageService] Failed to save config:', error);
        }
    }

    private getConfigValue(key: string, defaultValue: any = null): any {
        return this.config[key as keyof StorageConfig] ?? defaultValue;
    }

    private setConfigValue(key: string, value: any): void {
        (this.config as any)[key] = value;
        this.saveConfig();
    }

    async initialize(): Promise<void> {
        console.log('🦆 DEBUG: DuckDBChatStorageService.initialize() called at:', new Date().toISOString());
        if (this.db) {
            console.log('🦆 DEBUG: DuckDBChatStorageService.initialize() - Database already initialized, skipping');
            return;
        }

        // Initialize paths when needed
        if (!this.DB_PATH) {
            this.DB_PATH = path.join(app.getPath('userData'), 'cindy-chat.db');
            this.configPath = path.join(app.getPath('userData'), 'chat-storage.json');
            this.config = this.loadConfig();
        }

        try {
            console.log('🦆 DEBUG: DuckDBChatStorageService.initialize() - Opening DuckDB database at:', this.DB_PATH);
            this.db = await Database.create(this.DB_PATH);
            console.log('🦆 DEBUG: DuckDBChatStorageService.initialize() - Database opened successfully');

            console.log('🦆 DEBUG: DuckDBChatStorageService.initialize() - Creating tables and indexes...');
            
            // Create messages table
            await this.db.exec(`
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY,
                    conversationId VARCHAR NOT NULL,
                    role VARCHAR NOT NULL,
                    content TEXT NOT NULL,
                    timestamp BIGINT NOT NULL
                );
            `);

            // Create indexes for better performance
            await this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_conversation ON messages(conversationId);
                CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp);
                CREATE INDEX IF NOT EXISTS idx_conversation_timestamp ON messages(conversationId, timestamp);
            `);

            // Create conversations table for metadata
            await this.db.exec(`
                CREATE TABLE IF NOT EXISTS conversations (
                    id VARCHAR PRIMARY KEY,
                    title VARCHAR,
                    created_at BIGINT NOT NULL,
                    updated_at BIGINT NOT NULL,
                    message_count INTEGER DEFAULT 0
                );
            `);

            // Create index on conversations
            await this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at);
            `);

            console.log('🦆 DEBUG: DuckDBChatStorageService.initialize() - Tables and indexes created successfully');

            // Verify database is working by running a test query
            try {
                const tableCheck = await this.db.all("SHOW TABLES");
                console.log('🦆 DEBUG: DuckDBChatStorageService.initialize() - Database verification successful, tables:', tableCheck);
            } catch (verifyError) {
                console.error('🚨 DEBUG: DuckDBChatStorageService.initialize() - Database verification failed:', verifyError);
            }

            // Perform cleanup on initialization if needed
            await this.performMaintenanceCleanup();
        } catch (error) {
            console.error('🚨 DEBUG: DuckDBChatStorageService.initialize() - Failed to initialize database:', error);
            console.error('🚨 DEBUG: DuckDBChatStorageService.initialize() - Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    async saveMessage(message: Omit<ChatMessage, 'id'>): Promise<number> {
        console.log('🦆 DEBUG: DuckDBChatStorageService.saveMessage() called with:', {
            conversationId: message.conversationId,
            role: message.role,
            contentLength: message.content.length,
            timestamp: message.timestamp
        });

        if (!this.db) {
            console.log('🦆 DEBUG: DuckDBChatStorageService.saveMessage() - Database not initialized, initializing...');
            await this.initialize();
        }

        try {
            console.log('🦆 DEBUG: DuckDBChatStorageService.saveMessage() - Inserting message into database...');
            
            // Insert message
            const result = await this.db.run(
                `INSERT INTO messages (conversationId, role, content, timestamp)
                 VALUES (?, ?, ?, ?) RETURNING id`,
                [message.conversationId, message.role, message.content, message.timestamp]
            );

            const messageId = result[0]?.id || Date.now(); // Fallback ID
            console.log('🦆 DEBUG: DuckDBChatStorageService.saveMessage() - Message saved successfully with ID:', messageId);

            // Update or create conversation metadata
            await this.db.run(`
                INSERT INTO conversations (id, title, created_at, updated_at, message_count)
                VALUES (?, ?, ?, ?, 1)
                ON CONFLICT (id) DO UPDATE SET
                    updated_at = ?,
                    message_count = message_count + 1
            `, [
                message.conversationId,
                message.content.substring(0, 50) + (message.content.length > 50 ? '...' : ''),
                message.timestamp,
                message.timestamp,
                message.timestamp
            ]);

            // Verify the save worked by counting messages in this conversation
            const messageCount = await this.db.all(
                `SELECT COUNT(*) as count FROM messages WHERE conversationId = ?`,
                [message.conversationId]
            );
            console.log('🦆 DEBUG: DuckDBChatStorageService.saveMessage() - Total messages in conversation:', messageCount[0]?.count);

            return messageId;
        } catch (error) {
            console.error('🚨 DEBUG: DuckDBChatStorageService.saveMessage() - Failed to save message:', error);
            console.error('🚨 DEBUG: DuckDBChatStorageService.saveMessage() - Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    async getConversationHistory(
        conversationId: string,
        limit: number = 100
    ): Promise<ChatMessage[]> {
        if (!this.db) await this.initialize();

        // First get all messages for this conversation
        const rows = await this.db.all(
            `SELECT id, conversationId, role, content, timestamp
             FROM messages
             WHERE conversationId = ?
             ORDER BY timestamp ASC, id ASC
             LIMIT ?`,
            [conversationId, limit]
        );

        const messages = rows.map(row => ({
            id: row.id,
            conversationId: row.conversationId,
            role: row.role,
            content: row.content,
            timestamp: row.timestamp
        })) as ChatMessage[];

        // Clean up duplicates and fix ordering
        const cleanedMessages = this.cleanupAndFixMessageOrder(messages);
        
        return cleanedMessages;
    }

    /**
     * Clean up duplicate messages and ensure proper human-AI alternation
     */
    private cleanupAndFixMessageOrder(messages: ChatMessage[]): ChatMessage[] {
        if (messages.length === 0) return messages;

        console.log('🦆 DEBUG: Cleaning up message order for conversation, input:', messages.length, 'messages');

        // Step 1: Remove exact duplicates based on content and role
        const deduped: ChatMessage[] = [];
        const seen = new Set<string>();
        
        for (const message of messages) {
            // Create a unique key for duplicate detection
            const key = `${message.role}:${message.content.trim()}`;
            
            if (!seen.has(key)) {
                seen.add(key);
                deduped.push(message);
            } else {
                console.log('🦆 DEBUG: Removing duplicate message:', message.role, message.content.substring(0, 50) + '...');
            }
        }

        // Step 2: Ensure messages are in chronological order (oldest to newest)
        const sorted = deduped.sort((a, b) => {
            // Primary sort: timestamp
            if (a.timestamp !== b.timestamp) {
                return a.timestamp - b.timestamp;
            }
            // Secondary sort: id (in case timestamps are identical)
            if (a.id && b.id) {
                return a.id - b.id;
            }
            return 0;
        });

        // Step 3: Ensure proper human-AI alternation and remove orphaned messages
        const alternated: ChatMessage[] = [];
        
        for (let i = 0; i < sorted.length; i++) {
            const current = sorted[i];
            
            // Always include system messages
            if (current.role === 'system') {
                alternated.push(current);
                continue;
            }
            
            // If this is the first message, it should be from user
            if (alternated.length === 0) {
                if (current.role === 'user') {
                    alternated.push(current);
                } else {
                    console.log('🦆 DEBUG: Skipping orphaned assistant message at start:', current.content.substring(0, 50) + '...');
                }
                continue;
            }
            
            // Ignore system messages when checking for previous role
            let lastNonSystemMessage = null;
            for (let j = alternated.length - 1; j >= 0; j--) {
                if (alternated[j].role !== 'system') {
                    lastNonSystemMessage = alternated[j];
                    break;
                }
            }
            
            if (!lastNonSystemMessage) {
                // If no non-system message before, this should be user
                if (current.role === 'user') {
                    alternated.push(current);
                }
                continue;
            }
            
            // Ensure proper alternation: user -> assistant -> user -> assistant
            const shouldInclude = (
                (lastNonSystemMessage.role === 'user' && current.role === 'assistant') ||
                (lastNonSystemMessage.role === 'assistant' && current.role === 'user')
            );
            
            if (shouldInclude) {
                alternated.push(current);
            } else {
                console.log('🦆 DEBUG: Skipping message that breaks alternation:', 
                    current.role, 'after', lastNonSystemMessage.role, 
                    current.content.substring(0, 50) + '...');
            }
        }

        console.log('🦆 DEBUG: Message cleanup complete. Input:', messages.length, '-> Output:', alternated.length, 'messages');
        
        // Final verification: log the final order
        const messageOrder = alternated.map((msg, idx) => `${idx + 1}. ${msg.role}`).join(', ');
        console.log('🦆 DEBUG: Final message order:', messageOrder);
        
        return alternated;
    }

    /**
     * Find the latest human message in a conversation
     */
    async getLatestHumanMessage(conversationId: string): Promise<ChatMessage | null> {
        if (!this.db) await this.initialize();

        const rows = await this.db.all(
            `SELECT id, conversationId, role, content, timestamp
             FROM messages
             WHERE conversationId = ? AND role = 'user'
             ORDER BY timestamp DESC, id DESC
             LIMIT 1`,
            [conversationId]
        );
        
        const row = rows[0];

        if (!row) return null;

        return {
            id: row.id,
            conversationId: row.conversationId,
            role: row.role,
            content: row.content,
            timestamp: row.timestamp
        } as ChatMessage;
    }

    async clearConversation(conversationId: string): Promise<void> {
        if (!this.db) await this.initialize();

        await this.db.run(
            `DELETE FROM messages WHERE conversationId = ?`,
            [conversationId]
        );

        await this.db.run(
            `DELETE FROM conversations WHERE id = ?`,
            [conversationId]
        );
    }

    async close(): Promise<void> {
        if (this.db) {
            await this.db.close();
            this.db = null;
        }
    }

    async getConversations(): Promise<Array<{ id: string; title: string; lastMessageAt: number }>> {
        if (!this.db) await this.initialize();

        const rows = await this.db.all(
            `SELECT c.id, c.title, c.updated_at as lastMessageAt, c.message_count
             FROM conversations c
             WHERE c.message_count > 0
             ORDER BY c.updated_at DESC`
        );

        return rows.map(row => ({
            id: row.id,
            title: row.title || `Conversation ${new Date(row.lastMessageAt).toLocaleDateString()}`,
            lastMessageAt: row.lastMessageAt
        }));
    }

    async getFirstMessage(conversationId: string): Promise<string | null> {
        if (!this.db) await this.initialize();

        const rows = await this.db.all(
            `SELECT content 
             FROM messages 
             WHERE conversationId = ? 
             ORDER BY timestamp ASC 
             LIMIT 1`,
            [conversationId]
        );
        
        const row = rows[0];

        return row ? row.content : null;
    }

    /**
     * Creates a new conversation by saving a system message
     */
    async createConversation(): Promise<string> {
        if (!this.db) await this.initialize();

        // Generate a unique conversation ID
        const conversationId = Date.now().toString();

        // Save a system message to establish the conversation
        await this.saveMessage({
            conversationId,
            role: 'system',
            content: 'New conversation created',
            timestamp: Date.now()
        });

        return conversationId;
    }

    /**
     * Get thinking blocks for a specific conversation
     * Note: For now, returns empty array since thinking blocks are not yet stored in the database
     * This is a placeholder for future implementation
     */
    async getThinkingBlocks(conversationId: string): Promise<any[]> {
        console.log('🦆 DEBUG: DuckDBChatStorageService.getThinkingBlocks() called for conversation:', conversationId);
        
        // TODO: Implement thinking blocks storage in database
        // For now, return empty array as thinking blocks are not stored in the database
        // They are managed in Redux store during the session
        
        console.log('🦆 DEBUG: Thinking blocks not implemented in storage yet, returning empty array');
        return [];
    }

    /**
     * Perform maintenance cleanup to remove duplicates and fix message ordering
     */
    private async performMaintenanceCleanup(): Promise<void> {
        const lastCleanup = this.getConfigValue('lastCleanup', 0);
        const now = Date.now();
        
        // Only run cleanup once per day
        if (now - lastCleanup < 24 * 60 * 60 * 1000) {
            return;
        }

        try {
            console.log('🦆 DEBUG: Performing maintenance cleanup of chat messages');
            
            // Get all conversations
            const conversations = await this.getConversations();
            
            for (const conversation of conversations) {
                // Get raw messages for this conversation
                const rawMessages = await this.db!.all(
                    `SELECT id, conversationId, role, content, timestamp
                     FROM messages
                     WHERE conversationId = ?
                     ORDER BY timestamp ASC, id ASC`,
                    [conversation.id]
                );

                if (rawMessages.length === 0) continue;

                const messages = rawMessages.map(row => ({
                    id: row.id,
                    conversationId: row.conversationId,
                    role: row.role,
                    content: row.content,
                    timestamp: row.timestamp
                })) as ChatMessage[];

                // Clean up the messages
                const cleanedMessages = this.cleanupAndFixMessageOrder(messages);
                
                // If messages were cleaned up, update the database
                if (cleanedMessages.length !== messages.length) {
                    console.log(`🦆 DEBUG: Conversation ${conversation.id}: ${messages.length} -> ${cleanedMessages.length} messages after cleanup`);
                    
                    // Delete all messages for this conversation
                    await this.clearConversation(conversation.id);
                    
                    // Re-insert cleaned messages
                    for (const message of cleanedMessages) {
                        await this.db!.run(
                            `INSERT INTO messages (conversationId, role, content, timestamp)
                             VALUES (?, ?, ?, ?)`,
                            [message.conversationId, message.role, message.content, message.timestamp]
                        );
                    }
                    
                    // Update conversation metadata
                    await this.db!.run(`
                        INSERT INTO conversations (id, title, created_at, updated_at, message_count)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT (id) DO UPDATE SET
                            message_count = ?,
                            updated_at = ?
                    `, [
                        conversation.id,
                        cleanedMessages.length > 0 ? cleanedMessages[0].content.substring(0, 50) + '...' : 'Empty Conversation',
                        cleanedMessages.length > 0 ? cleanedMessages[0].timestamp : Date.now(),
                        Date.now(),
                        cleanedMessages.length,
                        cleanedMessages.length,
                        Date.now()
                    ]);
                }
            }

            // Update last cleanup time
            this.setConfigValue('lastCleanup', now);
            console.log('🦆 DEBUG: Maintenance cleanup completed');
            
        } catch (error) {
            console.error('🚨 DEBUG: Error during maintenance cleanup:', error);
        }
    }

    /**
     * Migrate data from SQLite ChatStorageService
     */
    async migrateFromSQLite(sqliteService: any): Promise<void> {
        try {
            console.log('🦆 DEBUG: Starting migration from SQLite to DuckDB...');
            
            // Get all conversations from SQLite
            const conversations = await sqliteService.getConversations();
            console.log(`🦆 DEBUG: Found ${conversations.length} conversations to migrate`);
            
            for (const conversation of conversations) {
                console.log(`🦆 DEBUG: Migrating conversation ${conversation.id}...`);
                
                // Get all messages for this conversation from SQLite
                const messages = await sqliteService.getConversationHistory(conversation.id, 1000);
                console.log(`🦆 DEBUG: Found ${messages.length} messages in conversation ${conversation.id}`);
                
                // Insert messages into DuckDB
                for (const message of messages) {
                    await this.saveMessage({
                        conversationId: message.conversationId,
                        role: message.role,
                        content: message.content,
                        timestamp: message.timestamp
                    });
                }
                
                console.log(`🦆 DEBUG: Migrated ${messages.length} messages for conversation ${conversation.id}`);
            }
            
            console.log('🦆 DEBUG: Migration from SQLite to DuckDB completed successfully');
        } catch (error) {
            console.error('🚨 DEBUG: Error during SQLite to DuckDB migration:', error);
            throw error;
        }
    }
}