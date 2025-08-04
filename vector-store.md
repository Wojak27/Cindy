# Cindy - Vector Store Implementation for Vault Content

## Requirements

1. Embedded vector store for local content
2. Semantic search capabilities over vault content
3. Extendable to remote/cloud storage
4. Efficient indexing and retrieval
5. Cross-platform compatibility
6. Persistent storage across sessions

## Selected Technologies

### SQLite with Vector Search Extension
- Lightweight, embedded database
- Cross-platform support
- Good performance for local applications
- Extensions available for vector operations
- Familiar SQL interface

### FAISS (Facebook AI Similarity Search)
- Specialized for similarity search
- Optimized vector operations
- Multiple indexing strategies
- Good TypeScript support through bindings

## Hybrid Approach

We'll use SQLite as the primary storage engine with FAISS for vector operations:

1. **SQLite**: Store document metadata, content, and references
2. **FAISS**: Handle vector indexing and similarity search
3. **Integration**: Keep both systems synchronized

## Implementation Architecture

```
src/
├── main/
│   ├── services/
│   │   ├── VectorStoreService.ts
│   │   ├── DocumentIndexer.ts
│   │   └── SemanticSearchEngine.ts
│   ├── utils/
│   │   ├── VectorEncoder.ts
│   │   └── TextChunker.ts
│   └── database/
│       ├── schema.sql
│       └── migrations/
└── renderer/
    └── components/
        └── SearchInterface.tsx
```

## Core Components

### 1. Vector Store Service (Main Interface)

