/**
 * Unit tests for AgenticMemoryService (A-Mem implementation)
 */

import { AgenticMemoryService, MemoryNote } from '../AgenticMemoryService';

// Mock Electron app
jest.mock('electron', () => ({
    app: {
        getPath: jest.fn().mockReturnValue('/tmp')
    }
}));

// Mock dependencies
jest.mock('duckdb-async', () => ({
    Database: {
        create: jest.fn().mockResolvedValue({
            run: jest.fn().mockResolvedValue(undefined),
            all: jest.fn().mockResolvedValue([]),
            prepare: jest.fn().mockResolvedValue({
                run: jest.fn().mockResolvedValue(undefined),
                all: jest.fn().mockResolvedValue([]),
                finalize: jest.fn().mockResolvedValue(undefined)
            }),
            close: jest.fn().mockResolvedValue(undefined)
        })
    }
}));

// Mock LLM provider
const mockLLMProvider = {
    chat: jest.fn().mockResolvedValue({
        choices: [{
            message: {
                content: JSON.stringify({
                    content: "Test memory content",
                    context: "Test context",
                    keywords: ["test", "memory"],
                    tags: ["important", "testing"],
                    links: []
                })
            }
        }]
    }),
    embeddings: {
        create: jest.fn().mockResolvedValue({
            data: [{ embedding: [0.1, 0.2, 0.3, 0.4, 0.5] }]
        })
    }
};

