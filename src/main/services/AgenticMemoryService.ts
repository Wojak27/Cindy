/**
 * Agentic Memory Service implementing A-Mem architecture
 * Based on Zettelkasten method with dynamic note construction, linking, and evolution
 */

import { EventEmitter } from 'events';
import { Database } from 'duckdb-async';
import { v4 as uuidv4 } from 'uuid';
import { LLMProvider } from '../services/LLMProvider.ts';
import path from 'path';
import { app } from 'electron';

/**
 * Structure of a memory note following A-Mem paper
 */
export interface MemoryNote {
    id: string;
    conversationId?: string;      // Optional conversation context
    content: string;               // Original interaction content
    context: string;              // LLM-generated contextual description
    keywords: string[];           // LLM-extracted keywords
    tags: string[];              // LLM-generated tags for categorization
    embedding: number[];         // Dense vector representation
    links: string[];            // Connected memory IDs
    timestamp: number;
    importance: number;         // Relevance score (0-1)
    accessCount: number;       // Usage tracking
    lastAccessed: number;      // Last access timestamp
    evolved: boolean;          // Whether this memory has evolved
}

/**
 * Memory link structure
 */
interface MemoryLink {
    sourceId: string;
    targetId: string;
    strength: number;         // Connection strength (0-1)
    type: 'semantic' | 'temporal' | 'evolved';
    createdAt: number;
}

/**
 * Memory evolution record
 */
// Interface removed - was not used

/**
 * Configuration for Agentic Memory Service
 */
export interface AgenticMemoryConfig {
    databasePath?: string;
    llmProvider: LLMProvider;
    embeddingDimension?: number;
    topK?: number;               // Number of nearest neighbors for linking
    evolutionThreshold?: number;  // Similarity threshold for evolution
    decayRate?: number;          // Memory importance decay rate
}

export class AgenticMemoryService extends EventEmitter {
    private db: Database | null = null;
    private llmProvider: LLMProvider;
    private config: AgenticMemoryConfig;
    private memoryCache: Map<string, MemoryNote> = new Map();
    private isInitialized: boolean = false;

    constructor(config: AgenticMemoryConfig) {
        super();
        this.config = {
            databasePath: path.join(app.getPath('userData'), 'agentic_memory.db'),
            embeddingDimension: 1536,
            topK: 10,
            evolutionThreshold: 0.75,
            decayRate: 0.95,
            ...config
        };
        this.llmProvider = config.llmProvider;
        console.log('[AgenticMemoryService] Initialized with config:', this.config);
    }