```typescript
// VectorStoreService.ts
import { EventEmitter } from 'events';
import { Database } from 'sqlite3';
import { DocumentIndexer } from './DocumentIndexer';
import { SemanticSearchEngine } from './SemanticSearchEngine';
import { TextChunker } from '../utils/TextChunker';
import { VectorEncoder } from '../utils/VectorEncoder';

interface VectorStoreConfig {
  databasePath: string;
  embeddingModel: 'openai' | 'ollama' | 'local';
  chunkSize: number;
  chunkOverlap: number;
  autoIndex: boolean;
}

interface Document {
  id: string;
  title: string;
  content: string;
  path: string;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  metadata?: Record<string, any>;
}

interface SearchResult {
  id: string;
  documentId: string;
  content: string;
  score: number;
  metadata: Record<string, any>;
}

class VectorStoreService extends EventEmitter {
  private db: Database | null = null;
  private indexer: DocumentIndexer;
  private searchEngine: SemanticSearchEngine;
  private textChunker: TextChunker;
  private vectorEncoder: VectorEncoder;
  private config: VectorStoreConfig;
  private isInitialized: boolean = false;

  constructor(config: VectorStoreConfig) {
    super();
    this.config = config;
    this.indexer = new DocumentIndexer();
    this.searchEngine = new SemanticSearchEngine();
    this.textChunker = new TextChunker(config.chunkSize, config.chunkOverlap);
    this.vectorEncoder = new VectorEncoder(config.embeddingModel);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize SQLite database
      await this.initializeDatabase();
      
      // Initialize FAISS index
      await this.searchEngine.initialize();
      
      // Load existing index if available
      if (this.config.autoIndex) {
        await this.loadIndex();
      }
      
      this.isInitialized = true;
      this.emit('initialized');
    } catch (error) {
      console.error('Failed to initialize vector store:', error);
      throw error;
    }
  }

  async addDocument(document: Document): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Store document in SQLite
      await this.storeDocument(document);
      
      // Chunk document content
      const chunks = this.textChunker.chunk(document.content);
      
      // Generate embeddings for chunks
      const embeddings = await this.vectorEncoder.encode(chunks);
      
      // Add to FAISS index
      await this.searchEngine.addDocuments(
        chunks.map((chunk, index) => ({
          id: `${document.id}_${index}`,
          documentId: document.id,
          content: chunk,
          embedding: embeddings[index],
          metadata: {
            ...document.metadata,
            chunkIndex: index,
            totalChunks: chunks.length
          }
        }))
      );
      
      this.emit('documentAdded', document);
    } catch (error) {
      console.error('Failed to add document:', error);
      throw error;
    }
  }

  async removeDocument(documentId: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Remove from SQLite
      await this.deleteDocument(documentId);
      
      // Remove from FAISS index
      await this.searchEngine.removeDocument(documentId);
      
      this.emit('documentRemoved', documentId);
    } catch (error) {
      console.error('Failed to remove document:', error);
      throw error;
    }
  }

  async search(query: string, options?: {
    limit?: number;
    threshold?: number;
    filters?: Record<string, any>;
  }): Promise<SearchResult[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Generate query embedding
      const queryEmbedding = await this.vectorEncoder.encode([query]);
      
      // Search in FAISS
      const results = await this.searchEngine.search(
        queryEmbedding[0],
        options?.limit || 10,
        options?.threshold
      );
      
      // Enrich results with document data from SQLite
      const enrichedResults = await this.enrichSearchResults(results);
      
      this.emit('searchCompleted', { query, results: enrichedResults });
      return enrichedResults;
    } catch (error) {
      console.error('Search failed:', error);
      throw error;
    }
  }

  async indexVault(vaultPath: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      this.emit('indexingStarted', vaultPath);
      
      // Clear existing index
      await this.clearIndex();
      
      // Scan vault directory for markdown files
      const markdownFiles = await this.scanVault(vaultPath);
      
      // Process each file
      for (const filePath of markdownFiles) {
        try {
          const document = await this.processMarkdownFile(filePath);
          await this.addDocument(document);
        } catch (fileError) {
          console.warn(`Failed to process file ${filePath}:`, fileError);
        }
      }
      
      // Save index
      await this.saveIndex();
      
      this.emit('indexingCompleted', { 
        vaultPath, 
        documentCount: markdownFiles.length 
      });
    } catch (error) {
      console.error('Vault indexing failed:', error);
      this.emit('indexingError', { vaultPath, error });
      throw error;
    }
  }

  async updateDocument(documentId: string, updates: Partial<Document>): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Update document in SQLite
      await this.updateDocumentRecord(documentId, updates);
      
      // If content was updated, reindex
      if (updates.content !== undefined) {
        const updatedDocument = await this.getDocument(documentId);
        if (updatedDocument) {
          await this.removeDocument(documentId);
          await this.addDocument(updatedDocument);
        }
      }
      
      this.emit('documentUpdated', { documentId, updates });
    } catch (error) {
      console.error('Failed to update document:', error);
      throw error;
    }
  }

  async getDocument(documentId: string): Promise<Document | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return await this.retrieveDocument(documentId);
  }

  async updateConfig(newConfig: Partial<VectorStoreConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.embeddingModel) {
      await this.vectorEncoder.updateModel(newConfig.embeddingModel);
    }
    
    if (newConfig.chunkSize !== undefined || newConfig.chunkOverlap !== undefined) {
      this.textChunker.updateConfig(
        newConfig.chunkSize || this.config.chunkSize,
        newConfig.chunkOverlap || this.config.chunkOverlap
      );
    }
    
    this.emit('configUpdated', this.config);
  }

  getConfig(): VectorStoreConfig {
    return { ...this.config };
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
    }
    await this.searchEngine.close();
    this.isInitialized = false;
    this.emit('closed');
  }

  // Private methods for database operations
  private async initializeDatabase(): Promise<void> {
    // Implementation would initialize SQLite with proper schema
    // For now, we'll simulate the initialization
    console.log('Initializing SQLite database at:', this.config.databasePath);
  }

  private async storeDocument(document: Document): Promise<void> {
    // Implementation would store document in SQLite
    console.log('Storing document:', document.id);
  }

  private async deleteDocument(documentId: string): Promise<void> {
    // Implementation would delete document from SQLite
    console.log('Deleting document:', documentId);
  }

  private async updateDocumentRecord(documentId: string, updates: Partial<Document>): Promise<void> {
    // Implementation would update document in SQLite
    console.log('Updating document:', documentId);
  }

  private async retrieveDocument(documentId: string): Promise<Document | null> {
    // Implementation would retrieve document from SQLite
    console.log('Retrieving document:', documentId);
    return null;
  }

  private async scanVault(vaultPath: string): Promise<string[]> {
    // Implementation would scan directory for markdown files
    console.log('Scanning vault:', vaultPath);
    return [];
  }

  private async processMarkdownFile(filePath: string): Promise<Document> {
    // Implementation would read and process markdown file
    console.log('Processing markdown file:', filePath);
    return {
      id: 'temp',
      title: 'Temp',
      content: 'Temp',
      path: filePath,
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: []
    };
  }

  private async clearIndex(): Promise<void> {
    // Implementation would clear FAISS index
    console.log('Clearing index');
  }

  private async saveIndex(): Promise<void> {
    // Implementation would save FAISS index to disk
    console.log('Saving index');
  }

  private async loadIndex(): Promise<void> {
    // Implementation would load FAISS index from disk
    console.log('Loading index');
  }

  private async enrichSearchResults(results: any[]): Promise<SearchResult[]> {
    // Implementation would enrich FAISS results with document data
    console.log('Enriching search results');
    return results as SearchResult[];
  }
}
```

