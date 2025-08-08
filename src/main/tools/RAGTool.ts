// import { LangChainVectorStoreService as VectorStoreService } from '../services/LangChainVectorStoreService'; // Removed - using DuckDBVectorStore instead
import { BrowserTool } from './BrowserTool';
import { CitationTool } from './CitationTool';
import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';

interface RAGResult {
    success: boolean;
    context?: string[];
    sources?: Array<{
        id: string;
        title: string;
        path: string;
        relevanceScore: number;
        citation?: string;
    }>;
    indexedDocuments?: number;
    error?: string;
}

interface RAGOptions {
    maxResults?: number;
    relevanceThreshold?: number;
    includeMetadata?: boolean;
    contextWindow?: number;
}

interface DocumentContent {
    id: string;
    title: string;
    content: string;
    path: string;
    type: 'file' | 'web' | 'note';
    tags: string[];
    metadata?: Record<string, any>;
}

export class RAGTool {
    private vectorStore: any; // DuckDBVectorStore instance
    private browserTool: BrowserTool;
    private citationTool: CitationTool;
    private knowledgeBaseDir: string;

    constructor(vectorStore: any) {
        this.vectorStore = vectorStore;
        this.browserTool = new BrowserTool();
        this.citationTool = new CitationTool();
        this.knowledgeBaseDir = path.join(app.getPath('userData'), 'knowledge-base');
        this.ensureKnowledgeBaseDir();
    }

    async queryKnowledge(query: string, options: RAGOptions = {}): Promise<RAGResult> {
        try {
            console.log('🔍 RAG: Querying knowledge base for:', query);
            console.log('🔍 RAG: Options:', JSON.stringify(options, null, 2));

            const {
                maxResults = 5,
                relevanceThreshold = 0.7
            } = options;

            // Search vector store for relevant documents
            const searchResults = await this.vectorStore.search(query, {
                k: maxResults * 2, // Get more results to filter by relevance
                filter: {}
            });

            console.log('🔍 RAG: Found', searchResults.length, 'potential matches');

            // Filter by relevance and format results
            const relevantSources = searchResults
                .map(result => ({
                    id: result.source,
                    title: result.metadata.title || 'Untitled',
                    path: result.metadata.path,
                    content: result.content,
                    relevanceScore: this.calculateRelevanceScore(query, result.content),
                    metadata: result.metadata
                }))
                .filter(source => source.relevanceScore >= relevanceThreshold)
                .sort((a, b) => b.relevanceScore - a.relevanceScore)
                .slice(0, maxResults);

            if (relevantSources.length === 0) {
                console.log('🔍 RAG: No relevant sources found for query:', query);
                return {
                    success: true,
                    context: [`No documents found matching the query "${query}". The user may need to index more documents or try a different search term.`],
                    sources: [],
                };
            }

            // Extract context from relevant sources
            const context = relevantSources.map(source => {
                const contextSnippet = this.extractRelevantContext(query, source.content, options.contextWindow || 500);
                return `${source.title}: ${contextSnippet}`;
            });

            // Generate citations for sources
            const sourcesWithCitations = await Promise.all(
                relevantSources.map(async (source) => {
                    let citation = '';
                    const metadata = source.metadata as any; // Type assertion for extended metadata
                    if (metadata.url) {
                        // Generate citation for web sources
                        const citationResult = await this.citationTool.extractCitation(metadata.url, { format: 'apa' });
                        citation = citationResult.success ? citationResult.formatted?.apa || '' : '';
                    } else {
                        // Generate citation for local files
                        citation = `${source.title}. Local file: ${source.path}`;
                    }

                    return {
                        id: source.id,
                        title: source.title,
                        path: source.path,
                        relevanceScore: source.relevanceScore,
                        citation
                    };
                })
            );

            console.log('🔍 RAG: Returning', context.length, 'context snippets');

            return {
                success: true,
                context,
                sources: sourcesWithCitations
            };

        } catch (error) {
            console.error('🚨 RAG: Query failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to query knowledge base'
            };
        }
    }

