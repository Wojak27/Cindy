
/**
 * LangChainVectorStoreService
 * 
 * This service manages semantic document indexing and retrieval using LangChain's vector store capabilities.
 * It serves as the semantic search layer for the Cindy voice assistant, enabling intelligent document
 * retrieval and knowledge base management.
 * 
 * Key Responsibilities:
 * - Document embedding: Converts text documents into high-dimensional vectors using OpenAI embeddings
 * - Vector storage: Persists document vectors using FAISS for efficient similarity search
 * - Document chunking: Intelligently splits large documents into semantically meaningful chunks
 * - Multi-format support: Handles PDF, DOCX, text files, and various code files
 * - Semantic search: Performs similarity-based retrieval to find relevant documents for queries
 * 
 * Architecture Position:
 * - Lives in the Main Process alongside other core services
 * - Integrates with CindyAgent for knowledge-augmented responses
 * - Provides document context for LLM interactions
 * - Stores vectors locally using FAISS for privacy and performance
 * 
 * Data Flow:
 * 1. Documents are loaded from filesystem or added programmatically
 * 2. Text is extracted and split into semantic chunks
 * 3. Chunks are embedded using OpenAI's embedding models
 * 4. Vectors are stored in FAISS index with metadata
 * 5. Queries trigger similarity search to retrieve relevant chunks
 * 6. Retrieved chunks provide context for LLM responses
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { FaissStore } from '@langchain/community/vectorstores/faiss';
import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { Document } from '@langchain/core/documents';

interface VectorStoreOptions {
    databasePath: string;
    embeddingModel: string;
    chunkSize: number;
    chunkOverlap: number;
    autoIndex: boolean;
    openaiApiKey?: string;
}

interface IndexedFile {
    name: string;
    path: string;
    type: 'file' | 'folder';
    size?: number;
    chunks?: number;
    error?: string;
    lastModified?: Date;
}

interface SearchResult {
    content: string;
    metadata: Record<string, any>;
    score: number;
    source?: string;
}

export class LangChainVectorStoreService extends EventEmitter {
    private options: VectorStoreOptions;
    private vectorStore: FaissStore | null = null;
    private embeddings: OpenAIEmbeddings;
    private textSplitter: RecursiveCharacterTextSplitter;
    private indexedFiles: Map<string, IndexedFile> = new Map();
    private supportedExtensions = new Set(['.txt', '.md', '.mdx', '.pdf', '.doc', '.docx', '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.html', '.css', '.json', '.xml', '.yml', '.yaml']);

    constructor(options: VectorStoreOptions) {
        super();
        this.options = options;

        // Initialize embeddings
        this.embeddings = new OpenAIEmbeddings({
            openAIApiKey: options.openaiApiKey,
            modelName: 'text-embedding-3-small', // More cost-effective than ada-002
            maxRetries: 3,
            timeout: 30000,
        });

        // Initialize text splitter with semantic splitting
        this.textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: options.chunkSize,
            chunkOverlap: options.chunkOverlap,
            separators: ['\n\n', '\n', ' ', ''], // Prioritize semantic boundaries
        });

        console.log('[LangChainVectorStoreService] Initialized with options:', {
            databasePath: options.databasePath,
            embeddingModel: options.embeddingModel,
            chunkSize: options.chunkSize,
            chunkOverlap: options.chunkOverlap
        });
    }

    async initialize(): Promise<void> {
        try {
            // Create database directory if it doesn't exist
            const dbDir = path.join(this.options.databasePath, '.vector_store_langchain');
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }

            const indexPath = path.join(dbDir, 'faiss_index');

            // Try to load existing vector store
            if (fs.existsSync(indexPath + '.faiss') && fs.existsSync(indexPath + '.pkl')) {
                console.log('[LangChainVectorStoreService] Loading existing vector store...');
                this.vectorStore = await FaissStore.load(indexPath, this.embeddings);
                console.log('[LangChainVectorStoreService] Loaded existing vector store with', this.vectorStore.index?.ntotal(), 'vectors');
            } else {
                console.log('[LangChainVectorStoreService] Creating new empty vector store...');
                // Create empty vector store with initial dummy document
                const initialDoc = new Document({
                    pageContent: 'Initial document for vector store setup',
                    metadata: { source: 'system', type: 'initialization' }
                });
                this.vectorStore = await FaissStore.fromDocuments([initialDoc], this.embeddings);
                await this.vectorStore.save(indexPath);
                console.log('[LangChainVectorStoreService] Created new vector store');
            }

            // Load indexed files metadata
            await this.loadIndexedFilesMetadata();

            console.log('[LangChainVectorStoreService] Vector store initialized successfully');
        } catch (error) {
            console.error('[LangChainVectorStoreService] Failed to initialize vector store:', error);
            throw error;
        }
    }

    private async loadIndexedFilesMetadata(): Promise<void> {
        const metadataPath = path.join(this.options.databasePath, '.vector_store_langchain', 'files_metadata.json');
        if (fs.existsSync(metadataPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
                this.indexedFiles = new Map(Object.entries(data));
                console.log('[LangChainVectorStoreService] Loaded metadata for', this.indexedFiles.size, 'files');
            } catch (error) {
                console.warn('[LangChainVectorStoreService] Failed to load files metadata:', error);
            }
        }
    }

    private async saveIndexedFilesMetadata(): Promise<void> {
        const metadataPath = path.join(this.options.databasePath, '.vector_store_langchain', 'files_metadata.json');
        try {
            const data = Object.fromEntries(this.indexedFiles);
            fs.writeFileSync(metadataPath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.warn('[LangChainVectorStoreService] Failed to save files metadata:', error);
        }
    }

    async addDocument(document: {
        id: string;
        title: string;
        content: string;
        path: string;
        createdAt: Date;
        updatedAt: Date;
    }): Promise<boolean> {
        try {
            if (!this.vectorStore) {
                throw new Error('Vector store not initialized');
            }

            console.log(`[LangChainVectorStoreService] Adding document: ${document.title}`);

            // Split the document content into chunks
            const chunks = await this.textSplitter.createDocuments(
                [document.content],
                [{
                    id: document.id,
                    title: document.title,
                    source: document.path,
                    createdAt: document.createdAt.toISOString(),
                    updatedAt: document.updatedAt.toISOString(),
                    type: 'document'
                }]
            );

            console.log(`[LangChainVectorStoreService] Split into ${chunks.length} chunks`);

            // Add chunks to vector store
            await this.vectorStore.addDocuments(chunks);

            // Update indexed files metadata
            this.indexedFiles.set(document.path, {
                name: path.basename(document.path),
                path: document.path,
                type: 'file',
                chunks: chunks.length,
                lastModified: document.updatedAt
            });

            // Save vector store and metadata
            const indexPath = path.join(this.options.databasePath, '.vector_store_langchain', 'faiss_index');
            await this.vectorStore.save(indexPath);
            await this.saveIndexedFilesMetadata();

            this.emit('documentAdded', document.id);
            console.log(`[LangChainVectorStoreService] Successfully added document: ${document.title}`);
            return true;
        } catch (error) {
            console.error('[LangChainVectorStoreService] Error adding document:', error);
            this.emit('indexingError', { documentId: document.id, error: error.message });
            return false;
        }
    }

    async updateDocument(document: {
        id: string;
        title: string;
        content: string;
        path: string;
        createdAt: Date;
        updatedAt: Date;
    }): Promise<boolean> {
        try {
            if (!this.vectorStore) {
                throw new Error('Vector store not initialized');
            }

            console.log(`[LangChainVectorStoreService] Updating document: ${document.title}`);

            // FAISS doesn't support direct document updates, so we need to:
            // 1. Remove the old document (by rebuilding without it)
            // 2. Add the updated document
            
            // For now, we'll use a simpler approach: delete and re-add
            // In production, you might want to implement a more sophisticated
            // index management strategy with versioning
            
            // First, mark the file as being updated
            const existingFile = this.indexedFiles.get(document.path);
            
            // Split the updated document content into chunks
            const chunks = await this.textSplitter.createDocuments(
                [document.content],
                [{
                    id: document.id,
                    title: document.title,
                    source: document.path,
                    createdAt: document.createdAt.toISOString(),
                    updatedAt: document.updatedAt.toISOString(),
                    type: 'document',
                    version: Date.now() // Add version to distinguish updates
                }]
            );

            console.log(`[LangChainVectorStoreService] Split updated document into ${chunks.length} chunks`);

            // Add the updated chunks to the vector store
            // Note: This will add new vectors without removing old ones
            // For true updates, consider implementing a document ID tracking system
            await this.vectorStore.addDocuments(chunks);

            // Update indexed files metadata
            this.indexedFiles.set(document.path, {
                name: path.basename(document.path),
                path: document.path,
                type: 'file',
                chunks: chunks.length + (existingFile?.chunks || 0), // Track total chunks
                lastModified: document.updatedAt
            });

            // Save updated vector store and metadata
            const indexPath = path.join(this.options.databasePath, '.vector_store_langchain', 'faiss_index');
            await this.vectorStore.save(indexPath);
            await this.saveIndexedFilesMetadata();

            this.emit('documentUpdated', document.id);
            console.log(`[LangChainVectorStoreService] Successfully updated document: ${document.title}`);
            console.log(`[LangChainVectorStoreService] Note: Old versions remain in index. Consider periodic rebuild for cleanup.`);
            return true;
        } catch (error) {
            console.error('[LangChainVectorStoreService] Error updating document:', error);
            this.emit('indexingError', { documentId: document.id, error: error.message });
            return false;
        }
    }

    async addDocumentFromFile(filePath: string): Promise<boolean> {
        try {
            if (!this.vectorStore) {
                throw new Error('Vector store not initialized');
            }

            if (!this.isSupportedFile(filePath)) {
                throw new Error(`Unsupported file type: ${path.extname(filePath)}`);
            }

            console.log(`[LangChainVectorStoreService] Processing file: ${filePath}`);

            // Load document using appropriate loader
            let documents: Document[] = [];
            const extension = path.extname(filePath).toLowerCase();

            switch (extension) {
                case '.pdf':
                    const pdfLoader = new PDFLoader(filePath);
                    documents = await pdfLoader.load();
                    break;
                case '.docx':
                    const docxLoader = new DocxLoader(filePath);
                    documents = await docxLoader.load();
                    break;
                default:
                    const textLoader = new TextLoader(filePath);
                    documents = await textLoader.load();
                    break;
            }

            if (documents.length === 0) {
                throw new Error('No content extracted from file');
            }

            // Add metadata to documents
            const fileStats = fs.statSync(filePath);
            documents = documents.map(doc => ({
                ...doc,
                metadata: {
                    ...doc.metadata,
                    source: filePath,
                    fileName: path.basename(filePath),
                    fileSize: fileStats.size,
                    lastModified: fileStats.mtime.toISOString(),
                    type: 'file',
                    extension: extension
                }
            }));

            // Split documents into chunks
            const chunks: Document[] = [];
            for (const doc of documents) {
                const docChunks = await this.textSplitter.splitDocuments([doc]);
                chunks.push(...docChunks);
            }

            console.log(`[LangChainVectorStoreService] Split ${documents.length} documents into ${chunks.length} chunks`);

            // Add chunks to vector store
            await this.vectorStore.addDocuments(chunks);

            // Update indexed files metadata
            this.indexedFiles.set(filePath, {
                name: path.basename(filePath),
                path: filePath,
                type: 'file',
                size: fileStats.size,
                chunks: chunks.length,
                lastModified: fileStats.mtime
            });

            // Save vector store and metadata
            const indexPath = path.join(this.options.databasePath, '.vector_store_langchain', 'faiss_index');
            await this.vectorStore.save(indexPath);
            await this.saveIndexedFilesMetadata();

            this.emit('fileIndexed', filePath);
            console.log(`[LangChainVectorStoreService] Successfully indexed file: ${filePath}`);
            return true;
        } catch (error) {
            console.error('[LangChainVectorStoreService] Error indexing file:', error);
            this.emit('indexingError', { filePath, error: error.message });

            // Update with error status
            this.indexedFiles.set(filePath, {
                name: path.basename(filePath),
                path: filePath,
                type: 'file',
                error: error.message,
                lastModified: new Date()
            });
            await this.saveIndexedFilesMetadata();

            return false;
        }
    }

    async updateDocumentFromFile(filePath: string): Promise<boolean> {
        try {
            if (!this.vectorStore) {
                throw new Error('Vector store not initialized');
            }

            if (!fs.existsSync(filePath)) {
                throw new Error(`File does not exist: ${filePath}`);
            }

            if (!this.isSupportedFile(filePath)) {
                throw new Error(`Unsupported file type: ${path.extname(filePath)}`);
            }

            console.log(`[LangChainVectorStoreService] Updating file: ${filePath}`);

            // Get the existing file metadata
            const existingFile = this.indexedFiles.get(filePath);
            const fileStats = fs.statSync(filePath);

            // Check if file has been modified since last indexing
            if (existingFile?.lastModified) {
                const lastModified = existingFile.lastModified instanceof Date 
                    ? existingFile.lastModified 
                    : new Date(existingFile.lastModified);
                
                if (fileStats.mtime.getTime() <= lastModified.getTime()) {
                    console.log(`[LangChainVectorStoreService] File hasn't changed since last indexing, skipping: ${filePath}`);
                    return true;
                }
            }

            // Load document using appropriate loader
            let documents: Document[] = [];
            const extension = path.extname(filePath).toLowerCase();

            switch (extension) {
                case '.pdf':
                    const pdfLoader = new PDFLoader(filePath);
                    documents = await pdfLoader.load();
                    break;
                case '.docx':
                    const docxLoader = new DocxLoader(filePath);
                    documents = await docxLoader.load();
                    break;
                default:
                    const textLoader = new TextLoader(filePath);
                    documents = await textLoader.load();
                    break;
            }

            if (documents.length === 0) {
                throw new Error('No content extracted from file');
            }

            // Add metadata to documents with version tracking
            documents = documents.map(doc => ({
                ...doc,
                metadata: {
                    ...doc.metadata,
                    source: filePath,
                    fileName: path.basename(filePath),
                    fileSize: fileStats.size,
                    lastModified: fileStats.mtime.toISOString(),
                    type: 'file',
                    extension: extension,
                    version: Date.now() // Add version for update tracking
                }
            }));

            // Split documents into chunks
            const chunks: Document[] = [];
            for (const doc of documents) {
                const docChunks = await this.textSplitter.splitDocuments([doc]);
                chunks.push(...docChunks);
            }

            console.log(`[LangChainVectorStoreService] Split ${documents.length} documents into ${chunks.length} chunks for update`);

            // Add updated chunks to vector store
            // Note: This adds new vectors without removing old ones
            await this.vectorStore.addDocuments(chunks);

            // Update indexed files metadata
            this.indexedFiles.set(filePath, {
                name: path.basename(filePath),
                path: filePath,
                type: 'file',
                size: fileStats.size,
                chunks: chunks.length + (existingFile?.chunks || 0), // Track cumulative chunks
                lastModified: fileStats.mtime
            });

            // Save vector store and metadata
            const indexPath = path.join(this.options.databasePath, '.vector_store_langchain', 'faiss_index');
            await this.vectorStore.save(indexPath);
            await this.saveIndexedFilesMetadata();

            this.emit('fileUpdated', filePath);
            console.log(`[LangChainVectorStoreService] Successfully updated file: ${filePath}`);
            console.log(`[LangChainVectorStoreService] Note: Old versions remain in index. Consider periodic rebuild for cleanup.`);
            return true;
        } catch (error) {
            console.error('[LangChainVectorStoreService] Error updating file:', error);
            this.emit('indexingError', { filePath, error: error.message });

            // Update with error status
            this.indexedFiles.set(filePath, {
                name: path.basename(filePath),
                path: filePath,
                type: 'file',
                error: error.message,
                lastModified: new Date()
            });
            await this.saveIndexedFilesMetadata();

            return false;
        }
    }

    async search(query: string, options: {
        k?: number;
        filter?: Record<string, any>;
        scoreThreshold?: number;
    } = {}): Promise<SearchResult[]> {
        try {
            if (!this.vectorStore) {
                throw new Error('Vector store not initialized');
            }

            const { k = 10, filter, scoreThreshold = 0.7 } = options;

            console.log(`[LangChainVectorStoreService] Searching for: "${query}" (k=${k})`);

            // Perform similarity search with scores
            const results = await this.vectorStore.similaritySearchWithScore(query, k, filter);

            // Transform results to SearchResult format
            const searchResults: SearchResult[] = results
                .filter(([_, score]) => scoreThreshold ? score >= scoreThreshold : true)
                .map(([document, score]) => ({
                    content: document.pageContent,
                    metadata: document.metadata,
                    score: score,
                    source: document.metadata.source || document.metadata.fileName
                }));

            console.log(`[LangChainVectorStoreService] Found ${searchResults.length} results`);
            return searchResults;
        } catch (error) {
            console.error('[LangChainVectorStoreService] Search error:', error);
            throw error;
        }
    }

    async deleteDocument(filePath: string): Promise<boolean> {
        try {
            if (!this.vectorStore) {
                throw new Error('Vector store not initialized');
            }

            // Note: FaissStore doesn't have built-in delete functionality
            // We would need to rebuild the index without the deleted document
            // For now, just remove from metadata and emit warning
            console.warn('[LangChainVectorStoreService] Document deletion requires index rebuild (not implemented yet)');

            this.indexedFiles.delete(filePath);
            await this.saveIndexedFilesMetadata();

            this.emit('documentDeleted', filePath);
            return true;
        } catch (error) {
            console.error('[LangChainVectorStoreService] Error deleting document:', error);
            return false;
        }
    }

    async indexFolder(folderPath: string): Promise<{ success: number; errors: number }> {
        const results = { success: 0, errors: 0 };

        if (!fs.existsSync(folderPath)) {
            throw new Error(`Folder does not exist: ${folderPath}`);
        }

        console.log(`[LangChainVectorStoreService] Indexing folder: ${folderPath}`);

        const files = this.getAllFiles(folderPath);
        console.log(`[LangChainVectorStoreService] Found ${files.length} files to index`);

        for (const filePath of files) {
            try {
                const success = await this.addDocumentFromFile(filePath);
                if (success) {
                    results.success++;
                } else {
                    results.errors++;
                }
            } catch (error) {
                console.error(`[LangChainVectorStoreService] Failed to index ${filePath}:`, error);
                results.errors++;
            }

            // Emit progress
            this.emit('indexingProgress', {
                processed: results.success + results.errors,
                total: files.length,
                currentFile: filePath
            });
        }

        console.log(`[LangChainVectorStoreService] Folder indexing complete:`, results);
        return results;
    }

    private getAllFiles(dirPath: string): string[] {
        const files: string[] = [];

        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                // Skip hidden directories and node_modules
                if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    files.push(...this.getAllFiles(fullPath));
                }
            } else if (entry.isFile() && this.isSupportedFile(fullPath)) {
                files.push(fullPath);
            }
        }

        return files;
    }

    private isSupportedFile(filePath: string): boolean {
        const extension = path.extname(filePath).toLowerCase();
        return this.supportedExtensions.has(extension);
    }

    getIndexedFiles(): IndexedFile[] {
        return Array.from(this.indexedFiles.values());
    }

    getIndexedFilesPaths(): string[] {
        return Array.from(this.indexedFiles.keys());
    }

    async getStats(): Promise<{
        totalFiles: number;
        totalChunks: number;
        vectorStoreSize: number;
        supportedExtensions: string[];
    }> {
        const totalFiles = this.indexedFiles.size;
        const totalChunks = Array.from(this.indexedFiles.values())
            .reduce((sum, file) => sum + (file.chunks || 0), 0);
        const vectorStoreSize = this.vectorStore?.index?.ntotal() || 0;

        return {
            totalFiles,
            totalChunks,
            vectorStoreSize,
            supportedExtensions: Array.from(this.supportedExtensions)
        };
    }

    async rebuildIndex(): Promise<void> {
        console.log('[LangChainVectorStoreService] Rebuilding vector store index...');

        // Clear current vector store
        const indexPath = path.join(this.options.databasePath, '.vector_store_langchain', 'faiss_index');

        // Create new empty vector store
        const initialDoc = new Document({
            pageContent: 'Initial document for vector store rebuild',
            metadata: { source: 'system', type: 'initialization' }
        });
        this.vectorStore = await FaissStore.fromDocuments([initialDoc], this.embeddings);

        // Re-index all files
        const filePaths = Array.from(this.indexedFiles.keys());
        let processed = 0;

        for (const filePath of filePaths) {
            try {
                if (fs.existsSync(filePath)) {
                    await this.addDocumentFromFile(filePath);
                } else {
                    // Remove non-existent files from metadata
                    this.indexedFiles.delete(filePath);
                }
                processed++;
                this.emit('rebuildProgress', { processed, total: filePaths.length });
            } catch (error) {
                console.error(`[LangChainVectorStoreService] Failed to rebuild index for ${filePath}:`, error);
            }
        }

        await this.vectorStore.save(indexPath);
        await this.saveIndexedFilesMetadata();

        console.log('[LangChainVectorStoreService] Index rebuild complete');
        this.emit('rebuildComplete', { processedFiles: processed });
    }

    // Compatibility method for existing code
    async queryDocuments(query: string, limit: number = 10): Promise<any[]> {
        const results = await this.search(query, { k: limit });
        return results.map(result => ({
            content: result.content,
            metadata: result.metadata,
            relevanceScore: result.score,
            source: result.source
        }));
    }
}

export { VectorStoreOptions, IndexedFile, SearchResult };