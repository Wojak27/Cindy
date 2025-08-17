/**
 * Vector search tool implementation for document similarity search
 */

import { Tool } from '@langchain/core/tools';
import { ToolCategory } from '../ToolDefinitions';
import type { ToolSpecification } from '../ToolDefinitions';

/**
 * Vector search tool for semantic document search
 */
export class VectorSearchTool extends Tool {
    name = 'search_documents';
    description = 'Search through indexed documents and notes using semantic similarity. Use this when users ask about stored documents, notes, or need to find specific information from their knowledge base. Triggered by #search or #find hashtags.';
    
    constructor(private vectorStore: any) {
        super();
    }

    async invoke(input: any): Promise<string> {
        console.log('[VectorSearchTool] invoke called with:', input);
        console.log('[VectorSearchTool] input type:', typeof input);
        return this._call(input);
    }

    async _call(input: any): Promise<string> {
        try {
            console.log('[VectorSearchTool] _call method called with:', input);
            console.log('[VectorSearchTool] input type in _call:', typeof input);
            
            // Handle both string input and object input
            const query = typeof input === 'string' ? input : (input?.query || input);
            const limit = typeof input === 'object' && input.limit ? input.limit : 5;

            if (!query || query.trim().length === 0) {
                return 'Please provide a search query to find relevant documents.';
            }

            // Validate query length
            const sanitizedQuery = query.trim();
            if (sanitizedQuery.length > 1000) {
                return 'Search query is too long. Please use a shorter search term (maximum 1000 characters).';
            }

            // Check if vector store is available
            if (!this.vectorStore) {
                return 'Vector database is not available. Please ensure the vector store is properly configured.';
            }

            // Ensure vector store is initialized
            if (!this.vectorStore.isInitialized) {
                console.log('[VectorSearchTool] Initializing vector store...');
                await this.vectorStore.initialize();
            }

            // Perform similarity search
            console.log(`[VectorSearchTool] Performing similarity search for: "${sanitizedQuery}" (limit: ${limit})`);
            const results = await this.vectorStore.similaritySearch(sanitizedQuery, limit);
            
            if (!results || results.length === 0) {
                return `I searched through the indexed documents but could not find any information related to "${sanitizedQuery}". This could mean:
1. The information is not in the indexed documents
2. Try rephrasing your search with different keywords
3. The documents may need to be re-indexed if recently added

Please try a different search term or check if the relevant documents have been indexed.`;
            }

            // Format results with clear instructions for the LLM
            const formattedResults = results.map((doc: any, index: number) => {
                const metadata = doc.metadata || {};
                const source = metadata.source || metadata.fileName || 'Unknown source';
                const content = doc.pageContent || '';
                const pageNumber = metadata.pdf?.page || metadata.page || 'N/A';
                
                // Create clickable file path for links
                const fileName = source.split('/').pop() || source;
                const fileLink = `[${fileName}](file://${source})`;
                
                return `**Document ${index + 1}** - ${fileLink} (Page: ${pageNumber})
${content.substring(0, 800)}${content.length > 800 ? '...' : ''}`;
            }).join('\n\n---\n\n');

            // Provide clear instruction to the LLM about how to use this information
            const resultMessage = `I found ${results.length} relevant document${results.length === 1 ? '' : 's'} that contain information to answer your question about "${sanitizedQuery}". Use the following retrieved information to provide a comprehensive answer:

${formattedResults}

Based on the above retrieved documents, please provide a detailed answer to your question. Include specific information from the documents and cite the sources with file links when referencing specific details.`;

            console.log(`[VectorSearchTool] Successfully found ${results.length} results`);
            return resultMessage;

        } catch (error: any) {
            console.error('[VectorSearchTool] Error during search:', error);
            
            // Handle specific error types
            if (error.message.includes('not initialized')) {
                return 'Vector database is not initialized. Please initialize the vector store first.';
            }
            
            if (error.message.includes('connection')) {
                return 'Cannot connect to vector database. Please check the database configuration.';
            }
            
            if (error.message.includes('timeout')) {
                return 'Vector search timed out. Please try again with a shorter query.';
            }
            
            return `Search failed: ${error.message}. Please try again or check if the vector database is properly configured.`;
        }
    }

    /**
     * Check if vector store is available and properly initialized
     */
    isReady(): boolean {
        return !!(this.vectorStore && this.vectorStore.isInitialized);
    }

    /**
     * Get vector store statistics
     */
    async getStats(): Promise<{
        documentsCount: number;
        isInitialized: boolean;
        lastIndexed?: Date;
    }> {
        if (!this.vectorStore) {
            return {
                documentsCount: 0,
                isInitialized: false
            };
        }

        try {
            const stats = {
                documentsCount: await this.vectorStore.getDocumentCount?.() || 0,
                isInitialized: this.vectorStore.isInitialized || false,
                lastIndexed: this.vectorStore.lastIndexed || undefined
            };
            return stats;
        } catch (error) {
            console.error('[VectorSearchTool] Error getting stats:', error);
            return {
                documentsCount: 0,
                isInitialized: false
            };
        }
    }
}

/**
 * Create and register the vector search tool
 */
export function createVectorSearchTool(vectorStore: any): ToolSpecification | null {
    if (!vectorStore) {
        console.log('[VectorSearchTool] Cannot create tool - vector store not provided');
        return null;
    }

    const tool = new VectorSearchTool(vectorStore);
    
    const specification: ToolSpecification = {
        name: 'search_documents',
        description: tool.description,
        parameters: {
            type: 'object',
            properties: {
                query: { 
                    type: 'string', 
                    description: 'The search query to find relevant documents' 
                },
                limit: { 
                    type: 'number', 
                    description: 'Maximum number of results to return (default: 5)',
                    default: 5
                }
            },
            required: ['query']
        },
        tool,
        metadata: {
            category: ToolCategory.VECTOR,
            version: '1.0.0',
            requiresAuth: false,
            tags: ['vector', 'documents', 'semantic', 'search', 'similarity'],
            rateLimit: {
                requestsPerMinute: 30  // Reasonable limit for vector operations
            }
        }
    };
    
    return specification;
}

export default VectorSearchTool;