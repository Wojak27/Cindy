import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

interface VectorStoreOptions {
    databasePath: string;
    embeddingModel: string;
    chunkSize: number;
    chunkOverlap: number;
    autoIndex: boolean;
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

export class VectorStoreService extends EventEmitter {
    private options: VectorStoreOptions;
    private indexedFiles: Map<string, IndexedFile> = new Map();
    private supportedExtensions = new Set(['.txt', '.md', '.mdx', '.pdf', '.doc', '.docx', '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.html', '.css', '.json', '.xml', '.yml', '.yaml']);

    constructor(options: VectorStoreOptions) {
        super();
        this.options = options;
    }

    async initialize(): Promise<void> {
        // Implementation would connect to database and set up schema
        console.log('Vector store initialized with:', this.options);
        
        // Create database directory if it doesn't exist
        const dbDir = path.join(this.options.databasePath, '.vector_store');
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
    }

    async addDocument(document: {
        id: string;
        title: string;
        content: string;
        path: string;
        createdAt: Date;
        updatedAt: Date;
        tags: string[];
    }): Promise<void> {
        // Implementation would add document to vector database
        console.log('Added document:', document.id);
    }

    async updateDocument(id: string, updates: {
        content?: string;
        title?: string;
        tags?: string[];
        updatedAt?: Date;
    }): Promise<void> {
        // Implementation would update document in vector database
        console.log('Updated document:', id);
    }

    async search(query: string, options?: {
        limit?: number;
        filters?: { tags?: string[] };
    }): Promise<Array<{
        id: string;
        content: string;
        metadata: {
            title?: string;
            path: string;
            createdAt: string;
            updatedAt: string;
            tags: string[];
        };
    }>> {
        // Implementation would query vector database
        console.log('RAG Search query:', query);
        return [{
            id: 'test',
            content: `Search results for: ${query}`,
            metadata: {
                path: '/test/path',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                tags: ['test']
            }
        }];
    }

    async indexDirectory(): Promise<{ success: boolean; indexedFiles: IndexedFile[]; error?: string }> {
        try {
            console.log('Starting indexing of directory:', this.options.databasePath);
            const files = await this.scanDirectory(this.options.databasePath);
            const indexedFiles: IndexedFile[] = [];
            let processedCount = 0;
            
            this.emit('progress', { type: 'progress', progress: 0 });
            
            for (const file of files) {
                try {
                    const result = await this.processFile(file);
                    if (result) {
                        indexedFiles.push(result);
                        this.emit('progress', { type: 'file', file: result });
                    }
                } catch (error) {
                    console.error(`Error processing file ${file}:`, error);
                    const errorResult: IndexedFile = {
                        name: path.basename(file),
                        path: file,
                        type: 'file',
                        error: error instanceof Error ? error.message : 'Unknown error'
                    };
                    indexedFiles.push(errorResult);
                }
                
                processedCount++;
                const progress = Math.round((processedCount / files.length) * 100);
                this.emit('progress', { type: 'progress', progress });
            }
            
            console.log(`Indexing completed. Processed ${indexedFiles.length} files.`);
            return { success: true, indexedFiles };
        } catch (error) {
            console.error('Error during indexing:', error);
            return { 
                success: false, 
                indexedFiles: [], 
                error: error instanceof Error ? error.message : 'Unknown error' 
            };
        }
    }
    
    private async scanDirectory(dirPath: string): Promise<string[]> {
        const files: string[] = [];
        
        const scanRecursive = async (currentPath: string) => {
            const items = fs.readdirSync(currentPath);
            
            for (const item of items) {
                const fullPath = path.join(currentPath, item);
                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory()) {
                    // Skip hidden directories and common non-content directories
                    if (!item.startsWith('.') && !['node_modules', 'dist', 'build', '__pycache__'].includes(item)) {
                        await scanRecursive(fullPath);
                    }
                } else if (stat.isFile()) {
                    const ext = path.extname(item).toLowerCase();
                    if (this.supportedExtensions.has(ext)) {
                        files.push(fullPath);
                    }
                }
            }
        };
        
        await scanRecursive(dirPath);
        return files;
    }
    
