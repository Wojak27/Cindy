/**
 * Zotero Connector for reference management integration
 * Uses Zotero Web API with API key authentication
 */

import { BaseConnector } from './BaseConnector.ts';
import { ConnectorConfig, SearchOptions, ConnectorResponse, RefHit, ConnectorCredentials } from './types.ts';
import { z } from 'zod';

// Validation schemas
const ZoteroCredentialsSchema = z.object({
  provider: z.literal('zotero'),
  apiKey: z.string().min(1, 'Zotero API key is required'),
  userId: z.string().min(1, 'Zotero User ID is required'),
  workspaceId: z.string().optional(), // For group libraries
  config: z.object({
    baseUrl: z.string().default('https://api.zotero.org'),
    version: z.string().default('3') // API version
  }).optional()
});

const ZoteroSearchOptionsSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  maxResults: z.number().min(1).max(25).default(10),
  itemType: z.string().optional(), // book, journalArticle, webpage, etc.
  tag: z.string().optional(),
  collection: z.string().optional(), // Collection key
  since: z.number().optional(), // Unix timestamp for incremental sync
  format: z.enum(['json', 'bibtex', 'ris']).default('json')
});

export class ZoteroConnector extends BaseConnector {
  private apiKey: string | null = null;
  private userId: string | null = null;
  private workspaceId: string | null = null;
  private baseUrl: string = 'https://api.zotero.org';

  constructor(config: ConnectorConfig = { provider: 'zotero', enabled: true, connected: false }) {
    super('zotero', config);
    console.log('[ZoteroConnector] Initialized');
  }

  /**
   * Validate Zotero credentials
   */
  protected async validateCredentials(): Promise<void> {
    if (!this.credentials) {
      throw new Error('No credentials provided');
    }

    try {
      // Validate credential structure
      const validatedCredentials = ZoteroCredentialsSchema.parse(this.credentials) as ConnectorCredentials;
      console.log('[ZoteroConnector] Credentials validated successfully');

      // Set credentials
      this.apiKey = validatedCredentials.apiKey;
      this.userId = validatedCredentials.userId;
      this.workspaceId = validatedCredentials.workspaceId || null;
      this.baseUrl = validatedCredentials.config?.baseUrl || 'https://api.zotero.org';

      // Test connection with user info API call
      const userInfo = await this.getUserInfo();
      console.log(`[ZoteroConnector] Successfully connected to Zotero for user: ${userInfo.name || this.userId}`);
    } catch (error: any) {
      console.error('[ZoteroConnector] Credential validation failed:', error);

      if (error.message?.includes('403') || error.message?.includes('401')) {
        throw new Error('Zotero API key is invalid or expired.');
      }

      throw new Error(`Zotero connector validation failed: ${error.message}`);
    }
  }

  /**
   * Zotero uses API keys, so no token refresh needed
   */
  protected async refreshCredentials(): Promise<boolean> {
    console.log('[ZoteroConnector] API key authentication - no refresh needed');
    return true;
  }