    async indexDocument(filePath: string, options: { tags?: string[], metadata?: Record<string, any> } = {}): Promise<RAGResult> {
        try {
            console.log('📚 RAG: Indexing document:', filePath);

            // Read file content
            const content = await fs.readFile(filePath, 'utf8');
            const fileName = path.basename(filePath);
            const fileExt = path.extname(filePath);

            // Extract title and content based on file type
            const { title, processedContent } = this.processFileContent(fileName, content, fileExt);

            // Create document object
            const document: DocumentContent = {
                id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
                title,
                content: processedContent,
                path: filePath,
                type: 'file',
                tags: options.tags || [fileExt.slice(1)], // Remove the dot from extension
                metadata: {
                    ...options.metadata,
                    fileType: fileExt,
                    size: content.length,
                    indexedAt: new Date().toISOString()
                }
            };

            // Add to vector store
            await this.vectorStore.addDocument({
                id: document.id,
                title: document.title,
                content: document.content,
                path: document.path,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            console.log('📚 RAG: Document indexed successfully:', document.id);

            return {
                success: true,
                indexedDocuments: 1
            };

        } catch (error) {
            console.error('🚨 RAG: Document indexing failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to index document'
            };
        }
    }

    async indexWebPage(url: string, options: { tags?: string[], metadata?: Record<string, any> } = {}): Promise<RAGResult> {
        try {
            console.log('🌐 RAG: Indexing web page:', url);

            // Extract content from web page
            const browserResult = await this.browserTool.extractContent(url, { headless: true });

            if (!browserResult.success) {
                throw new Error(`Failed to extract content: ${browserResult.error}`);
            }

            // Create document object
            const document: DocumentContent = {
                id: `web_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
                title: browserResult.title || 'Untitled Web Page',
                content: browserResult.content || '',
                path: url,
                type: 'web',
                tags: options.tags || ['web', 'article'],
                metadata: {
                    ...options.metadata,
                    url,
                    indexedAt: new Date().toISOString(),
                    contentLength: browserResult.content?.length || 0
                }
            };

            // Add to vector store
            await this.vectorStore.addDocument({
                id: document.id,
                title: document.title,
                content: document.content,
                path: document.path,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            console.log('🌐 RAG: Web page indexed successfully:', document.id);

            return {
                success: true,
                indexedDocuments: 1
            };

        } catch (error) {
            console.error('🚨 RAG: Web page indexing failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to index web page'
            };
        }
    }

    async indexDirectory(dirPath: string, options: {
        recursive?: boolean,
        fileTypes?: string[],
        tags?: string[],
        maxFiles?: number
    } = {}): Promise<RAGResult> {
        try {
            console.log('📁 RAG: Indexing directory:', dirPath);

            const {
                recursive = true,
                fileTypes = ['.md', '.txt', '.pdf', '.docx', '.html'],
                maxFiles = 100
            } = options;

            const files = await this.scanDirectory(dirPath, recursive, fileTypes, maxFiles);
            let indexedCount = 0;
            const errors: string[] = [];

            for (const filePath of files) {
                try {
                    const result = await this.indexDocument(filePath, { tags: options.tags });
                    if (result.success) {
                        indexedCount++;
                    } else {
                        errors.push(`${filePath}: ${result.error}`);
                    }
                } catch (error) {
                    errors.push(`${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }

            console.log('📁 RAG: Directory indexing completed. Indexed:', indexedCount, 'files');

            return {
                success: true,
                indexedDocuments: indexedCount,
                error: errors.length > 0 ? `Some files failed to index: ${errors.slice(0, 5).join(', ')}` : undefined
            };

        } catch (error) {
            console.error('🚨 RAG: Directory indexing failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to index directory'
            };
        }
    }

    async enhanceResponseWithRAG(query: string, initialResponse: string, options: RAGOptions = {}): Promise<string> {
        try {
            // Query knowledge base for relevant context
            const ragResult = await this.queryKnowledge(query, options);

            if (!ragResult.success || !ragResult.context || ragResult.context.length === 0) {
                return initialResponse;
            }

            // Enhance response with RAG context
            const contextSection = ragResult.context.join('\n\n');
            const sources = ragResult.sources || [];

            const sourcesSection = sources.length > 0
                ? '\n\n**Sources:**\n' + sources.map((source, index) =>
                    `${index + 1}. ${source.citation || `${source.title} (${source.path})`}`
                ).join('\n')
                : '';

            const enhancedResponse = `${initialResponse}

**Additional Context from Knowledge Base:**
${contextSection}${sourcesSection}`;

            return enhancedResponse;

        } catch (error) {
            console.error('🚨 RAG: Response enhancement failed:', error);
            return initialResponse; // Return original response on error
        }
    }

    private processFileContent(fileName: string, content: string, fileExt: string): { title: string, processedContent: string } {
        let title = fileName;
        let processedContent = content;

        switch (fileExt.toLowerCase()) {
            case '.md':
                // Extract title from markdown
                const titleMatch = content.match(/^#\s+(.+)$/m);
                if (titleMatch) {
                    title = titleMatch[1];
                }
                // Remove markdown formatting for better vector search
                processedContent = content
                    .replace(/#{1,6}\s+/g, '') // Remove headers
                    .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
                    .replace(/\*(.*?)\*/g, '$1') // Remove italic
                    .replace(/\[(.*?)\]\(.*?\)/g, '$1'); // Remove links
                break;

            case '.html':
                // Basic HTML tag removal
                processedContent = content
                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                break;
        }

        return { title, processedContent };
    }

    private calculateRelevanceScore(query: string, content: string): number {
        const queryTerms = query.toLowerCase().split(' ').filter(term => term.length > 2);
        const contentLower = content.toLowerCase();

        let score = 0;
        for (const term of queryTerms) {
            const termCount = (contentLower.match(new RegExp(term, 'g')) || []).length;
            score += termCount * (1 / queryTerms.length);
        }

        // Normalize score to 0-1 range
        return Math.min(score / 10, 1);
    }

    private extractRelevantContext(query: string, content: string, windowSize: number): string {
        const queryTerms = query.toLowerCase().split(' ').filter(term => term.length > 2);
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);

        // Find sentences containing query terms
        const relevantSentences = sentences
            .map((sentence, index) => ({
                sentence: sentence.trim(),
                index,
                score: queryTerms.reduce((score, term) =>
                    score + (sentence.toLowerCase().includes(term) ? 1 : 0), 0)
            }))
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);

        if (relevantSentences.length === 0) {
            return content.substring(0, windowSize) + (content.length > windowSize ? '...' : '');
        }

        const context = relevantSentences.map(item => item.sentence).join(' ');
        return context.length > windowSize
            ? context.substring(0, windowSize) + '...'
            : context;
    }

    private async scanDirectory(dirPath: string, recursive: boolean, fileTypes: string[], maxFiles: number): Promise<string[]> {
        const files: string[] = [];

        const scanDir = async (currentPath: string, depth: number = 0) => {
            if (files.length >= maxFiles) return;

            const items = await fs.readdir(currentPath, { withFileTypes: true });

            for (const item of items) {
                if (files.length >= maxFiles) break;

                const fullPath = path.join(currentPath, item.name);

                if (item.isDirectory() && recursive) {
                    await scanDir(fullPath, depth + 1);
                } else if (item.isFile()) {
                    const ext = path.extname(item.name).toLowerCase();
                    if (fileTypes.includes(ext)) {
                        files.push(fullPath);
                    }
                }
            }
        };

        await scanDir(dirPath);
        return files;
    }

    private async ensureKnowledgeBaseDir(): Promise<void> {
        try {
            await fs.mkdir(this.knowledgeBaseDir, { recursive: true });
        } catch (error) {
            // Directory might already exist
        }
    }

    destroy(): void {
        this.browserTool.destroy();
        this.citationTool.destroy();
    }
}