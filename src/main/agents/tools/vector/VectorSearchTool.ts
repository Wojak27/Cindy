/**
 * Vector search tool implementation for document similarity search
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import type { DuckDBVectorStore } from "../../../services/DuckDBVectorStore";
import { z } from "zod";

/**
 * Zod schema for vector search input validation
 */
const vectorSearchSchema = z.object({
  query: z
    .string()
    .min(1, "Search query cannot be empty")
    .max(1000, "Search query too long (maximum 1000 characters)")
    .describe("The search query to find relevant documents"),
  limit: z
    .number()
    .min(1, "Limit must be at least 1")
    .max(20, "Limit cannot exceed 20")
    .default(5)
    .describe("Maximum number of documents to return"),
});

/**
 * Creates a Vector search tool for semantic document search
 */
export function createVectorSearchTool(
  vectorStore: DuckDBVectorStore
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: "search_documents",
    description:
      "Search through users personal, indexed documents and notes using semantic similarity. Use this when users ask about stored documents, notes, or need to find specific information from their knowledge base. Triggered by #search or #find hashtags.",
    schema: vectorSearchSchema,
    func: async (
      input: z.infer<typeof vectorSearchSchema>
    ): Promise<string | object> => {
      try {
        console.log("[VectorSearchTool] func method called with:", input);
        console.log("[VectorSearchTool] input type:", typeof input);

        // Parse input through schema to apply defaults
        const parsed = vectorSearchSchema.parse(input);
        const { query, limit } = parsed;

        // Check if vector store is available
        if (!vectorStore) {
          return "Vector database is not available. Please ensure the vector store is properly configured.";
        }

        // Ensure vector store is initialized
        if (!vectorStore.isInitialized) {
          console.log("[VectorSearchTool] Initializing vector store...");
          await vectorStore.initialize();
        }

        // Perform similarity search
        console.log(
          `[VectorSearchTool] Performing similarity search for: "${query}" (limit: ${limit})`
        );
        const results = await vectorStore.similaritySearch(query, limit);

        if (!results || results.length === 0) {
          return `I searched through the indexed documents but could not find any information related to "${query}". This could mean:
1. The information is not in the indexed documents
2. Try rephrasing your search with different keywords
3. The documents may need to be re-indexed if recently added

Please try a different search term or check if the relevant documents have been indexed.`;
        }

        console.log(
          `[VectorSearchTool] Successfully found ${results.length} results`
        );

        // Append raw results in a comment for backend processing
        const rawResults = results.map((doc: any) => {
          const metadata = doc.metadata || {};
          const source =
            metadata.source || metadata.fileName || "Unknown source";
          const fileName = source.split("/").pop() || source;
          return {
            path: source,
            name: fileName,
            size: metadata.size || 0,
            mtime: metadata.mtime || new Date().toISOString(),
            chunks: metadata.chunks || 1,
          };
        });

        return rawResults;
      } catch (error: any) {
        console.error("[VectorSearchTool] Error during search:", error);

        // Handle specific error types
        if (error.message.includes("not initialized")) {
          return "Vector database is not initialized. Please initialize the vector store first.";
        }

        if (error.message.includes("connection")) {
          return "Cannot connect to vector database. Please check the database configuration.";
        }

        if (error.message.includes("timeout")) {
          return "Vector search timed out. Please try again with a shorter query.";
        }

        return `Search failed: ${error.message}. Please try again or check if the vector database is properly configured.`;
      }
    },
  });
}

/**
 * Backward compatibility class wrapper for the VectorSearchTool
 * @deprecated Use createVectorSearchTool() function instead
 */
export class VectorSearchTool {
  private tool: DynamicStructuredTool;

  constructor(vectorStore: any) {
    this.tool = createVectorSearchTool(vectorStore);
  }

  get name(): string {
    return this.tool.name;
  }

  get description(): string {
    return this.tool.description;
  }

  async _call(input: any): Promise<string> {
    // Convert legacy input format to new structured format
    let structuredInput;

    if (typeof input === "string") {
      structuredInput = { query: input, limit: 5 };
    } else if (input && typeof input === "object") {
      structuredInput = {
        query: input.query || input,
        limit: input.limit || 5,
      };
    } else {
      structuredInput = { query: String(input), limit: 5 };
    }

    return this.tool.func(structuredInput);
  }

  isReady(): boolean {
    // This method is kept for backward compatibility
    // The actual readiness check is now handled inside the tool function
    return true;
  }
}

export default createVectorSearchTool;
