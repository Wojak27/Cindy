import { EventEmitter } from 'events';
import { ChatStorageService } from './ChatStorageService';

interface MemoryEntry {
    id: string;
    type: 'conversation' | 'fact' | 'preference';
    key: string;
    value: any;
    timestamp: Date;
    expiresAt?: Date;
}

class MemoryService extends EventEmitter {
    private store: any;
    private memoryCache: Map<string, MemoryEntry> = new Map();
    private chatStorage: ChatStorageService;

    constructor(store: any) {
        super();
        this.store = store;
        this.chatStorage = new ChatStorageService();
        this.chatStorage.initialize().catch(console.error);
    }

    async addMessage(message: {
        conversationId: string;
        role: string;
        content: string;
        toolName?: string;
        timestamp: Date;
    }): Promise<void> {
        // Add message to Redux store
        this.store.dispatch({
            type: 'ADD_MESSAGE',
            payload: message
        });

        // Store in memory cache
        await this.set(`conversation:${message.conversationId}:messages`, [
            ...(await this.get(`conversation:${message.conversationId}:messages`, [])),
            message
        ]);

        // Save to SQLite database
        try {
            await this.chatStorage.saveMessage({
                conversationId: message.conversationId,
                role: message.role as 'user' | 'assistant' | 'system',
                content: message.content,
                timestamp: message.timestamp.getTime()
            });
        } catch (error) {
            console.error('Failed to save message to chat storage:', error);
        }
    }

    async getConversationHistory(conversationId: string, limit?: number): Promise<any[]> {
        let messages = await this.get(`conversation:${conversationId}:messages`, []);

        // Load from database if cache is empty
        if (messages.length === 0) {
            const chatMessages = await this.chatStorage.getConversationHistory(conversationId);
            messages = chatMessages.map(m => ({
                conversationId: m.conversationId,
                role: m.role,
                content: m.content,
                timestamp: new Date(m.timestamp)
            }));
            // Store in memory cache
            await this.set(`conversation:${conversationId}:messages`, messages);
        }

        if (limit) {
            return messages.slice(-limit);
        }

        return messages;
    }

    async set(key: string, value: any, ttl?: number): Promise<void> {
        const entry: MemoryEntry = {
            id: this.generateId(),
            type: 'fact',
            key,
            value,
            timestamp: new Date(),
            expiresAt: ttl ? new Date(Date.now() + ttl) : undefined
        };

        this.memoryCache.set(key, entry);

        // Also persist to store
        this.store.dispatch({
            type: 'SET_MEMORY',
            payload: entry
        });
    }

    async get<T>(key: string, defaultValue?: T): Promise<T> {
        const entry = this.memoryCache.get(key);

        if (!entry) {
            return defaultValue as T;
        }

        // Check expiration
        if (entry.expiresAt && entry.expiresAt < new Date()) {
            this.memoryCache.delete(key);
            return defaultValue as T;
        }

        return entry.value as T;
    }

    async delete(key: string): Promise<void> {
        this.memoryCache.delete(key);

        this.store.dispatch({
            type: 'DELETE_MEMORY',
            payload: key
        });
    }

    async clearExpired(): Promise<void> {
        const now = new Date();
        for (const [key, entry] of this.memoryCache.entries()) {
            if (entry.expiresAt && entry.expiresAt < now) {
                this.memoryCache.delete(key);
            }
        }
    }

    private generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
}

export { MemoryService };