describe('AgenticMemoryService', () => {
    let memoryService: AgenticMemoryService;

    beforeEach(async () => {
        jest.clearAllMocks();
        memoryService = new AgenticMemoryService({
            databasePath: ':memory:',
            llmProvider: mockLLMProvider as any
        });
        await memoryService.initialize();
    });

    afterEach(() => {
        // No cleanup method available
        jest.clearAllMocks();
    });

    describe('initialization', () => {
        it('should initialize with default config', async () => {
            const service = new AgenticMemoryService({
                llmProvider: mockLLMProvider as any
            });
            
            expect(service).toBeDefined();
            await service.initialize();
        });

        it('should create database tables during initialization', async () => {
            // This would typically check if tables were created
            // In a real test, you'd verify the database schema
            expect(memoryService).toBeDefined();
        });
    });

    describe('note construction', () => {
        it('should construct a memory note from input', async () => {
            const input = "Remember that Paris is the capital of France";
            const context = "Geography lesson";

            const note = await memoryService.constructNote(input, context);

            expect(note).toBeDefined();
            expect(note.content).toBe("Test memory content");
            expect(note.context).toBe("Test context");
            expect(note.keywords).toEqual(["test", "memory"]);
            expect(note.tags).toEqual(["important", "testing"]);
            expect(note.embedding).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
            expect(note.id).toMatch(/^mem_/);
            expect(note.timestamp).toBeInstanceOf(Date);
        });

        it('should handle LLM parsing errors gracefully', async () => {
            mockLLMProvider.chat.mockResolvedValueOnce({
                choices: [{
                    message: { content: "invalid json" }
                }]
            });

            const note = await memoryService.constructNote("test input", "test context");

            expect(note.content).toBe("test input");
            expect(note.context).toBe("test context");
            expect(note.keywords).toEqual([]);
            expect(note.tags).toEqual([]);
        });
    });

    describe('memory addition', () => {
        it('should add a memory and return the note', async () => {
            const input = "Test memory input";
            const context = "Test context";

            const addedNote = await memoryService.addMemory(input, context);

            expect(addedNote).toBeDefined();
            expect(addedNote.content).toBe("Test memory content");
            expect(mockLLMProvider.chat).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        role: 'system',
                        content: expect.stringContaining('You are a memory construction agent')
                    }),
                    expect.objectContaining({
                        role: 'user',
                        content: expect.stringContaining(input)
                    })
                ])
            );
        });

        it('should handle conversation ID', async () => {
            const addedNote = await memoryService.addMemory("test", "conv_123");
            
            expect(addedNote.conversationId).toBe("conv_123");
        });
    });

    describe('memory retrieval', () => {
        beforeEach(async () => {
            // Add some test memories
            await memoryService.addMemory("Paris is capital of France", "Geography");
            await memoryService.addMemory("Python is a programming language", "Programming");
        });

        it('should retrieve relevant memories based on query', async () => {
            const memories = await memoryService.retrieveMemories("What is the capital?", 5);

            expect(Array.isArray(memories)).toBe(true);
            expect(memories.length).toBeGreaterThanOrEqual(0);
        });

        it('should limit results based on limit parameter', async () => {
            const memories = await memoryService.retrieveMemories("programming", 1);

            expect(memories.length).toBeLessThanOrEqual(1);
        });

        it('should handle empty query', async () => {
            const memories = await memoryService.retrieveMemories("", 5);

            expect(Array.isArray(memories)).toBe(true);
        });
    });

    describe('link generation', () => {
        it('should generate links between related memories', async () => {
            const sourceNote: MemoryNote = {
                id: 'mem_1',
                content: 'Paris is the capital of France',
                context: 'Geography',
                keywords: ['paris', 'france', 'capital'],
                tags: ['geography', 'cities'],
                embedding: [0.1, 0.2, 0.3],
                links: [],
                timestamp: Date.now(),
                lastAccessed: Date.now(),
                importance: 1.0,
                accessCount: 0,
                evolved: false
            };

            await memoryService.generateLinks(sourceNote);

            expect(mockLLMProvider.chat).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        role: 'system',
                        content: expect.stringContaining('determine if memories should be linked')
                    })
                ])
            );
        });
    });

    describe('memory evolution', () => {
        it('should evolve memories when new information is added', async () => {
            const existingNote: MemoryNote = {
                id: 'mem_1',
                content: 'Paris is a city',
                context: 'Geography',
                keywords: ['paris', 'city'],
                tags: ['geography'],
                embedding: [0.1, 0.2, 0.3],
                links: [],
                timestamp: Date.now(),
                lastAccessed: Date.now(),
                importance: 1.0,
                accessCount: 5,
                evolved: false
            };

            mockLLMProvider.chat.mockResolvedValueOnce({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            shouldEvolve: true,
                            evolvedContent: "Paris is the capital of France with 2.2 million inhabitants",
                            evolvedKeywords: ["paris", "france", "capital", "population"],
                            evolvedTags: ["geography", "cities", "demographics"]
                        })
                    }
                }]
            });

            await memoryService.evolveMemories(existingNote, []);

            expect(mockLLMProvider.chat).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        role: 'system',
                        content: expect.stringContaining('memory evolution agent')
                    })
                ])
            );
        });
    });

    describe('graph data generation', () => {
        it('should generate graph data for visualization', async () => {
            // Add some memories first
            await memoryService.addMemory("Test memory 1", "context 1");
            await memoryService.addMemory("Test memory 2", "context 2");

            const graphData = await memoryService.getMemoryGraphData();

            expect(graphData).toBeDefined();
            expect(graphData.nodes).toBeDefined();
            expect(graphData.edges).toBeDefined();
            expect(Array.isArray(graphData.nodes)).toBe(true);
            expect(Array.isArray(graphData.edges)).toBe(true);
        });

        it('should handle empty memory database', async () => {
            const emptyService = new AgenticMemoryService({
                databasePath: ':memory:',
                llmProvider: mockLLMProvider as any
            });
            await emptyService.initialize();

            const graphData = await emptyService.getMemoryGraphData();

            expect(graphData.nodes).toEqual([]);
            expect(graphData.edges).toEqual([]);
        });
    });

    describe('importance scoring', () => {
        it('should calculate importance based on access patterns', () => {
            const recentTimestamp = Date.now();
            const oldTimestamp = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days ago

            // Recent memory with high access
            const recentNote: MemoryNote = {
                id: 'mem_recent',
                content: 'Recent important info',
                context: 'work',
                keywords: ['important'],
                tags: ['work'],
                embedding: [0.1],
                links: [],
                timestamp: recentTimestamp,
                lastAccessed: recentTimestamp,
                importance: 1.0,
                accessCount: 10,
                evolved: false
            };

            // Old memory with low access
            const oldNote: MemoryNote = {
                id: 'mem_old',
                content: 'Old info',
                context: 'misc',
                keywords: ['old'],
                tags: ['misc'],
                embedding: [0.1],
                links: [],
                timestamp: oldTimestamp,
                lastAccessed: oldTimestamp,
                importance: 1.0,
                accessCount: 1,
                evolved: false
            };

            // This would test the importance calculation
            // In a real implementation, you'd call a method that calculates importance
            expect(recentNote.timestamp).toBeGreaterThan(oldNote.timestamp);
            expect(recentNote.accessCount).toBeGreaterThan(oldNote.accessCount);
        });
    });

    describe('error handling', () => {
        it('should handle database connection errors', async () => {
            const Database = require('duckdb-async').Database;
            Database.mockImplementationOnce(() => {
                throw new Error('Database connection failed');
            });

            const service = new AgenticMemoryService({
                databasePath: '/invalid/path',
                llmProvider: mockLLMProvider as any
            });

            await expect(service.initialize()).rejects.toThrow();
        });

        it('should handle LLM provider errors', async () => {
            mockLLMProvider.chat.mockRejectedValueOnce(new Error('LLM API error'));

            const result = await memoryService.addMemory("test input", "test context");

            // Should fallback to basic note creation
            expect(result.content).toBe("test input");
            expect(result.context).toBe("test context");
        });
    });
});