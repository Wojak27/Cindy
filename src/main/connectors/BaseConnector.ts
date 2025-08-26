/**
 * Base connector class with common functionality for all connectors
 */

import { EventEmitter } from 'events';
import { 
  ConnectorCredentials, 
  ConnectorConfig, 
  SearchOptions, 
  ConnectorResponse, 
  ConnectorProvider,
  RetryConfig 
} from './types';

export abstract class BaseConnector extends EventEmitter {
  protected provider: ConnectorProvider;
  protected config: ConnectorConfig;
  protected credentials: ConnectorCredentials | null = null;
  protected retryConfig: RetryConfig;
  
  constructor(provider: ConnectorProvider, config: ConnectorConfig) {
    super();
    this.provider = provider;
    this.config = {
      timeout: 15000,
      retryAttempts: 3,
      retryDelay: 1000,
      maxResults: 25,
      ...config
    };
    
    this.retryConfig = {
      maxAttempts: this.config.retryAttempts || 3,
      baseDelay: this.config.retryDelay || 1000,
      maxDelay: 30000,
      backoffFactor: 2
    };
  }

  /**
   * Initialize connector with credentials
   */
  async initialize(credentials: ConnectorCredentials): Promise<boolean> {
    try {
      this.credentials = credentials;
      await this.validateCredentials();
      this.config.connected = true;
      this.emit('connected', this.provider);
      console.log(`[${this.provider}] Connector initialized successfully`);
      return true;
    } catch (error: any) {
      console.error(`[${this.provider}] Failed to initialize:`, error.message);
      this.config.connected = false;
      this.emit('error', { provider: this.provider, error: error.message });
      return false;
    }
  }

  /**
   * Check if connector is properly configured and connected
   */
  isConnected(): boolean {
    return this.config.connected && this.credentials !== null;
  }

  /**
   * Check if connector is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable/disable connector
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    this.emit('statusChanged', { provider: this.provider, enabled });
  }

  /**
   * Get connector configuration
   */
  getConfig(): ConnectorConfig {
    return { ...this.config };
  }

  /**
   * Perform search with retry logic and error handling
   */
  async search<T>(options: SearchOptions): Promise<ConnectorResponse<T>> {
    if (!this.isEnabled()) {
      return {
        success: false,
        data: [],
        error: `${this.provider} connector is disabled`
      };
    }

    if (!this.isConnected()) {
      return {
        success: false,
        data: [],
        error: `${this.provider} connector not configured or connected`
      };
    }

    return await this.retryOperation(async () => {
      return await this.performSearch(options);
    });
  }

  /**
   * Abstract method for performing the actual search - implemented by subclasses
   */
  protected abstract performSearch(options: SearchOptions): Promise<ConnectorResponse<any>>;

  /**
   * Abstract method for validating credentials - implemented by subclasses
   */
  protected abstract validateCredentials(): Promise<void>;

  /**
   * Abstract method for refreshing tokens (OAuth connectors)
   */
  protected abstract refreshCredentials?(): Promise<boolean>;

  /**
   * Retry operation with exponential backoff
   */
  protected async retryOperation<T>(
    operation: () => Promise<T>, 
    attempt = 1
  ): Promise<T> {
    try {
      const startTime = Date.now();
      const result = await this.withTimeout(operation(), this.config.timeout!);
      const duration = Date.now() - startTime;
      
      console.log(`[${this.provider}] Operation completed in ${duration}ms`);
      return result;
    } catch (error: any) {
      const isRetriableError = this.isRetriableError(error);
      const shouldRetry = attempt < this.retryConfig.maxAttempts && isRetriableError;
      
      console.error(`[${this.provider}] Operation failed (attempt ${attempt}):`, error.message);
      
      if (shouldRetry) {
        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffFactor, attempt - 1),
          this.retryConfig.maxDelay
        );
        
        // Add jitter to prevent thundering herd
        const jitteredDelay = delay + Math.random() * 1000;
        
        console.log(`[${this.provider}] Retrying in ${Math.round(jitteredDelay)}ms...`);
        await this.sleep(jitteredDelay);
        
        return this.retryOperation(operation, attempt + 1);
      }
      
      // Final failure
      this.emit('error', { 
        provider: this.provider, 
        error: error.message,
        attempts: attempt,
        fatal: !isRetriableError 
      });
      
      throw error;
    }
  }

  /**
   * Check if error is retriable (5xx, 429, network errors)
   */
  protected isRetriableError(error: any): boolean {
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
      return true;
    }
    
    if (error.response?.status) {
      const status = error.response.status;
      return status === 429 || (status >= 500 && status < 600);
    }
    
    return false;
  }

  /**
   * Add timeout to operations
   */
  protected withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timer));
    });
  }

  /**
   * Sleep utility for delays
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Truncate text to specified length
   */
  protected truncateText(text: string, maxLength: number = 250): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Strip HTML tags from text
   */
  protected stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
  }

  /**
   * Normalize date to ISO string if possible
   */
  protected normalizeDate(date: string | Date): string {
    try {
      if (date instanceof Date) {
        return date.toISOString();
      }
      const parsedDate = new Date(date);
      return isNaN(parsedDate.getTime()) ? date.toString() : parsedDate.toISOString();
    } catch {
      return date.toString();
    }
  }

  /**
   * Validate search options
   */
  protected validateSearchOptions(options: SearchOptions): void {
    if (!options.query || options.query.trim().length === 0) {
      throw new Error('Search query is required');
    }
    
    if (options.maxResults && options.maxResults > 25) {
      options.maxResults = 25;
    }
    
    if (options.limit && options.limit > 25) {
      options.limit = 25;
    }
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    try {
      this.config.connected = false;
      this.credentials = null;
      this.emit('disconnected', this.provider);
      console.log(`[${this.provider}] Connector disconnected`);
    } catch (error: any) {
      console.error(`[${this.provider}] Error during disconnect:`, error.message);
    }
  }
}