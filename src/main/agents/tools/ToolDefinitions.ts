/**
 * Tool type definitions and interfaces for the agent system
 */

import { Tool } from '@langchain/core/tools';

/**
 * Tool parameter schema definition
 */
export interface ToolParameterSchema {
    type: 'object';
    properties: Record<string, {
        type: string;
        description?: string;
        enum?: string[];
        default?: any;
    }>;
    required?: string[];
}

/**
 * Tool definition interface for registration
 */
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: ToolParameterSchema;
    tool: Tool;
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
    success: boolean;
    result?: any;
    error?: string;
    duration?: number;
    metadata?: Record<string, any>;
}

/**
 * Tool configuration options
 */
export interface ToolConfig {
    apiKey?: string;
    baseUrl?: string;
    maxResults?: number;
    timeout?: number;
    retryAttempts?: number;
    retryDelay?: number;
    [key: string]: any;
}

/**
 * Base interface for all tools
 */
export interface BaseTool {
    name: string;
    description: string;
    initialize?(config?: ToolConfig): Promise<void>;
    execute(input: any): Promise<string | ToolExecutionResult>;
    validate?(input: any): boolean;
    cleanup?(): Promise<void>;
}

/**
 * Search tool specific interface
 */
export interface SearchTool extends BaseTool {
    searchType: 'web' | 'vector' | 'document' | 'api';
    maxResults: number;
    formatResults(results: any[]): string;
}

/**
 * Research tool specific interface
 */
export interface ResearchTool extends BaseTool {
    researchType: 'think' | 'conduct' | 'complete';
}

/**
 * Tool categories for organization
 */
export enum ToolCategory {
    SEARCH = 'search',
    VECTOR = 'vector',
    RESEARCH = 'research',
    UTILITY = 'utility',
    ANALYSIS = 'analysis',
    GENERATION = 'generation'
}

/**
 * Tool metadata for registration and discovery
 */
export interface ToolMetadata {
    category: ToolCategory;
    version: string;
    author?: string;
    requiresAuth: boolean;
    rateLimit?: {
        requestsPerMinute: number;
        requestsPerDay?: number;
    };
    supportedModels?: string[];
    tags?: string[];
}

/**
 * Complete tool specification
 */
export interface ToolSpecification extends ToolDefinition {
    metadata: ToolMetadata;
    config?: ToolConfig;
}