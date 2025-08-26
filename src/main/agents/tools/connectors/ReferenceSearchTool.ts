/**
 * Reference Search Tool for Zotero and Mendeley integration
 * LangChain tool wrapper for reference management connectors
 */

import { Tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ZoteroConnector } from '../../../connectors/ZoteroConnector';
import { MendeleyConnector } from '../../../connectors/MendeleyConnector';
import { BaseConnector } from '../../../connectors/BaseConnector';
import { RefHit, SearchOptions } from '../../../connectors/types';
import { ToolCategory } from '../ToolDefinitions';
import type { ToolSpecification } from '../ToolDefinitions';

// Input schema for the tool
const ReferenceSearchInputSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  provider: z.enum(['zotero', 'mendeley']).optional(),
  maxResults: z.number().min(1).max(25).default(10),
  author: z.string().optional(),
  title: z.string().optional(),
  year: z.number().optional(),
  type: z.string().optional(), // book, journalArticle, etc.
  tag: z.string().optional(),
  collection: z.string().optional(), // Collection/folder ID
  sortBy: z.enum(['relevance', 'title', 'year', 'created']).default('relevance')
});

type ReferenceSearchInput = z.infer<typeof ReferenceSearchInputSchema>;

export class ReferenceSearchTool extends Tool {
  name = 'reference_search';
  description = 'Search academic references from Zotero and Mendeley libraries. Finds papers, books, articles by query text, author, title, year, and other filters.';
  
  private connectors: Map<string, BaseConnector> = new Map();

  constructor(connectors: { zotero?: ZoteroConnector; mendeley?: MendeleyConnector } = {}) {
    super();
    
    if (connectors.zotero) {
      this.connectors.set('zotero', connectors.zotero);
    }
    if (connectors.mendeley) {
      this.connectors.set('mendeley', connectors.mendeley);
    }

    console.log(`[ReferenceSearchTool] Initialized with ${this.connectors.size} connector(s)`);
  }

  protected async _call(input: string): Promise<string> {
    try {
      console.log(`[ReferenceSearchTool] Received input:`, input);
      
      // Parse input
      let parsedInput: ReferenceSearchInput;
      try {
        const inputObj = typeof input === 'string' ? JSON.parse(input) : input;
        parsedInput = ReferenceSearchInputSchema.parse(inputObj);
      } catch (parseError: any) {
        console.error('[ReferenceSearchTool] Input parsing failed:', parseError);
        return JSON.stringify({
          success: false,
          error: `Invalid input format: ${parseError.message}`,
          results: []
        });
      }

      console.log(`[ReferenceSearchTool] Parsed input:`, parsedInput);

      // Determine which connectors to use
      const connectorsToSearch: BaseConnector[] = [];
      
      if (parsedInput.provider) {
        // Specific provider requested
        const connector = this.connectors.get(parsedInput.provider);
        if (connector && connector.isEnabled() && connector.isConnected()) {
          connectorsToSearch.push(connector);
        } else {
          return JSON.stringify({
            success: false,
            error: `${parsedInput.provider} connector not available or not connected`,
            results: []
          });
        }
      } else {
        // Search all available connectors
        this.connectors.forEach((connector) => {
          if (connector.isEnabled() && connector.isConnected()) {
            connectorsToSearch.push(connector);
          }
        });
      }

      if (connectorsToSearch.length === 0) {
        return JSON.stringify({
          success: false,
          error: 'No reference connectors are available or connected',
          results: []
        });
      }

      console.log(`[ReferenceSearchTool] Searching ${connectorsToSearch.length} connector(s)`);

      // Build search options - map from tool input to connector-specific options
      const searchOptions: SearchOptions = {
        query: parsedInput.query,
        maxResults: parsedInput.maxResults,
        sortBy: parsedInput.sortBy,
        filters: {}
      };

      // Add provider-specific filters
      if (parsedInput.author) {
        searchOptions.filters!.author = parsedInput.author;
      }
      if (parsedInput.title) {
        searchOptions.filters!.title = parsedInput.title;
      }
      if (parsedInput.year) {
        searchOptions.filters!.year = parsedInput.year;
      }
      if (parsedInput.type) {
        searchOptions.filters!.itemType = parsedInput.type;
      }
      if (parsedInput.tag) {
        searchOptions.filters!.tag = parsedInput.tag;
      }
      if (parsedInput.collection) {
        searchOptions.filters!.collection = parsedInput.collection;
      }

      // Search all connectors in parallel
      const searchPromises = connectorsToSearch.map(async (connector) => {
        try {
          const result = await connector.search<RefHit>(searchOptions);
          return {
            provider: connector.getConfig().provider,
            ...result
          };
        } catch (error: any) {
          console.error(`[ReferenceSearchTool] Search failed for ${connector.getConfig().provider}:`, error);
          return {
            provider: connector.getConfig().provider,
            success: false,
            data: [],
            error: error.message
          };
        }
      });

      const searchResults = await Promise.all(searchPromises);

      // Combine and format results
      const allReferences: (RefHit & { searchProvider: string })[] = [];
      let totalSearched = 0;
      const errors: string[] = [];

      for (const result of searchResults) {
        totalSearched++;
        if (result.success && result.data) {
          // Add provider info to each reference
          const providerRefs = result.data.map(ref => ({
            ...ref,
            searchProvider: result.provider
          }));
          allReferences.push(...providerRefs);
        } else if (result.error) {
          errors.push(`${result.provider}: ${result.error}`);
        }
      }

      // Sort results based on sortBy parameter
      this.sortReferences(allReferences, parsedInput.sortBy);

      // Limit total results
      const limitedReferences = allReferences.slice(0, parsedInput.maxResults);

      console.log(`[ReferenceSearchTool] Found ${limitedReferences.length} references from ${totalSearched} provider(s)`);

      // Format response with additional metadata
      const response = {
        success: true,
        results: limitedReferences.map(ref => this.enrichReference(ref)),
        metadata: {
          totalResults: limitedReferences.length,
          searchedProviders: searchResults.map(r => r.provider),
          query: parsedInput.query,
          sortBy: parsedInput.sortBy,
          hasMore: allReferences.length > limitedReferences.length,
          breakdown: this.getProviderBreakdown(limitedReferences)
        },
        errors: errors.length > 0 ? errors : undefined
      };

      return JSON.stringify(response, null, 2);

    } catch (error: any) {
      console.error('[ReferenceSearchTool] Tool execution failed:', error);
      return JSON.stringify({
        success: false,
        error: `Reference search failed: ${error.message}`,
        results: []
      });
    }
  }