### 2. Document Indexer

```typescript
// DocumentIndexer.ts
import { readdir, readFile, stat } from 'fs/promises';
import { join, extname } from 'path';

class DocumentIndexer {
  async scanDirectory(directoryPath: string): Promise<string[]> {
    const files: string[] = [];
    
    const scan = async (dir: string) => {
      const entries = await readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
          files.push(fullPath);
        }
      }
    };
    
    await scan(directoryPath);
    return files;
  }

  async readMarkdownFile(filePath: string): Promise<{ title: string; content: string; tags: string[] }> {
    const content = await readFile(filePath, 'utf8');
    
    // Extract title from first H1 header
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : filePath.split('/').pop()?.replace('.md', '') || 'Untitled';
    
    // Extract tags from YAML frontmatter or #tag format
    const tags: string[] = [];
    
    // Check YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      const tagsMatch = frontmatter.match(/tags:\s*\[([^\]]+)\]/);
      if (tagsMatch) {
        tags.push(...tagsMatch[1].split(',').map(tag => tag.trim().replace(/['"]/g, '')));
      }
    }
    
    // Check for #tag format
    const tagMatches = content.match(/#(\w+)/g);
    if (tagMatches) {
      tags.push(...tagMatches.map(tag => tag.substring(1)));
    }
    
    return { title, content, tags: [...new Set(tags)] };
  }

  async getFileMetadata(filePath: string): Promise<{ createdAt: Date; updatedAt: Date; size: number }> {
    const stats = await stat(filePath);
    
    return {
      createdAt: stats.birthtime,
      updatedAt: stats.mtime,
      size: stats.size
    };
  }
}

export { DocumentIndexer };
```

### 3. Semantic Search Engine

```typescript
// SemanticSearchEngine.ts
import * as faiss from 'faiss-node'; // This is a placeholder - actual implementation would use proper FAISS bindings

interface IndexedDocument {
  id: string;
  documentId: string;
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
}

class SemanticSearchEngine {
  private index: any = null; // FAISS index
  private documents: Map<string, IndexedDocument> = new Map();
  private isInitialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize FAISS index
      // This is a placeholder - actual implementation would use proper FAISS API
      // this.index = new faiss.IndexFlatL2(1536); // For 1536-dimensional embeddings
      
      this.isInitialized = true;
      console.log('Semantic search engine initialized');
    } catch (error) {
      console.error('Failed to initialize semantic search engine:', error);
      throw error;
    }
  }

  async addDocuments(documents: IndexedDocument[]): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Store documents
      for (const doc of documents) {
        this.documents.set(doc.id, doc);
      }
      
      // Add embeddings to FAISS index
      if (documents.length > 0) {
        const embeddings = documents.map(doc => doc.embedding);
        // this.index.add(embeddings); // Placeholder
      }
      
      console.log(`Added ${documents.length} documents to index`);
    } catch (error) {
      console.error('Failed to add documents to index:', error);
      throw error;
    }
  }

  async search(queryEmbedding: number[], limit: number = 10, threshold?: number): Promise<any[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Search in FAISS index
      // This is a placeholder - actual implementation would use proper FAISS API
      // const results = this.index.search([queryEmbedding], limit);
      
      // Filter by threshold if provided
      // const filteredResults = threshold ? 
      //   results.filter((r: any) => r.distance <= threshold) : 
      //   results;
      
      // Map results to document data
      // const enrichedResults = filteredResults.map((result: any) => {
      //   const doc = this.documents.get(result.id);
      //   return {
      //     ...result,
      //     document: doc
      //   };
      // });
      
      // Placeholder return
      return [];
    } catch (error) {
      console.error('Search failed:', error);
      throw error;
    }
  }

  async removeDocument(documentId: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Remove documents associated with documentId
      for (const [id, doc] of this.documents.entries()) {
        if (doc.documentId === documentId) {
          this.documents.delete(id);
        }
      }
      
      console.log(`Removed documents for documentId: ${documentId}`);
    } catch (error) {
      console.error('Failed to remove document from index:', error);
      throw error;
    }
  }

  async saveIndex(filePath: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Save FAISS index to file
      // this.index.write(filePath); // Placeholder
      console.log('Index saved to:', filePath);
    } catch (error) {
      console.error('Failed to save index:', error);
      throw error;
    }
  }

  async loadIndex(filePath: string): Promise<void> {
    if (this.isInitialized) {
      await this.close();
    }

    try {
      // Load FAISS index from file
      // this.index = faiss.readIndex(filePath); // Placeholder
      this.isInitialized = true;
      console.log('Index loaded from:', filePath);
    } catch (error) {
      console.error('Failed to load index:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    // Clean up resources
    this.documents.clear();
    this.index = null;
    this.isInitialized = false;
    console.log('Semantic search engine closed');
  }
}

export { SemanticSearchEngine };
```

