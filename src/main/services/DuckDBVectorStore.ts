import { EventEmitter } from 'events';
import { Database } from 'duckdb-async';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Document } from '@langchain/core/documents';
import * as fs from 'fs';
import * as path from 'path';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { JSONLoader } from 'langchain/document_loaders/fs/json';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';

interface DuckDBVectorStoreConfig {
    databasePath: string;
    openaiApiKey: string;
    embeddingModel?: string;
    chunkSize?: number;
    chunkOverlap?: number;
    vectorDimension?: number;
}

interface IndexedFile {
    path: string;
    name: string;
    size: number;
    mtime: string;
    chunks: number;
}

export class DuckDBVectorStore extends EventEmitter {
    private db: Database | null = null;
    private embeddings: OpenAIEmbeddings;
    private config: DuckDBVectorStoreConfig;
    private textSplitter: RecursiveCharacterTextSplitter;
    private indexedFiles: Map<string, IndexedFile> = new Map();
    private isInitialized = false;

    constructor(config: DuckDBVectorStoreConfig) {
        super();
        this.config = {
            embeddingModel: 'text-embedding-3-small',
            chunkSize: 1000,
            chunkOverlap: 200,
            vectorDimension: 1536, // Default for text-embedding-3-small
            ...config
        };

        // Initialize OpenAI embeddings
        this.embeddings = new OpenAIEmbeddings({
            openAIApiKey: this.config.openaiApiKey,
            modelName: this.config.embeddingModel
        });

        // Initialize text splitter
        this.textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: this.config.chunkSize!,
            chunkOverlap: this.config.chunkOverlap!,
            separators: ['\n\n', '\n', ' ', '']
        });
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            // Create database directory if it doesn't exist
            const dbDir = path.dirname(this.config.databasePath);
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }

            // Initialize DuckDB
            this.db = await Database.create(this.config.databasePath);
            
            // Install and load VSS extension
            await this.db.all(`INSTALL vss;`);
            await this.db.all(`LOAD vss;`);

            // Create tables for vector storage
            await this.createTables();

            this.isInitialized = true;
            console.log('[DuckDBVectorStore] Initialized successfully');
        } catch (error) {
            console.error('[DuckDBVectorStore] Initialization failed:', error);
            throw error;
        }
    }

    private async createTables(): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');

        // Create documents table
        await this.db.all(`
            CREATE TABLE IF NOT EXISTS documents (
                id VARCHAR PRIMARY KEY,
                content TEXT NOT NULL,
                metadata JSON,
                embedding FLOAT[${this.config.vectorDimension}],
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexed files tracking table
        await this.db.all(`
            CREATE TABLE IF NOT EXISTS indexed_files (
                file_path VARCHAR PRIMARY KEY,
                file_name VARCHAR NOT NULL,
                file_size BIGINT,
                modified_time TIMESTAMP,
                chunk_count INTEGER,
                indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create VSS index for similarity search
        await this.db.all(`
            CREATE INDEX IF NOT EXISTS idx_documents_embedding 
            ON documents USING HNSW (embedding) 
            WITH (metric = 'cosine')
        `);

        console.log('[DuckDBVectorStore] Tables and indexes created');
    }

    async addDocuments(documents: Document[]): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');

        const embeddings = await this.embeddings.embedDocuments(
            documents.map(doc => doc.pageContent)
        );

        const stmt = await this.db.prepare(`
            INSERT INTO documents (id, content, metadata, embedding)
            VALUES (?, ?, ?, ?)
        `);

        for (let i = 0; i < documents.length; i++) {
            const doc = documents[i];
            const embedding = embeddings[i];
            const id = `doc_${Date.now()}_${i}`;
            
            await stmt.run(
                id,
                doc.pageContent,
                JSON.stringify(doc.metadata || {}),
                `[${embedding.join(',')}]`
            );
        }

        await stmt.finalize();
        console.log(`[DuckDBVectorStore] Added ${documents.length} documents`);
    }

    async similaritySearch(query: string, k: number = 5): Promise<Document[]> {
        if (!this.db) throw new Error('Database not initialized');

        // Get query embedding
        const queryEmbedding = await this.embeddings.embedQuery(query);
        
        // Perform similarity search using VSS
        const results = await this.db.all(`
            SELECT 
                content,
                metadata,
                vss_distance_cosine(embedding, ?::FLOAT[${this.config.vectorDimension}]) as distance
            FROM documents
            ORDER BY distance ASC
            LIMIT ?
        `, [`[${queryEmbedding.join(',')}]`, k]);

        return results.map(row => new Document({
            pageContent: row.content,
            metadata: JSON.parse(row.metadata)
        }));
    }

    async indexFolder(folderPath: string): Promise<{ success: number; errors: number }> {
        if (!fs.existsSync(folderPath)) {
            throw new Error(`Folder does not exist: ${folderPath}`);
        }

        const stats = { success: 0, errors: 0 };
        const files = this.getAllFiles(folderPath);
        const totalFiles = files.length;

        console.log(`[DuckDBVectorStore] Starting to index ${totalFiles} files from ${folderPath}`);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            
            this.emit('progress', {
                current: i + 1,
                total: totalFiles,
                file: file,
                percentage: Math.round(((i + 1) / totalFiles) * 100)
            });

            try {
                await this.indexFile(file);
                stats.success++;
            } catch (error) {
                console.error(`[DuckDBVectorStore] Error indexing ${file}:`, error);
                stats.errors++;
            }
        }

        console.log(`[DuckDBVectorStore] Indexing complete. Success: ${stats.success}, Errors: ${stats.errors}`);
        return stats;
    }

    private async indexFile(filePath: string): Promise<void> {
        const ext = path.extname(filePath).toLowerCase();
        let loader: any;

        switch (ext) {
            case '.pdf':
                loader = new PDFLoader(filePath);
                break;
            case '.txt':
            case '.md':
                loader = new TextLoader(filePath);
                break;
            case '.json':
                loader = new JSONLoader(filePath);
                break;
            case '.docx':
                loader = new DocxLoader(filePath);
                break;
            default:
                // Skip unsupported file types
                console.log(`[DuckDBVectorStore] Skipping unsupported file type: ${ext}`);
                return;
        }

        const docs = await loader.load();
        const splitDocs = await this.textSplitter.splitDocuments(docs);

        // Add file metadata to each chunk
        const docsWithMetadata = splitDocs.map(doc => ({
            ...doc,
            metadata: {
                ...doc.metadata,
                source: filePath,
                fileName: path.basename(filePath),
                fileType: ext
            }
        }));

        await this.addDocuments(docsWithMetadata);

        // Track indexed file
        const stats = fs.statSync(filePath);
        const fileInfo: IndexedFile = {
            path: filePath,
            name: path.basename(filePath),
            size: stats.size,
            mtime: stats.mtime.toISOString(),
            chunks: docsWithMetadata.length
        };

        this.indexedFiles.set(filePath, fileInfo);
        await this.saveIndexedFileInfo(fileInfo);
    }

    private async saveIndexedFileInfo(fileInfo: IndexedFile): Promise<void> {
        if (!this.db) return;

        await this.db.run(`
            INSERT OR REPLACE INTO indexed_files 
            (file_path, file_name, file_size, modified_time, chunk_count)
            VALUES (?, ?, ?, ?, ?)
        `, [fileInfo.path, fileInfo.name, fileInfo.size, fileInfo.mtime, fileInfo.chunks]);
    }

    private getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
        const files = fs.readdirSync(dirPath);

        files.forEach(file => {
            const filePath = path.join(dirPath, file);
            if (fs.statSync(filePath).isDirectory()) {
                arrayOfFiles = this.getAllFiles(filePath, arrayOfFiles);
            } else {
                arrayOfFiles.push(filePath);
            }
        });

        return arrayOfFiles;
    }

    async getIndexedFiles(): Promise<IndexedFile[]> {
        if (!this.db) return [];

        const rows = await this.db.all(`
            SELECT file_path, file_name, file_size, modified_time, chunk_count
            FROM indexed_files
            ORDER BY indexed_at DESC
        `);

        return rows.map(row => ({
            path: row.file_path,
            name: row.file_name,
            size: row.file_size,
            mtime: row.modified_time,
            chunks: row.chunk_count
        }));
    }

    async clearIndex(): Promise<void> {
        if (!this.db) return;

        await this.db.run('DELETE FROM documents');
        await this.db.run('DELETE FROM indexed_files');
        this.indexedFiles.clear();
        console.log('[DuckDBVectorStore] Index cleared');
    }

    async close(): Promise<void> {
        if (this.db) {
            await this.db.close();
            this.db = null;
            this.isInitialized = false;
        }
    }

    // Create a LangChain-compatible wrapper
    asLangChainVectorStore(): any {
        const self = this;
        
        // Return a simplified interface for now
        return {
            embeddings: this.embeddings,
            
            async addDocuments(documents: Document[]): Promise<void> {
                return self.addDocuments(documents);
            },
            
            async similaritySearch(query: string, k?: number): Promise<Document[]> {
                return self.similaritySearch(query, k);
            },
            
            async similaritySearchWithScore(query: string, k?: number): Promise<[Document, number][]> {
                const docs = await self.similaritySearch(query, k);
                // Return documents with dummy scores for now
                return docs.map(doc => [doc, 0.5]);
            },
            
            async delete(): Promise<void> {
                return self.clearIndex();
            }
        };
    }
}