  /**
   * Sort references based on the specified criteria
   */
  private sortReferences(references: (RefHit & { searchProvider: string })[], sortBy: string): void {
    switch (sortBy) {
      case 'title':
        references.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'year':
        references.sort((a, b) => {
          const yearA = typeof a.year === 'number' ? a.year : parseInt(String(a.year)) || 0;
          const yearB = typeof b.year === 'number' ? b.year : parseInt(String(b.year)) || 0;
          return yearB - yearA; // Newer first
        });
        break;
      case 'created':
        // For created date, we don't have that field, so fall back to relevance
      case 'relevance':
      default:
        // Keep original order (relevance from each provider)
        break;
    }
  }

  /**
   * Enrich reference with additional information
   */
  private enrichReference(ref: RefHit & { searchProvider: string }): any {
    const enriched = {
      ...ref,
      // Add citation format helper
      citation: this.generateSimpleCitation(ref),
      // Add search context
      source: `${ref.searchProvider} library`
    };

    return enriched;
  }

  /**
   * Generate a simple citation for the reference
   */
  private generateSimpleCitation(ref: RefHit): string {
    let citation = '';
    
    if (ref.creators && ref.creators.length > 0) {
      if (ref.creators.length === 1) {
        citation += ref.creators[0];
      } else if (ref.creators.length === 2) {
        citation += `${ref.creators[0]} & ${ref.creators[1]}`;
      } else {
        citation += `${ref.creators[0]} et al.`;
      }
    }
    
    if (ref.year) {
      citation += citation ? ` (${ref.year}). ` : `(${ref.year}). `;
    } else {
      citation += citation ? '. ' : '';
    }
    
    citation += ref.title;
    
    if (ref.type && ref.type !== 'unknown') {
      citation += ` [${ref.type}]`;
    }
    
    return citation;
  }

  /**
   * Get breakdown of results by provider
   */
  private getProviderBreakdown(references: (RefHit & { searchProvider: string })[]): Record<string, number> {
    const breakdown: Record<string, number> = {};
    
    for (const ref of references) {
      breakdown[ref.searchProvider] = (breakdown[ref.searchProvider] || 0) + 1;
    }
    
    return breakdown;
  }