    /**
     * Initialize the database and create tables
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            this.db = await Database.create(this.config.databasePath!);

            // Create memory notes table
            await this.db.run(`
                CREATE TABLE IF NOT EXISTS memory_notes (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT,
                    content TEXT NOT NULL,
                    context TEXT NOT NULL,
                    keywords TEXT NOT NULL,
                    tags TEXT NOT NULL,
                    embedding BLOB NOT NULL,
                    links TEXT,
                    timestamp INTEGER NOT NULL,
                    importance REAL DEFAULT 1.0,
                    access_count INTEGER DEFAULT 0,
                    last_accessed INTEGER,
                    evolved BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create memory links table
            await this.db.run(`
                CREATE TABLE IF NOT EXISTS memory_links (
                    source_id TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    strength REAL DEFAULT 0.5,
                    type TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    PRIMARY KEY (source_id, target_id),
                    FOREIGN KEY (source_id) REFERENCES memory_notes(id),
                    FOREIGN KEY (target_id) REFERENCES memory_notes(id)
                )
            `);

            // Create memory evolution history table
            await this.db.run(`
                CREATE TABLE IF NOT EXISTS memory_evolution (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    memory_id TEXT NOT NULL,
                    old_context TEXT,
                    new_context TEXT,
                    old_tags TEXT,
                    new_tags TEXT,
                    reason TEXT,
                    timestamp INTEGER NOT NULL,
                    FOREIGN KEY (memory_id) REFERENCES memory_notes(id)
                )
            `);

            // Create indexes for better performance
            await this.db.run('CREATE INDEX IF NOT EXISTS idx_memory_timestamp ON memory_notes(timestamp)');
            await this.db.run('CREATE INDEX IF NOT EXISTS idx_memory_conversation ON memory_notes(conversation_id)');
            await this.db.run('CREATE INDEX IF NOT EXISTS idx_memory_importance ON memory_notes(importance)');
            await this.db.run('CREATE INDEX IF NOT EXISTS idx_links_source ON memory_links(source_id)');
            await this.db.run('CREATE INDEX IF NOT EXISTS idx_links_target ON memory_links(target_id)');

            this.isInitialized = true;
            console.log('[AgenticMemoryService] Database initialized successfully');
        } catch (error) {
            console.error('[AgenticMemoryService] Failed to initialize database:', error);
            throw error;
        }
    }

    /**
     * Step 1: Note Construction - Create a structured memory note from content
     */
    async constructNote(content: string, conversationId?: string): Promise<MemoryNote> {
        console.log('[AgenticMemoryService] Constructing note from content');

        // Generate structured components using LLM
        const prompt = `Generate a structured analysis of the following content by:
1. Identifying the most salient keywords (focus on nouns, verbs, and key concepts)
2. Extracting core themes and contextual elements
3. Creating relevant categorical tags

Format the response as a JSON object:
{
    "keywords": ["keyword1", "keyword2", ...],
    "context": "one sentence summarizing main topic and key points",
    "tags": ["tag1", "tag2", ...]
}

Content for analysis:
${content}`;

        try {
            const response = await this.llmProvider.chat([
                {
                    role: 'system',
                    content: 'You are a memory construction agent that creates structured memory notes from user input. Return valid JSON only.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ]);
            const responseContent = (response as any).choices?.[0]?.message?.content || (response as any).content || response;
            const structured = JSON.parse(responseContent);

            // Generate embedding for the complete note
            const embedding = await this.generateEmbedding(
                `${content} ${structured.keywords.join(' ')} ${structured.context} ${structured.tags.join(' ')}`
            );

            // Create the memory note
            const note: MemoryNote = {
                id: uuidv4(),
                conversationId,
                content,
                context: structured.context,
                keywords: structured.keywords,
                tags: structured.tags,
                embedding,
                links: [],
                timestamp: Date.now(),
                importance: 1.0,
                accessCount: 0,
                lastAccessed: Date.now(),
                evolved: false
            };

            console.log('[AgenticMemoryService] Note constructed:', note.id);
            return note;
        } catch (error) {
            console.error('[AgenticMemoryService] Error constructing note:', error);
            throw error;
        }
    }

    /**
     * Step 2: Link Generation - Establish connections with existing memories
     */
    async generateLinks(note: MemoryNote): Promise<string[]> {
        console.log('[AgenticMemoryService] Generating links for note:', note.id);

        // Find nearest neighbors based on embedding similarity
        const nearestMemories = await this.findNearestMemories(note.embedding, this.config.topK!);

        if (nearestMemories.length === 0) {
            console.log('[AgenticMemoryService] No existing memories to link');
            return [];
        }

        // Use LLM to analyze potential connections
        const prompt = `You are an AI memory evolution agent responsible for managing and evolving a knowledge base.
Analyze the new memory note and determine which existing memories it should be linked to.

New memory context: ${note.context}
Content: ${note.content}
Keywords: ${note.keywords.join(', ')}

Nearest neighbor memories:
${nearestMemories.map((m, i) => `${i + 1}. ID: ${m.id}, Context: ${m.context}, Keywords: ${m.keywords.join(', ')}`).join('\n')}

Based on this information, determine which memories should be linked (provide memory IDs).
Consider semantic similarity, shared concepts, and potential relationships.

Return your decision as a JSON array of memory IDs:
["memory_id_1", "memory_id_2", ...]`;

        try {
            const response = await this.llmProvider.chat([
                {
                    role: 'system',
                    content: 'You are a memory construction agent that creates structured memory notes from user input. Return valid JSON only.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ]);
            const responseContent = (response as any).choices?.[0]?.message?.content || (response as any).content || response;
            const linkedIds = JSON.parse(responseContent);

            // Create bidirectional links
            for (const targetId of linkedIds) {
                await this.createLink(note.id, targetId, 'semantic');
            }

            console.log('[AgenticMemoryService] Created', linkedIds.length, 'links');
            return linkedIds;
        } catch (error) {
            console.error('[AgenticMemoryService] Error generating links:', error);
            return [];
        }
    }

    /**
     * Step 3: Memory Evolution - Evolve existing memories based on new information
     */
    async evolveMemories(newNote: MemoryNote, relatedMemories: MemoryNote[]): Promise<void> {
        console.log('[AgenticMemoryService] Evolving', relatedMemories.length, 'related memories');

        for (const memory of relatedMemories) {
            const similarity = this.cosineSimilarity(newNote.embedding, memory.embedding);

            // Only evolve if similarity exceeds threshold
            if (similarity < this.config.evolutionThreshold!) continue;

            const prompt = `You are an AI memory evolution agent. 
Analyze how a new memory should influence an existing memory's understanding.

New memory context: ${newNote.context}
Content: ${newNote.content}
Keywords: ${newNote.keywords.join(', ')}

Existing memory to potentially evolve:
Context: ${memory.context}
Content: ${memory.content}
Keywords: ${memory.keywords.join(', ')}
Tags: ${memory.tags.join(', ')}

Based on the new information, should this memory be evolved? If yes, provide:
1. Updated context that incorporates new understanding
2. Updated tags if categories should change

Return as JSON:
{
    "should_evolve": true/false,
    "new_context": "updated context if evolving",
    "new_tags": ["tag1", "tag2", ...] if tags should change
}`;

            try {
                const response = await this.llmProvider.chat([
                    {
                        role: 'system',
                        content: 'You are a memory construction agent that creates structured memory notes from user input. Return valid JSON only.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ]);
                const responseContent = (response as any).choices?.[0]?.message?.content || (response as any).content || response;
                const evolution = JSON.parse(responseContent);

                if (evolution.should_evolve) {
                    await this.applyEvolution(memory, evolution.new_context, evolution.new_tags);
                    await this.createLink(newNote.id, memory.id, 'evolved');
                }
            } catch (error) {
                console.error('[AgenticMemoryService] Error evolving memory:', memory.id, error);
            }
        }
    }

    /**
     * Main entry point: Add a new memory to the system
     */
    async addMemory(content: string, conversationId?: string): Promise<MemoryNote> {
        await this.initialize();

        // Step 1: Construct the note
        const note = await this.constructNote(content, conversationId);

        // Step 2: Generate links with existing memories
        const linkedMemoryIds = await this.generateLinks(note);
        note.links = linkedMemoryIds;

        // Step 3: Evolve related memories
        if (linkedMemoryIds.length > 0) {
            const relatedMemories = await this.getMemoriesByIds(linkedMemoryIds);
            await this.evolveMemories(note, relatedMemories);
        }

        // Save to database
        await this.saveMemory(note);

        // Update cache
        this.memoryCache.set(note.id, note);

        // Emit event for real-time updates
        this.emit('memory-added', note);

        return note;
    }

    /**
     * Retrieve relevant memories for a query
     */
    async retrieveMemories(query: string, limit: number = 10): Promise<MemoryNote[]> {
        await this.initialize();

        // Generate query embedding
        const queryEmbedding = await this.generateEmbedding(query);

        // Find most similar memories
        const memories = await this.findNearestMemories(queryEmbedding, limit);

        // Update access counts and last accessed times
        for (const memory of memories) {
            memory.accessCount++;
            memory.lastAccessed = Date.now();
            await this.updateMemoryAccess(memory.id);
        }

        // Also retrieve linked memories for context
        const allMemoryIds = new Set<string>();
        memories.forEach(m => {
            allMemoryIds.add(m.id);
            m.links.forEach(link => allMemoryIds.add(link));
        });

        // Get all unique memories
        const expandedMemories = await this.getMemoriesByIds(Array.from(allMemoryIds));

        return expandedMemories;
    }

    /**
     * Get memory graph data for visualization
     */
    async getMemoryGraphData(): Promise<{
        nodes: Array<any>;
        edges: Array<any>;
    }> {
        await this.initialize();

        // Get all memories
        const memories = await this.getAllMemories();

        // Get all links
        const links = await this.getAllLinks();

        // Format for graph visualization
        const nodes = memories.map(m => ({
            id: m.id,
            label: m.keywords[0] || 'Memory',
            content: m.content,
            context: m.context,
            keywords: m.keywords,
            tags: m.tags,
            importance: m.importance,
            timestamp: m.timestamp,
            accessCount: m.accessCount,
            evolved: m.evolved,
            color: m.evolved ? '#ff6b6b' : '#4ecdc4',
            size: Math.max(10, Math.min(50, m.importance * 50))
        }));

        const edges = links.map(l => ({
            source: l.sourceId,
            target: l.targetId,
            strength: l.strength,
            type: l.type
        }));

        return { nodes, edges };
    }

    /**
     * Private helper methods
     */

    private async generateEmbedding(text: string): Promise<number[]> {
        // Use the LLM provider's embedding capability
        // For now, returning a mock embedding
        // TODO: Integrate with actual embedding service
        const embedding = new Array(this.config.embeddingDimension!).fill(0).map(() => Math.random());
        return embedding;
    }

    private cosineSimilarity(a: number[], b: number[]): number {
        const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
        const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
        const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
        return dotProduct / (magnitudeA * magnitudeB);
    }

    private async findNearestMemories(embedding: number[], k: number): Promise<MemoryNote[]> {
        const allMemories = await this.getAllMemories();

        // Calculate similarities
        const similarities = allMemories.map(m => ({
            memory: m,
            similarity: this.cosineSimilarity(embedding, m.embedding)
        }));

        // Sort by similarity and return top k
        similarities.sort((a, b) => b.similarity - a.similarity);
        return similarities.slice(0, k).map(s => s.memory);
    }

    private async saveMemory(note: MemoryNote): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');

        await this.db.run(`
            INSERT INTO memory_notes (
                id, conversation_id, content, context, keywords, tags, 
                embedding, links, timestamp, importance, access_count, 
                last_accessed, evolved
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            note.id,
            note.conversationId,
            note.content,
            note.context,
            JSON.stringify(note.keywords),
            JSON.stringify(note.tags),
            Buffer.from(new Float32Array(note.embedding).buffer),
            JSON.stringify(note.links),
            note.timestamp,
            note.importance,
            note.accessCount,
            note.lastAccessed,
            note.evolved
        ]);
    }

    private async createLink(sourceId: string, targetId: string, type: 'semantic' | 'temporal' | 'evolved'): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');

        await this.db.run(`
            INSERT OR REPLACE INTO memory_links (source_id, target_id, strength, type, created_at)
            VALUES (?, ?, ?, ?, ?)
        `, [sourceId, targetId, 0.5, type, Date.now()]);
    }

    private async applyEvolution(memory: MemoryNote, newContext: string, newTags: string[]): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');

        // Save evolution history
        await this.db.run(`
            INSERT INTO memory_evolution (memory_id, old_context, new_context, old_tags, new_tags, reason, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            memory.id,
            memory.context,
            newContext,
            JSON.stringify(memory.tags),
            JSON.stringify(newTags),
            'Evolved based on new related information',
            Date.now()
        ]);

        // Update memory
        memory.context = newContext;
        memory.tags = newTags;
        memory.evolved = true;

        await this.db.run(`
            UPDATE memory_notes 
            SET context = ?, tags = ?, evolved = ?
            WHERE id = ?
        `, [newContext, JSON.stringify(newTags), true, memory.id]);

        this.emit('memory-evolved', memory);
    }

    private async updateMemoryAccess(memoryId: string): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');

        await this.db.run(`
            UPDATE memory_notes 
            SET access_count = access_count + 1, last_accessed = ?
            WHERE id = ?
        `, [Date.now(), memoryId]);
    }

    private async getAllMemories(): Promise<MemoryNote[]> {
        if (!this.db) throw new Error('Database not initialized');

        const rows = await this.db.all('SELECT * FROM memory_notes ORDER BY timestamp DESC');

        return rows.map(row => ({
            id: row.id,
            conversationId: row.conversation_id,
            content: row.content,
            context: row.context,
            keywords: JSON.parse(row.keywords),
            tags: JSON.parse(row.tags),
            embedding: Array.from(new Float32Array(row.embedding.buffer)),
            links: JSON.parse(row.links || '[]'),
            timestamp: row.timestamp,
            importance: row.importance,
            accessCount: row.access_count,
            lastAccessed: row.last_accessed,
            evolved: row.evolved
        }));
    }

    private async getMemoriesByIds(ids: string[]): Promise<MemoryNote[]> {
        if (!this.db || ids.length === 0) return [];

        const placeholders = ids.map(() => '?').join(',');
        const rows = await this.db.all(
            `SELECT * FROM memory_notes WHERE id IN (${placeholders})`,
            ids
        );

        return rows.map(row => ({
            id: row.id,
            conversationId: row.conversation_id,
            content: row.content,
            context: row.context,
            keywords: JSON.parse(row.keywords),
            tags: JSON.parse(row.tags),
            embedding: Array.from(new Float32Array(row.embedding.buffer)),
            links: JSON.parse(row.links || '[]'),
            timestamp: row.timestamp,
            importance: row.importance,
            accessCount: row.access_count,
            lastAccessed: row.last_accessed,
            evolved: row.evolved
        }));
    }

    private async getAllLinks(): Promise<MemoryLink[]> {
        if (!this.db) throw new Error('Database not initialized');

        const rows = await this.db.all('SELECT * FROM memory_links');

        return rows.map(row => ({
            sourceId: row.source_id,
            targetId: row.target_id,
            strength: row.strength,
            type: row.type,
            createdAt: row.created_at
        }));
    }

    /**
     * Apply forgetting curve to decay memory importance over time
     */
    async applyForgettingCurve(): Promise<void> {
        await this.initialize();

        const now = Date.now();
        const memories = await this.getAllMemories();

        for (const memory of memories) {
            const daysSinceAccess = (now - memory.lastAccessed) / (1000 * 60 * 60 * 24);
            const newImportance = memory.importance * Math.pow(this.config.decayRate!, daysSinceAccess);

            if (newImportance !== memory.importance) {
                await this.db!.run(
                    'UPDATE memory_notes SET importance = ? WHERE id = ?',
                    [newImportance, memory.id]
                );
            }
        }

        console.log('[AgenticMemoryService] Applied forgetting curve to', memories.length, 'memories');
    }
}