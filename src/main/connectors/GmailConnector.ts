/**
 * Gmail Connector for email search integration
 * Uses Gmail API v1 with OAuth 2.0 authentication
 */

// Use stubs for compilation when dependencies are not available  
let google: any, OAuth2Client: any;

try {
  const googleapis = require('googleapis');
  google = googleapis.google;
} catch {
  const stub = require('../stubs/googleapis');
  google = stub.google;
}

try {
  const googleAuth = require('google-auth-library');
  OAuth2Client = googleAuth.OAuth2Client;
} catch {
  const stub = require('../stubs/google-auth-library');
  OAuth2Client = stub.OAuth2Client;
}
import { BaseConnector } from './BaseConnector';
import { ConnectorCredentials, ConnectorConfig, SearchOptions, ConnectorResponse, EmailHit } from './types';
import { z } from 'zod';

// Validation schemas
const GmailCredentialsSchema = z.object({
  provider: z.literal('gmail'),
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
    redirect_uri: z.string().default('http://localhost:8080/oauth/callback')
  }).optional()
});

const GmailSearchOptionsSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  maxResults: z.number().min(1).max(25).default(10),
  includeSpamTrash: z.boolean().default(false),
  labelIds: z.array(z.string()).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  subject: z.string().optional(),
  hasAttachment: z.boolean().optional(),
  isUnread: z.boolean().optional(),
  after: z.string().optional(), // Date string YYYY/MM/DD
  before: z.string().optional() // Date string YYYY/MM/DD
});

export class GmailConnector extends BaseConnector {
  private oauth2Client: any = null;
  private gmail: any = null;
  