  /**
   * Add a connector
   */
  addConnector(provider: 'zotero' | 'mendeley', connector: BaseConnector): void {
    this.connectors.set(provider, connector);
    console.log(`[ReferenceSearchTool] Added ${provider} connector`);
  }

  /**
   * Remove a connector
   */
  removeConnector(provider: 'zotero' | 'mendeley'): void {
    this.connectors.delete(provider);
    console.log(`[ReferenceSearchTool] Removed ${provider} connector`);
  }

  /**
   * Get status of all connectors
   */
  getConnectorStatus(): Record<string, { available: boolean; connected: boolean; enabled: boolean }> {
    const status: Record<string, { available: boolean; connected: boolean; enabled: boolean }> = {};
    
    this.connectors.forEach((connector, provider) => {
      status[provider] = {
        available: true,
        connected: connector.isConnected(),
        enabled: connector.isEnabled()
      };
    });

    // Add missing providers
    const allProviders = ['zotero', 'mendeley'];
    for (const provider of allProviders) {
      if (!status[provider]) {
        status[provider] = { available: false, connected: false, enabled: false };
      }
    }

    return status;
  }

  /**
   * Get available collections from all connected providers
   */
  async getAvailableCollections(): Promise<Record<string, Array<{ id: string; name: string; count?: number }>>> {
    const collections: Record<string, Array<{ id: string; name: string; count?: number }>> = {};
    
    const promises: Promise<void>[] = [];
    
    this.connectors.forEach((connector, provider) => {
      if (!connector.isConnected()) return;
      
      const promise = (async () => {
        try {
          if (provider === 'zotero' && connector instanceof ZoteroConnector) {
            const zoteroCollections = await connector.getCollections();
            collections.zotero = zoteroCollections.map(col => ({
              id: col.key,
              name: col.name,
              count: col.itemCount
            }));
          } else if (provider === 'mendeley' && connector instanceof MendeleyConnector) {
            const mendeleyFolders = await connector.getFolders();
            collections.mendeley = mendeleyFolders.map(folder => ({
              id: folder.id,
              name: folder.name,
              count: folder.documentCount
            }));
          }
        } catch (error: any) {
          console.warn(`[ReferenceSearchTool] Failed to get collections from ${provider}:`, error);
          collections[provider] = [];
        }
      })();
      
      promises.push(promise);
    });
    
    await Promise.all(promises);
    return collections;
  }
}

/**
 * Create and configure reference search tool specification
 */
export function createReferenceSearchTool(connectors?: { 
  zotero?: ZoteroConnector; 
  mendeley?: MendeleyConnector; 
}): ToolSpecification {
  const tool = new ReferenceSearchTool(connectors);
  
  const specification: ToolSpecification = {
    name: 'reference_search',
    description: tool.description,
    parameters: {
      type: 'object',
      properties: {
        query: { 
          type: 'string', 
          description: 'Search query to find academic references (searches title, authors, abstract, and keywords)' 
        },
        provider: { 
          type: 'string',
          enum: ['zotero', 'mendeley'],
          description: 'Specific reference manager to search (optional, will search all if not specified)' 
        },
        maxResults: { 
          type: 'number', 
          description: 'Maximum number of references to return (1-25, default: 10)',
          default: 10
        },
        author: { 
          type: 'string', 
          description: 'Filter by author name' 
        },
        title: { 
          type: 'string', 
          description: 'Filter by title text' 
        },
        year: { 
          type: 'number', 
          description: 'Filter by publication year' 
        },
        type: { 
          type: 'string', 
          description: 'Filter by document type (e.g., journalArticle, book, conferencePaper)' 
        },
        tag: { 
          type: 'string', 
          description: 'Filter by tag or keyword' 
        },
        collection: { 
          type: 'string', 
          description: 'Filter by collection/folder ID' 
        },
        sortBy: { 
          type: 'string',
          enum: ['relevance', 'title', 'year', 'created'],
          description: 'Sort results by specified criteria',
          default: 'relevance'
        }
      },
      required: ['query']
    },
    tool,
    metadata: {
      category: ToolCategory.SEARCH,
      version: '1.0.0',
      requiresAuth: true,
      tags: ['reference', 'zotero', 'mendeley', 'academic', 'search', 'research', 'bibliography'],
      rateLimit: {
        requestsPerMinute: 15, // More generous for reference searches
        requestsPerDay: 200
      }
    },
    config: {
      maxResults: 10,
      timeout: 20000 // Longer timeout for reference searches
    }
  };
  
  return specification;
}