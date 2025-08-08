import { open } from 'sqlite';
import { Database } from 'sqlite3';
import path from 'path';
import { app } from 'electron';
export interface ChatMessage {
    id?: number;
    conversationId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}

export class ChatStorageService {
    private db: any | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    private DB_PATH: string;

    constructor() {
        // Defer path initialization until Electron app is ready
    }



    async initialize(): Promise<void> {
        console.log('🔧 DEBUG: ChatStorageService.initialize() called at:', new Date().toISOString());
        if (this.db) {
            console.log('🔧 DEBUG: ChatStorageService.initialize() - Database already initialized, skipping');
            return;
        }

        // Initialize paths when needed
        if (!this.DB_PATH) {
            this.DB_PATH = path.join(app.getPath('userData'), 'chat-history.db');
            console.log('🔧 DEBUG: ChatStorageService.initialize() - Database path set to:', this.DB_PATH);
        }

        try {
            console.log('🔧 DEBUG: ChatStorageService.initialize() - Opening SQLite database...');
            this.db = await open({
                filename: this.DB_PATH,
                driver: Database as any
            });
            console.log('🔧 DEBUG: ChatStorageService.initialize() - Database opened successfully');

            console.log('🔧 DEBUG: ChatStorageService.initialize() - Creating tables and indexes...');
            await this.db.exec(`
          CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversationId TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_conversation ON messages(conversationId);
          CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp);
        `);
            console.log('🔧 DEBUG: ChatStorageService.initialize() - Tables and indexes created successfully');

            // Verify database is working by running a test query
            const tableCheck = await this.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'");
            if (tableCheck) {
                console.log('🔧 DEBUG: ChatStorageService.initialize() - Database verification successful, messages table exists');
            } else {
                console.error('🚨 DEBUG: ChatStorageService.initialize() - Database verification failed, messages table not found');
            }

            // Perform cleanup on initialization if needed
        } catch (error) {
            console.error('🚨 DEBUG: ChatStorageService.initialize() - Failed to initialize database:', error);
            console.error('🚨 DEBUG: ChatStorageService.initialize() - Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    async saveMessage(message: Omit<ChatMessage, 'id'>): Promise<number> {
        console.log('🔧 DEBUG: ChatStorageService.saveMessage() called with:', {
            conversationId: message.conversationId,
            role: message.role,
            contentLength: message.content.length,
            timestamp: message.timestamp
        });

        if (!this.db) {
            console.log('🔧 DEBUG: ChatStorageService.saveMessage() - Database not initialized, initializing...');
            await this.initialize();
        }

        try {
            console.log('🔧 DEBUG: ChatStorageService.saveMessage() - Inserting message into database...');
            const result = await this.db!.run(
                `INSERT INTO messages (conversationId, role, content, timestamp)
               VALUES (?, ?, ?, ?)`,
                [message.conversationId, message.role, message.content, message.timestamp]
            ) as any;

            console.log('🔧 DEBUG: ChatStorageService.saveMessage() - Message saved successfully with ID:', result.lastID);

            // Verify the save worked by counting messages in this conversation
            const messageCount = await this.db!.get(
                `SELECT COUNT(*) as count FROM messages WHERE conversationId = ?`,
                [message.conversationId]
            );
            console.log('🔧 DEBUG: ChatStorageService.saveMessage() - Total messages in conversation:', messageCount.count);

            return result.lastID;
        } catch (error) {
            console.error('🚨 DEBUG: ChatStorageService.saveMessage() - Failed to save message:', error);
            console.error('🚨 DEBUG: ChatStorageService.saveMessage() - Error details:', {
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
        const rows = await (this.db! as any).all(
            `SELECT id, conversationId, role, content, timestamp
           FROM messages
           WHERE conversationId = ?
           ORDER BY timestamp ASC, id ASC`,
            [conversationId]
        );

        const messages = rows.map(row => ({
            id: row.id,
            conversationId: row.conversationId,
            role: row.role,
            content: row.content,
            timestamp: row.timestamp
        })) as ChatMessage[];

        // Clean up duplicates and fix ordering

        // Apply limit after cleanup
        return messages.slice(0, limit);
    }

    /**
     * Get ALL messages from a conversation without any filtering or cleanup
     * This returns the raw data directly from the database
     */
    async getAllConversationMessages(
        conversationId: string
    ): Promise<ChatMessage[]> {
        if (!this.db) await this.initialize();

        console.log('🔧 DEBUG: Getting ALL messages for conversation (no filtering):', conversationId);

        // Get all messages for this conversation without any filtering
        const rows = await (this.db! as any).all(
            `SELECT id, conversationId, role, content, timestamp
           FROM messages
           WHERE conversationId = ?
           ORDER BY timestamp ASC, id ASC`,
            [conversationId]
        );

        const messages = rows.map(row => ({
            id: row.id,
            conversationId: row.conversationId,
            role: row.role,
            content: row.content,
            timestamp: row.timestamp
        })) as ChatMessage[];

        console.log('🔧 DEBUG: Returning', messages.length, 'unfiltered messages');

        // Return ALL messages without any cleanup, deduplication, or limit
        return messages;
    }


    /**
     * Find the latest human message in a conversation
     */
    async getMessagesForChat(conversationId: string): Promise<ChatMessage | null> {
        if (!this.db) await this.initialize();

        const row = await (this.db! as any).get(
            `SELECT id, conversationId, role, content, timestamp
           FROM messages
           WHERE conversationId = ? 
           ORDER BY timestamp DESC, id DESC`,
            [conversationId]
        );

        if (!row) return null;

        return {
            id: row.id,
            conversationId: row.conversationId,
            role: row.role,
            content: row.content,
            timestamp: row.timestamp
        } as ChatMessage;
    }


    async close(): Promise<void> {
        if (this.db) {
            await this.db.close();
            this.db = null;
        }
    }

    async getConversations(): Promise<Array<{ id: string; title: string; lastMessageAt: number }>> {
        if (!this.db) await this.initialize();

        const rows = await (this.db! as any).all(
            `SELECT conversationId, MAX(timestamp) as lastMessageAt
             FROM messages 
             GROUP BY conversationId 
             ORDER BY lastMessageAt ASC`
        );

        // For each conversation, get the first message to use as title
        const conversations = await Promise.all(rows.map(async (row: any) => {
            const firstMessage = await this.getFirstMessage(row.conversationId);
            return {
                id: row.conversationId,
                title: firstMessage ? firstMessage.substring(0, 50) + (firstMessage.length > 50 ? '...' : '') : `Conversation ${new Date(row.lastMessageAt).toLocaleDateString()}`,
                lastMessageAt: row.lastMessageAt
            };
        }));

        return conversations;
    }

    async getFirstMessage(conversationId: string): Promise<string | null> {
        if (!this.db) await this.initialize();

        const row = await (this.db! as any).get(
            `SELECT content 
             FROM messages 
             WHERE conversationId = ? 
             ORDER BY timestamp ASC 
             LIMIT 1`,
            [conversationId]
        );

        return row ? row.content : null;
    }

    /**
     * Get thinking blocks for a specific conversation
     * Note: For now, returns empty array since thinking blocks are not yet stored in the database
     * This is a placeholder for future implementation
     */
    async getThinkingBlocks(conversationId: string): Promise<any[]> {
        console.log('🔧 DEBUG: ChatStorageService.getThinkingBlocks() called for conversation:', conversationId);

        // TODO: Implement thinking blocks storage in database
        // For now, return empty array as thinking blocks are not stored in the database
        // They are managed in Redux store during the session

        console.log('🔧 DEBUG: Thinking blocks not implemented in storage yet, returning empty array');
        return [];
    }

}