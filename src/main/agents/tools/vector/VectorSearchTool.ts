/**
 * Vector search tool implementation for document similarity search
 */

import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager';
import { StructuredTool, ToolSchemaBase } from '@langchain/core/tools';

/**
 * Vector search tool for semantic document search
 */
export class VectorSearchTool extends StructuredTool {
    schema: ToolSchemaBase;
    name = 'search_documents';
    description = 'Search through users personal, indexed documents and notes using semantic similarity. Use this when users ask about stored documents, notes, or need to find specific information from their knowledge base. Triggered by #search or #find hashtags.';
    
    private vectorStore: any;

    constructor(vectorStore: any) {
        super();
        this.vectorStore = vectorStore;
    }

    async _call(input: any, _runManager?: CallbackManagerForToolRun): Promise<any> {
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

            // Append raw results in a comment for backend processing
            const rawResults = results.map((doc: any) => {
                const metadata = doc.metadata || {};
                const source = metadata.source || metadata.fileName || 'Unknown source';
                const fileName = source.split('/').pop() || source;
                return {
                    path: source,
                    name: fileName,
                    size: metadata.size || 0,
                    mtime: metadata.mtime || new Date().toISOString(),
                    chunks: metadata.chunks || 1
                };
            });

            const rawResultsComment = `<!-- RAW_RESULTS: ${JSON.stringify(rawResults)} -->`;
            return resultMessage + '\n\n' + rawResultsComment;

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
}


export default VectorSearchTool;