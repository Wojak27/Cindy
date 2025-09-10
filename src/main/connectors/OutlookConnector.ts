/**
 * Outlook Connector for Microsoft Graph API email search integration
 * Uses Microsoft Graph API v1.0 with OAuth 2.0 authentication
 */

// Use stubs for compilation when dependencies are not available
let Client: any;

try {
  const microsoftGraph = require('@microsoft/microsoft-graph-client');
  Client = microsoftGraph.Client;
} catch {
  const stub = require('../stubs/microsoft-graph-client');
  Client = stub.Client;
}
import { BaseConnector } from './BaseConnector.ts';
import { ConnectorCredentials, ConnectorConfig, SearchOptions, ConnectorResponse, EmailHit } from './types.ts';
import { z } from 'zod';

// Validation schemas
const OutlookCredentialsSchema = z.object({
  provider: z.literal('outlook'),
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
    tenant: z.string().default('common') // common, organizations, or specific tenant ID
  }).optional()
});

const OutlookSearchOptionsSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  maxResults: z.number().min(1).max(25).default(10),
  from: z.string().optional(),
  to: z.string().optional(),
  subject: z.string().optional(),
  hasAttachment: z.boolean().optional(),
  isUnread: z.boolean().optional(),
  folderId: z.string().optional(), // inbox, sentitems, drafts, deleteditems
  after: z.string().optional(), // ISO date string
  before: z.string().optional() // ISO date string
});

/**
 * Custom authentication provider for Microsoft Graph Client
 */
class OutlookAuthProvider {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  async getAccessToken(): Promise<string> {
    return this.accessToken;
  }

  updateAccessToken(newToken: string): void {
    this.accessToken = newToken;
  }
}

export class OutlookConnector extends BaseConnector {
  private authProvider: OutlookAuthProvider | null = null;
  private graphClient: any = null;

  // Microsoft Graph OAuth scopes
  private static readonly SCOPES = [
    'https://graph.microsoft.com/Mail.Read',
    'https://graph.microsoft.com/User.Read'
  ];

  // Microsoft Graph endpoints
  private static readonly AUTHORITY_URL = 'https://login.microsoftonline.com';

  constructor(config: ConnectorConfig = { provider: 'outlook', enabled: true, connected: false }) {
    super('outlook', config);
    console.log('[OutlookConnector] Initialized');
  }

  /**
   * Validate Outlook credentials and initialize Graph client
   */
  protected async validateCredentials(): Promise<void> {
    if (!this.credentials) {
      throw new Error('No credentials provided');
    }

    try {
      // Validate credential structure
      const validatedCredentials = OutlookCredentialsSchema.parse(this.credentials);
      console.log('[OutlookConnector] Credentials validated successfully');

      // Initialize authentication provider
      this.authProvider = new OutlookAuthProvider(validatedCredentials.tokens.access_token);

      // Initialize Microsoft Graph client
      this.graphClient = Client.initWithMiddleware({
        authProvider: this.authProvider
      });

      // Test connection with a minimal API call
      await this.graphClient.api('/me').get();

      console.log('[OutlookConnector] Successfully connected to Microsoft Graph API');
    } catch (error: any) {
      console.error('[OutlookConnector] Credential validation failed:', error);

      if (error.code === 'InvalidAuthenticationToken' || error.status === 401) {
        // Try to refresh token if available
        if (await this.refreshCredentials?.()) {
          console.log('[OutlookConnector] Token refreshed successfully, retrying validation');
          return this.validateCredentials();
        }
        throw new Error('Outlook authentication failed. Token may be expired or invalid.');
      }

      throw new Error(`Outlook connector validation failed: ${error.message}`);
    }
  }

  /**
   * Refresh OAuth tokens
   */
  protected async refreshCredentials(): Promise<boolean> {
    if (!this.credentials?.tokens?.refresh_token) {
      console.warn('[OutlookConnector] Cannot refresh - no refresh token');
      return false;
    }

    try {
      console.log('[OutlookConnector] Refreshing OAuth tokens...');

      const tenantId = this.credentials.config?.tenant || 'common';
      const tokenUrl = `${OutlookConnector.AUTHORITY_URL}/${tenantId}/oauth2/v2.0/token`;

      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: this.credentials.config?.client_id || process.env.MICROSOFT_CLIENT_ID || '',
          client_secret: this.credentials.config?.client_secret || process.env.MICROSOFT_CLIENT_SECRET || '',
          grant_type: 'refresh_token',
          refresh_token: this.credentials.tokens.refresh_token,
          scope: OutlookConnector.SCOPES.join(' ')
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

      // Update auth provider
      if (this.authProvider) {
        this.authProvider.updateAccessToken(tokenData.access_token);
      }

      console.log('[OutlookConnector] Tokens refreshed successfully');
      this.emit('credentialsRefreshed', { provider: 'outlook', credentials: this.credentials });
      return true;
    } catch (error: any) {
      console.error('[OutlookConnector] Token refresh failed:', error);
      this.emit('error', {
        provider: 'outlook',
        error: 'Token refresh failed',
        fatal: true
      });
      return false;
    }
  }

