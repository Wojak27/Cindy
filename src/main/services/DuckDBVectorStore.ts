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
import { th } from 'zod/v4/locales';

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
                // const extList = await this.db.all(`SELECT * FROM duckdb_extensions();`);
                // console.log('[DuckDBVectorStore] Active extensions:', extList);
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

        // Smart table initialization - preserve existing documents when possible
        console.log(`[DuckDBVectorStore] 🔍 Checking if documents table exists...`);

        let needsRecreation = false;
        try {
            // Check if table exists and get its schema
            const tableInfo = await this.db.all(`DESCRIBE documents`);
            console.log(`[DuckDBVectorStore] 📋 Existing documents table schema:`, tableInfo);

            // Find the embedding column and check its dimension
            const embeddingColumn = tableInfo.find((col: any) => col.column_name === 'embedding');
            if (embeddingColumn) {
                const existingDimMatch = embeddingColumn.column_type.match(/FLOAT\[(\d+)\]/);
                const existingDim = existingDimMatch ? parseInt(existingDimMatch[1]) : null;

                if (existingDim !== embedDim) {
                    console.log(`[DuckDBVectorStore] ⚠️ Dimension mismatch: existing=${existingDim}, required=${embedDim}. Table recreation needed.`);
                    needsRecreation = true;
                } else {
                    console.log(`[DuckDBVectorStore] ✅ Documents table exists with correct dimension (${embedDim}). Preserving existing data.`);
                }
            } else {
                console.log(`[DuckDBVectorStore] ⚠️ Documents table exists but no embedding column found. Recreation needed.`);
                needsRecreation = true;
            }
        } catch (error) {
            // Table doesn't exist, create it
            console.log(`[DuckDBVectorStore] 📝 Documents table doesn't exist, creating new one...`);
            needsRecreation = true;
        }

        if (needsRecreation) {
            console.log(`[DuckDBVectorStore] 🔄 Recreating documents table with ${embedDim} dimensions...`);
            await this.db.all(`DROP TABLE IF EXISTS documents;`);

            const createTableSQL = `
                CREATE TABLE documents (
                    id VARCHAR PRIMARY KEY,
                    content TEXT NOT NULL,
                    metadata JSON,
                    embedding FLOAT[${embedDim}],
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `;
            console.log(`[DuckDBVectorStore] 🔍 Create table SQL:`, createTableSQL);
            await this.db.all(createTableSQL);
        }

        // Verify table was created
        const tableInfo = await this.db.all(`DESCRIBE documents`);
        console.log(`[DuckDBVectorStore] 🔍 Documents table schema:`, tableInfo);

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

                    console.log(`[DuckDBVectorStore] 🔍 Inserting document ${id}: content=${safeContent.length} chars, embedding=${embeddingPlain.length} dims`);

                    // Use positional parameters correctly
                    await stmt.run(id, safeContent, safeMetadataStr, embeddingArrayString);
                    successCount++;

                    // Verify this specific insertion worked
                    if (i === 0) { // Only log for first document to avoid spam
                        const justInserted = await this.db.all('SELECT COUNT(*) as count FROM documents WHERE id = ?', [id]);
                        console.log(`[DuckDBVectorStore] 🔍 Verification: document ${id} exists in table: ${justInserted[0]?.count === 1 ? 'YES' : 'NO'}`);
                    }
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

            // Verify documents were actually inserted
            try {
                const verifyCount = await this.db.all('SELECT COUNT(*) as count FROM documents');
                console.log(`[DuckDBVectorStore] 🔍 Verification: documents table now has ${verifyCount[0]?.count || 0} total rows`);

                if (verifyCount[0]?.count > 0) {
                    const sampleDoc = await this.db.all('SELECT LEFT(content, 100) as preview FROM documents LIMIT 1');
                    console.log(`[DuckDBVectorStore] 🔍 Sample document content: "${sampleDoc[0]?.preview}..."`);
                } else {
                    console.error(`[DuckDBVectorStore] ❌ CRITICAL: Documents table is empty after claiming to add ${successCount} documents!`);
                }
            } catch (verifyError) {
                console.error(`[DuckDBVectorStore] ❌ Failed to verify document insertion:`, verifyError);
            }
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

        console.log(`[DuckDBVectorStore] Starting similarity search for: "${query}" (k=${k})`);

        // Debug database contents first
        await this.debugDatabaseContents();

        // Get query embedding with detailed debugging
        console.log(`[DuckDBVectorStore] 🔍 Creating embedding for query: "${query}"`);
        console.log(`[DuckDBVectorStore] 🔍 Embedding provider: ${this.config.embeddingProvider}`);
        console.log(`[DuckDBVectorStore] 🔍 Embedding model: ${this.config.embeddingModel}`);

        let queryEmbedding;
        try {
            queryEmbedding = await this.embeddings.embedQuery(query);
            console.log(`[DuckDBVectorStore] ✅ Query embedding created successfully`);
            console.log(`[DuckDBVectorStore] 📊 Query embedding dimension: ${queryEmbedding.length}`);
            console.log(`[DuckDBVectorStore] 📊 Query embedding sample (first 5): [${queryEmbedding.slice(0, 5).map(n => n.toFixed(4)).join(', ')}...]`);
            console.log(`[DuckDBVectorStore] 📊 Query embedding range: min=${Math.min(...queryEmbedding).toFixed(4)}, max=${Math.max(...queryEmbedding).toFixed(4)}`);
        } catch (embeddingError) {
            console.error(`[DuckDBVectorStore] ❌ Failed to create query embedding:`, embeddingError);
            throw embeddingError;
        }

        const queryDimension = queryEmbedding.length;

        // Check what vector functions are available
        try {
            console.log('[DuckDBVectorStore] Checking available functions...');
            const functions = await this.db.all(`
                SELECT function_name 
                FROM duckdb_functions() 
                WHERE function_name LIKE '%distance%' OR function_name LIKE '%cosine%'
            `);
            console.log('[DuckDBVectorStore] Available vector functions:', functions);
        } catch (funcError) {
            console.log('[DuckDBVectorStore] Could not query available functions:', funcError.message);
        }

        // Try multiple similarity search approaches with direct query execution
        const vectorQueryStr = `[${queryEmbedding.join(',')}]`;
        const searchMethods = [
            {
                name: 'array_cosine_distance',
                query: `
                    SELECT 
                        content,
                        metadata,
                        array_cosine_distance(embedding, '${vectorQueryStr}'::FLOAT[${queryDimension}]) as distance
                    FROM documents
                    ORDER BY distance ASC
                    LIMIT ${k}
                `
            },
            {
                name: 'list_cosine_distance',
                query: `
                    SELECT 
                        content,
                        metadata,
                        list_cosine_distance(embedding, '${vectorQueryStr}'::FLOAT[${queryDimension}]) as distance
                    FROM documents
                    ORDER BY distance ASC
                    LIMIT ${k}
                `
            },
            {
                name: 'array_cosine_similarity',
                query: `
                    SELECT 
                        content,
                        metadata,
                        (1 - array_cosine_similarity(embedding, '${vectorQueryStr}'::FLOAT[${queryDimension}])) as distance
                    FROM documents
                    ORDER BY distance ASC
                    LIMIT ${k}
                `
            },
            {
                name: 'list_cosine_similarity',
                query: `
                    SELECT 
                        content,
                        metadata,
                        (1 - list_cosine_similarity(embedding, '${vectorQueryStr}'::FLOAT[${queryDimension}])) as distance
                    FROM documents
                    ORDER BY distance ASC
                    LIMIT ${k}
                `
            }
        ];

        for (const method of searchMethods) {
            try {
                console.log(`[DuckDBVectorStore] 🔍 Trying similarity search method: ${method.name}`);
                console.log(`[DuckDBVectorStore] 🔍 Query: ${method.query.replace(/\[[\d\.,\-\s]+\]/g, '[EMBEDDING_VECTOR]')}`);

                const results = await this.db.all(method.query);

                console.log(`[DuckDBVectorStore] ✅ ${method.name} executed successfully!`);
                console.log(`[DuckDBVectorStore] 📊 Raw results count: ${results.length}`);

                if (results.length > 0) {
                    console.log(`[DuckDBVectorStore] 📋 Sample result:`, {
                        contentPreview: results[0].content?.substring(0, 100) + '...',
                        distance: results[0].distance,
                        metadata: JSON.parse(results[0].metadata || '{}')
                    });

                    return results.map(row => new Document({
                        pageContent: row.content,
                        metadata: JSON.parse(row.metadata)
                    }));
                } else {
                    console.log(`[DuckDBVectorStore] ⚠️ ${method.name} returned 0 results - trying next method`);
                    continue;
                }
            } catch (methodError) {
                console.log(`[DuckDBVectorStore] ❌ ${method.name} failed:`, methodError.message);
                continue;
            }
        }

        // If all vector similarity methods fail, fall back to text search
        console.log('[DuckDBVectorStore] 🔍 All vector similarity methods failed, falling back to text search');
        try {
            const searchPattern = `%${query.toLowerCase()}%`;
            console.log('[DuckDBVectorStore] 🔍 Fallback search pattern:', searchPattern, 'limit:', k);

            // Use direct string interpolation for text search as well
            const textSearchQuery = `
                SELECT content, metadata
                FROM documents
                WHERE LOWER(content) LIKE '${searchPattern.replace(/'/g, "''")}'
                ORDER BY LENGTH(content) ASC
                LIMIT ${k}
            `;

            console.log('[DuckDBVectorStore] 🔍 Text search query:', textSearchQuery.replace(/\n\s+/g, ' '));
            const results = await this.db.all(textSearchQuery);

            console.log(`[DuckDBVectorStore] 📊 Text search found ${results.length} results`);

            if (results.length > 0) {
                console.log(`[DuckDBVectorStore] 📋 Text search sample result:`, {
                    contentPreview: results[0].content?.substring(0, 100) + '...',
                    metadata: JSON.parse(results[0].metadata || '{}')
                });
            } else {
                console.log(`[DuckDBVectorStore] ⚠️ Text search also returned 0 results`);

                // Final diagnostic: check if there's ANY content in the database
                const anyContent = await this.db.all('SELECT content FROM documents LIMIT 1');
                if (anyContent.length > 0) {
                    console.log(`[DuckDBVectorStore] 🔍 Database has content, but search failed. Sample content:`, anyContent[0].content.substring(0, 200) + '...');
                } else {
                    console.log(`[DuckDBVectorStore] ❌ Database documents table is completely empty!`);
                }
            }

            return results.map(row => new Document({
                pageContent: row.content,
                metadata: JSON.parse(row.metadata)
            }));
        } catch (fallbackError) {
            console.error('[DuckDBVectorStore] ❌ All search methods failed:', fallbackError);
            return [];
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

    async debugDatabaseContents(): Promise<void> {
        if (!this.db) {
            console.log('[DuckDBVectorStore] ❌ Database not initialized');
            return;
        }

        try {
            // Check indexed files
            const indexedFiles = await this.db.all('SELECT COUNT(*) as count FROM indexed_files');
            console.log('[DuckDBVectorStore] 📊 Indexed files count:', indexedFiles[0]?.count || 0);

            if (indexedFiles[0]?.count > 0) {
                const sampleFiles = await this.db.all('SELECT file_name, chunk_count FROM indexed_files LIMIT 5');
                console.log('[DuckDBVectorStore] 📋 Sample indexed files:', sampleFiles);
            }

            // Check documents table
            const documentsCount = await this.db.all('SELECT COUNT(*) as count FROM documents');
            console.log('[DuckDBVectorStore] 📊 Document chunks count:', documentsCount[0]?.count || 0);

            if (documentsCount[0]?.count > 0) {
                const sampleDocs = await this.db.all('SELECT LEFT(content, 100) as preview, metadata FROM documents LIMIT 3');
                console.log('[DuckDBVectorStore] 📋 Sample document chunks:', sampleDocs.map(doc => ({
                    preview: doc.preview + '...',
                    metadata: JSON.parse(doc.metadata)
                })));
            }

            // Check embedding dimensions
            const embeddingInfo = await this.db.all('SELECT array_length(embedding) as dim_count FROM documents LIMIT 1');
            if (embeddingInfo.length > 0) {
                console.log('[DuckDBVectorStore] 📊 Embedding dimensions:', embeddingInfo[0]?.dim_count || 'unknown');
            }

        } catch (error) {
            console.error('[DuckDBVectorStore] ❌ Error checking database contents:', error);
        }
    }

    async checkDirectoryStatus(folderPath: string): Promise<{
        totalFiles: number;
        indexedFiles: number;
        newFiles: string[];
        deletedFiles: string[];
        modifiedFiles: string[];
        upToDate: boolean;
    }> {
        if (!fs.existsSync(folderPath)) {
            return {
                totalFiles: 0,
                indexedFiles: 0,
                newFiles: [],
                deletedFiles: [],
                modifiedFiles: [],
                upToDate: true
            };
        }

        // Get current files in directory
        const currentFiles = this.getAllFiles(folderPath);

        // Get indexed files from database
        const indexedFiles = await this.getIndexedFiles();
        const indexedFilePaths = new Set(indexedFiles.map(f => f.path));
        const indexedFileMap = new Map(indexedFiles.map(f => [f.path, f]));

        // Find new files (in directory but not indexed)
        const newFiles = currentFiles.filter(file => !indexedFilePaths.has(file));

        // Find deleted files (indexed but not in directory)
        const deletedFiles = indexedFiles
            .filter(indexedFile => !currentFiles.includes(indexedFile.path))
            .map(f => f.path);

        // Find modified files (different modification time)
        const modifiedFiles: string[] = [];
        for (const file of currentFiles) {
            if (indexedFilePaths.has(file)) {
                const indexedFile = indexedFileMap.get(file);
                if (indexedFile) {
                    try {
                        const stats = fs.statSync(file);
                        const currentMtime = stats.mtime.toISOString();
                        if (currentMtime !== indexedFile.mtime) {
                            modifiedFiles.push(file);
                        }
                    } catch (error) {
                        // If we can't stat the file, consider it modified
                        modifiedFiles.push(file);
                    }
                }
            }
        }

        const hasChanges = newFiles.length > 0 || deletedFiles.length > 0 || modifiedFiles.length > 0;
        const indexedCount = indexedFiles.filter(f => currentFiles.includes(f.path)).length;

        return {
            totalFiles: currentFiles.length,
            indexedFiles: indexedCount,
            newFiles,
            deletedFiles,
            modifiedFiles,
            upToDate: !hasChanges
        };
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

export async function createDuckDBVectorStore(databasePath: string, llmConfig: { embeddingProvider: string, embeddingModel: string, apiKey?: string }, appDataPath: string): Promise<DuckDBVectorStore> {
    // Validate path first
    if (!databasePath) {
        throw new Error('No path provided');
    }

    // Validate path manually (inline validation)

    if (!fs.existsSync(databasePath)) {
        throw new Error('Path does not exist');
    }
    const stat = fs.statSync(databasePath);
    if (!stat.isDirectory()) {
        throw new Error('Path is not a directory');
    }
    fs.accessSync(databasePath, fs.constants.W_OK);


    const vectorDbDir = path.join(appDataPath, 'vector-stores');

    // Create vector store directory if it doesn't exist
    if (!fs.existsSync(vectorDbDir)) {
        fs.mkdirSync(vectorDbDir, { recursive: true });
    }

    // Use a hash of the source path to create unique database names
    const crypto = require('crypto');
    const sourcePathHash = crypto.createHash('md5').update(databasePath).digest('hex').substring(0, 8);
    const dbName = `vector-store-${sourcePathHash}.db`;

    let vectorStoreConfig: any = {
        databasePath: path.join(vectorDbDir, dbName),
        chunkSize: 1000,
        chunkOverlap: 200
    };
    vectorStoreConfig = { ...vectorStoreConfig, ...llmConfig };
    if (llmConfig.apiKey) {
        vectorStoreConfig.apiKey = llmConfig.apiKey;
    }

    console.log('[IPC] Vector database will be stored at:', vectorStoreConfig.databasePath);
    console.log('[IPC] Indexing content from:', databasePath);


    const vectorStore = new DuckDBVectorStore(vectorStoreConfig);
    return vectorStore
}