import { open } from 'sqlite';
import { Database } from 'sqlite3';
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

export class ChatStorageService {
    private db: any | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    private DB_PATH: string;
    private configPath: string;
    private config: StorageConfig;

    constructor() {
        this.configPath = path.join(app.getPath('userData'), 'chat-storage.json');
        this.config = this.loadConfig();
    }

    private loadConfig(): StorageConfig {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf-8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.warn('[ChatStorageService] Failed to load config:', error);
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
            console.error('[ChatStorageService] Failed to save config:', error);
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
        console.log('🔧 DEBUG: ChatStorageService.initialize() called at:', new Date().toISOString());
        if (this.db) {
            console.log('🔧 DEBUG: ChatStorageService.initialize() - Database already initialized, skipping');
            return;
        }

        // Initialize DB_PATH only when needed
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
            await this.performMaintenanceCleanup();
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
        const cleanedMessages = this.cleanupAndFixMessageOrder(messages);
        
        // Apply limit after cleanup
        return cleanedMessages.slice(0, limit);
    }

    /**
     * Clean up duplicate messages and ensure proper human-AI alternation
     */
    private cleanupAndFixMessageOrder(messages: ChatMessage[]): ChatMessage[] {
        if (messages.length === 0) return messages;

        console.log('🔧 DEBUG: Cleaning up message order for conversation, input:', messages.length, 'messages');

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
                console.log('🔧 DEBUG: Removing duplicate message:', message.role, message.content.substring(0, 50) + '...');
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
            const previous = alternated.length > 0 ? alternated[alternated.length - 1] : null;
            
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
                    console.log('🔧 DEBUG: Skipping orphaned assistant message at start:', current.content.substring(0, 50) + '...');
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
                console.log('🔧 DEBUG: Skipping message that breaks alternation:', 
                    current.role, 'after', lastNonSystemMessage.role, 
                    current.content.substring(0, 50) + '...');
            }
        }

        console.log('🔧 DEBUG: Message cleanup complete. Input:', messages.length, '-> Output:', alternated.length, 'messages');
        
        // Final verification: log the final order
        const messageOrder = alternated.map((msg, idx) => `${idx + 1}. ${msg.role}`).join(', ');
        console.log('🔧 DEBUG: Final message order:', messageOrder);
        
        return alternated;
    }

    /**
     * Find the latest human message in a conversation
     */
    async getLatestHumanMessage(conversationId: string): Promise<ChatMessage | null> {
        if (!this.db) await this.initialize();

        const row = await (this.db! as any).get(
            `SELECT id, conversationId, role, content, timestamp
           FROM messages
           WHERE conversationId = ? AND role = 'user'
           ORDER BY timestamp DESC, id DESC
           LIMIT 1`,
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

    async clearConversation(conversationId: string): Promise<void> {
        if (!this.db) await this.initialize();

        await this.db!.run(
            `DELETE FROM messages WHERE conversationId = ?`,
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
     * Creates a new conversation by saving a system message
     * This ensures the conversation appears in getConversations()
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
        console.log('🔧 DEBUG: ChatStorageService.getThinkingBlocks() called for conversation:', conversationId);
        
        // TODO: Implement thinking blocks storage in database
        // For now, return empty array as thinking blocks are not stored in the database
        // They are managed in Redux store during the session
        
        console.log('🔧 DEBUG: Thinking blocks not implemented in storage yet, returning empty array');
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
            console.log('🔧 DEBUG: Performing maintenance cleanup of chat messages');
            
            // Get all conversations
            const conversations = await this.getConversations();
            
            for (const conversation of conversations) {
                // Get raw messages for this conversation
                const rawMessages = await (this.db! as any).all(
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
                    console.log(`🔧 DEBUG: Conversation ${conversation.id}: ${messages.length} -> ${cleanedMessages.length} messages after cleanup`);
                    
                    // Delete all messages for this conversation
                    await this.clearConversation(conversation.id);
                    
                    // Re-insert cleaned messages
                    for (const message of cleanedMessages) {
                        await (this.db! as any).run(
                            `INSERT INTO messages (conversationId, role, content, timestamp)
                           VALUES (?, ?, ?, ?)`,
                            [message.conversationId, message.role, message.content, message.timestamp]
                        );
                    }
                }
            }

            // Update last cleanup time
            this.setConfigValue('lastCleanup', now);
            console.log('🔧 DEBUG: Maintenance cleanup completed');
            
        } catch (error) {
            console.error('🚨 DEBUG: Error during maintenance cleanup:', error);
        }
    }
}