  /**
   * Perform Outlook/Graph API search
   */
  protected async performSearch(options: SearchOptions): Promise<ConnectorResponse<EmailHit>> {
    if (!this.graphClient) {
      throw new Error('Microsoft Graph client not initialized');
    }

    try {
      // Validate and parse search options
      this.validateSearchOptions(options);
      const validatedOptions = OutlookSearchOptionsSchema.parse(options);

      console.log(`[OutlookConnector] Searching Outlook with query: "${validatedOptions.query}"`);

      // Build Graph API search parameters
      const { searchQuery, filterQuery } = this.buildGraphQuery(validatedOptions);
      console.log(`[OutlookConnector] Graph search query: "${searchQuery}", filter: "${filterQuery}"`);

      // Determine folder path
      const folderPath = validatedOptions.folderId ?
        `/me/mailFolders/${validatedOptions.folderId}/messages` :
        '/me/messages';

      // Build Graph API request
      let request = this.graphClient
        .api(folderPath)
        .top(validatedOptions.maxResults)
        .select('id,subject,from,receivedDateTime,bodyPreview,hasAttachments,isRead')
        .orderby('receivedDateTime desc');

      // Add search query if provided
      if (searchQuery) {
        request = request.search(searchQuery);
      }

      // Add filter query if provided
      if (filterQuery) {
        request = request.filter(filterQuery);
      }

      // Execute search
      const response = await request.get();
      const messages = response.value || [];

      console.log(`[OutlookConnector] Found ${messages.length} message(s)`);

      if (messages.length === 0) {
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

      // Convert to EmailHit format
      const emailHits: EmailHit[] = messages.map((message: any) => {
        const emailHit: EmailHit = {
          id: message.id,
          subject: this.truncateText(message.subject || 'No Subject', 100),
          from: this.extractEmailAddress(message.from?.emailAddress?.address || 'Unknown'),
          date: this.normalizeDate(message.receivedDateTime || new Date().toISOString()),
          snippet: this.truncateText(this.stripHtml(message.bodyPreview || ''), 200),
          provider: 'outlook'
        };
        return emailHit;
      });

      console.log(`[OutlookConnector] Successfully processed ${emailHits.length} emails`);

      return {
        success: true,
        data: emailHits,
        metadata: {
          totalResults: emailHits.length,
          hasMore: response['@odata.nextLink'] ? true : false,
          nextPageToken: response['@odata.nextLink'],
          searchTime: Date.now()
        }
      };

    } catch (error: any) {
      console.error('[OutlookConnector] Search failed:', error);

      // Check if it's an authentication error
      if (error.code === 'InvalidAuthenticationToken' || error.status === 401) {
        if (await this.refreshCredentials?.()) {
          console.log('[OutlookConnector] Retrying search after token refresh');
          return this.performSearch(options);
        }
      }

      return {
        success: false,
        data: [],
        error: `Outlook search failed: ${error.message}`
      };
    }
  }

  /**
   * Build Microsoft Graph search query and filter from options
   */
  private buildGraphQuery(options: z.infer<typeof OutlookSearchOptionsSchema>): {
    searchQuery: string;
    filterQuery: string;
  } {
    let searchQuery = options.query;
    const filters: string[] = [];

    // Add OData filters
    if (options.from) {
      filters.push(`from/emailAddress/address eq '${options.from}'`);
    }
    if (options.to) {
      // Note: Graph API doesn't have a simple 'to' filter, would need recipients
      console.warn('[OutlookConnector] "to" filter not implemented for Graph API');
    }
    if (options.subject) {
      filters.push(`contains(subject,'${options.subject}')`);
    }
    if (options.hasAttachment !== undefined) {
      filters.push(`hasAttachments eq ${options.hasAttachment}`);
    }
    if (options.isUnread !== undefined) {
      filters.push(`isRead eq ${!options.isUnread}`);
    }
    if (options.after) {
      filters.push(`receivedDateTime ge ${options.after}`);
    }
    if (options.before) {
      filters.push(`receivedDateTime le ${options.before}`);
    }

    const filterQuery = filters.length > 0 ? filters.join(' and ') : '';

    return { searchQuery, filterQuery };
  }

  /**
   * Extract email address from various formats
   */
  private extractEmailAddress(emailInfo: any): string {
    if (typeof emailInfo === 'string') {
      return emailInfo;
    }

    if (emailInfo?.address) {
      return emailInfo.address;
    }

    if (emailInfo?.emailAddress?.address) {
      return emailInfo.emailAddress.address;
    }

    return 'Unknown';
  }

  /**
   * Get OAuth authorization URL for initial setup
   */
  getAuthUrl(): string {
    const tenantId = this.credentials?.config?.tenant || 'common';
    const clientId = this.credentials?.config?.client_id || process.env.MICROSOFT_CLIENT_ID;
    const redirectUri = this.credentials?.config?.redirect_uri || 'http://localhost:8080/oauth/callback';

    if (!clientId) {
      throw new Error('Microsoft Client ID not configured');
    }

    const authUrl = new URL(`${OutlookConnector.AUTHORITY_URL}/${tenantId}/oauth2/v2.0/authorize`);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', OutlookConnector.SCOPES.join(' '));
    authUrl.searchParams.set('response_mode', 'query');
    authUrl.searchParams.set('prompt', 'consent'); // Force consent to get refresh token

    return authUrl.toString();
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string): Promise<ConnectorCredentials> {
    try {
      const tenantId = this.credentials?.config?.tenant || 'common';
      const clientId = this.credentials?.config?.client_id || process.env.MICROSOFT_CLIENT_ID;
      const clientSecret = this.credentials?.config?.client_secret || process.env.MICROSOFT_CLIENT_SECRET;
      const redirectUri = this.credentials?.config?.redirect_uri || 'http://localhost:8080/oauth/callback';

      if (!clientId || !clientSecret) {
        throw new Error('Microsoft Client ID and Secret are required');
      }

      const tokenUrl = `${OutlookConnector.AUTHORITY_URL}/${tenantId}/oauth2/v2.0/token`;

      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri,
          scope: OutlookConnector.SCOPES.join(' ')
        })
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        throw new Error(`Token exchange failed: ${tokenResponse.status} ${errorData}`);
      }

