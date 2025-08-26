/**
 * Email Search Tool for Gmail and Outlook integration
 * LangChain tool wrapper for email connectors
 */

import { Tool } from '@langchain/core/tools';
import { z } from 'zod';
import { GmailConnector } from '../../../connectors/GmailConnector';
import { OutlookConnector } from '../../../connectors/OutlookConnector';
import { BaseConnector } from '../../../connectors/BaseConnector';
import { EmailHit, SearchOptions } from '../../../connectors/types';
import { ToolCategory } from '../ToolDefinitions';
import type { ToolSpecification } from '../ToolDefinitions';

// Input schema for the tool
const EmailSearchInputSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  provider: z.enum(['gmail', 'outlook']).optional(),
  maxResults: z.number().min(1).max(25).default(10),
  from: z.string().optional(),
  to: z.string().optional(),
  subject: z.string().optional(),
  hasAttachment: z.boolean().optional(),
  isUnread: z.boolean().optional(),
  after: z.string().optional(),
  before: z.string().optional()
});

type EmailSearchInput = z.infer<typeof EmailSearchInputSchema>;

export class EmailSearchTool extends Tool {
  name = 'email_search';
  description = 'Search emails from Gmail and Outlook accounts. Finds emails by query text, sender, subject, date range, and other filters.';
  
  private connectors: Map<string, BaseConnector> = new Map();

  constructor(connectors: { gmail?: GmailConnector; outlook?: OutlookConnector } = {}) {
    super();
    
    if (connectors.gmail) {
      this.connectors.set('gmail', connectors.gmail);
    }
    if (connectors.outlook) {
      this.connectors.set('outlook', connectors.outlook);
    }

    console.log(`[EmailSearchTool] Initialized with ${this.connectors.size} connector(s)`);
  }

  protected async _call(input: string): Promise<string> {
    try {
      console.log(`[EmailSearchTool] Received input:`, input);
      
      // Parse input
      let parsedInput: EmailSearchInput;
      try {
        const inputObj = typeof input === 'string' ? JSON.parse(input) : input;
        parsedInput = EmailSearchInputSchema.parse(inputObj);
      } catch (parseError: any) {
        console.error('[EmailSearchTool] Input parsing failed:', parseError);
        return JSON.stringify({
          success: false,
          error: `Invalid input format: ${parseError.message}`,
          results: []
        });
      }

      console.log(`[EmailSearchTool] Parsed input:`, parsedInput);

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
          error: 'No email connectors are available or connected',
          results: []
        });
      }

      console.log(`[EmailSearchTool] Searching ${connectorsToSearch.length} connector(s)`);

      // Build search options
      const searchOptions: SearchOptions = {
        query: parsedInput.query,
        maxResults: parsedInput.maxResults,
        from: parsedInput.from,
        to: parsedInput.to,
        subject: parsedInput.subject,
        hasAttachment: parsedInput.hasAttachment,
        isUnread: parsedInput.isUnread,
        after: parsedInput.after,
        before: parsedInput.before
      };

      // Search all connectors in parallel
      const searchPromises = connectorsToSearch.map(async (connector) => {
        try {
          const result = await connector.search<EmailHit>(searchOptions);
          return {
            provider: connector.getConfig().provider,
            ...result
          };
        } catch (error: any) {
          console.error(`[EmailSearchTool] Search failed for ${connector.getConfig().provider}:`, error);
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
      const allEmails: (EmailHit & { searchProvider: string })[] = [];
      let totalSearched = 0;
      const errors: string[] = [];

      for (const result of searchResults) {
        totalSearched++;
        if (result.success && result.data) {
          // Add provider info to each email
          const providerEmails = result.data.map(email => ({
            ...email,
            searchProvider: result.provider
          }));
          allEmails.push(...providerEmails);
        } else if (result.error) {
          errors.push(`${result.provider}: ${result.error}`);
        }
      }

      // Sort by date (newest first)
      allEmails.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA;
      });

      // Limit total results
      const limitedEmails = allEmails.slice(0, parsedInput.maxResults);

      console.log(`[EmailSearchTool] Found ${limitedEmails.length} emails from ${totalSearched} provider(s)`);

      // Format response
      const response = {
        success: true,
        results: limitedEmails,
        metadata: {
          totalResults: limitedEmails.length,
          searchedProviders: searchResults.map(r => r.provider),
          query: parsedInput.query,
          hasMore: allEmails.length > limitedEmails.length
        },
        errors: errors.length > 0 ? errors : undefined
      };

      return JSON.stringify(response, null, 2);

    } catch (error: any) {
      console.error('[EmailSearchTool] Tool execution failed:', error);
      return JSON.stringify({
        success: false,
        error: `Email search failed: ${error.message}`,
        results: []
      });
    }
  }

  /**
   * Add a connector
   */
  addConnector(provider: 'gmail' | 'outlook', connector: BaseConnector): void {
    this.connectors.set(provider, connector);
    console.log(`[EmailSearchTool] Added ${provider} connector`);
  }

  /**
   * Remove a connector
   */
  removeConnector(provider: 'gmail' | 'outlook'): void {
    this.connectors.delete(provider);
    console.log(`[EmailSearchTool] Removed ${provider} connector`);
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
    const allProviders = ['gmail', 'outlook'];
    for (const provider of allProviders) {
      if (!status[provider]) {
        status[provider] = { available: false, connected: false, enabled: false };
      }
    }

    return status;
  }
}

/**
 * Create and configure email search tool specification
 */
export function createEmailSearchTool(connectors?: { 
  gmail?: GmailConnector; 
  outlook?: OutlookConnector; 
}): ToolSpecification {
  const tool = new EmailSearchTool(connectors);
  
  const specification: ToolSpecification = {
    name: 'email_search',
    description: tool.description,
    parameters: {
      type: 'object',
      properties: {
        query: { 
          type: 'string', 
          description: 'Search query to find emails (searches subject, body, and sender)' 
        },
        provider: { 
          type: 'string',
          enum: ['gmail', 'outlook'],
          description: 'Specific email provider to search (optional, will search all if not specified)' 
        },
        maxResults: { 
          type: 'number', 
          description: 'Maximum number of emails to return (1-25, default: 10)',
          default: 10
        },
        from: { 
          type: 'string', 
          description: 'Filter by sender email address' 
        },
        to: { 
          type: 'string', 
          description: 'Filter by recipient email address (Gmail only)' 
        },
        subject: { 
          type: 'string', 
          description: 'Filter by subject line text' 
        },
        hasAttachment: { 
          type: 'boolean', 
          description: 'Filter emails with attachments' 
        },
        isUnread: { 
          type: 'boolean', 
          description: 'Filter unread emails only' 
        },
        after: { 
          type: 'string', 
          description: 'Find emails after this date (ISO string or YYYY/MM/DD format)' 
        },
        before: { 
          type: 'string', 
          description: 'Find emails before this date (ISO string or YYYY/MM/DD format)' 
        }
      },
      required: ['query']
    },
    tool,
    metadata: {
      category: ToolCategory.SEARCH,
      version: '1.0.0',
      requiresAuth: true,
      tags: ['email', 'gmail', 'outlook', 'search', 'communication'],
      rateLimit: {
        requestsPerMinute: 10, // Conservative limit for API calls
        requestsPerDay: 100
      }
    },
    config: {
      maxResults: 10,
      timeout: 15000
    }
  };
  
  return specification;
}