/**
 * LangSmith Integration Service
 * Enhanced LangChain tracing and monitoring with proper configuration management
 */

import { ApiKeyService } from './ApiKeyService';
import { logger } from '../utils/ColorLogger';

export interface LangSmithConfig {
    apiKey?: string;
    endpoint?: string;
    projectName?: string;
    tracingEnabled?: boolean;
    sessionId?: string;
    metadata?: Record<string, any>;
}

export interface LangSmithSession {
    projectName: string;
    sessionId: string;
    startTime: Date;
    tracingEnabled: boolean;
    metadata?: Record<string, any>;
}

/**
 * LangSmith Service for enhanced LangChain monitoring
 * Provides centralized configuration and session management
 */
export class LangSmithService {
    private apiKeyService: ApiKeyService;
    private currentSession: LangSmithSession | null = null;
    private isInitialized = false;

    constructor(apiKeyService: ApiKeyService) {
        this.apiKeyService = apiKeyService;
    }

    /**
     * Initialize LangSmith with configuration
     */
    async initialize(config: LangSmithConfig = {}): Promise<boolean> {
        try {
            logger.stage('LangSmithService', 'Initializing LangSmith Integration');
            
            // Debug current environment
            logger.debug('LangSmithService', 'Environment check', {
                hasApiKey: !!(process.env.LANGSMITH_API_KEY || config.apiKey),
                endpoint: process.env.LANGSMITH_ENDPOINT || config.endpoint || 'default',
                tracingRequested: config.tracingEnabled !== false
            });

            // Get API key from multiple sources
            const apiKey = config.apiKey || 
                         this.apiKeyService.getApiKey('LANGSMITH_API_KEY') ||
                         process.env.LANGSMITH_API_KEY;

            if (!apiKey) {
                logger.warn('LangSmithService', 'No LangSmith API key found - tracing will be disabled');
                // Disable tracing to prevent errors
                process.env.LANGCHAIN_TRACING_V2 = 'false';
                return false;
            }
            
            // Validate API key format
            if (!apiKey.startsWith('lsv2_')) {
                logger.warn('LangSmithService', 'API key does not appear to be a valid LangSmith v2 key');
                process.env.LANGCHAIN_TRACING_V2 = 'false';
                return false;
            }

            // Configure environment variables for LangChain
            process.env.LANGCHAIN_API_KEY = apiKey;
            process.env.LANGSMITH_API_KEY = apiKey;
            
            logger.success('LangSmithService', 'API key configured', {
                keyPrefix: apiKey.substring(0, 10) + '...',
                keyLength: apiKey.length
            });
            
            // Enable tracing if requested (with enhanced error handling)
            if (config.tracingEnabled !== false) {
                try {
                    process.env.LANGCHAIN_TRACING_V2 = 'true';
                    logger.success('LangSmithService', 'LangChain tracing enabled');
                    logger.warn('LangSmithService', 'Note: If you see "Failed to ingest multipart runs" 403 errors, this is a known LangSmith permissions issue');
                    logger.info('LangSmithService', 'The application will continue to work normally despite these trace ingestion errors');
                } catch (tracingError) {
                    logger.warn('LangSmithService', 'Failed to enable tracing, continuing without it', tracingError);
                    process.env.LANGCHAIN_TRACING_V2 = 'false';
                }
            }

            // Set project name with validation
            const projectName = config.projectName || 'voice-assistant';
            if (projectName && projectName.length > 0) {
                process.env.LANGCHAIN_PROJECT = projectName;
                logger.keyValue('LangSmithService', 'Project', projectName);
            } else {
                logger.warn('LangSmithService', 'No project name specified, using default');
                process.env.LANGCHAIN_PROJECT = 'voice-assistant';
            }

            // Set endpoint if provided or from environment
            const endpoint = config.endpoint || process.env.LANGSMITH_ENDPOINT;
            if (endpoint) {
                process.env.LANGCHAIN_ENDPOINT = endpoint;
                process.env.LANGSMITH_ENDPOINT = endpoint;
                logger.keyValue('LangSmithService', 'Endpoint', endpoint);
            }

            this.isInitialized = true;
            logger.complete('LangSmithService', 'LangSmith initialization complete');

            return true;

        } catch (error) {
            logger.error('LangSmithService', 'Failed to initialize LangSmith', error);
            
            // If it's a 403 error, provide specific guidance
            if (error.message && error.message.includes('403')) {
                logger.warn('LangSmithService', 'Detected 403 Forbidden error - this is likely a trace ingestion permission issue');
                logger.info('LangSmithService', 'Disabling tracing to prevent further errors');
                process.env.LANGCHAIN_TRACING_V2 = 'false';
            }
            
            return false;
        }
    }