  /**
   * Perform Zotero search
   */
  protected async performSearch(options: SearchOptions): Promise<ConnectorResponse<RefHit>> {
    if (!this.apiKey || !this.userId) {
      throw new Error('Zotero API not initialized');
    }

    try {
      // Validate and parse search options
      this.validateSearchOptions(options);
      const validatedOptions = ZoteroSearchOptionsSchema.parse(options);

      console.log(`[ZoteroConnector] Searching Zotero with query: "${validatedOptions.query}"`);

      // Determine library type (user or group)
      const libraryType = this.workspaceId ? 'groups' : 'users';
      const libraryId = this.workspaceId || this.userId;

      // Build API URL
      const searchUrl = new URL(`${this.baseUrl}/${libraryType}/${libraryId}/items`);

      // Add search parameters
      const searchParams = this.buildZoteroParams(validatedOptions);
      Object.entries(searchParams).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          searchUrl.searchParams.set(key, String(value));
        }
      });

      console.log(`[ZoteroConnector] Zotero API URL: ${searchUrl.toString()}`);

      // Make API request
      const response = await this.makeZoteroRequest(searchUrl.toString());

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Zotero API request failed: ${response.status} ${errorText}`);
      }

      const items = await response.json();
      console.log(`[ZoteroConnector] Found ${items.length} item(s)`);

      if (items.length === 0) {
        return {
          success: true,
          data: [],
          metadata: {
            totalResults: 0,
            hasMore: false,
            searchTime: Date.now()
          }
        };
      }

      // Convert to RefHit format
      const refHits: RefHit[] = items
        .filter((item: any) => item.data) // Skip items without data
        .map((item: any) => this.convertToRefHit(item))
        .filter((hit: RefHit | null) => hit !== null) as RefHit[];

      console.log(`[ZoteroConnector] Successfully processed ${refHits.length} references`);

      // Get rate limit info from headers
      const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');

      return {
        success: true,
        data: refHits,
        metadata: {
          totalResults: refHits.length,
          hasMore: items.length === validatedOptions.maxResults,
          rateLimitRemaining: rateLimitRemaining ? parseInt(rateLimitRemaining) : undefined,
          searchTime: Date.now()
        }
      };

    } catch (error: any) {
      console.error('[ZoteroConnector] Search failed:', error);

      return {
        success: false,
        data: [],
        error: `Zotero search failed: ${error.message}`
      };
    }
  }

  /**
   * Build Zotero API parameters
   */
  private buildZoteroParams(options: z.infer<typeof ZoteroSearchOptionsSchema>): Record<string, any> {
    const params: Record<string, any> = {
      limit: options.maxResults,
      format: options.format,
      v: '3' // API version
    };

    // Add search query - Zotero uses 'q' for general search
    if (options.query) {
      params.q = options.query;
    }

    // Add filters
    if (options.itemType) {
      params.itemType = options.itemType;
    }

    if (options.tag) {
      params.tag = options.tag;
    }

    if (options.collection) {
      params.collection = options.collection;
    }

    if (options.since) {
      params.since = options.since;
    }

    // Sort by date modified (newest first)
    params.sort = 'dateModified';
    params.direction = 'desc';

    return params;
  }

  /**
   * Make authenticated request to Zotero API
   */
  private async makeZoteroRequest(url: string): Promise<Response> {
    return await this.withTimeout(
      fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'Cindy-Voice-Assistant/1.0',
          'Content-Type': 'application/json'
        }
      }),
      this.config.timeout!
    );
  }

  /**
   * Convert Zotero item to RefHit format
   */
  private convertToRefHit(item: any): RefHit | null {
    try {
      const data = item.data;

      if (!data) {
        console.warn('[ZoteroConnector] Item missing data field');
        return null;
      }

      // Extract title from various fields
      let title = data.title || data.shortTitle || data.bookTitle || data.publicationTitle;

      if (!title && data.itemType === 'attachment') {
        title = data.filename || 'Untitled attachment';
      }

      if (!title) {
        title = 'Untitled';
      }

      // Extract creators (authors, editors, etc.)
      const creators: string[] = [];
      if (data.creators && Array.isArray(data.creators)) {
        data.creators.forEach((creator: any) => {
          if (creator.firstName && creator.lastName) {
            creators.push(`${creator.firstName} ${creator.lastName}`);
          } else if (creator.name) {
            creators.push(creator.name);
          } else if (creator.lastName) {
            creators.push(creator.lastName);
          }
        });
      }

      // Extract year from date field
      let year: string | number | undefined;
      if (data.date) {
        const dateMatch = data.date.match(/\b(19|20)\d{2}\b/);
        if (dateMatch) {
          year = parseInt(dateMatch[0]);
        } else {
          year = data.date;
        }
      }

      const refHit: RefHit = {
        id: item.key || item.data?.key || 'unknown',
        title: this.truncateText(title, 150),
        year: year,
        type: data.itemType || 'unknown',
        creators: creators.length > 0 ? creators : undefined,
        provider: 'zotero'
      };

      return refHit;
    } catch (error: any) {
      console.error('[ZoteroConnector] Error converting item to RefHit:', error);
      return null;
    }
  }

  /**
   * Get user profile information
   */
  async getUserInfo(): Promise<{ email?: string; name?: string; id: string }> {
    if (!this.apiKey || !this.userId) {
      throw new Error('Zotero API not initialized');
    }

    try {
      const response = await this.makeZoteroRequest(`${this.baseUrl}/users/${this.userId}`);

      if (!response.ok) {
        throw new Error(`Failed to get user info: ${response.status} ${response.statusText}`);
      }

      const userData = await response.json();

      return {
        id: this.userId,
        name: userData.name || userData.username,
        email: userData.email // May not be available depending on privacy settings
      };
    } catch (error: any) {
      console.error('[ZoteroConnector] Failed to get user info:', error);

      // Return minimal info if API call fails
      return {
        id: this.userId,
        name: `User ${this.userId}`
      };
    }
  }

  /**
   * Get library statistics
   */
  async getLibraryStats(): Promise<{ itemCount: number; collectionCount: number }> {
    if (!this.apiKey || !this.userId) {
      throw new Error('Zotero API not initialized');
    }

    try {
      const libraryType = this.workspaceId ? 'groups' : 'users';
      const libraryId = this.workspaceId || this.userId;

      // Get item count
      const itemsResponse = await this.makeZoteroRequest(
        `${this.baseUrl}/${libraryType}/${libraryId}/items?format=json&limit=1`
      );
      const itemCount = parseInt(itemsResponse.headers.get('Total-Results') || '0');

      // Get collection count
      const collectionsResponse = await this.makeZoteroRequest(
        `${this.baseUrl}/${libraryType}/${libraryId}/collections?format=json&limit=1`
      );
      const collectionCount = parseInt(collectionsResponse.headers.get('Total-Results') || '0');

      return { itemCount, collectionCount };
    } catch (error: any) {
      console.warn('[ZoteroConnector] Failed to get library stats:', error);
      return { itemCount: 0, collectionCount: 0 };
    }
  }

  /**
   * Test the connector with a simple search
   */
  async test(): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log('[ZoteroConnector] Running connector test...');

      if (!this.isConnected()) {
        return {
          success: false,
          message: 'Connector not connected. Please configure Zotero API key and User ID.'
        };
      }

      // Test with a simple search
      const testResult = await this.search({
        query: '', // Empty query to get recent items
        maxResults: 3
      });

      if (testResult.success) {
        const userInfo = await this.getUserInfo();
        const stats = await this.getLibraryStats();

        return {
          success: true,
          message: `Zotero connector working! Found ${testResult.data.length} recent references for ${userInfo.name}`,
          data: {
            userId: userInfo.id,
            userName: userInfo.name,
            libraryStats: stats,
            sampleResults: testResult.data.length,
            firstRefTitle: (testResult.data[0] as RefHit)?.title || 'N/A'
          }
        };
      } else {
        return {
          success: false,
          message: `Zotero connector test failed: ${testResult.error}`
        };
      }
    } catch (error: any) {
      console.error('[ZoteroConnector] Test failed:', error);
      return {
        success: false,
        message: `Zotero connector test failed: ${error.message}`
      };
    }
  }

  /**
   * Get available collections for UI display
   */
  async getCollections(): Promise<Array<{ key: string; name: string; itemCount: number }>> {
    if (!this.apiKey || !this.userId) {
      throw new Error('Zotero API not initialized');
    }

    try {
      const libraryType = this.workspaceId ? 'groups' : 'users';
      const libraryId = this.workspaceId || this.userId;

      const response = await this.makeZoteroRequest(
        `${this.baseUrl}/${libraryType}/${libraryId}/collections?format=json`
      );

      if (!response.ok) {
        throw new Error(`Failed to get collections: ${response.status}`);
      }

      const collections = await response.json();

      return collections.map((collection: any) => ({
        key: collection.key,
        name: collection.data.name || 'Unnamed Collection',
        itemCount: collection.meta?.numItems || 0
      }));
    } catch (error: any) {
      console.error('[ZoteroConnector] Failed to get collections:', error);
      return [];
    }
  }

  /**
   * Get available item types for filtering
   */
  static getItemTypes(): Array<{ value: string; label: string }> {
    return [
      { value: 'journalArticle', label: 'Journal Article' },
      { value: 'book', label: 'Book' },
      { value: 'bookSection', label: 'Book Chapter' },
      { value: 'conferencePaper', label: 'Conference Paper' },
      { value: 'thesis', label: 'Thesis' },
      { value: 'report', label: 'Report' },
      { value: 'webpage', label: 'Web Page' },
      { value: 'patent', label: 'Patent' },
      { value: 'blogPost', label: 'Blog Post' },
      { value: 'document', label: 'Document' },
      { value: 'preprint', label: 'Preprint' }
    ];
  }
}