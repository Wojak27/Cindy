import { EventEmitter } from 'events';
import { BufferWindowMemory } from 'langchain/memory';
import { ConversationSummaryBufferMemory } from 'langchain/memory';
import { VectorStoreRetrieverMemory } from 'langchain/memory';
import { ChatMessageHistory } from '@langchain/community/stores/message/in_memory';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { ChatStorageService } from './ChatStorageService';
// import { LangChainVectorStoreService } from './LangChainVectorStoreService'; // Unused - using DuckDBVectorStore instead
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

interface MemoryEntry {
    id: string;
    type: 'conversation' | 'fact' | 'preference';
    key: string;
    value: any;
    timestamp: Date;
    expiresAt?: Date;
}

interface ConversationContext {
    conversationId: string;
    shortTermMemory: BufferWindowMemory;
    longTermMemory?: ConversationSummaryBufferMemory;
    semanticMemory?: VectorStoreRetrieverMemory;
    lastActivity: Date;
}

export class LangChainMemoryService extends EventEmitter {
    private memoryCache: Map<string, MemoryEntry> = new Map();
    private chatStorage: ChatStorageService;
    private vectorStore?: any; // Using DuckDBVectorStore instead of LangChainVectorStoreService
    private llmModel?: BaseChatModel;
    
    // Conversation-specific memory instances
    private conversations: Map<string, ConversationContext> = new Map();
    
    // Memory configuration
    private readonly DEFAULT_WINDOW_SIZE = 20; // Number of messages to keep in short-term memory
    private readonly MAX_TOKEN_LIMIT = 4000; // Token limit for conversation buffer

    constructor(store: any, vectorStore?: any, llmModel?: BaseChatModel) {
        super();
        this.chatStorage = new ChatStorageService();
        this.vectorStore = vectorStore;
        this.llmModel = llmModel;
        
        console.log('[LangChainMemoryService] Initialized with enhanced memory capabilities');
    }

    async initialize(): Promise<void> {
        await this.chatStorage.initialize();
        console.log('[LangChainMemoryService] Memory service initialized');
    }

    /**
     * Get or create memory context for a conversation
     */
    private async getConversationContext(conversationId: string): Promise<ConversationContext> {
        let context = this.conversations.get(conversationId);
        
        if (!context) {
            console.log(`[LangChainMemoryService] Creating new memory context for conversation: ${conversationId}`);
            
            // Create message history from existing chat storage
            const chatHistory = new ChatMessageHistory();
            
            // Load existing conversation messages
            try {
                const existingMessages = await this.chatStorage.getConversationHistory(conversationId);
                
                // Convert to LangChain message format
                for (const msg of existingMessages) {
                    let message: BaseMessage;
                    switch (msg.role) {
                        case 'user':
                            message = new HumanMessage(msg.content);
                            break;
                        case 'assistant':
                            message = new AIMessage(msg.content);
                            break;
                        case 'system':
                            message = new SystemMessage(msg.content);
                            break;
                        default:
                            message = new HumanMessage(msg.content);
                    }
                    await chatHistory.addMessage(message);
                }
                
                console.log(`[LangChainMemoryService] Loaded ${existingMessages.length} messages from storage`);
            } catch (error) {
                console.warn('[LangChainMemoryService] Failed to load existing messages:', error);
            }

            // Create short-term memory (buffer window)
            const shortTermMemory = new BufferWindowMemory({
                chatHistory,
                k: this.DEFAULT_WINDOW_SIZE,
                memoryKey: 'chat_history',
                returnMessages: true
            });

            // Create long-term memory with summarization (if LLM available)
            let longTermMemory: ConversationSummaryBufferMemory | undefined;
            if (this.llmModel) {
                longTermMemory = new ConversationSummaryBufferMemory({
                    llm: this.llmModel,
                    chatHistory,
                    maxTokenLimit: this.MAX_TOKEN_LIMIT,
                    memoryKey: 'chat_history_summary',
                    returnMessages: true
                });
            }

            // Create semantic memory (if vector store available)
            let semanticMemory: VectorStoreRetrieverMemory | undefined;
            if (this.vectorStore && this.vectorStore['vectorStore']) {
                const retriever = this.vectorStore['vectorStore'].asRetriever({
                    k: 6,
                    searchType: 'similarity'
                });
                
                semanticMemory = new VectorStoreRetrieverMemory({
                    vectorStoreRetriever: retriever,
                    memoryKey: 'semantic_context',
                    inputKey: 'input',
                    returnDocs: true
                });
            }

            context = {
                conversationId,
                shortTermMemory,
                longTermMemory,
                semanticMemory,
                lastActivity: new Date()
            };

            this.conversations.set(conversationId, context);
        } else {
            // Update last activity
            context.lastActivity = new Date();
        }

        return context;
    }