      const tokenData = await tokenResponse.json();

      const credentials: ConnectorCredentials = {
        provider: 'outlook',
        tokens: {
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_at: Date.now() + (tokenData.expires_in * 1000),
          token_type: tokenData.token_type || 'Bearer',
          scope: tokenData.scope
        }
      };

      console.log('[OutlookConnector] Successfully exchanged code for tokens');
      return credentials;
    } catch (error: any) {
      console.error('[OutlookConnector] Token exchange failed:', error);
      throw new Error(`Failed to exchange authorization code: ${error.message}`);
    }
  }

  /**
   * Get user profile information
   */
  async getUserInfo(): Promise<{ email: string; name?: string }> {
    if (!this.graphClient) {
      throw new Error('Microsoft Graph client not initialized');
    }

    try {
      const user = await this.graphClient.api('/me').get();
      return {
        email: user.mail || user.userPrincipalName || 'Unknown',
        name: user.displayName || user.givenName
      };
    } catch (error: any) {
      console.error('[OutlookConnector] Failed to get user info:', error);
      throw new Error(`Failed to get user information: ${error.message}`);
    }
  }

  /**
   * Test the connector with a simple search
   */
  async test(): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log('[OutlookConnector] Running connector test...');

      if (!this.isConnected()) {
        return {
          success: false,
          message: 'Connector not connected. Please configure Outlook credentials.'
        };
      }

      // Test with a simple search
      const testResult = await this.search({
        query: 'inbox',
        maxResults: 3
      });

      if (testResult.success) {
        const userInfo = await this.getUserInfo();
        return {
          success: true,
          message: `Outlook connector working! Found ${testResult.data.length} recent emails for ${userInfo.email}`,
          data: {
            userEmail: userInfo.email,
            userName: userInfo.name,
            sampleResults: testResult.data.length,
            firstEmailSubject: (testResult.data[0] as EmailHit)?.subject || 'N/A'
          }
        };
      } else {
        return {
          success: false,
          message: `Outlook connector test failed: ${testResult.error}`
        };
      }
    } catch (error: any) {
      console.error('[OutlookConnector] Test failed:', error);
      return {
        success: false,
        message: `Outlook connector test failed: ${error.message}`
      };
    }
  }
}