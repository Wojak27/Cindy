/**
 * Mendeley Connector for reference management integration
 * Uses Mendeley API v1 with OAuth 2.0 authentication
 */

import { BaseConnector } from './BaseConnector';
import { ConnectorCredentials, ConnectorConfig, SearchOptions, ConnectorResponse, RefHit } from './types';
import { z } from 'zod';

// Validation schemas
const MendeleyCredentialsSchema = z.object({
  provider: z.literal('mendeley'),
  tokens: z.object({
    access_token: z.string(),
    refresh_token: z.string().optional(),
    expires_at: z.number().optional(),
    token_type: z.string().default('Bearer'),
    scope: z.string().optional()
  }),
  config: z.object({
    client_id: z.string(),
    client_secret: z.string(),
    redirect_uri: z.string().default('http://localhost:8080/oauth/callback'),
    baseUrl: z.string().default('https://api.mendeley.com/v1')
  }).optional()
});

const MendeleySearchOptionsSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  maxResults: z.number().min(1).max(25).default(10),
  author: z.string().optional(),
  title: z.string().optional(),
  year: z.number().optional(),
  source: z.string().optional(), // Journal/source name
  tag: z.string().optional(),
  folderId: z.string().optional(), // Mendeley folder ID
  sortBy: z.enum(['relevance', 'title', 'year', 'created']).default('relevance'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

export class MendeleyConnector extends BaseConnector {
  private accessToken: string | null = null;
  private baseUrl: string = 'https://api.mendeley.com/v1';
  
  // Mendeley OAuth scopes
  private static readonly SCOPES = [
    'library.read',
    'documents.read',
    'folders.read',
    'annotations.read'
  ];

  // Mendeley OAuth endpoints
  private static readonly AUTH_URL = 'https://api.mendeley.com/oauth/authorize';
  private static readonly TOKEN_URL = 'https://api.mendeley.com/oauth/token';

  constructor(config: ConnectorConfig = { provider: 'mendeley', enabled: true, connected: false }) {
    super('mendeley', config);
    console.log('[MendeleyConnector] Initialized');
  }

  /**
   * Validate Mendeley credentials and test API connection
   */
  protected async validateCredentials(): Promise<void> {
    if (!this.credentials) {
      throw new Error('No credentials provided');
    }

    try {
      // Validate credential structure
      const validatedCredentials = MendeleyCredentialsSchema.parse(this.credentials);
      console.log('[MendeleyConnector] Credentials validated successfully');

      // Set access token
      this.accessToken = validatedCredentials.tokens.access_token;
      this.baseUrl = validatedCredentials.config?.baseUrl || 'https://api.mendeley.com/v1';

      // Test connection with profile API call
      const profileInfo = await this.getUserInfo();
      console.log(`[MendeleyConnector] Successfully connected to Mendeley for user: ${profileInfo.name || 'Unknown'}`);
    } catch (error: any) {
      console.error('[MendeleyConnector] Credential validation failed:', error);
      
      if (error.status === 401 || error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        // Try to refresh token if available
        if (await this.refreshCredentials?.()) {
          console.log('[MendeleyConnector] Token refreshed successfully, retrying validation');
          return this.validateCredentials();
        }
        throw new Error('Mendeley authentication failed. Token may be expired or invalid.');
      }
      
      throw new Error(`Mendeley connector validation failed: ${error.message}`);
    }
  }

  /**
   * Refresh OAuth tokens
   */
  protected async refreshCredentials(): Promise<boolean> {
    if (!this.credentials?.tokens?.refresh_token) {
      console.warn('[MendeleyConnector] Cannot refresh - no refresh token');
      return false;
    }

    try {
      console.log('[MendeleyConnector] Refreshing OAuth tokens...');
      
      const clientId = this.credentials.config?.client_id || process.env.MENDELEY_CLIENT_ID;
      const clientSecret = this.credentials.config?.client_secret || process.env.MENDELEY_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) {
        throw new Error('Mendeley Client ID and Secret are required for token refresh');
      }

      const tokenResponse = await fetch(MendeleyConnector.TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.credentials.tokens.refresh_token,
          scope: MendeleyConnector.SCOPES.join(' ')
        })
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        throw new Error(`Token refresh failed: ${tokenResponse.status} ${errorData}`);
      }

      const tokenData = await tokenResponse.json();
      
      // Update stored credentials
      this.credentials.tokens.access_token = tokenData.access_token;
      if (tokenData.refresh_token) {
        this.credentials.tokens.refresh_token = tokenData.refresh_token;
      }
      if (tokenData.expires_in) {
        this.credentials.tokens.expires_at = Date.now() + (tokenData.expires_in * 1000);
      }

      // Update access token
      this.accessToken = tokenData.access_token;

      console.log('[MendeleyConnector] Tokens refreshed successfully');
      this.emit('credentialsRefreshed', { provider: 'mendeley', credentials: this.credentials });
      return true;
    } catch (error: any) {
      console.error('[MendeleyConnector] Token refresh failed:', error);
      this.emit('error', { 
        provider: 'mendeley', 
        error: 'Token refresh failed', 
        fatal: true 
      });
      return false;
    }
  }

  /**
   * Perform Mendeley search
   */
  protected async performSearch(options: SearchOptions): Promise<ConnectorResponse<RefHit>> {
    if (!this.accessToken) {
      throw new Error('Mendeley API not initialized');
    }

    try {
      // Validate and parse search options
      this.validateSearchOptions(options);
      const validatedOptions = MendeleySearchOptionsSchema.parse(options);
      
      console.log(`[MendeleyConnector] Searching Mendeley with query: "${validatedOptions.query}"`);

      // Build API URL and parameters
      const searchUrl = new URL(`${this.baseUrl}/search/catalog`);
      const searchParams = this.buildMendeleyParams(validatedOptions);
      
      Object.entries(searchParams).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          searchUrl.searchParams.set(key, String(value));
        }
      });

      console.log(`[MendeleyConnector] Mendeley API URL: ${searchUrl.toString()}`);

      // Make API request
      const response = await this.makeMendeleyRequest(searchUrl.toString());
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Mendeley API request failed: ${response.status} ${errorText}`);
      }

      const searchResults = await response.json();
      const documents = searchResults.documents || searchResults || [];
      
      console.log(`[MendeleyConnector] Found ${documents.length} document(s)`);

      if (documents.length === 0) {
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
      const refHits: RefHit[] = documents
        .map((doc: any) => this.convertToRefHit(doc))
        .filter((hit: RefHit | null) => hit !== null) as RefHit[];

      console.log(`[MendeleyConnector] Successfully processed ${refHits.length} references`);

      // Check for pagination
      const hasMore = documents.length === validatedOptions.maxResults;

      return {
        success: true,
        data: refHits,
        metadata: {
          totalResults: refHits.length,
          hasMore: hasMore,
          searchTime: Date.now()
        }
      };

    } catch (error: any) {
      console.error('[MendeleyConnector] Search failed:', error);
      
      // Check if it's an authentication error
      if (error.status === 401 || error.message?.includes('401')) {
        if (await this.refreshCredentials?.()) {
          console.log('[MendeleyConnector] Retrying search after token refresh');
          return this.performSearch(options);
        }
      }

      return {
        success: false,
        data: [],
        error: `Mendeley search failed: ${error.message}`
      };
    }
  }

  /**
   * Build Mendeley API parameters
   */
  private buildMendeleyParams(options: z.infer<typeof MendeleySearchOptionsSchema>): Record<string, any> {
    const params: Record<string, any> = {
      limit: options.maxResults,
      view: 'stats' // Include citation stats
    };

    // Main search query
    if (options.query) {
      params.query = options.query;
    }

    // Specific field searches
    if (options.author) {
      params.author = options.author;
    }

    if (options.title) {
      params.title = options.title;
    }

    if (options.year) {
      params.year = options.year;
    }

    if (options.source) {
      params.source = options.source;
    }

    if (options.tag) {
      params.tag = options.tag;
    }

    // Sorting
    if (options.sortBy && options.sortBy !== 'relevance') {
      params.sort = options.sortBy;
      params.order = options.sortOrder;
    }

    return params;
  }

  /**
   * Make authenticated request to Mendeley API
   */
  private async makeMendeleyRequest(url: string): Promise<Response> {
    return await this.withTimeout(
      fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/vnd.mendeley-document.1+json',
          'User-Agent': 'Cindy-Voice-Assistant/1.0'
        }
      }),
      this.config.timeout!
    );
  }

  /**
   * Convert Mendeley document to RefHit format
   */
  private convertToRefHit(doc: any): RefHit | null {
    try {
      if (!doc) {
        return null;
      }

      // Extract title
      let title = doc.title || 'Untitled';

      // Extract creators/authors
      const creators: string[] = [];
      if (doc.authors && Array.isArray(doc.authors)) {
        doc.authors.forEach((author: any) => {
          if (author.first_name && author.last_name) {
            creators.push(`${author.first_name} ${author.last_name}`);
          } else if (author.name) {
            creators.push(author.name);
          } else if (author.last_name) {
            creators.push(author.last_name);
          }
        });
      }

      // Extract year
      let year: string | number | undefined;
      if (doc.year) {
        year = doc.year;
      } else if (doc.published) {
        const dateMatch = doc.published.match(/\b(19|20)\d{2}\b/);
        if (dateMatch) {
          year = parseInt(dateMatch[0]);
        }
      }

      // Extract document type
      let type = doc.type || 'unknown';
      
      // Map Mendeley types to more readable names
      const typeMap: Record<string, string> = {
        'journal': 'Journal Article',
        'book': 'Book',
        'book_section': 'Book Chapter',
        'conference_proceedings': 'Conference Paper',
        'thesis': 'Thesis',
        'patent': 'Patent',
        'web_page': 'Web Page',
        'report': 'Report',
        'working_paper': 'Working Paper',
        'generic': 'Document'
      };
      
      if (typeMap[type]) {
        type = typeMap[type];
      }

      const refHit: RefHit = {
        id: doc.id || doc.uuid || 'unknown',
        title: this.truncateText(title, 150),
        year: year,
        type: type,
        creators: creators.length > 0 ? creators : undefined,
        provider: 'mendeley'
      };

      return refHit;
    } catch (error: any) {
      console.error('[MendeleyConnector] Error converting document to RefHit:', error);
      return null;
    }
  }

  /**
   * Get OAuth authorization URL for initial setup
   */
  getAuthUrl(): string {
    const clientId = this.credentials?.config?.client_id || process.env.MENDELEY_CLIENT_ID;
    const redirectUri = this.credentials?.config?.redirect_uri || 'http://localhost:8080/oauth/callback';
    
    if (!clientId) {
      throw new Error('Mendeley Client ID not configured');
    }

    const authUrl = new URL(MendeleyConnector.AUTH_URL);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', MendeleyConnector.SCOPES.join(' '));

    return authUrl.toString();
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string): Promise<ConnectorCredentials> {
    try {
      const clientId = this.credentials?.config?.client_id || process.env.MENDELEY_CLIENT_ID;
      const clientSecret = this.credentials?.config?.client_secret || process.env.MENDELEY_CLIENT_SECRET;
      const redirectUri = this.credentials?.config?.redirect_uri || 'http://localhost:8080/oauth/callback';

      if (!clientId || !clientSecret) {
        throw new Error('Mendeley Client ID and Secret are required');
      }

      const tokenResponse = await fetch(MendeleyConnector.TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri,
          scope: MendeleyConnector.SCOPES.join(' ')
        })
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        throw new Error(`Token exchange failed: ${tokenResponse.status} ${errorData}`);
      }

      const tokenData = await tokenResponse.json();
      
      const credentials: ConnectorCredentials = {
        provider: 'mendeley',
        tokens: {
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_at: Date.now() + (tokenData.expires_in * 1000),
          token_type: tokenData.token_type || 'Bearer',
          scope: tokenData.scope
        }
      };

      console.log('[MendeleyConnector] Successfully exchanged code for tokens');
      return credentials;
    } catch (error: any) {
      console.error('[MendeleyConnector] Token exchange failed:', error);
      throw new Error(`Failed to exchange authorization code: ${error.message}`);
    }
  }

  /**
   * Get user profile information
   */
  async getUserInfo(): Promise<{ email?: string; name?: string; id?: string }> {
    if (!this.accessToken) {
      throw new Error('Mendeley API not initialized');
    }

    try {
      const response = await this.makeMendeleyRequest(`${this.baseUrl}/profiles/me`);
      
      if (!response.ok) {
        throw new Error(`Failed to get user profile: ${response.status} ${response.statusText}`);
      }

      const profile = await response.json();
      
      return {
        id: profile.id,
        name: profile.display_name || profile.first_name + ' ' + profile.last_name || 'Unknown',
        email: profile.email
      };
    } catch (error: any) {
      console.error('[MendeleyConnector] Failed to get user info:', error);
      throw new Error(`Failed to get user information: ${error.message}`);
    }
  }

  /**
   * Get user library statistics
   */
  async getLibraryStats(): Promise<{ documentCount: number; folderCount: number }> {
    if (!this.accessToken) {
      throw new Error('Mendeley API not initialized');
    }

    try {
      // Get document count - make a small request and check headers
      const docsResponse = await this.makeMendeleyRequest(`${this.baseUrl}/documents?limit=1`);
      const documentCount = parseInt(docsResponse.headers.get('X-Total-Count') || '0');

      // Get folder count
      const foldersResponse = await this.makeMendeleyRequest(`${this.baseUrl}/folders?limit=1`);
      const folderCount = parseInt(foldersResponse.headers.get('X-Total-Count') || '0');

      return { documentCount, folderCount };
    } catch (error: any) {
      console.warn('[MendeleyConnector] Failed to get library stats:', error);
      return { documentCount: 0, folderCount: 0 };
    }
  }

  /**
   * Test the connector with a simple search
   */
  async test(): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log('[MendeleyConnector] Running connector test...');
      
      if (!this.isConnected()) {
        return {
          success: false,
          message: 'Connector not connected. Please configure Mendeley OAuth credentials.'
        };
      }

      // Test with a simple search
      const testResult = await this.search({ 
        query: 'machine learning', // Generic search term
        maxResults: 3 
      });

      if (testResult.success) {
        const userInfo = await this.getUserInfo();
        const stats = await this.getLibraryStats();
        
        return {
          success: true,
          message: `Mendeley connector working! Found ${testResult.data.length} references for ${userInfo.name}`,
          data: {
            userId: userInfo.id,
            userName: userInfo.name,
            userEmail: userInfo.email,
            libraryStats: stats,
            sampleResults: testResult.data.length,
            firstRefTitle: (testResult.data[0] as RefHit)?.title || 'N/A'
          }
        };
      } else {
        return {
          success: false,
          message: `Mendeley connector test failed: ${testResult.error}`
        };
      }
    } catch (error: any) {
      console.error('[MendeleyConnector] Test failed:', error);
      return {
        success: false,
        message: `Mendeley connector test failed: ${error.message}`
      };
    }
  }

  /**
   * Get available folders for UI display
   */
  async getFolders(): Promise<Array<{ id: string; name: string; documentCount?: number }>> {
    if (!this.accessToken) {
      throw new Error('Mendeley API not initialized');
    }

    try {
      const response = await this.makeMendeleyRequest(`${this.baseUrl}/folders`);
      
      if (!response.ok) {
        throw new Error(`Failed to get folders: ${response.status}`);
      }

      const folders = await response.json();
      
      return folders.map((folder: any) => ({
        id: folder.id,
        name: folder.name || 'Unnamed Folder',
        documentCount: folder.document_count
      }));
    } catch (error: any) {
      console.error('[MendeleyConnector] Failed to get folders:', error);
      return [];
    }
  }
}