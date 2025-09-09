/**
 * Unit tests for DuckDBVectorStore
 */

import { DuckDBVectorStore } from '../DuckDBVectorStore';
import { Document } from '@langchain/core/documents';
import { EventEmitter } from 'events';
import * as fs from 'fs';

// Mock DuckDB
const mockDatabase = {
    exec: jest.fn().mockResolvedValue(undefined),
    all: jest.fn().mockResolvedValue([]),
    run: jest.fn().mockResolvedValue(undefined),
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

// Mock file system
const mockFs = {
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    readdirSync: jest.fn(),
    statSync: jest.fn(),
    lstatSync: jest.fn()
};

jest.mock('fs', () => mockFs);

// Mock embeddings providers
const mockOpenAIEmbeddings = {
    embedQuery: jest.fn(),
    embedDocuments: jest.fn()
};

const mockOllamaEmbeddings = {
    embedQuery: jest.fn(),
    embedDocuments: jest.fn()
};

const mockHFEmbeddings = {
    embedQuery: jest.fn(),
    embedDocuments: jest.fn()
};

jest.mock('@langchain/openai', () => ({
    OpenAIEmbeddings: jest.fn().mockImplementation(() => mockOpenAIEmbeddings)
}));

jest.mock('@langchain/ollama', () => ({
    OllamaEmbeddings: jest.fn().mockImplementation(() => mockOllamaEmbeddings)
}));

jest.mock('@langchain/community/embeddings/huggingface_transformers', () => ({
    HuggingFaceTransformersEmbeddings: jest.fn().mockImplementation(() => mockHFEmbeddings)
}));

// Mock text splitter
const mockTextSplitter = {
    splitDocuments: jest.fn()
};

jest.mock('langchain/text_splitter', () => ({
    RecursiveCharacterTextSplitter: jest.fn().mockImplementation(() => mockTextSplitter)
}));

// Mock document loaders
const mockPDFLoader = { load: jest.fn() };
const mockTextLoader = { load: jest.fn() };
const mockJSONLoader = { load: jest.fn() };
const mockDocxLoader = { load: jest.fn() };

jest.mock('@langchain/community/document_loaders/fs/pdf', () => ({
    PDFLoader: jest.fn().mockImplementation(() => mockPDFLoader)
}));

jest.mock('langchain/document_loaders/fs/text', () => ({
    TextLoader: jest.fn().mockImplementation(() => mockTextLoader)
}));

jest.mock('langchain/document_loaders/fs/json', () => ({
    JSONLoader: jest.fn().mockImplementation(() => mockJSONLoader)
}));

jest.mock('@langchain/community/document_loaders/fs/docx', () => ({
    DocxLoader: jest.fn().mockImplementation(() => mockDocxLoader)
}));

describe('DuckDBVectorStore', () => {
    let vectorStore: DuckDBVectorStore;
    let baseConfig: any;

    beforeEach(() => {
        jest.clearAllMocks();

        baseConfig = {
            databasePath: '/tmp/test-vector.db',
            embeddingProvider: 'openai' as const,
            openaiApiKey: 'test-openai-key'
        };

        vectorStore = new DuckDBVectorStore(baseConfig);

        // Default mock responses
        mockDatabase.all.mockResolvedValue([]);
        mockDatabase.run.mockResolvedValue(undefined);
        mockOpenAIEmbeddings.embedQuery.mockResolvedValue([0.1, 0.2, 0.3]);
        mockOpenAIEmbeddings.embedDocuments.mockResolvedValue([[0.1, 0.2, 0.3]]);
        mockTextSplitter.splitDocuments.mockResolvedValue([]);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should create DuckDBVectorStore with OpenAI provider', () => {
            expect(vectorStore).toBeInstanceOf(DuckDBVectorStore);
            expect(vectorStore).toBeInstanceOf(EventEmitter);

            const { OpenAIEmbeddings } = require('@langchain/openai');
            expect(OpenAIEmbeddings).toHaveBeenCalledWith({
                modelName: 'text-embedding-ada-002',
                openAIApiKey: 'test-openai-key'
            });
        });

        it('should create DuckDBVectorStore with Ollama provider', () => {
            const ollamaConfig = {
                databasePath: '/tmp/test-vector.db',
                embeddingProvider: 'ollama' as const,
                ollamaBaseUrl: 'http://localhost:11435'
            };

            const ollamaStore = new DuckDBVectorStore(ollamaConfig);

            const { OllamaEmbeddings } = require('@langchain/ollama');
            expect(OllamaEmbeddings).toHaveBeenCalledWith({
                model: 'granite-embedding:278m',
                baseUrl: 'http://localhost:11435'
            });
        });

        it('should create DuckDBVectorStore with HuggingFace provider', () => {
            const hfConfig = {
                databasePath: '/tmp/test-vector.db',
                embeddingProvider: 'huggingface' as const
            };

            const hfStore = new DuckDBVectorStore(hfConfig);

            const { HuggingFaceTransformersEmbeddings } = require('@langchain/community/embeddings/huggingface_transformers');
            expect(HuggingFaceTransformersEmbeddings).toHaveBeenCalledWith({
                model: 'Xenova/all-MiniLM-L6-v2'
            });
        });

        it('should throw error for OpenAI provider without API key', () => {
            expect(() => {
                new DuckDBVectorStore({
                    databasePath: '/tmp/test-vector.db',
                    embeddingProvider: 'openai'
                    // Missing openaiApiKey
                });
            }).toThrow('OpenAI API key is required');
        });

        it('should apply provider defaults correctly', () => {
            const ollamaStore = new DuckDBVectorStore({
                databasePath: '/tmp/test-vector.db',
                embeddingProvider: 'ollama'
            });

            const config = (ollamaStore as any).config;
            expect(config.chunkSize).toBe(1000);
            expect(config.chunkOverlap).toBe(200);
            expect(config.vectorDimension).toBe(1024);
        });
    });

    describe('initialize', () => {
        it('should initialize database and create tables', async () => {
            mockDatabase.all.mockResolvedValueOnce([]); // No existing table

            await vectorStore.initialize();

            const { Database } = require('duckdb-async');
            expect(Database.create).toHaveBeenCalledWith('/tmp/test-vector.db');

            // Should install VSS extension
            expect(mockDatabase.exec).toHaveBeenCalledWith('INSTALL vss;');
            expect(mockDatabase.exec).toHaveBeenCalledWith('LOAD vss;');

            // Should create tables
            expect(mockDatabase.exec).toHaveBeenCalledWith(
                expect.stringContaining('CREATE TABLE IF NOT EXISTS documents')
            );
            expect(mockDatabase.exec).toHaveBeenCalledWith(
                expect.stringContaining('CREATE TABLE IF NOT EXISTS indexed_files')
            );
        });

        it('should detect existing table with matching dimensions', async () => {
            mockDatabase.all
                .mockResolvedValueOnce([{ column_name: 'embedding', column_type: 'FLOAT[1536]' }]) // Existing table
                .mockResolvedValueOnce([{ count: 5 }]); // Has content

            await vectorStore.initialize();

            // Should not recreate table
            expect(mockDatabase.exec).not.toHaveBeenCalledWith(
                expect.stringContaining('DROP TABLE documents')
            );
        });

        it('should recreate table with dimension mismatch', async () => {
            mockDatabase.all
                .mockResolvedValueOnce([{ column_name: 'embedding', column_type: 'FLOAT[512]' }]) // Wrong dimension
                .mockResolvedValueOnce([{ count: 5 }]); // Has content

            await vectorStore.initialize();

            // Should drop and recreate table
            expect(mockDatabase.exec).toHaveBeenCalledWith('DROP TABLE documents;');
        });

        it('should auto-detect embedding dimensions', async () => {
            mockDatabase.all.mockResolvedValueOnce([]); // No existing table
            mockOpenAIEmbeddings.embedQuery.mockResolvedValueOnce([0.1, 0.2, 0.3, 0.4]); // 4 dimensions

            await vectorStore.initialize();

            // Should create table with detected dimensions
            expect(mockDatabase.exec).toHaveBeenCalledWith(
                expect.stringContaining('embedding FLOAT[4]')
            );
        });

        it('should handle embedding dimension detection failure', async () => {
            mockDatabase.all.mockResolvedValueOnce([]); // No existing table
            mockOpenAIEmbeddings.embedQuery.mockRejectedValueOnce(new Error('API error'));

            await vectorStore.initialize();

            // Should use default dimensions
            expect(mockDatabase.exec).toHaveBeenCalledWith(
                expect.stringContaining('embedding FLOAT[1536]') // Default for OpenAI
            );
        });

        it('should create HNSW index successfully', async () => {
            mockDatabase.all.mockResolvedValueOnce([]); // No existing table

            await vectorStore.initialize();

            expect(mockDatabase.exec).toHaveBeenCalledWith(
                expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_documents_embedding')
            );
        });

        it('should handle HNSW index creation failure gracefully', async () => {
            mockDatabase.all.mockResolvedValueOnce([]); // No existing table
            mockDatabase.exec
                .mockResolvedValue(undefined) // Other commands succeed
                .mockRejectedValueOnce(new Error('HNSW index failed')); // Index creation fails

            // Should not throw
            await expect(vectorStore.initialize()).resolves.not.toThrow();
        });

        it('should not initialize twice', async () => {
            await vectorStore.initialize();
            await vectorStore.initialize(); // Second call

            const { Database } = require('duckdb-async');
            expect(Database.create).toHaveBeenCalledTimes(1);
        });
    });

    describe('addDocuments', () => {
        beforeEach(async () => {
            await vectorStore.initialize();
        });

        it('should add documents with embeddings', async () => {
            const documents = [
                new Document({ pageContent: 'Test content 1', metadata: { source: 'test1' } }),
                new Document({ pageContent: 'Test content 2', metadata: { source: 'test2' } })
            ];

            mockOpenAIEmbeddings.embedDocuments.mockResolvedValueOnce([
                [0.1, 0.2, 0.3],
                [0.4, 0.5, 0.6]
            ]);

            mockDatabase.all.mockResolvedValueOnce([{ count: 2 }]); // Verification query

            await vectorStore.addDocuments(documents);

            expect(mockOpenAIEmbeddings.embedDocuments).toHaveBeenCalledWith([
                'Test content 1',
                'Test content 2'
            ]);

            const preparedStatement = await mockDatabase.prepare();
            expect(preparedStatement.run).toHaveBeenCalledTimes(2);
        });

        it('should handle empty embeddings gracefully', async () => {
            const documents = [
                new Document({ pageContent: 'Test content', metadata: { source: 'test' } })
            ];

            mockOpenAIEmbeddings.embedDocuments.mockResolvedValueOnce([]); // No embeddings

            await expect(vectorStore.addDocuments(documents)).rejects.toThrow(
                'No embeddings returned for provided documents'
            );
        });

        it('should skip documents with empty embeddings', async () => {
            const documents = [
                new Document({ pageContent: 'Test content 1', metadata: { source: 'test1' } }),
                new Document({ pageContent: 'Test content 2', metadata: { source: 'test2' } })
            ];

            mockOpenAIEmbeddings.embedDocuments.mockResolvedValueOnce([
                [0.1, 0.2, 0.3],
                [] // Empty embedding
            ]);

            mockDatabase.all.mockResolvedValueOnce([{ count: 1 }]); // Only 1 document added

            await vectorStore.addDocuments(documents);

            const preparedStatement = await mockDatabase.prepare();
            expect(preparedStatement.run).toHaveBeenCalledTimes(1); // Only valid document added
        });

        it('should handle embedding errors', async () => {
            const documents = [
                new Document({ pageContent: 'Test content', metadata: { source: 'test' } })
            ];

            mockOpenAIEmbeddings.embedDocuments.mockRejectedValueOnce(new Error('Embedding failed'));

            await expect(vectorStore.addDocuments(documents)).rejects.toThrow('Embedding failed');
        });

        it('should sanitize content for database storage', async () => {
            const documents = [
                new Document({
                    pageContent: "Content with 'quotes' and \"double quotes\"",
                    metadata: { source: 'test' }
                })
            ];

            mockOpenAIEmbeddings.embedDocuments.mockResolvedValueOnce([[0.1, 0.2, 0.3]]);
            mockDatabase.all.mockResolvedValueOnce([{ count: 1 }]);

            await vectorStore.addDocuments(documents);

            const preparedStatement = await mockDatabase.prepare();
            expect(preparedStatement.run).toHaveBeenCalledWith(
                expect.any(String), // ID
                "Content with 'quotes' and \"double quotes\"", // Content preserved
                expect.any(String), // Metadata
                expect.any(String)  // Embedding
            );
        });

        it('should handle database insertion errors with retry', async () => {
            const documents = [
                new Document({ pageContent: 'Test content', metadata: { source: 'test' } })
            ];

            mockOpenAIEmbeddings.embedDocuments.mockResolvedValueOnce([[0.1, 0.2, 0.3]]);

            const preparedStatement = await mockDatabase.prepare();
            preparedStatement.run
                .mockRejectedValueOnce(new Error('First try failed'))
                .mockResolvedValueOnce(undefined); // Retry succeeds

            mockDatabase.all.mockResolvedValueOnce([{ count: 1 }]);

            // Should not throw, retry should work
            await expect(vectorStore.addDocuments(documents)).resolves.not.toThrow();
        });
    });

    describe('similaritySearch', () => {
        beforeEach(async () => {
            await vectorStore.initialize();
        });

        it('should perform vector similarity search', async () => {
            const query = 'test query';

            mockOpenAIEmbeddings.embedQuery.mockResolvedValueOnce([0.1, 0.2, 0.3]);
            mockDatabase.all.mockResolvedValueOnce([
                {
                    id: '1',
                    content: 'Similar content',
                    metadata: '{"source": "test"}',
                    distance: 0.1
                }
            ]);

            const results = await vectorStore.similaritySearch(query, 3);

            expect(results).toHaveLength(1);
            expect(results[0].pageContent).toBe('Similar content');
            expect(results[0].metadata).toEqual({ source: 'test' });

            expect(mockOpenAIEmbeddings.embedQuery).toHaveBeenCalledWith(query);
        });

        it('should fallback to text search when vector search fails', async () => {
            const query = 'test query';

            mockOpenAIEmbeddings.embedQuery.mockResolvedValueOnce([0.1, 0.2, 0.3]);
            mockDatabase.all
                .mockRejectedValueOnce(new Error('Vector search failed')) // First method fails
                .mockRejectedValueOnce(new Error('Second method fails')) // Second method fails
                .mockRejectedValueOnce(new Error('Third method fails')) // Third method fails
                .mockRejectedValueOnce(new Error('Fourth method fails')) // Fourth method fails
                .mockResolvedValueOnce([ // Text search succeeds
                    {
                        id: '1',
                        content: 'Content with test query',
                        metadata: '{"source": "text"}',
                        distance: null
                    }
                ]);

            const results = await vectorStore.similaritySearch(query, 3);

            expect(results).toHaveLength(1);
            expect(results[0].pageContent).toBe('Content with test query');
            expect(results[0].metadata).toEqual({ source: 'text' });
        });

        it('should handle query embedding errors', async () => {
            const query = 'test query';

            mockOpenAIEmbeddings.embedQuery.mockRejectedValueOnce(new Error('Embedding failed'));

            await expect(vectorStore.similaritySearch(query)).rejects.toThrow('Embedding failed');
        });

        it('should return empty array when no results found', async () => {
            const query = 'nonexistent query';

            mockOpenAIEmbeddings.embedQuery.mockResolvedValueOnce([0.1, 0.2, 0.3]);
            mockDatabase.all.mockResolvedValue([]); // All search methods return empty

            const results = await vectorStore.similaritySearch(query);

            expect(results).toEqual([]);
        });

        it('should limit results to k parameter', async () => {
            const query = 'test query';
            const k = 2;

            mockOpenAIEmbeddings.embedQuery.mockResolvedValueOnce([0.1, 0.2, 0.3]);
            mockDatabase.all.mockResolvedValueOnce([
                { id: '1', content: 'Result 1', metadata: '{}', distance: 0.1 },
                { id: '2', content: 'Result 2', metadata: '{}', distance: 0.2 }
            ]);

            const results = await vectorStore.similaritySearch(query, k);

            expect(results).toHaveLength(2);

            // Should use LIMIT in query
            expect(mockDatabase.all).toHaveBeenCalledWith(
                expect.stringContaining('LIMIT 2')
            );
        });
    });

    describe('indexFolder', () => {
        beforeEach(async () => {
            await vectorStore.initialize();
        });

        it('should index all files in folder', async () => {
            const folderPath = '/test/folder';

            mockFs.existsSync.mockReturnValue(true);
            mockFs.readdirSync.mockReturnValue(['file1.txt', 'file2.pdf', 'subdir']);
            mockFs.lstatSync
                .mockReturnValueOnce({ isDirectory: () => false }) // file1.txt
                .mockReturnValueOnce({ isDirectory: () => false }) // file2.pdf
                .mockReturnValueOnce({ isDirectory: () => true });  // subdir

            mockFs.statSync.mockReturnValue({
                size: 1000,
                mtime: new Date(),
                isDirectory: () => false
            });

            // Mock loaders
            mockTextLoader.load.mockResolvedValue([
                new Document({ pageContent: 'Text content', metadata: { source: 'file1.txt' } })
            ]);
            mockPDFLoader.load.mockResolvedValue([
                new Document({ pageContent: 'PDF content', metadata: { source: 'file2.pdf' } })
            ]);

            mockTextSplitter.splitDocuments.mockResolvedValue([
                new Document({ pageContent: 'Text content', metadata: { source: 'file1.txt' } }),
                new Document({ pageContent: 'PDF content', metadata: { source: 'file2.pdf' } })
            ]);

            mockOpenAIEmbeddings.embedDocuments.mockResolvedValue([
                [0.1, 0.2, 0.3],
                [0.4, 0.5, 0.6]
            ]);

            mockDatabase.all.mockResolvedValue([{ count: 2 }]);

            const result = await vectorStore.indexFolder(folderPath);

            expect(result.success).toBe(2);
            expect(result.errors).toBe(0);
        });

        it('should handle file indexing errors gracefully', async () => {
            const folderPath = '/test/folder';

            mockFs.existsSync.mockReturnValue(true);
            mockFs.readdirSync.mockReturnValue(['file1.txt', 'file2.txt']);
            mockFs.lstatSync.mockReturnValue({ isDirectory: () => false });
            mockFs.statSync.mockReturnValue({
                size: 1000,
                mtime: new Date(),
                isDirectory: () => false
            });

            // First file succeeds, second fails
            mockTextLoader.load
                .mockResolvedValueOnce([new Document({ pageContent: 'Content', metadata: {} })])
                .mockRejectedValueOnce(new Error('File loading failed'));

            mockTextSplitter.splitDocuments.mockResolvedValue([
                new Document({ pageContent: 'Content', metadata: {} })
            ]);

            mockOpenAIEmbeddings.embedDocuments.mockResolvedValue([[0.1, 0.2, 0.3]]);
            mockDatabase.all.mockResolvedValue([{ count: 1 }]);

            const result = await vectorStore.indexFolder(folderPath);

            expect(result.success).toBe(1);
            expect(result.errors).toBe(1);
        });

        it('should skip unsupported file types', async () => {
            const folderPath = '/test/folder';

            mockFs.existsSync.mockReturnValue(true);
            mockFs.readdirSync.mockReturnValue(['file.txt', 'image.jpg', 'video.mp4']);
            mockFs.lstatSync.mockReturnValue({ isDirectory: () => false });
            mockFs.statSync.mockReturnValue({
                size: 1000,
                mtime: new Date(),
                isDirectory: () => false
            });

            mockTextLoader.load.mockResolvedValue([
                new Document({ pageContent: 'Text content', metadata: {} })
            ]);
            mockTextSplitter.splitDocuments.mockResolvedValue([
                new Document({ pageContent: 'Text content', metadata: {} })
            ]);
            mockOpenAIEmbeddings.embedDocuments.mockResolvedValue([[0.1, 0.2, 0.3]]);
            mockDatabase.all.mockResolvedValue([{ count: 1 }]);

            const result = await vectorStore.indexFolder(folderPath);

            // Only .txt file should be processed
            expect(result.success).toBe(1);
            expect(result.errors).toBe(0);
        });

        it('should emit indexingCompleted event', async () => {
            const eventSpy = jest.fn();
            vectorStore.on('indexingCompleted', eventSpy);

            const folderPath = '/test/folder';
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readdirSync.mockReturnValue([]);

            await vectorStore.indexFolder(folderPath);

            expect(eventSpy).toHaveBeenCalledWith({
                success: 0,
                errors: 0,
                totalFiles: 0
            });
        });

        it('should handle non-existent folder', async () => {
            const folderPath = '/nonexistent/folder';

            mockFs.existsSync.mockReturnValue(false);

            const result = await vectorStore.indexFolder(folderPath);

            expect(result).toEqual({ success: 0, errors: 0 });
        });
    });

    describe('getIndexedFiles', () => {
        beforeEach(async () => {
            await vectorStore.initialize();
        });

        it('should retrieve indexed files list', async () => {
            const mockIndexedFiles = [
                {
                    file_path: '/test/file1.txt',
                    file_name: 'file1.txt',
                    file_size: 1000,
                    file_mtime: '2023-01-01T00:00:00Z',
                    chunk_count: 5
                },
                {
                    file_path: '/test/file2.pdf',
                    file_name: 'file2.pdf',
                    file_size: 2000,
                    file_mtime: '2023-01-02T00:00:00Z',
                    chunk_count: 3
                }
            ];

            mockDatabase.all.mockResolvedValueOnce(mockIndexedFiles);

            const files = await vectorStore.getIndexedFiles();

            expect(files).toHaveLength(2);
            expect(files[0]).toEqual({
                path: '/test/file1.txt',
                name: 'file1.txt',
                size: 1000,
                mtime: '2023-01-01T00:00:00Z',
                chunks: 5
            });
        });

        it('should return empty array when no files indexed', async () => {
            mockDatabase.all.mockResolvedValueOnce([]);

            const files = await vectorStore.getIndexedFiles();

            expect(files).toEqual([]);
        });
    });

    describe('checkDirectoryStatus', () => {
        beforeEach(async () => {
            await vectorStore.initialize();
        });

        it('should detect new, modified, and deleted files', async () => {
            const folderPath = '/test/folder';

            // Mock current files in directory
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readdirSync.mockReturnValue(['new.txt', 'modified.txt', 'unchanged.txt']);
            mockFs.lstatSync.mockReturnValue({ isDirectory: () => false });
            mockFs.statSync
                .mockReturnValueOnce({ mtime: new Date('2023-01-01') }) // new.txt
                .mockReturnValueOnce({ mtime: new Date('2023-01-03') }) // modified.txt (newer)
                .mockReturnValueOnce({ mtime: new Date('2023-01-02') }); // unchanged.txt

            // Mock indexed files in database
            mockDatabase.all.mockResolvedValueOnce([
                {
                    file_path: '/test/folder/modified.txt',
                    file_name: 'modified.txt',
                    file_size: 1000,
                    file_mtime: '2023-01-02T00:00:00.000Z', // older
                    chunk_count: 2
                },
                {
                    file_path: '/test/folder/unchanged.txt',
                    file_name: 'unchanged.txt',
                    file_size: 1500,
                    file_mtime: '2023-01-02T00:00:00.000Z', // same
                    chunk_count: 3
                },
                {
                    file_path: '/test/folder/deleted.txt',
                    file_name: 'deleted.txt',
                    file_size: 500,
                    file_mtime: '2023-01-01T00:00:00.000Z',
                    chunk_count: 1
                }
            ]);

            const status = await vectorStore.checkDirectoryStatus(folderPath);

            expect(status.newFiles).toContain('/test/folder/new.txt');
            expect(status.modifiedFiles).toContain('/test/folder/modified.txt');
            expect(status.deletedFiles).toContain('/test/folder/deleted.txt');
            expect(status.indexedFiles).toBe(2); // modified.txt and unchanged.txt are in directory
            expect(status.hasChanges).toBe(true);
        });

        it('should return no changes when directory matches index', async () => {
            const folderPath = '/test/folder';

            mockFs.existsSync.mockReturnValue(true);
            mockFs.readdirSync.mockReturnValue(['file.txt']);
            mockFs.lstatSync.mockReturnValue({ isDirectory: () => false });
            mockFs.statSync.mockReturnValue({ mtime: new Date('2023-01-01') });

            mockDatabase.all.mockResolvedValueOnce([
                {
                    file_path: '/test/folder/file.txt',
                    file_name: 'file.txt',
                    file_size: 1000,
                    file_mtime: '2023-01-01T00:00:00.000Z',
                    chunk_count: 2
                }
            ]);

            const status = await vectorStore.checkDirectoryStatus(folderPath);

            expect(status.hasChanges).toBe(false);
            expect(status.newFiles).toEqual([]);
            expect(status.modifiedFiles).toEqual([]);
            expect(status.deletedFiles).toEqual([]);
            expect(status.indexedFiles).toBe(1);
        });

        it('should handle non-existent directory', async () => {
            const folderPath = '/nonexistent';

            mockFs.existsSync.mockReturnValue(false);

            const status = await vectorStore.checkDirectoryStatus(folderPath);

            expect(status).toEqual({
                indexedFiles: 0,
                newFiles: [],
                modifiedFiles: [],
                deletedFiles: [],
                hasChanges: false
            });
        });
    });

    describe('clearIndex', () => {
        beforeEach(async () => {
            await vectorStore.initialize();
        });

        it('should clear all documents and indexed files', async () => {
            await vectorStore.clearIndex();

            expect(mockDatabase.run).toHaveBeenCalledWith('DELETE FROM documents');
            expect(mockDatabase.run).toHaveBeenCalledWith('DELETE FROM indexed_files');
        });

        it('should clear in-memory indexed files map', async () => {
            // Add some files to in-memory map
            (vectorStore as any).indexedFiles.set('/test/file.txt', { name: 'test' });

            await vectorStore.clearIndex();

            expect((vectorStore as any).indexedFiles.size).toBe(0);
        });
    });

    describe('debugDatabaseContents', () => {
        beforeEach(async () => {
            await vectorStore.initialize();
        });

        it('should log database statistics', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            mockDatabase.all
                .mockResolvedValueOnce([{ count: 10 }]) // Documents count
                .mockResolvedValueOnce([{ count: 5 }])  // Indexed files count
                .mockResolvedValueOnce([{ file_name: 'test.txt', chunk_count: 2 }]) // Sample files
                .mockResolvedValueOnce([{ dim_count: 1536 }]); // Embedding dimensions

            await vectorStore.debugDatabaseContents();

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Documents count: 10')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Indexed files count: 5')
            );

            consoleSpy.mockRestore();
        });

        it('should handle uninitialized database', async () => {
            const uninitializedStore = new DuckDBVectorStore(baseConfig);
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            await uninitializedStore.debugDatabaseContents();

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Database not initialized')
            );

            consoleSpy.mockRestore();
        });
    });

    describe('close and asRetriever', () => {
        beforeEach(async () => {
            await vectorStore.initialize();
        });

        it('should close database connection', async () => {
            await vectorStore.close();

            expect(mockDatabase.close).toHaveBeenCalled();
        });

        it('should return LangChain-compatible retriever', () => {
            const retriever = vectorStore.asRetriever();

            expect(retriever).toHaveProperty('addDocuments');
            expect(retriever).toHaveProperty('similaritySearch');
            expect(retriever).toHaveProperty('similaritySearchWithScore');
            expect(typeof retriever.addDocuments).toBe('function');
            expect(typeof retriever.similaritySearch).toBe('function');
        });

        it('should handle retriever methods correctly', async () => {
            const retriever = vectorStore.asRetriever();

            const docs = [new Document({ pageContent: 'test', metadata: {} })];
            mockOpenAIEmbeddings.embedDocuments.mockResolvedValueOnce([[0.1, 0.2, 0.3]]);
            mockDatabase.all.mockResolvedValueOnce([{ count: 1 }]);

            await retriever.addDocuments(docs);

            expect(mockOpenAIEmbeddings.embedDocuments).toHaveBeenCalled();
        });
    });

    describe('error handling', () => {
        it('should handle database initialization errors', async () => {
            const { Database } = require('duckdb-async');
            Database.create.mockRejectedValueOnce(new Error('DB creation failed'));

            await expect(vectorStore.initialize()).rejects.toThrow('DB creation failed');
        });

        it('should handle methods called before initialization', async () => {
            const uninitializedStore = new DuckDBVectorStore(baseConfig);

            await expect(uninitializedStore.addDocuments([]))
                .rejects.toThrow('Database not initialized');

            await expect(uninitializedStore.similaritySearch('query'))
                .rejects.toThrow('Database not initialized');
        });

        it('should handle various embedding provider errors', async () => {
            // Test unsupported provider
            expect(() => {
                new DuckDBVectorStore({
                    databasePath: '/tmp/test.db',
                    embeddingProvider: 'unsupported' as any
                });
            }).toThrow('Unsupported embedding provider');
        });
    });
});