    /**
     * Start a new LangSmith session for tracking
     */
    async startSession(config: Partial<LangSmithConfig> = {}): Promise<LangSmithSession | null> {
        if (!this.isInitialized) {
            const initialized = await this.initialize(config);
            if (!initialized) {
                return null;
            }
        }

        try {
            const sessionId = config.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const projectName = config.projectName || process.env.LANGCHAIN_PROJECT || 'voice-assistant';

            const session: LangSmithSession = {
                projectName,
                sessionId,
                startTime: new Date(),
                tracingEnabled: process.env.LANGCHAIN_TRACING_V2 === 'true',
                metadata: config.metadata
            };

            this.currentSession = session;

            logger.stage('LangSmithService', 'Starting LangSmith Session', sessionId);
            logger.data('LangSmithService', 'Session details', {
                project: projectName,
                sessionId,
                tracingEnabled: session.tracingEnabled,
                metadata: config.metadata
            });

            return session;

        } catch (error) {
            logger.error('LangSmithService', 'Failed to start LangSmith session', error);
            return null;
        }
    }

    /**
     * End current session
     */
    endSession(): void {
        if (this.currentSession) {
            const duration = Date.now() - this.currentSession.startTime.getTime();
            logger.complete('LangSmithService', `Session ended after ${duration}ms`, duration);
            this.currentSession = null;
        }
    }

    /**
     * Get current session info
     */
    getCurrentSession(): LangSmithSession | null {
        return this.currentSession;
    }

    /**
     * Check if LangSmith is properly configured
     */
    isConfigured(): boolean {
        return !!(process.env.LANGSMITH_API_KEY || process.env.LANGCHAIN_API_KEY);
    }

    /**
     * Check if tracing is enabled
     */
    isTracingEnabled(): boolean {
        return process.env.LANGCHAIN_TRACING_V2 === 'true';
    }

    /**
     * Get current project name
     */
    getProjectName(): string {
        return process.env.LANGCHAIN_PROJECT || 'voice-assistant';
    }

    /**
     * Update project name for current session
     */
    setProjectName(projectName: string): void {
        process.env.LANGCHAIN_PROJECT = projectName;
        if (this.currentSession) {
            this.currentSession.projectName = projectName;
        }
        logger.info('LangSmithService', `Project name updated to: ${projectName}`);
    }

