/**
 * Connector Manager Service
 * Manages all email and reference connectors with OAuth flows
 */

import { EventEmitter } from 'events';
import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { GmailConnector } from '../connectors/GmailConnector.ts';
import { OutlookConnector } from '../connectors/OutlookConnector.ts';
import { ZoteroConnector } from '../connectors/ZoteroConnector.ts';
import { MendeleyConnector } from '../connectors/MendeleyConnector.ts';
import { BaseConnector } from '../connectors/BaseConnector.ts';
import { ConnectorCredentials, ConnectorProvider } from '../connectors/types.ts';
import * as keytar from 'keytar';

// Note: ConnectorConfigSchema removed as unused

interface ConnectorInfo {
  provider: ConnectorProvider;
  connector: BaseConnector;
  enabled: boolean;
  connected: boolean;
  lastSync?: Date;
  userInfo?: { email?: string; name?: string; id?: string };
}

export class ConnectorManagerService extends EventEmitter {
  private connectors: Map<ConnectorProvider, ConnectorInfo> = new Map();
  private server: Server | null = null;
  private readonly OAUTH_PORT = 8080;
  private readonly SERVICE_NAME = 'Cindy-Connectors';

  // OAuth state tracking
  private oauthStates: Map<string, { provider: ConnectorProvider; timestamp: number; config?: any }> = new Map();

  constructor() {
    super();
  }

  /**
   * Handle HTTP requests (OAuth callbacks and health checks)
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url!, `http://127.0.0.1:${this.OAUTH_PORT}`);

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    try {
      if (url.pathname === '/oauth/callback') {
        await this.handleOAuthCallback(url, res);
      } else if (url.pathname === '/health') {
        this.handleHealthCheck(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    } catch (error: any) {
      console.error('[ConnectorManager] Request handling error:', error);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Internal Server Error: ${error.message}`);
    }
  }

  /**
   * Handle OAuth callback
   */
  private async handleOAuthCallback(url: URL, res: ServerResponse): Promise<void> {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    console.log('[ConnectorManager] OAuth callback received:', {
      hasCode: !!code,
      state,
      hasError: !!error
    });

    if (error) {
      console.error('[ConnectorManager] OAuth error:', error);
      this.sendErrorResponse(res, 400, `Authentication failed: ${error}`);
      this.emit('oauth-error', { error: error.toString() });
      return;
    }

    if (!code || !state) {
      this.sendErrorResponse(res, 400, 'Missing authorization code or state');
      this.emit('oauth-error', { error: 'Missing authorization code or state' });
      return;
    }

    // Validate state
    const stateInfo = this.oauthStates.get(state);
    if (!stateInfo) {
      this.sendErrorResponse(res, 400, 'Invalid or expired state');
      this.emit('oauth-error', { error: 'Invalid or expired state' });
      return;
    }

    // Clean up state
    this.oauthStates.delete(state);

    try {
      // Exchange code for tokens
      const provider = stateInfo.provider;
      const connector = this.connectors.get(provider)?.connector;

      if (!connector) {
        this.sendErrorResponse(res, 500, 'Connector not found');
        this.emit('oauth-error', { error: 'Connector not found', provider });
        return;
      }

      // Get OAuth credentials from stored state or settings service
      let credentialsToUse = stateInfo.config;

      if (!credentialsToUse) {
        // Try to get credentials from settings service
        try {
          const settingsService = require('./DuckDBSettingsService');
          if (settingsService) {
            const storedCredentials = await settingsService.getOAuthCredentials?.(provider);
            if (storedCredentials) {
              credentialsToUse = storedCredentials;
            }
          }
        } catch (error) {
          console.warn(`[ConnectorManager] Could not load stored credentials for ${provider}:`, error);
        }
      }

      // Temporarily set OAuth credentials from available sources
      const originalEnvVars: Record<string, string | undefined> = {};

      if (credentialsToUse) {
        if (provider === 'gmail' && credentialsToUse.clientId && credentialsToUse.clientSecret) {
          originalEnvVars.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
          originalEnvVars.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
          process.env.GOOGLE_CLIENT_ID = credentialsToUse.clientId;
          process.env.GOOGLE_CLIENT_SECRET = credentialsToUse.clientSecret;
        } else if (provider === 'outlook' && credentialsToUse.clientId && credentialsToUse.clientSecret) {
          originalEnvVars.MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
          originalEnvVars.MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
          process.env.MICROSOFT_CLIENT_ID = credentialsToUse.clientId;
          process.env.MICROSOFT_CLIENT_SECRET = credentialsToUse.clientSecret;
        } else if (provider === 'mendeley' && credentialsToUse.clientId && credentialsToUse.clientSecret) {
          originalEnvVars.MENDELEY_CLIENT_ID = process.env.MENDELEY_CLIENT_ID;
          originalEnvVars.MENDELEY_CLIENT_SECRET = process.env.MENDELEY_CLIENT_SECRET;
          process.env.MENDELEY_CLIENT_ID = credentialsToUse.clientId;
          process.env.MENDELEY_CLIENT_SECRET = credentialsToUse.clientSecret;
        }
      }

      let credentials: ConnectorCredentials;
      try {
        if (provider === 'gmail' && connector instanceof GmailConnector) {
          credentials = await connector.exchangeCodeForTokens(code);
        } else if (provider === 'outlook' && connector instanceof OutlookConnector) {
          credentials = await connector.exchangeCodeForTokens(code);
        } else if (provider === 'mendeley' && connector instanceof MendeleyConnector) {
          credentials = await connector.exchangeCodeForTokens(code);
        } else {
          throw new Error(`OAuth not supported for provider: ${provider}`);
        }
      } finally {
        // Restore original environment variables
        for (const [key, value] of Object.entries(originalEnvVars)) {
          if (value === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = value;
          }
        }
      }

      // Store credentials securely
      await this.storeCredentials(provider, credentials);

      // Initialize connector with credentials
      await connector.initialize(credentials);

      // Update connector info
      const connectorInfo = this.connectors.get(provider)!;
      connectorInfo.connected = true;
      connectorInfo.lastSync = new Date();

      // Get user info
      try {
        if (connector instanceof GmailConnector) {
          connectorInfo.userInfo = await connector.getUserInfo();
        } else if (connector instanceof OutlookConnector) {
          connectorInfo.userInfo = await connector.getUserInfo();
        } else if (connector instanceof MendeleyConnector) {
          connectorInfo.userInfo = await connector.getUserInfo();
        }
      } catch (error: any) {
        console.warn(`[ConnectorManager] Failed to get user info for ${provider}:`, error);
      }

      console.log(`[ConnectorManager] Successfully connected ${provider} connector`);

      // Send success response
      this.sendSuccessResponse(res, provider);

      // Emit success event
      this.emit('connector-connected', {
        provider,
        userInfo: connectorInfo.userInfo,
        connected: true
      });

    } catch (error: any) {
      console.error('[ConnectorManager] OAuth callback error:', error);
      this.sendErrorResponse(res, 500, `Authentication failed: ${error.message}`);
      this.emit('oauth-error', { error: error.message, provider: state });
    }
  }

