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

export interface ThinkingBlock {
    id: string;
    conversationId: string;
    messageId?: string;
    content: string;
    startTime: number;
    endTime?: number;
    duration?: string;
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
          
          CREATE TABLE IF NOT EXISTS thinking_blocks (
            id TEXT PRIMARY KEY,
            conversationId TEXT NOT NULL,
            messageId TEXT,
            content TEXT NOT NULL,
            startTime INTEGER NOT NULL,
            endTime INTEGER,
            duration TEXT,
            timestamp INTEGER NOT NULL
          );
          
          CREATE INDEX IF NOT EXISTS idx_conversation ON messages(conversationId);
          CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp);
          CREATE INDEX IF NOT EXISTS idx_thinking_conversation ON thinking_blocks(conversationId);
          CREATE INDEX IF NOT EXISTS idx_thinking_message ON thinking_blocks(messageId);
          CREATE INDEX IF NOT EXISTS idx_thinking_timestamp ON thinking_blocks(timestamp);
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
           WHERE conversationId = ? AND role = 'user'
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

    /**
     * Detect conversations that may have missing AI responses
     * Returns conversation IDs that have orphaned user messages
     */
    async getIncompleteConversations(): Promise<string[]> {
        if (!this.db) await this.initialize();

        console.log('🔧 DEBUG: Checking for incomplete conversations...');

        // Find conversations where the last message is from user (indicating missing AI response)
        const query = `
            WITH conversation_last_messages AS (
                SELECT 
                    conversationId,
                    role,
                    timestamp,
                    ROW_NUMBER() OVER (PARTITION BY conversationId ORDER BY timestamp DESC, id DESC) as row_num
                FROM messages
            ),
            user_ending_conversations AS (
                SELECT conversationId
                FROM conversation_last_messages 
                WHERE row_num = 1 AND role = 'user'
            ),
            conversation_stats AS (
                SELECT 
                    conversationId,
                    COUNT(*) as total_messages,
                    SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as user_messages,
                    SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END) as assistant_messages
                FROM messages
                GROUP BY conversationId
            )
            SELECT DISTINCT uec.conversationId
            FROM user_ending_conversations uec
            JOIN conversation_stats cs ON uec.conversationId = cs.conversationId
            WHERE cs.user_messages > cs.assistant_messages
            AND cs.total_messages > 1
        `;

        const rows = await (this.db! as any).all(query);
        const incompleteConversations = rows.map(row => row.conversationId);

        console.log('🔧 DEBUG: Found', incompleteConversations.length, 'incomplete conversations:', incompleteConversations);
        return incompleteConversations;
    }

    /**
     * Get conversation health stats for a specific conversation
     */
    async getConversationHealth(conversationId: string): Promise<{
        isComplete: boolean;
        totalMessages: number;
        userMessages: number;
        assistantMessages: number;
        lastMessageRole: 'user' | 'assistant' | null;
        missingResponseCount: number;
    }> {
        if (!this.db) await this.initialize();

        const query = `
            SELECT 
                COUNT(*) as total_messages,
                SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as user_messages,
                SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END) as assistant_messages
            FROM messages 
            WHERE conversationId = ?
        `;

        const lastMessageQuery = `
            SELECT role 
            FROM messages 
            WHERE conversationId = ?
            ORDER BY timestamp DESC, id DESC 
            LIMIT 1
        `;

        const statsRow = await (this.db! as any).get(query, [conversationId]);
        const lastMessageRow = await (this.db! as any).get(lastMessageQuery, [conversationId]);

        const totalMessages = statsRow?.total_messages || 0;
        const userMessages = statsRow?.user_messages || 0;
        const assistantMessages = statsRow?.assistant_messages || 0;
        const lastMessageRole = lastMessageRow?.role || null;

        // Calculate missing responses: ideally user_messages should equal assistant_messages
        const missingResponseCount = Math.max(0, userMessages - assistantMessages);
        
        // Conversation is complete if:
        // 1. Has messages
        // 2. User messages <= assistant messages (no orphaned user messages)
        // 3. If there are messages, the pattern should be balanced
        const isComplete = totalMessages > 0 && missingResponseCount === 0;

        return {
            isComplete,
            totalMessages,
            userMessages,
            assistantMessages,
            lastMessageRole: lastMessageRole as 'user' | 'assistant' | null,
            missingResponseCount
        };
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
    async saveThinkingBlock(thinkingBlock: ThinkingBlock): Promise<void> {
        console.log('🔧 DEBUG: ChatStorageService.saveThinkingBlock() called for:', thinkingBlock.id);
        
        if (!this.db) {
            console.error('🚨 DEBUG: ChatStorageService.saveThinkingBlock() - Database not initialized');
            return;
        }

        try {
            await this.db.run(
                `INSERT OR REPLACE INTO thinking_blocks 
                 (id, conversationId, messageId, content, startTime, endTime, duration, timestamp) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    thinkingBlock.id,
                    thinkingBlock.conversationId,
                    thinkingBlock.messageId || null,
                    thinkingBlock.content,
                    thinkingBlock.startTime,
                    thinkingBlock.endTime || null,
                    thinkingBlock.duration || null,
                    thinkingBlock.timestamp
                ]
            );
            console.log('🔧 DEBUG: ChatStorageService.saveThinkingBlock() - Thinking block saved successfully');
        } catch (error) {
            console.error('🚨 DEBUG: ChatStorageService.saveThinkingBlock() - Failed to save thinking block:', error);
        }
    }

    async getThinkingBlocks(conversationId: string): Promise<ThinkingBlock[]> {
        console.log('🔧 DEBUG: ChatStorageService.getThinkingBlocks() called for conversation:', conversationId);

        if (!this.db) {
            console.error('🚨 DEBUG: ChatStorageService.getThinkingBlocks() - Database not initialized');
            return [];
        }

        try {
            const blocks = await this.db.all(
                `SELECT * FROM thinking_blocks 
                 WHERE conversationId = ? 
                 ORDER BY timestamp ASC`,
                [conversationId]
            );
            
            console.log('🔧 DEBUG: ChatStorageService.getThinkingBlocks() - Retrieved', blocks.length, 'thinking blocks');
            return blocks;
        } catch (error) {
            console.error('🚨 DEBUG: ChatStorageService.getThinkingBlocks() - Failed to retrieve thinking blocks:', error);
            return [];
        }
    }

    async deleteThinkingBlocks(conversationId: string): Promise<void> {
        console.log('🔧 DEBUG: ChatStorageService.deleteThinkingBlocks() called for conversation:', conversationId);

        if (!this.db) {
            console.error('🚨 DEBUG: ChatStorageService.deleteThinkingBlocks() - Database not initialized');
            return;
        }

        try {
            await this.db.run(
                `DELETE FROM thinking_blocks WHERE conversationId = ?`,
                [conversationId]
            );
            console.log('🔧 DEBUG: ChatStorageService.deleteThinkingBlocks() - Thinking blocks deleted successfully');
        } catch (error) {
            console.error('🚨 DEBUG: ChatStorageService.deleteThinkingBlocks() - Failed to delete thinking blocks:', error);
        }
    }

    async createConversation(): Promise<string> {
        console.log('🔧 DEBUG: ChatStorageService.createConversation() called');
        
        if (!this.db) {
            console.log('🔧 DEBUG: ChatStorageService.createConversation() - Database not initialized, initializing...');
            await this.initialize();
        }

        try {
            // Generate a unique conversation ID
            const conversationId = Date.now().toString();

            // Save a system message to establish the conversation
            await this.saveMessage({
                conversationId,
                role: 'system',
                content: 'New conversation created',
                timestamp: Date.now()
            });

            console.log('🔧 DEBUG: ChatStorageService.createConversation() - Created new conversation with ID:', conversationId);
            return conversationId;
        } catch (error) {
            console.error('🚨 DEBUG: ChatStorageService.createConversation() - Failed to create conversation:', error);
            throw error;
        }
    }

}