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
    private readonly DB_PATH = path.join(app.getPath('userData'), 'chat-history.db');

    async initialize(): Promise<void> {
        if (this.db) return;

        this.db = await open({
            filename: this.DB_PATH,
            driver: Database as any
        });

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
    }

    async saveMessage(message: Omit<ChatMessage, 'id'>): Promise<number> {
        if (!this.db) await this.initialize();

        const result = await this.db!.run(
            `INSERT INTO messages (conversationId, role, content, timestamp)
           VALUES (?, ?, ?, ?)`,
            [message.conversationId, message.role, message.content, message.timestamp]
        ) as any;

        return result.lastID;
    }

    async getConversationHistory(
        conversationId: string,
        limit: number = 100
    ): Promise<ChatMessage[]> {
        if (!this.db) await this.initialize();

        const rows = await (this.db! as any).all(
            `SELECT id, conversationId, role, content, timestamp
           FROM messages
           WHERE conversationId = ?
           ORDER BY timestamp ASC
           LIMIT ?`,
            [conversationId, limit]
        );

        return rows.map(row => ({
            id: row.id,
            conversationId: row.conversationId,
            role: row.role,
            content: row.content,
            timestamp: row.timestamp
        })) as ChatMessage[];
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
             ORDER BY lastMessageAt DESC`
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
}