    private async processFile(filePath: string): Promise<IndexedFile | null> {
        const stat = fs.statSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const fileName = path.basename(filePath);
        
        console.log(`Processing file: ${fileName}`);
        
        try {
            let content = '';
            let chunks = 0;
            
            if (ext === '.pdf') {
                content = await this.parsePDF(filePath);
            } else if (ext === '.doc' || ext === '.docx') {
                content = await this.parseWordDocument(filePath);
            } else {
                // Handle text-based files
                try {
                    content = fs.readFileSync(filePath, 'utf-8');
                    console.log(`Read text file: ${fileName} (${content.length} characters)`);
                } catch (readError) {
                    // Handle binary files or encoding issues
                    console.warn(`Could not read as UTF-8: ${fileName}, attempting as binary`);
                    const buffer = fs.readFileSync(filePath);
                    content = `Binary file: ${fileName} (${buffer.length} bytes) - content not extracted`;
                }
            }
            
            // Split content into chunks
            if (content.trim()) {
                chunks = this.createChunks(content).length;
            }
            
            return {
                name: fileName,
                path: filePath,
                type: 'file',
                size: stat.size,
                chunks,
                lastModified: stat.mtime
            };
        } catch (error) {
            console.error(`Error processing ${fileName}:`, error);
            return {
                name: fileName,
                path: filePath,
                type: 'file',
                size: stat.size,
                error: error instanceof Error ? error.message : 'Processing failed'
            };
        }
    }
    
    private async parsePDF(filePath: string): Promise<string> {
        try {
            const pdfParse = require('pdf-parse');
            const dataBuffer = fs.readFileSync(filePath);
            console.log(`Parsing PDF: ${path.basename(filePath)} (${dataBuffer.length} bytes)`);
            
            const data = await pdfParse(dataBuffer, {
                // Options for better text extraction
                max: 0, // No page limit
                version: 'default'
            });
            
            console.log(`PDF parsing completed: ${data.numpages} pages, ${data.text.length} characters`);
            
            // Clean up the extracted text
            let cleanText = data.text
                .replace(/\s+/g, ' ') // Normalize whitespace
                .replace(/\n\s*\n/g, '\n') // Remove excessive line breaks
                .trim();
            
            // Add metadata as a header if available
            if (data.info) {
                const metadata = [];
                if (data.info.Title) metadata.push(`Title: ${data.info.Title}`);
                if (data.info.Author) metadata.push(`Author: ${data.info.Author}`);
                if (data.info.Subject) metadata.push(`Subject: ${data.info.Subject}`);
                if (data.numpages) metadata.push(`Pages: ${data.numpages}`);
                
                if (metadata.length > 0) {
                    cleanText = metadata.join('\n') + '\n\n' + cleanText;
                }
            }
            
            return cleanText;
        } catch (error) {
            console.error(`Error parsing PDF ${path.basename(filePath)}:`, error);
            throw new Error(`PDF parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    private async parseWordDocument(filePath: string): Promise<string> {
        try {
            const mammoth = require('mammoth');
            const ext = path.extname(filePath).toLowerCase();
            console.log(`Parsing Word document: ${path.basename(filePath)}`);
            
            let result;
            
            if (ext === '.docx') {
                // Parse .docx files
                result = await mammoth.extractRawText({ path: filePath });
            } else if (ext === '.doc') {
                // Parse .doc files (older format)
                result = await mammoth.extractRawText({ path: filePath });
            } else {
                throw new Error(`Unsupported Word document format: ${ext}`);
            }
            
            console.log(`Word document parsing completed: ${result.value.length} characters`);
            
            // Clean up the extracted text
            let cleanText = result.value
                .replace(/\s+/g, ' ') // Normalize whitespace
                .replace(/\n\s*\n/g, '\n') // Remove excessive line breaks
                .trim();
            
            // Log any warnings from mammoth
            if (result.messages && result.messages.length > 0) {
                console.warn(`Word document parsing warnings for ${path.basename(filePath)}:`, result.messages);
            }
            
            // Add filename as a header
            cleanText = `Document: ${path.basename(filePath)}\n\n` + cleanText;
            
            return cleanText;
        } catch (error) {
            console.error(`Error parsing Word document ${path.basename(filePath)}:`, error);
            throw new Error(`Word document parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    private createChunks(content: string): string[] {
        const chunks: string[] = [];
        const sentences = content.split(/[.!?]+/).filter(s => s.trim());
        let currentChunk = '';
        
        for (const sentence of sentences) {
            if (currentChunk.length + sentence.length > this.options.chunkSize) {
                if (currentChunk.trim()) {
                    chunks.push(currentChunk.trim());
                }
                currentChunk = sentence;
            } else {
                currentChunk += sentence + '. ';
            }
        }
        
        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }
        
        return chunks.filter(chunk => chunk.length > 10); // Filter out very short chunks
    }
    
    async getIndexedItems(): Promise<IndexedFile[]> {
        // Return currently indexed files - in a real implementation,
        // this would query the vector database
        return Array.from(this.indexedFiles.values());
    }

    async close(): Promise<void> {
        // Implementation would clean up database connection
        console.log('Vector store closed');
    }
}