  /**
   * Handle health check
   */
  private handleHealthCheck(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'oauth-callback' }));
  }

  /**
   * Send success response
   */
  private sendSuccessResponse(res: ServerResponse, provider: string): void {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Successful</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; text-align: center; padding: 50px; }
            .success { color: #28a745; }
            .info { color: #6c757d; margin-top: 20px; }
          </style>
        </head>
        <body>
          <h1 class="success">✅ Authentication Successful</h1>
          <p>Your ${provider} account has been connected to Cindy.</p>
          <p class="info">You can close this window and return to the application.</p>
          <script>
            setTimeout(() => window.close(), 3000);
          </script>
        </body>
      </html>
    `;

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  /**
   * Send error response
   */
  private sendErrorResponse(res: ServerResponse, statusCode: number, message: string): void {
    res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
    res.end(message);
  }

  /**
   * Start OAuth callback server
   */
  async startOAuthServer(): Promise<void> {
    if (this.server) {
      console.log('[ConnectorManager] OAuth server already running');
      return;
    }

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res).catch(error => {
          console.error('[ConnectorManager] Request handling error:', error);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
          }
        });
      });

      this.server.listen(this.OAUTH_PORT, '127.0.0.1', () => {
        console.log(`[ConnectorManager] OAuth callback server listening on http://127.0.0.1:${this.OAUTH_PORT}`);
        resolve();
      });

      this.server.on('error', (error) => {
        console.error('[ConnectorManager] Failed to start OAuth server:', error);
        reject(error);
      });
    });
  }

  /**
   * Stop OAuth callback server
   */
  async stopOAuthServer(): Promise<void> {
    if (!this.server) return;

    return new Promise((resolve) => {
      this.server!.close(() => {
        console.log('[ConnectorManager] OAuth callback server stopped');
        this.server = null;
        resolve();
      });
    });
  }

  /**
   * Initialize all connectors
   */
  async initialize(): Promise<void> {
    console.log('[ConnectorManager] Initializing connector manager...');

    try {
      // Start OAuth server
      await this.startOAuthServer();

      // Initialize connectors (but don't connect yet)
      this.connectors.set('gmail', {
        provider: 'gmail',
        connector: new GmailConnector(),
        enabled: true,
        connected: false
      });

      this.connectors.set('outlook', {
        provider: 'outlook',
        connector: new OutlookConnector(),
        enabled: true,
        connected: false
      });

      this.connectors.set('zotero', {
        provider: 'zotero',
        connector: new ZoteroConnector(),
        enabled: true,
        connected: false
      });

      this.connectors.set('mendeley', {
        provider: 'mendeley',
        connector: new MendeleyConnector(),
        enabled: true,
        connected: false
      });

      // Attempt to load existing credentials and connect
      await this.loadExistingCredentials();

      console.log('[ConnectorManager] Connector manager initialized successfully');
      this.emit('initialized');
    } catch (error: any) {
      console.error('[ConnectorManager] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Load existing credentials from keystore
   */
  private async loadExistingCredentials(): Promise<void> {
    const providers = Array.from(this.connectors.keys());

    for (const provider of providers) {
      try {
        const info = this.connectors.get(provider)!;
        const credentials = await this.getStoredCredentials(provider);
        if (credentials) {
          console.log(`[ConnectorManager] Found existing credentials for ${provider}`);
          await info.connector.initialize(credentials);
          info.connected = true;
          info.lastSync = new Date();

          // Get user info
          try {
            if (info.connector instanceof GmailConnector) {
              info.userInfo = await info.connector.getUserInfo();
            } else if (info.connector instanceof OutlookConnector) {
              info.userInfo = await info.connector.getUserInfo();
            } else if (info.connector instanceof ZoteroConnector) {
              info.userInfo = await info.connector.getUserInfo();
            } else if (info.connector instanceof MendeleyConnector) {
              info.userInfo = await info.connector.getUserInfo();
            }
          } catch (userInfoError: any) {
            console.warn(`[ConnectorManager] Failed to get user info for ${provider}:`, userInfoError);
          }

          console.log(`[ConnectorManager] Successfully connected ${provider} with existing credentials`);
          this.emit('connector-connected', { provider, userInfo: info.userInfo, connected: true });
        }
      } catch (error: any) {
        const info = this.connectors.get(provider)!;
        console.warn(`[ConnectorManager] Failed to load credentials for ${provider}:`, error.message);
        info.connected = false;
      }
    }
  }

  /**
   * Start OAuth flow for a provider
   */
  async startOAuthFlow(provider: ConnectorProvider, oauthConfig?: any): Promise<string> {
    const info = this.connectors.get(provider);
    if (!info) {
      throw new Error(`Connector not found: ${provider}`);
    }

    if (provider === 'zotero') {
      throw new Error('Zotero uses API key authentication, not OAuth');
    }

    // Generate state for OAuth flow
    const state = `${provider}_${Date.now()}_${Math.random().toString(36).substr(2)}`;
    if (!oauthConfig) {
      this.oauthStates.set(state, { provider, timestamp: Date.now() });
    }

    // Clean up old states (expire after 10 minutes)
    this.cleanupExpiredStates();

    let authUrl: string;

    try {
      // Get OAuth credentials from settings service or use provided config
      let credentialsToUse = oauthConfig;

      if (!credentialsToUse) {
        // Try to get credentials from settings service
        try {
          const settingsService = require('./DuckDBSettingsService');
          if (settingsService) {
            const storedCredentials = await settingsService.getOAuthCredentials?.(provider);
            if (storedCredentials) {
              credentialsToUse = storedCredentials;
            }
          }
        } catch (error) {
          console.warn(`[ConnectorManager] Could not load stored credentials for ${provider}:`, error);
        }
      }

      // Temporarily set OAuth credentials from available sources
      const originalEnvVars: Record<string, string | undefined> = {};

      if (credentialsToUse) {
        if (provider === 'gmail' && credentialsToUse.clientId && credentialsToUse.clientSecret) {
          originalEnvVars.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
          originalEnvVars.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
          process.env.GOOGLE_CLIENT_ID = credentialsToUse.clientId;
          process.env.GOOGLE_CLIENT_SECRET = credentialsToUse.clientSecret;
        } else if (provider === 'outlook' && credentialsToUse.clientId && credentialsToUse.clientSecret) {
          originalEnvVars.MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
          originalEnvVars.MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
          process.env.MICROSOFT_CLIENT_ID = credentialsToUse.clientId;
          process.env.MICROSOFT_CLIENT_SECRET = credentialsToUse.clientSecret;
        } else if (provider === 'mendeley' && credentialsToUse.clientId && credentialsToUse.clientSecret) {
          originalEnvVars.MENDELEY_CLIENT_ID = process.env.MENDELEY_CLIENT_ID;
          originalEnvVars.MENDELEY_CLIENT_SECRET = process.env.MENDELEY_CLIENT_SECRET;
          process.env.MENDELEY_CLIENT_ID = credentialsToUse.clientId;
          process.env.MENDELEY_CLIENT_SECRET = credentialsToUse.clientSecret;
        }
      }

      // Store OAuth config for later use during token exchange
      this.oauthStates.set(state, {
        provider,
        timestamp: Date.now(),
        config: credentialsToUse
      });

      try {
        if (provider === 'gmail' && info.connector instanceof GmailConnector) {
          authUrl = info.connector.getAuthUrl();
        } else if (provider === 'outlook' && info.connector instanceof OutlookConnector) {
          authUrl = info.connector.getAuthUrl();
        } else if (provider === 'mendeley' && info.connector instanceof MendeleyConnector) {
          authUrl = info.connector.getAuthUrl();
        } else {
          throw new Error(`OAuth not supported for provider: ${provider}`);
        }
      } finally {
        // Restore original environment variables
        for (const [key, value] of Object.entries(originalEnvVars)) {
          if (value === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = value;
          }
        }
      }

      // Add state parameter
      const url = new URL(authUrl);
      url.searchParams.set('state', state);

      console.log(`[ConnectorManager] Generated OAuth URL for ${provider}`);
      return url.toString();
    } catch (error: any) {
      console.error(`[ConnectorManager] Failed to generate OAuth URL for ${provider}:`, error);
      this.oauthStates.delete(state);
      throw error;
    }
  }

  /**
   * Configure Zotero connector with API key
   */
  async configureZotero(apiKey: string, userId: string, workspaceId?: string): Promise<void> {
    const info = this.connectors.get('zotero');
    if (!info) {
      throw new Error('Zotero connector not found');
    }

    const credentials: ConnectorCredentials = {
      provider: 'zotero',
      apiKey,
      userId,
      workspaceId
    };

    try {
      await info.connector.initialize(credentials);
      await this.storeCredentials('zotero', credentials);

      info.connected = true;
      info.lastSync = new Date();

      // Get user info
      if (info.connector instanceof ZoteroConnector) {
        info.userInfo = await info.connector.getUserInfo();
      }

      console.log('[ConnectorManager] Successfully configured Zotero connector');
      this.emit('connector-connected', {
        provider: 'zotero',
        userInfo: info.userInfo,
        connected: true
      });
    } catch (error: any) {
      console.error('[ConnectorManager] Failed to configure Zotero:', error);
      throw error;
    }
  }

  /**
   * Disconnect a connector
   */
  async disconnectConnector(provider: ConnectorProvider): Promise<void> {
    const info = this.connectors.get(provider);
    if (!info) {
      throw new Error(`Connector not found: ${provider}`);
    }

    try {
      await info.connector.disconnect();
      await this.clearStoredCredentials(provider);

      info.connected = false;
      info.userInfo = undefined;
      info.lastSync = undefined;

      console.log(`[ConnectorManager] Disconnected ${provider} connector`);
      this.emit('connector-disconnected', { provider, connected: false });
    } catch (error: any) {
      console.error(`[ConnectorManager] Failed to disconnect ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Get connector status
   */
  getConnectorStatus(): Record<ConnectorProvider, {
    enabled: boolean;
    connected: boolean;
    userInfo?: any;
    lastSync?: Date;
  }> {
    const status: Record<string, any> = {};

    const providers = Array.from(this.connectors.keys());
    for (const provider of providers) {
      const info = this.connectors.get(provider)!;
      status[provider] = {
        enabled: info.enabled,
        connected: info.connected,
        userInfo: info.userInfo,
        lastSync: info.lastSync
      };
    }

    return status;
  }

  /**
   * Get connected connectors for tool loading
   */
  getConnectedConnectors(): {
    gmail?: GmailConnector;
    outlook?: OutlookConnector;
    zotero?: ZoteroConnector;
    mendeley?: MendeleyConnector;
  } {
    const connectors: any = {};

    const providers = Array.from(this.connectors.keys());
    for (const provider of providers) {
      const info = this.connectors.get(provider)!;
      if (info.connected && info.enabled) {
        connectors[provider] = info.connector;
      }
    }

    return connectors;
  }

  /**
   * Test a connector connection
   */
  async testConnector(provider: ConnectorProvider): Promise<{ success: boolean; message: string; data?: any }> {
    const info = this.connectors.get(provider);
    if (!info || !info.connected) {
      return {
        success: false,
        message: `${provider} connector is not connected`
      };
    }

    try {
      if (info.connector instanceof GmailConnector) {
        return await info.connector.test();
      } else if (info.connector instanceof OutlookConnector) {
        return await info.connector.test();
      } else if (info.connector instanceof ZoteroConnector) {
        return await info.connector.test();
      } else if (info.connector instanceof MendeleyConnector) {
        return await info.connector.test();
      } else {
        return {
          success: false,
          message: `Test not implemented for ${provider}`
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: `Test failed: ${error.message}`
      };
    }
  }

  /**
   * Store credentials securely in keystore
   */
  private async storeCredentials(provider: ConnectorProvider, credentials: ConnectorCredentials): Promise<void> {
    const credentialsJson = JSON.stringify(credentials);
    await keytar.setPassword(this.SERVICE_NAME, `${provider}_credentials`, credentialsJson);
    console.log(`[ConnectorManager] Stored credentials for ${provider}`);
  }

  /**
   * Get stored credentials from keystore
   */
  private async getStoredCredentials(provider: ConnectorProvider): Promise<ConnectorCredentials | null> {
    try {
      const credentialsJson = await keytar.getPassword(this.SERVICE_NAME, `${provider}_credentials`);
      if (!credentialsJson) return null;

      return JSON.parse(credentialsJson) as ConnectorCredentials;
    } catch (error: any) {
      console.warn(`[ConnectorManager] Failed to get stored credentials for ${provider}:`, error);
      return null;
    }
  }

  /**
   * Clear stored credentials
   */
  private async clearStoredCredentials(provider: ConnectorProvider): Promise<void> {
    try {
      await keytar.deletePassword(this.SERVICE_NAME, `${provider}_credentials`);
      console.log(`[ConnectorManager] Cleared stored credentials for ${provider}`);
    } catch (error: any) {
      console.warn(`[ConnectorManager] Failed to clear credentials for ${provider}:`, error);
    }
  }

  /**
   * Clean up expired OAuth states
   */
  private cleanupExpiredStates(): void {
    const now = Date.now();
    const expiration = 10 * 60 * 1000; // 10 minutes

    const states = Array.from(this.oauthStates.keys());
    for (const state of states) {
      const info = this.oauthStates.get(state)!;
      if (now - info.timestamp > expiration) {
        this.oauthStates.delete(state);
      }
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    console.log('[ConnectorManager] Cleaning up...');

    // Disconnect all connectors
    const providers = Array.from(this.connectors.keys());
    for (const provider of providers) {
      try {
        const info = this.connectors.get(provider)!;
        if (info.connected) {
          await info.connector.disconnect();
        }
      } catch (error: any) {
        console.warn(`[ConnectorManager] Failed to disconnect ${provider} during cleanup:`, error);
      }
    }

    // Stop OAuth server
    await this.stopOAuthServer();

    // Clear OAuth states
    this.oauthStates.clear();

    console.log('[ConnectorManager] Cleanup complete');
  }
}