### 4. Text Chunker

```typescript
// TextChunker.ts
class TextChunker {
  private chunkSize: number;
  private chunkOverlap: number;

  constructor(chunkSize: number = 1000, chunkOverlap: number = 200) {
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
  }

  chunk(text: string): string[] {
    const chunks: string[] = [];
    const sentences = this.splitIntoSentences(text);
    
    let currentChunk: string[] = [];
    let currentLength = 0;
    
    for (const sentence of sentences) {
      const sentenceLength = sentence.length;
      
      // If adding this sentence would exceed chunk size
      if (currentLength + sentenceLength > this.chunkSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push(currentChunk.join(' '));
        
        // Start new chunk with overlap
        const overlapSentences = this.getOverlapSentences(currentChunk);
        currentChunk = [...overlapSentences, sentence];
        currentLength = overlapSentences.reduce((sum, s) => sum + s.length, 0) + sentenceLength;
      } else {
        // Add sentence to current chunk
        currentChunk.push(sentence);
        currentLength += sentenceLength;
      }
    }
    
    // Don't forget the last chunk
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
    }
    
    return chunks;
  }

  updateConfig(chunkSize: number, chunkOverlap: number): void {
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
  }

  private splitIntoSentences(text: string): string[] {
    // Simple sentence splitting - in practice, you might want to use
    // a more sophisticated NLP library
    return text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
  }

  private getOverlapSentences(chunk: string[]): string[] {
    // Get sentences for overlap
    let overlapLength = 0;
    const overlapSentences: string[] = [];
    
    // Work backwards from the end of the chunk
    for (let i = chunk.length - 1; i >= 0; i--) {
      const sentence = chunk[i];
      if (overlapLength + sentence.length > this.chunkOverlap) {
        break;
      }
      overlapSentences.unshift(sentence);
      overlapLength += sentence.length;
    }
    
    return overlapSentences;
  }
}

export { TextChunker };
```

### 5. Vector Encoder

```typescript
// VectorEncoder.ts
import OpenAI from 'openai';
import axios from 'axios';

type EmbeddingModel = 'openai' | 'ollama' | 'local';

class VectorEncoder {
  private model: EmbeddingModel;
  private openaiClient: OpenAI | null = null;
  private ollamaBaseUrl: string = 'http://localhost:11434';

  constructor(model: EmbeddingModel) {
    this.model = model;
    if (model === 'openai') {
      this.initializeOpenAI();
    }
  }

  private initializeOpenAI(): void {
    // In a real implementation, the API key would be loaded from secure storage
    const apiKey = process.env.OPENAI_API_KEY || '';
    if (apiKey) {
      this.openaiClient = new OpenAI({ apiKey });
    }
  }

  async encode(texts: string[]): Promise<number[][]> {
    switch (this.model) {
      case 'openai':
        return await this.encodeWithOpenAI(texts);
      case 'ollama':
        return await this.encodeWithOllama(texts);
      case 'local':
        return await this.encodeWithLocalModel(texts);
      default:
        throw new Error(`Unsupported embedding model: ${this.model}`);
    }
  }

  private async encodeWithOpenAI(texts: string[]): Promise<number[][]> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    try {
      const response = await this.openaiClient.embeddings.create({
        model: 'text-embedding-ada-002',
        input: texts
      });

      return response.data.map(item => item.embedding);
    } catch (error) {
      console.error('OpenAI embedding failed:', error);
      throw error;
    }
  }

  private async encodeWithOllama(texts: string[]): Promise<number[][]> {
    try {
      const embeddings: number[][] = [];
      
      for (const text of texts) {
        const response = await axios.post(`${this.ollamaBaseUrl}/api/embeddings`, {
          model: 'nomic-embed-text',
          prompt: text
        });
        
        embeddings.push(response.data.embedding);
      }
      
      return embeddings;
    } catch (error) {
      console.error('Ollama embedding failed:', error);
      throw error;
    }
  }

  private async encodeWithLocalModel(texts: string[]): Promise<number[][]> {
    // Placeholder for local embedding model
    // In a real implementation, this might use a library like transformers.js
    // or a local model server
    
    // For now, return random embeddings as placeholder
    return texts.map(() => {
      const embedding = new Array(1536).fill(0).map(() => Math.random() - 0.5);
      // Normalize the vector
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      return embedding.map(val => val / magnitude);
    });
  }

  async updateModel(newModel: EmbeddingModel): Promise<void> {
    this.model = newModel;
    if (newModel === 'openai') {
      this.initializeOpenAI();
    }
  }

  getModel(): EmbeddingModel {
    return this.model;
  }
}

export { VectorEncoder };
```