    /**
     * Add a message to conversation memory
     */
    async addMessage(message: {
        conversationId: string;
        role: string;
        content: string;
        timestamp: Date;
    }): Promise<void> {
        console.log(`[LangChainMemoryService] Adding message to conversation ${message.conversationId}`);
        
        try {
            // Store in chat storage first
            await this.chatStorage.saveMessage({
                conversationId: message.conversationId,
                role: message.role as 'user' | 'assistant' | 'system',
                content: message.content,
                timestamp: message.timestamp.getTime()
            });

            // Get conversation context
            const context = await this.getConversationContext(message.conversationId);

            // Convert to LangChain message format
            let langchainMessage: BaseMessage;
            switch (message.role) {
                case 'user':
                    langchainMessage = new HumanMessage(message.content);
                    break;
                case 'assistant':
                    langchainMessage = new AIMessage(message.content);
                    break;
                case 'system':
                    langchainMessage = new SystemMessage(message.content);
                    break;
                default:
                    langchainMessage = new HumanMessage(message.content);
            }

            // Add to short-term memory
            await context.shortTermMemory.chatHistory.addMessage(langchainMessage);

            // Add to long-term memory if available
            if (context.longTermMemory) {
                await context.longTermMemory.chatHistory.addMessage(langchainMessage);
            }

            // Add to semantic memory if it's a user message with substantial content
            if (context.semanticMemory && message.role === 'user' && message.content.length > 50) {
                await context.semanticMemory.saveContext(
                    { input: message.content },
                    { output: '' } // Will be filled when assistant responds
                );
            }

            this.emit('messageAdded', message);
        } catch (error) {
            console.error('[LangChainMemoryService] Error adding message:', error);
            throw error;
        }
    }

    /**
     * Get conversation history with memory enhancements
     */
    async getConversationHistory(conversationId: string, limit?: number): Promise<any[]> {
        try {
            const context = await this.getConversationContext(conversationId);
            
            // Get messages from short-term memory
            const memoryVariables = await context.shortTermMemory.loadMemoryVariables({});
            const chatHistory = memoryVariables.chat_history as BaseMessage[];

            // Convert back to application format
            const messages = chatHistory.map((msg, index) => ({
                id: `mem-${conversationId}-${index}`,
                conversationId,
                role: msg._getType() === 'human' ? 'user' : 
                      msg._getType() === 'ai' ? 'assistant' : 'system',
                content: msg.content as string,
                timestamp: new Date() // LangChain doesn't preserve timestamps
            }));

            // Apply limit if specified
            if (limit && limit > 0) {
                return messages.slice(-limit);
            }

            return messages;
        } catch (error) {
            console.error('[LangChainMemoryService] Error getting conversation history:', error);
            // Fallback to chat storage
            return await this.chatStorage.getConversationHistory(conversationId, limit);
        }
    }

    /**
     * Get enhanced conversation context including summaries and semantic context
     */
    async getEnhancedContext(conversationId: string, userInput: string): Promise<{
        recentMessages: BaseMessage[];
        conversationSummary?: string;
        semanticContext?: string[];
        tokenCount: number;
    }> {
        const context = await this.getConversationContext(conversationId);
        
        // Get recent messages
        const shortTermContext = await context.shortTermMemory.loadMemoryVariables({});
        const recentMessages = shortTermContext.chat_history as BaseMessage[];

        // Get conversation summary if available
        let conversationSummary: string | undefined;
        if (context.longTermMemory) {
            const longTermContext = await context.longTermMemory.loadMemoryVariables({});
            conversationSummary = longTermContext.chat_history_summary as string;
        }

        // Get semantic context if available
        let semanticContext: string[] | undefined;
        if (context.semanticMemory) {
            const semanticVariables = await context.semanticMemory.loadMemoryVariables({ input: userInput });
            const docs = semanticVariables.semantic_context;
            if (Array.isArray(docs)) {
                semanticContext = docs.map(doc => doc.pageContent);
            }
        }

        // Estimate token count (rough approximation)
        const tokenCount = this.estimateTokenCount(recentMessages, conversationSummary, semanticContext);

        return {
            recentMessages,
            conversationSummary,
            semanticContext,
            tokenCount
        };
    }