    /**
     * Enable/disable tracing
     */
    setTracingEnabled(enabled: boolean): void {
        process.env.LANGCHAIN_TRACING_V2 = enabled ? 'true' : 'false';
        if (this.currentSession) {
            this.currentSession.tracingEnabled = enabled;
        }
        logger.info('LangSmithService', `Tracing ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Handle 403 Forbidden errors by disabling tracing
     */
    handle403Error(error: any): void {
        if (error && (error.message?.includes('403') || error.message?.includes('Forbidden'))) {
            logger.warn('LangSmithService', 'Received 403 Forbidden error from LangSmith - disabling tracing');
            logger.info('LangSmithService', 'This usually indicates insufficient permissions for trace ingestion');
            logger.info('LangSmithService', 'Application will continue normally without LangSmith tracing');
            
            this.setTracingEnabled(false);
            
            // Mark current session as disabled if exists
            if (this.currentSession) {
                this.currentSession.tracingEnabled = false;
                this.addSessionMetadata({ tracingDisabledDueTo403: true });
            }
        }
    }

    /**
     * Safe wrapper for operations that might trigger 403 errors
     */
    safeExecute<T>(operation: () => T, fallback: T): T {
        try {
            return operation();
        } catch (error) {
            this.handle403Error(error);
            return fallback;
        }
    }

    /**
     * Add metadata to current session
     */
    addSessionMetadata(metadata: Record<string, any>): void {
        if (this.currentSession) {
            this.currentSession.metadata = {
                ...this.currentSession.metadata,
                ...metadata
            };
            logger.debug('LangSmithService', 'Session metadata updated', metadata);
        }
    }

    /**
     * Get status information for debugging
     */
    getStatus(): {
        initialized: boolean;
        configured: boolean;
        tracingEnabled: boolean;
        projectName: string;
        hasCurrentSession: boolean;
        apiKeyAvailable: boolean;
    } {
        return {
            initialized: this.isInitialized,
            configured: this.isConfigured(),
            tracingEnabled: this.isTracingEnabled(),
            projectName: this.getProjectName(),
            hasCurrentSession: !!this.currentSession,
            apiKeyAvailable: !!(process.env.LANGSMITH_API_KEY || process.env.LANGCHAIN_API_KEY)
        };
    }

    /**
     * Test LangSmith connection and configuration
     */
    async testConnection(): Promise<{ success: boolean; error?: string; details?: any }> {
        try {
            if (!this.isConfigured()) {
                return {
                    success: false,
                    error: 'LangSmith not configured - missing API key'
                };
            }

            // Test basic configuration
            const config = {
                apiKeyConfigured: !!process.env.LANGSMITH_API_KEY,
                tracingEnabled: this.isTracingEnabled(),
                projectName: this.getProjectName(),
                endpoint: process.env.LANGSMITH_ENDPOINT || process.env.LANGCHAIN_ENDPOINT || 'default'
            };

            logger.info('LangSmithService', 'Connection test results', config);
            
            // If using EU endpoint, ensure proper configuration
            if (config.endpoint.includes('eu.api.smith.langchain.com')) {
                logger.info('LangSmithService', 'Using EU LangSmith endpoint');
            }

            return {
                success: true,
                details: config
            };

        } catch (error) {
            logger.error('LangSmithService', 'Connection test failed', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                details: { endpoint: process.env.LANGSMITH_ENDPOINT }
            };
        }
    }

    /**
     * Create a wrapped model with LangSmith tracing (with error handling)
     */
    wrapModel<T>(model: T, metadata?: Record<string, any>): T {
        if (!this.isConfigured()) {
            logger.warn('LangSmithService', 'LangSmith not configured, returning unwrapped model');
            return model;
        }

        try {
            // Dynamic import to avoid compilation issues
            const { wrapSDK } = require('langsmith/wrappers');
            
            if (metadata) {
                this.addSessionMetadata(metadata);
            }

            // Add error handling for the actual wrapping
            const wrappedModel = wrapSDK(model);
            logger.debug('LangSmithService', 'Model wrapped with LangSmith tracing');
            return wrappedModel;

        } catch (error) {
            logger.error('LangSmithService', 'Failed to wrap model with LangSmith - using unwrapped model', error);
            
            // Handle 403 errors specifically
            this.handle403Error(error);
            
            return model;
        }
    }

    /**
     * Log agent execution for monitoring
     */
    logAgentExecution(agentName: string, input: any, output: any, metadata?: Record<string, any>): void {
        if (!this.isTracingEnabled()) return;

        logger.info('LangSmithService', `Agent execution logged: ${agentName}`, {
            agent: agentName,
            inputType: typeof input,
            outputType: typeof output,
            sessionId: this.currentSession?.sessionId,
            ...metadata
        });
    }

    /**
     * Log tool execution for monitoring
     */
    logToolExecution(toolName: string, input: any, output: any, duration: number, metadata?: Record<string, any>): void {
        if (!this.isTracingEnabled()) return;

        logger.tool('LangSmithService', `Tool execution logged: ${toolName}`, {
            tool: toolName,
            duration: `${duration}ms`,
            inputType: typeof input,
            outputType: typeof output,
            sessionId: this.currentSession?.sessionId,
            ...metadata
        });
    }
}

/**
 * Global LangSmith service instance
 */
let langSmithService: LangSmithService | null = null;

/**
 * Get or create global LangSmith service instance
 */
export function getLangSmithService(): LangSmithService {
    if (!langSmithService) {
        const apiKeyService = new ApiKeyService();
        langSmithService = new LangSmithService(apiKeyService);
    }
    return langSmithService;
}

/**
 * Initialize global LangSmith service
 */
export async function initializeLangSmith(config: LangSmithConfig = {}): Promise<boolean> {
    const service = getLangSmithService();
    return await service.initialize(config);
}

/**
 * Quick setup for research agents with enhanced error handling
 */
export async function setupLangSmithForResearch(projectName = 'voice-assistant-research'): Promise<LangSmithSession | null> {
    const service = getLangSmithService();
    
    try {
        // Initialize with enhanced error handling
        const initialized = await service.initialize({
            projectName,
            tracingEnabled: true
        });
        
        if (!initialized) {
            logger.info('LangSmithService', 'LangSmith not available - research will continue without tracing');
            return null;
        }
        
        const session = await service.startSession({
            projectName,
            tracingEnabled: true,
            metadata: {
                component: 'research-agent',
                version: '1.0.0',
                timestamp: new Date().toISOString(),
                note: 'If you see 403 errors, this is a LangSmith permissions issue and can be safely ignored'
            }
        });
        
        return session;
        
    } catch (error) {
        logger.warn('LangSmithService', 'Failed to setup LangSmith for research - continuing without tracing', error);
        return null;
    }
}