## Database Schema

```sql
-- schema.sql
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    tags TEXT, -- JSON array
    metadata TEXT -- JSON object
);

CREATE TABLE IF NOT EXISTS document_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    total_chunks INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL,
    FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS index_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(path);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);
```

## Performance Considerations

### 1. Indexing Optimization
- Batch processing for large vaults
- Progress tracking and resumable indexing
- Memory-efficient chunking
- Parallel processing where possible

### 2. Search Optimization
- Caching of frequent queries
- Approximate nearest neighbor search
- Result pagination
- Query preprocessing

### 3. Storage Optimization
- Compression of stored embeddings
- Efficient serialization formats
- Incremental index updates
- Automatic cleanup of stale data

## Cross-Platform Considerations

### 1. File System Handling
- Unicode filename support
- Path separator normalization
- Permission handling
- Large file processing

### 2. Database Compatibility
- SQLite version consistency
- Extension availability across platforms
- File locking mechanisms
- Backup and recovery

## Settings Integration

```typescript
// VectorStoreSettings.tsx
interface VectorStoreSettingsProps {
  config: VectorStoreConfig;
  onConfigChange: (config: Partial<VectorStoreConfig>) => void;
  onReindexVault: () => void;
}

const VectorStoreSettings: React.FC<VectorStoreSettingsProps> = ({
  config,
  onConfigChange,
  onReindexVault
}) => {
  return (
    <div className="vector-store-settings">
      <h3>Vector Store Settings</h3>
      
      <div className="setting-group">
        <label htmlFor="embedding-model">Embedding Model</label>
        <select
          id="embedding-model"
          value={config.embeddingModel}
          onChange={(e) => onConfigChange({ embeddingModel: e.target.value as any })}
        >
          <option value="openai">OpenAI (text-embedding-ada-002)</option>
          <option value="ollama">Ollama (nomic-embed-text)</option>
          <option value="local">Local Model</option>
        </select>
      </div>
      
      <div className="setting-group">
        <label htmlFor="chunk-size">Chunk Size: {config.chunkSize} characters</label>
        <input
          id="chunk-size"
          type="range"
          min="100"
          max="5000"
          step="100"
          value={config.chunkSize}
          onChange={(e) => onConfigChange({ chunkSize: parseInt(e.target.value) })}
        />
        <div className="setting-description">
          Larger chunks provide more context but may be less precise.
        </div>
      </div>
      
      <div className="setting-group">
        <label htmlFor="chunk-overlap">Chunk Overlap: {config.chunkOverlap} characters</label>
        <input
          id="chunk-overlap"
          type="range"
          min="0"
          max="1000"
          step="50"
          value={config.chunkOverlap}
          onChange={(e) => onConfigChange({ chunkOverlap: parseInt(e.target.value) })}
        />
        <div className="setting-description">
          Overlap helps maintain context between chunks.
        </div>
      </div>
      
      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={config.autoIndex}
            onChange={(e) => onConfigChange({ autoIndex: e.target.checked })}
          />
          Automatically index vault content
        </label>
      </div>
      
      <div className="setting-group">
        <button onClick={onReindexVault}>
          Re-index Vault
        </button>
        <div className="setting-description">
          Rebuild the search index for all vault content.
        </div>
      </div>
    </div>
  );
};
```

## Dependencies

```json
{
  "dependencies": {
    "sqlite3": "^5.1.6",
    "faiss-node": "^0.1.0",
    "openai": "^4.0.0",
    "axios": "^1.4.0"
  }
}
```

## Testing Strategy

### 1. Unit Tests
- Text chunking algorithms
- Vector encoding accuracy
- Database operations
- Search result relevance

### 2. Integration Tests
- End-to-end indexing workflows
- Search performance benchmarks
- Cross-platform compatibility
- Error handling scenarios

### 3. Performance Tests
- Indexing speed for large vaults
- Search latency measurements
- Memory usage profiling
- Scalability testing

## Future Enhancements

### 1. Cloud Extension
- Integration with cloud vector databases (Pinecone, Weaviate)
- Hybrid local/cloud search
- Synchronized indexing

### 2. Advanced Features
- Multi-modal embeddings (images, audio)
- Graph-based relationships between documents
- Real-time collaborative indexing
- Incremental learning from user feedback

### 3. Optimization
- GPU acceleration for embedding generation
- Distributed indexing for large datasets
- Adaptive chunking based on content type
- Smart caching strategies