  // Gmail OAuth scopes
  private static readonly SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.email'
  ];

  constructor(config: ConnectorConfig = { provider: 'gmail', enabled: true, connected: false }) {
    super('gmail', config);
    console.log('[GmailConnector] Initialized');
  }

  /**
   * Validate Gmail credentials and initialize OAuth client
   */
  protected async validateCredentials(): Promise<void> {
    if (!this.credentials) {
      throw new Error('No credentials provided');
    }

    try {
      // Validate credential structure
      const validatedCredentials = GmailCredentialsSchema.parse(this.credentials);
      console.log('[GmailConnector] Credentials validated successfully');

      // Initialize OAuth2 client
      this.oauth2Client = new OAuth2Client(
        validatedCredentials.config?.client_id || process.env.GOOGLE_CLIENT_ID,
        validatedCredentials.config?.client_secret || process.env.GOOGLE_CLIENT_SECRET,
        validatedCredentials.config?.redirect_uri || 'http://localhost:8080/oauth/callback'
      );

      // Set credentials
      this.oauth2Client.setCredentials({
        access_token: validatedCredentials.tokens.access_token,
        refresh_token: validatedCredentials.tokens.refresh_token,
        expiry_date: validatedCredentials.tokens.expires_at,
        token_type: validatedCredentials.tokens.token_type,
        scope: validatedCredentials.tokens.scope
      });

      // Initialize Gmail API client
      this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

      // Test connection with a minimal API call
      await this.gmail.users.getProfile({ userId: 'me' });
      
      console.log('[GmailConnector] Successfully connected to Gmail API');
    } catch (error: any) {
      console.error('[GmailConnector] Credential validation failed:', error);
      
      if (error.code === 401 || error.message?.includes('invalid_token')) {
        // Try to refresh token if available
        if (await this.refreshCredentials?.()) {
          console.log('[GmailConnector] Token refreshed successfully, retrying validation');
          return this.validateCredentials();
        }
        throw new Error('Gmail authentication failed. Token may be expired or invalid.');
      }
      
      throw new Error(`Gmail connector validation failed: ${error.message}`);
    }
  }

  /**
   * Refresh OAuth tokens
   */
  protected async refreshCredentials(): Promise<boolean> {
    if (!this.oauth2Client || !this.credentials?.tokens?.refresh_token) {
      console.warn('[GmailConnector] Cannot refresh - no OAuth client or refresh token');
      return false;
    }

    try {
      console.log('[GmailConnector] Refreshing OAuth tokens...');
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      
      // Update stored credentials
      if (this.credentials?.tokens) {
        this.credentials.tokens.access_token = credentials.access_token!;
        if (credentials.refresh_token) {
          this.credentials.tokens.refresh_token = credentials.refresh_token;
        }
        if (credentials.expiry_date) {
          this.credentials.tokens.expires_at = credentials.expiry_date;
        }
      }

      console.log('[GmailConnector] Tokens refreshed successfully');
      this.emit('credentialsRefreshed', { provider: 'gmail', credentials: this.credentials });
      return true;
    } catch (error: any) {
      console.error('[GmailConnector] Token refresh failed:', error);
      this.emit('error', { 
        provider: 'gmail', 
        error: 'Token refresh failed', 
        fatal: true 
      });
      return false;
    }
  }

  /**
   * Perform Gmail search
   */
  protected async performSearch(options: SearchOptions): Promise<ConnectorResponse<EmailHit>> {
    if (!this.gmail) {
      throw new Error('Gmail API not initialized');
    }

    try {
      // Validate and parse search options
      this.validateSearchOptions(options);
      const validatedOptions = GmailSearchOptionsSchema.parse(options);
      
      console.log(`[GmailConnector] Searching Gmail with query: "${validatedOptions.query}"`);

      // Build Gmail search query
      const gmailQuery = this.buildGmailQuery(validatedOptions);
      console.log(`[GmailConnector] Gmail API query: "${gmailQuery}"`);

      // Search for message IDs
      const searchResponse = await this.gmail.users.messages.list({
        userId: 'me',
        q: gmailQuery,
        maxResults: validatedOptions.maxResults,
        includeSpamTrash: validatedOptions.includeSpamTrash
      });

      const messages = searchResponse.data.messages || [];
      console.log(`[GmailConnector] Found ${messages.length} message(s)`);

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

      // Fetch message details in batches to avoid rate limits
      const emailHits: EmailHit[] = [];
      const batchSize = 5;
      
      for (let i = 0; i < messages.length; i += batchSize) {
        const batch = messages.slice(i, i + batchSize);
        const batchPromises = batch.map(message => 
          this.fetchMessageDetails(message.id!)
        );
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value) {
            emailHits.push(result.value);
          } else {
            console.warn(`[GmailConnector] Failed to fetch message ${batch[index].id}:`, 
              result.status === 'rejected' ? result.reason : 'Unknown error');
          }
        });

        // Rate limiting: small delay between batches
        if (i + batchSize < messages.length) {
          await this.sleep(100);
        }
      }

      console.log(`[GmailConnector] Successfully processed ${emailHits.length} emails`);

      return {
        success: true,
        data: emailHits,
        metadata: {
          totalResults: emailHits.length,
          hasMore: searchResponse.data.resultSizeEstimate ? 
            searchResponse.data.resultSizeEstimate > emailHits.length : false,
          nextPageToken: searchResponse.data.nextPageToken,
          searchTime: Date.now()
        }
      };

    } catch (error: any) {
      console.error('[GmailConnector] Search failed:', error);
      
      // Check if it's an authentication error
      if (error.code === 401) {
        if (await this.refreshCredentials?.()) {
          console.log('[GmailConnector] Retrying search after token refresh');
          return this.performSearch(options);
        }
      }

      return {
        success: false,
        data: [],
        error: `Gmail search failed: ${error.message}`
      };
    }
  }

  /**
   * Build Gmail API query string from search options
   */
  private buildGmailQuery(options: z.infer<typeof GmailSearchOptionsSchema>): string {
    let query = options.query;

    // Add filters
    if (options.from) {
      query += ` from:${options.from}`;
    }
    if (options.to) {
      query += ` to:${options.to}`;
    }
    if (options.subject) {
      query += ` subject:${options.subject}`;
    }
    if (options.hasAttachment) {
      query += ' has:attachment';
    }
    if (options.isUnread) {
      query += ' is:unread';
    }
    if (options.after) {
      query += ` after:${options.after}`;
    }
    if (options.before) {
      query += ` before:${options.before}`;
    }
    if (options.labelIds && options.labelIds.length > 0) {
      query += ` label:${options.labelIds.join(' label:')}`;
    }

    return query.trim();
  }

  /**
   * Fetch detailed message information
   */
  private async fetchMessageDetails(messageId: string): Promise<EmailHit | null> {
    if (!this.gmail) return null;

    try {
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date']
      });

      const message = response.data;
      const headers = message.payload?.headers || [];
      
      // Extract header values
      const fromHeader = headers.find(h => h.name?.toLowerCase() === 'from')?.value || 'Unknown';
      const subjectHeader = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || 'No Subject';
      const dateHeader = headers.find(h => h.name?.toLowerCase() === 'date')?.value || '';
      
      // Get snippet (preview text)
      const snippet = this.stripHtml(message.snippet || '');
      
      const emailHit: EmailHit = {
        id: messageId,
        subject: this.truncateText(subjectHeader, 100),
        from: this.extractEmailAddress(fromHeader),
        date: this.normalizeDate(dateHeader || new Date(parseInt(message.internalDate || '0')).toISOString()),
        snippet: this.truncateText(snippet, 200),
        provider: 'gmail'
      };

      return emailHit;
    } catch (error: any) {
      console.error(`[GmailConnector] Failed to fetch message ${messageId}:`, error);
      return null;
    }
  }

  /**
   * Extract email address from header (handles "Name <email@example.com>" format)
   */
  private extractEmailAddress(fromHeader: string): string {
    const emailMatch = fromHeader.match(/<([^>]+)>/);
    if (emailMatch) {
      return emailMatch[1];
    }
    
    // If no brackets, check if it's just an email
    if (fromHeader.includes('@')) {
      return fromHeader.trim();
    }
    
    return fromHeader; // Return as-is if we can't parse
  }

  /**
   * Get OAuth authorization URL for initial setup
   */
  getAuthUrl(): string {
    if (!this.oauth2Client) {
      // Create temporary client for auth URL generation
      this.oauth2Client = new OAuth2Client(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        'http://localhost:8080/oauth/callback'
      );
    }

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: GmailConnector.SCOPES,
      prompt: 'consent' // Force consent screen to get refresh token
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string): Promise<ConnectorCredentials> {
    if (!this.oauth2Client) {
      throw new Error('OAuth client not initialized');
    }

    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      
      const credentials: ConnectorCredentials = {
        provider: 'gmail',
        tokens: {
          access_token: tokens.access_token!,
          refresh_token: tokens.refresh_token,
          expires_at: tokens.expiry_date,
          token_type: tokens.token_type || 'Bearer',
          scope: tokens.scope
        }
      };

      console.log('[GmailConnector] Successfully exchanged code for tokens');
      return credentials;
    } catch (error: any) {
      console.error('[GmailConnector] Token exchange failed:', error);
      throw new Error(`Failed to exchange authorization code: ${error.message}`);
    }
  }

  /**
   * Get user profile information
   */
  async getUserInfo(): Promise<{ email: string; name?: string }> {
    if (!this.gmail) {
      throw new Error('Gmail API not initialized');
    }

    try {
      const profile = await this.gmail.users.getProfile({ userId: 'me' });
      return {
        email: profile.data.emailAddress || 'Unknown',
        name: profile.data.emailAddress // Gmail doesn't provide name in profile
      };
    } catch (error: any) {
      console.error('[GmailConnector] Failed to get user info:', error);
      throw new Error(`Failed to get user information: ${error.message}`);
    }
  }

  /**
   * Test the connector with a simple search
   */
  async test(): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      console.log('[GmailConnector] Running connector test...');
      
      if (!this.isConnected()) {
        return {
          success: false,
          message: 'Connector not connected. Please configure Gmail credentials.'
        };
      }

      // Test with a simple search
      const testResult = await this.search({ 
        query: 'is:inbox', 
        maxResults: 3 
      });

      if (testResult.success) {
        const userInfo = await this.getUserInfo();
        return {
          success: true,
          message: `Gmail connector working! Found ${testResult.data.length} recent emails for ${userInfo.email}`,
          data: {
            userEmail: userInfo.email,
            sampleResults: testResult.data.length,
            firstEmailSubject: (testResult.data[0] as EmailHit)?.subject || 'N/A'
          }
        };
      } else {
        return {
          success: false,
          message: `Gmail connector test failed: ${testResult.error}`
        };
      }
    } catch (error: any) {
      console.error('[GmailConnector] Test failed:', error);
      return {
        success: false,
        message: `Gmail connector test failed: ${error.message}`
      };
    }
  }
}