/**
 * Normalized types for email and reference connectors
 */

export type EmailHit = {
  id: string;
  subject: string;
  from: string;
  date: string;      // ISO if available, else raw
  snippet: string;
  provider: "gmail" | "outlook";
};

export type RefHit = {
  id: string;        // Zotero key or Mendeley id
  title: string;
  year?: string | number;
  type?: string;
  creators?: string[];
  provider: "zotero" | "mendeley";
};

export interface ConnectorCredentials {
  provider: string;
  userId?: string;
  workspaceId?: string;
  tokens?: {
    access_token: string;
    refresh_token?: string;
    expires_at?: number;
    token_type?: string;
    scope?: string;
  };
  apiKey?: string;
  config?: Record<string, any>;
}

export interface ConnectorConfig {
  provider: string;
  enabled: boolean;
  connected: boolean;
  lastSync?: string;
  maxResults?: number;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface SearchOptions {
  query: string;
  maxResults?: number;
  limit?: number;
  offset?: number;
  sortBy?: string;
  filters?: Record<string, any>;
  // Email-specific options
  from?: string;
  to?: string;
  subject?: string;
  hasAttachment?: boolean;
  isUnread?: boolean;
  after?: string;
  before?: string;
  // Reference-specific options
  author?: string;
  title?: string;
  year?: number;
  type?: string;
  tag?: string;
  collection?: string;
}

export interface ConnectorResponse<T> {
  success: boolean;
  data: T[];
  error?: string;
  metadata?: {
    totalResults?: number;
    hasMore?: boolean;
    nextPageToken?: string;
    rateLimitRemaining?: number;
    searchTime?: number;
  };
}

export type ConnectorProvider = 'gmail' | 'outlook' | 'zotero' | 'mendeley';

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
}