    /**
     * Clear conversation memory
     */
    async clearConversation(conversationId: string): Promise<void> {
        console.log(`[LangChainMemoryService] Clearing conversation memory: ${conversationId}`);
        
        const context = this.conversations.get(conversationId);
        if (context) {
            // Clear all memory types
            await context.shortTermMemory.clear();
            if (context.longTermMemory) {
                await context.longTermMemory.clear();
            }
            // Note: VectorStoreRetrieverMemory doesn't have a clear method in LangChain
            // We'll skip clearing it for now as it's managed by the vector store
        }

        // Remove from conversations map
        this.conversations.delete(conversationId);

        // Clear from chat storage
        try {
            // Note: ChatStorageService doesn't have a clear method, would need to be added
            console.log('[LangChainMemoryService] Chat storage clear not implemented');
        } catch (error) {
            console.warn('[LangChainMemoryService] Failed to clear chat storage:', error);
        }

        this.emit('conversationCleared', conversationId);
    }

    /**
     * Get memory statistics
     */
    async getMemoryStats(): Promise<{
        activeConversations: number;
        totalMessages: number;
        averageContextLength: number;
        memoryTypes: string[];
    }> {
        const activeConversations = this.conversations.size;
        
        // Calculate total messages across all conversations
        let totalMessages = 0;
        let totalContextLength = 0;
        
        for (const [conversationId, context] of this.conversations) {
            try {
                const memoryVars = await context.shortTermMemory.loadMemoryVariables({});
                const messages = memoryVars.chat_history as BaseMessage[];
                totalMessages += messages.length;
                totalContextLength += messages.reduce((sum, msg) => sum + (msg.content as string).length, 0);
            } catch (error) {
                console.warn(`[LangChainMemoryService] Failed to get stats for conversation ${conversationId}:`, error);
            }
        }

        const averageContextLength = activeConversations > 0 ? totalContextLength / activeConversations : 0;

        const memoryTypes = ['short_term_buffer'];
        if (this.llmModel) memoryTypes.push('long_term_summary');
        if (this.vectorStore) memoryTypes.push('semantic_retrieval');

        return {
            activeConversations,
            totalMessages,
            averageContextLength,
            memoryTypes
        };
    }

    /**
     * Cleanup old conversation contexts
     */
    async cleanup(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
        const cutoffTime = new Date(Date.now() - maxAge);
        let cleaned = 0;

        for (const [conversationId, context] of this.conversations) {
            if (context.lastActivity < cutoffTime) {
                console.log(`[LangChainMemoryService] Cleaning up old conversation: ${conversationId}`);
                this.conversations.delete(conversationId);
                cleaned++;
            }
        }

        console.log(`[LangChainMemoryService] Cleaned up ${cleaned} old conversation contexts`);
        this.emit('memoryCleanup', { cleaned, remaining: this.conversations.size });
    }

    // Legacy compatibility methods

    async get(key: string, defaultValue: any = null): Promise<any> {
        const entry = this.memoryCache.get(key);
        if (entry && (!entry.expiresAt || entry.expiresAt > new Date())) {
            return entry.value;
        }
        return defaultValue;
    }

    async set(key: string, value: any, expiresAt?: Date): Promise<void> {
        const entry: MemoryEntry = {
            id: key,
            type: 'fact',
            key,
            value,
            timestamp: new Date(),
            expiresAt
        };
        this.memoryCache.set(key, entry);
        this.emit('memoryUpdated', entry);
    }

    async delete(key: string): Promise<boolean> {
        const existed = this.memoryCache.has(key);
        this.memoryCache.delete(key);
        if (existed) {
            this.emit('memoryDeleted', key);
        }
        return existed;
    }

    /**
     * Rough token count estimation
     */
    private estimateTokenCount(
        messages?: BaseMessage[], 
        summary?: string, 
        semanticContext?: string[]
    ): number {
        let count = 0;
        
        if (messages) {
            count += messages.reduce((sum, msg) => sum + (msg.content as string).length, 0) / 4;
        }
        
        if (summary) {
            count += summary.length / 4;
        }
        
        if (semanticContext) {
            count += semanticContext.reduce((sum, ctx) => sum + ctx.length, 0) / 4;
        }
        
        return Math.ceil(count);
    }

    // Backward compatibility methods for MemoryService interface

    /**
     * Clear expired memory entries (for compatibility)
     */
    async clearExpired(): Promise<void> {
        await this.cleanup(); // Use the existing cleanup method
    }

    /**
     * Generate unique ID (for compatibility)
     */
    generateId(): string {
        return `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}

export { MemoryEntry, ConversationContext };