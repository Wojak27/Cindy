import { EventEmitter } from 'events';
import { Database } from 'duckdb-async';
import { OpenAIEmbeddings } from '@langchain/openai';
import { OllamaEmbeddings } from '@langchain/ollama';
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/huggingface_transformers';
import { Embeddings } from '@langchain/core/embeddings';
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
    embeddingProvider?: 'openai' | 'ollama' | 'huggingface';
    embeddingModel?: string;
    chunkSize?: number;
    chunkOverlap?: number;
    vectorDimension?: number;
    // Provider-specific options
    openaiApiKey?: string; // Only required when provider is 'openai'
    ollamaBaseUrl?: string; // Optional for Ollama
    huggingfaceModel?: string; // Optional for HuggingFace
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
    private embeddings: Embeddings;
    private config: DuckDBVectorStoreConfig;
    private textSplitter: RecursiveCharacterTextSplitter;
    private indexedFiles: Map<string, IndexedFile> = new Map();
    private isInitialized = false;

    constructor(config: DuckDBVectorStoreConfig) {
        super();
        // Set defaults based on provider
        const provider = config.embeddingProvider || 'openai';
        const defaultConfig = this.getProviderDefaults(provider);

        this.config = {
            ...defaultConfig,
            ...config,
            embeddingProvider: provider
        };

        // Initialize embeddings based on provider
        this.embeddings = this.createEmbeddingsProvider();

        // Initialize text splitter
        this.textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: this.config.chunkSize!,
            chunkOverlap: this.config.chunkOverlap!,
            separators: ['\n\n', '\n', ' ', '']
        });
    }

    private getProviderDefaults(provider: string): Partial<DuckDBVectorStoreConfig> {
        switch (provider) {

            case 'huggingface':
                return {
                    embeddingModel: 'Xenova/all-MiniLM-L6-v2',
                    chunkSize: 1000,
                    chunkOverlap: 200,
                    vectorDimension: 384, // Default for all-MiniLM-L6-v2
                    huggingfaceModel: 'Xenova/all-MiniLM-L6-v2'
                };
            case 'openai':
                return {
                    embeddingModel: 'text-embedding-ada-002',
                    chunkSize: 1000,
                    chunkOverlap: 200,
                    vectorDimension: 1536 // Default for text-embedding-ada-002
                };
            case 'ollama':
            default:
                return {
                    embeddingModel: 'dengcao/Qwen3-Embedding-0.6B:Q8_0', // Smallest Qwen model for efficiency
                    chunkSize: 1000,
                    chunkOverlap: 200,
                    vectorDimension: 1024, // Qwen3-Embedding-0.6B outputs 1024 dimensions
                    ollamaBaseUrl: 'http://localhost:11434'
                };
        }
    }

    private createEmbeddingsProvider(): Embeddings {
        const provider = this.config.embeddingProvider!;

        switch (provider) {
            case 'ollama':
                console.log('[DuckDBVectorStore] Using Ollama embeddings:', this.config.embeddingModel);
                if (this.config.ollamaBaseUrl?.includes('localhost')) {
                    this.config.ollamaBaseUrl = this.config.ollamaBaseUrl.replace('localhost', '127.0.0.1');
                    console.log('[DuckDBVectorStore] Normalized Ollama base URL to IPv4:', this.config.ollamaBaseUrl);
                }
                console.log('[DuckDBVectorStore] Ollama base URL:', this.config.ollamaBaseUrl);
                return new OllamaEmbeddings({
                    model: this.config.embeddingModel!,
                    baseUrl: this.config.ollamaBaseUrl
                });

            case 'huggingface':
                console.log('[DuckDBVectorStore] Using HuggingFace local embeddings:', this.config.huggingfaceModel);
                return new HuggingFaceTransformersEmbeddings({
                    model: this.config.huggingfaceModel!
                });

            case 'openai':
                if (!this.config.openaiApiKey) {
                    throw new Error('OpenAI API key is required when using OpenAI embeddings provider');
                }
                console.log('[DuckDBVectorStore] Using OpenAI embeddings (Ada):', this.config.embeddingModel);
                return new OpenAIEmbeddings({
                    openAIApiKey: this.config.openaiApiKey,
                    modelName: this.config.embeddingModel!
                });

            default:
                throw new Error(`Unsupported embedding provider: ${provider}`);
        }
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        console.log('[DuckDBVectorStore] Initializing vector store at path:', this.config.databasePath);

        try {
            // Create database directory if it doesn't exist
            const dbDir = path.dirname(this.config.databasePath);
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }

            // Initialize DuckDB
            // To prevent WAL replay errors accessing HNSW index before extension load,
            // create an in-memory connection first to load VSS, then attach file DB
            console.log('[DuckDBVectorStore] Creating in-memory DB to load extensions before attaching file DB');
            this.db = await Database.create(':memory:');

            console.log('[DuckDBVectorStore] Installing and loading VSS extension...');
            await this.db.all(`INSTALL vss;`);
            await this.db.all(`LOAD vss;`);
            console.log('[DuckDBVectorStore] VSS extension loaded successfully');

            console.log('[DuckDBVectorStore] Attaching on-disk database:', this.config.databasePath);
            await this.db.all(`ATTACH '${this.config.databasePath}' AS diskdb (READ_WRITE);`);
            await this.db.all(`USE diskdb;`);

            // After attaching, ensure VSS extension is also loaded for the attached database
            console.log('[DuckDBVectorStore] Loading VSS extension on attached database...');
            try {
                await this.db.all(`LOAD vss;`);
                console.log('[DuckDBVectorStore] Verified VSS extension loaded on attached DB');
                const extList = await this.db.all(`SELECT * FROM duckdb_extensions();`);
                console.log('[DuckDBVectorStore] Active extensions:', extList);
            } catch (extErr) {
                console.error('[DuckDBVectorStore] Failed to load VSS on attached DB:', extErr);
            }

            // Enable experimental HNSW persistence for file-based databases
            await this.db.all(`SET hnsw_enable_experimental_persistence = true;`);

            // Create tables for vector storage

            // Additional safeguard: explicitly try to create a small HNSW temp index to ensure it's usable
            try {
                await this.db.all(`CREATE TABLE IF NOT EXISTS _vss_test (id INTEGER, embedding FLOAT[${this.config.vectorDimension}]);`);
                await this.db.all(`CREATE INDEX IF NOT EXISTS idx_vss_test_embedding
                    ON _vss_test USING HNSW (embedding)
                    WITH (metric = 'cosine')`);
                console.log('[DuckDBVectorStore] Verified HNSW index creation is possible on attached DB');
            } catch (verifyErr) {
                console.error('[DuckDBVectorStore] HNSW index creation test failed:', verifyErr);
            }

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

        // Dynamically detect embedding output dimension if possible
        let embedDim = this.config.vectorDimension;
        try {
            const testVec = await this.embeddings.embedQuery('dimension test');
            if (Array.isArray(testVec) && testVec.length > 0) {
                embedDim = testVec.length;
                console.log(`[DuckDBVectorStore] Detected embedding dimension: ${embedDim}`);
            }
        } catch (e) {
            console.warn('[DuckDBVectorStore] Failed to auto-detect embedding dimension, using config default:', embedDim);
        }

        // Drop and recreate documents table to ensure correct dimension if it already exists
        await this.db.all(`DROP TABLE IF EXISTS documents;`);

        await this.db.all(`
            CREATE TABLE documents (
                id VARCHAR PRIMARY KEY,
                content TEXT NOT NULL,
                metadata JSON,
                embedding FLOAT[${embedDim}],
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
        try {
            await this.db.all(`
                CREATE INDEX IF NOT EXISTS idx_documents_embedding 
                ON documents USING HNSW (embedding) 
                WITH (metric = 'cosine')
            `);
            console.log('[DuckDBVectorStore] HNSW index created successfully');
        } catch (error) {
            console.warn('[DuckDBVectorStore] HNSW index creation failed, using slower brute force search:', error.message);
            // Continue without index - queries will be slower but still work
        }

        console.log('[DuckDBVectorStore] Tables and indexes created');
    }

    async addDocuments(documents: Document[]): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');
        
        let stmt: any = null;
        try {
            console.log('[DuckDBVectorStore] Embedding documents using provider:', this.config.embeddingProvider);
            console.log('[DuckDBVectorStore] Embedding model:', this.config.embeddingModel);
            if (this.config.embeddingProvider === 'ollama') {
                console.log('[DuckDBVectorStore] Ollama base URL (before embedDocuments):', this.config.ollamaBaseUrl);
            }
            const embeddings = await this.embeddings.embedDocuments(
                documents.map(doc => doc.pageContent)
            );

            if (!embeddings || embeddings.length === 0) {
                console.error('[DuckDBVectorStore] No embeddings returned for provided documents');
                return;
            }
            const embedDim = embeddings[0]?.length || this.config.vectorDimension || 0;

            console.log(`[DuckDBVectorStore] Preparing INSERT statement for ${embedDim} dimensions`);
            stmt = await this.db.prepare(`
                INSERT INTO documents (id, content, metadata, embedding)
                VALUES (?, ?, ?, ?)
            `);
            console.log(`[DuckDBVectorStore] Statement prepared successfully`);

            let successCount = 0;
            for (let i = 0; i < documents.length; i++) {
                const doc = documents[i];
                const embedding = embeddings[i];
                const id = `doc_${Date.now()}_${i}`;

                if (!embedding || embedding.length === 0) {
                    console.warn(`[DuckDBVectorStore] Skipping document ${id} due to empty embedding`);
                    continue;
                }

                const content = doc.pageContent ?? '';
                let metadataStr: string;
                try {
                    metadataStr = JSON.stringify(doc.metadata || {});
                } catch (metaErr) {
                    console.warn(`[DuckDBVectorStore] Failed to serialize metadata for ${id}, using empty object`, metaErr);
                    metadataStr = '{}';
                }
                // Pass embedding as Float32Array so DuckDB binds it as a native FLOAT[] instead of varchar
                const embeddingArray = new Float32Array(embedding);

                try {
                    // Ensure content and metadata are valid UTF-8 strings to prevent STRING -> BLOB conversion errors
                    const safeContent = Buffer.from(content, 'utf8').toString('utf8');
                    const safeMetadataStr = Buffer.from(metadataStr, 'utf8').toString('utf8');

                    // Convert Float32Array to plain JS array to ensure DuckDB binds it as FLOAT[]
                    const embeddingPlain = Array.from(embeddingArray);
                    if (embeddingPlain.length !== embedDim) {
                        console.warn(`[DuckDBVectorStore] Embedding length mismatch for ${id}: got ${embeddingPlain.length}, expected ${embedDim}`);
                    }
                    // Convert Float32Array to DuckDB array literal format: [val1, val2, ...]
                    // DuckDB expects a string representation of the array for FLOAT[] columns
                    const embeddingArrayString = `[${Array.from(embeddingArray).join(',')}]`;

                    // Use positional parameters correctly
                    await stmt.run(id, safeContent, safeMetadataStr, embeddingArrayString);
                    successCount++;
                } catch (err) {
                    console.error(`[DuckDBVectorStore] Failed to insert document ${id}:`, err);
                    if (err instanceof Error && /Invalid byte encountered/.test(err.message)) {
                        console.error(`[DuckDBVectorStore] Detected encoding error for document ${id}, attempting to hex-escape non-ASCII characters and retry`);
                        try {
                            const escapedContent = content.replace(/[^\x00-\x7F]/g, ch => {
                                return '\\x' + Buffer.from(ch).toString('hex').toUpperCase();
                            });
                            const escapedMetadata = metadataStr.replace(/[^\x00-\x7F]/g, ch => {
                                return '\\x' + Buffer.from(ch).toString('hex').toUpperCase();
                            });
                            // Use the same array string format for retry - need to recreate it
                            const retryEmbeddingString = `[${Array.from(embeddingArray).join(',')}]`;
                            await stmt.run(id, escapedContent, escapedMetadata, retryEmbeddingString);
                            console.log(`[DuckDBVectorStore] Successfully retried document ${id} with escaped characters`);
                            successCount++;
                        } catch (retryErr) {
                            console.error(`[DuckDBVectorStore] Retry failed for document ${id}:`, retryErr);
                        }
                    }
                }
            }

            console.log(`[DuckDBVectorStore] Added ${successCount} of ${documents.length} documents successfully`);
        } catch (error) {
            console.error('[DuckDBVectorStore] Error in addDocuments:', error);
            throw error;
        } finally {
            // Always finalize the statement if it was created
            if (stmt) {
                try {
                    await stmt.finalize();
                    console.log('[DuckDBVectorStore] Statement finalized');
                } catch (finalizeErr) {
                    console.error('[DuckDBVectorStore] Error finalizing statement:', finalizeErr);
                }
            }
        }
    }

    async similaritySearch(query: string, k: number = 5): Promise<Document[]> {
        if (!this.db) throw new Error('Database not initialized');

        // Get query embedding
        const queryEmbedding = await this.embeddings.embedQuery(query);
        const queryDimension = queryEmbedding.length;

        // Perform similarity search using VSS (with or without HNSW index)
        try {
            const results = await this.db.all(`
                SELECT 
                    content,
                    metadata,
                    vss_distance_cosine(embedding, ?::FLOAT[${queryDimension}]) as distance
                FROM documents
                ORDER BY distance ASC
                LIMIT ?
            `, [`[${queryEmbedding.join(',')}]`, k]);

            return results.map(row => new Document({
                pageContent: row.content,
                metadata: JSON.parse(row.metadata)
            }));
        } catch (error) {
            console.error('[DuckDBVectorStore] VSS search failed:', error);
            // Fallback to basic search without similarity scoring
            console.log('[DuckDBVectorStore] Falling back to basic text search');
            const results = await this.db.all(`
                SELECT content, metadata
                FROM documents
                WHERE content LIKE ?
                LIMIT ?
            `, [`%${query}%`, k]);

            return results.map(row => new Document({
                pageContent: row.content,
                metadata: JSON.parse(row.metadata)
            }));
        }
    }

    async indexFolder(folderPath: string): Promise<{ success: number; errors: number }> {
        if (!fs.existsSync(folderPath)) {
            throw new Error(`Folder does not exist: ${folderPath}`);
        }

        const stats = { success: 0, errors: 0 };
        const files = this.getAllFiles(folderPath);
        const totalFiles = files.length;

        console.log(`[DuckDBVectorStore] Starting to index ${totalFiles} files from ${folderPath}`);

        if (totalFiles === 0) {
            console.log('[DuckDBVectorStore] No supported files found. Supported extensions: .pdf, .txt, .md, .json, .docx, .doc');
            return stats;
        }

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            const progressData = {
                current: i + 1,
                total: totalFiles,
                file: file,
                percentage: Math.round(((i + 1) / totalFiles) * 100)
            };
            console.log(`[DuckDBVectorStore] Progress: ${progressData.current}/${progressData.total} (${progressData.percentage}%) - ${file}`);
            this.emit('progress', progressData);

            try {
                await this.indexFile(file);
                stats.success++;
            } catch (error) {
                console.error(`[DuckDBVectorStore] Error indexing ${file}:`, error);
                stats.errors++;
            }
        }

        console.log(`[DuckDBVectorStore] Indexing complete. Success: ${stats.success}, Errors: ${stats.errors}`);

        // Emit completion event for UI updates
        this.emit('indexingCompleted', {
            success: stats.success,
            errors: stats.errors,
            total: totalFiles
        });

        return stats;
    }

    private async indexFile(filePath: string): Promise<void> {
        try {

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
        } catch (error) {
            console.error(`[DuckDBVectorStore] Error indexing file ${filePath}:`, error);
            throw error; // Re-throw to be caught by the caller
        }
    }

    private async saveIndexedFileInfo(fileInfo: IndexedFile): Promise<void> {
        if (!this.db) return;

        try {
            // Prepare and execute the statement separately for DuckDB compatibility
            const stmt = await this.db.prepare(`
                INSERT OR REPLACE INTO indexed_files 
                (file_path, file_name, file_size, modified_time, chunk_count)
                VALUES (?, ?, ?, ?, ?)
            `);
            
            await stmt.run(fileInfo.path, fileInfo.name, fileInfo.size, fileInfo.mtime, fileInfo.chunks);
            await stmt.finalize();
            
            console.log(`[DuckDBVectorStore] Saved indexed file info for ${fileInfo.name}`);
        } catch (error) {
            console.error('[DuckDBVectorStore] Error saving indexed file info:', error);
            // Don't throw - this is metadata tracking, not critical for indexing
        }
    }

    private getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
        const supportedExtensions = new Set(['.pdf', '.txt', '.md', '.json', '.docx', '.doc']);

        try {
            const files = fs.readdirSync(dirPath);
            console.log(`[DuckDBVectorStore] Scanning directory: ${dirPath} (${files.length} items)`);
            console.log(`[DuckDBVectorStore] Directory contents:`, files);

            files.forEach(file => {
                console.log(`[DuckDBVectorStore] Processing item: ${file}`);

                const filePath = path.join(dirPath, file);
                try {
                    const stat = fs.statSync(filePath);

                    if (stat.isDirectory()) {
                        console.log(`[DuckDBVectorStore] Directory found: ${file}`);
                        // Skip hidden files and directories
                        if (file.startsWith('.')) {
                            console.log(`[DuckDBVectorStore] Skipping hidden directory: ${file}`);
                            return;
                        }
                        // Skip common directories that shouldn't be indexed
                        if (['node_modules', '.git', 'dist', 'build', '__pycache__', '.next'].includes(file)) {
                            console.log(`[DuckDBVectorStore] Skipping excluded directory: ${file}`);
                            return;
                        }
                        arrayOfFiles = this.getAllFiles(filePath, arrayOfFiles);
                    } else if (stat.isFile()) {
                        const ext = path.extname(file).toLowerCase();
                        console.log(`[DuckDBVectorStore] File found: ${file} (extension: ${ext})`);

                        if (supportedExtensions.has(ext)) {
                            arrayOfFiles.push(filePath);
                            console.log(`[DuckDBVectorStore] ✅ Added supported file: ${filePath}`);
                        } else {
                            console.log(`[DuckDBVectorStore] ❌ Unsupported extension: ${ext} for file ${file}`);
                        }
                    }
                } catch (error) {
                    console.warn(`[DuckDBVectorStore] Error accessing ${filePath}:`, error.message);
                }
            });
        } catch (error) {
            console.error(`[DuckDBVectorStore] Error reading directory ${dirPath}:`, error.message);
        }

        console.log(`[DuckDBVectorStore] Total supported files found: ${arrayOfFiles.length}`);
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