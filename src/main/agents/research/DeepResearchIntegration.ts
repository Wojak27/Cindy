/**
 * Integration layer for Deep Research Agent with existing tool system
 * Provides backward compatibility and seamless integration
 */

import { LLMProvider } from '../../services/LLMProvider';
import { LangChainToolExecutorService } from '../../services/LangChainToolExecutorService';
import { SettingsService } from '../../services/SettingsService';
import { DeepResearchAgent } from './DeepResearchAgent';
import { DeepResearchConfiguration, DeepResearchConfigManager } from './DeepResearchConfig';
import { toolLoader } from '../tools/ToolLoader';
import { toolRegistry } from '../tools/ToolRegistry';

/**
 * Integration options for Deep Research
 */
export interface DeepResearchIntegrationOptions {
    llmProvider: LLMProvider;
    toolExecutor: LangChainToolExecutorService;
    settingsService: SettingsService;
    enableDeepResearch?: boolean;
    fallbackToOriginal?: boolean;
}

/**
 * Deep Research Integration Manager
 * Handles the integration between the new Deep Research agent and existing systems
 */
export class DeepResearchIntegration {
    private deepResearchAgent: DeepResearchAgent;
    private llmProvider: LLMProvider;
    private toolExecutor: LangChainToolExecutorService;
    private settingsService: SettingsService;
    private configManager: DeepResearchConfigManager;
    private enabled: boolean;
    private fallbackToOriginal: boolean;

    constructor(options: DeepResearchIntegrationOptions) {
        this.llmProvider = options.llmProvider;
        this.toolExecutor = options.toolExecutor;
        this.settingsService = options.settingsService;
        this.enabled = options.enableDeepResearch !== false; // Default to enabled
        this.fallbackToOriginal = options.fallbackToOriginal !== false; // Default to enabled

        // Initialize configuration from settings
        this.configManager = this.createConfigFromSettings();

        // Create Deep Research agent
        this.deepResearchAgent = new DeepResearchAgent({
            llmProvider: this.llmProvider,
            toolExecutor: this.toolExecutor,
            config: this.configManager.getConfig()
        });

        // Initialize tools
        this.initializeTools();

        console.log('[DeepResearchIntegration] Initialized with settings:', {
            enabled: this.enabled,
            fallback: this.fallbackToOriginal,
            searchAPI: this.configManager.getConfig().search_api
        });
    }

    /**
     * Create configuration from settings service
     */
    private createConfigFromSettings(): DeepResearchConfigManager {
        try {
            const settings = {
                // Map settings to Deep Research configuration
                search_api: this.getSearchAPIFromSettings(),
                allow_clarification: true, // Default values for now
                max_researcher_iterations: 6,
                max_react_tool_calls: 10,
                max_concurrent_research_units: 3,

                // Model configuration - use the same model as the LLM provider
                research_model: this.llmProvider,
                summarization_model: this.llmProvider,
                compression_model: this.llmProvider,
                final_report_model: this.llmProvider
            };

            return DeepResearchConfigManager.fromEnvironmentAndSettings(settings);

        } catch (error) {
            console.error('[DeepResearchIntegration] Error creating config from settings:', error);
            return new DeepResearchConfigManager();
        }
    }

    /**
     * Get search API preference from settings
     */
    private getSearchAPIFromSettings(): string {
        try {
            // Check for API keys in settings to determine which search APIs are available
            const settings = this.settingsService as any;

            // Check for search API keys
            const hasBraveKey = settings?.get?.('braveApiKey') || process.env.BRAVE_API_KEY;
            const hasTavilyKey = settings?.get?.('tavilyApiKey') || process.env.TAVILY_API_KEY;
            const hasSerpApiKey = settings?.get?.('serpApiKey') || process.env.SERP_API_KEY;

            // Prefer APIs with available keys
            if (hasTavilyKey) {
                return 'tavily';
            } else if (hasBraveKey) {
                return 'brave';
            } else if (hasSerpApiKey) {
                return 'serpapi';
            } else {
                return 'duckduckgo'; // Free fallback - no API key required
            }
        } catch (error) {
            console.warn('[DeepResearchIntegration] Could not check API keys from settings, using DuckDuckGo fallback');
            return 'duckduckgo';
        }
    }


    /**
     * Check if vector store has user files indexed
     */
    private async checkVectorStoreHasFiles(): Promise<boolean> {
        try {
            // Check if toolExecutor has vector store functionality
            const availableTools = this.toolExecutor.getAvailableTools();

            // If search_documents tool is not even available, return false
            if (!availableTools.includes('search_documents')) {
                return false;
            }

            // For now, return false to disable vector store until proper file detection is implemented
            // TODO: Implement proper vector store file count check
            console.log('[DeepResearchIntegration] Vector store file check: disabled pending proper implementation');
            return false;

        } catch (error) {
            console.warn('[DeepResearchIntegration] Error checking vector store files:', error);
            return false;
        }
    }

    /**
     * Initialize tools for Deep Research
     */
    private async initializeTools(): Promise<void> {
        try {
            // Check if vector store has user files before enabling
            const hasVectorStoreFiles = await this.checkVectorStoreHasFiles();

            // Load tools with current settings (simplified for compatibility)
            const toolConfig = {
                // braveApiKey: undefined, // Simplified for compatibility
                // serpApiKey: undefined,
                // tavilyApiKey: undefined,
                // vectorStore: undefined, // Use existing vector store
                enabledTools: {
                    duckduckgo: true,
                    brave: false,
                    wikipedia: true,
                    serpapi: false,
                    tavily: false,
                    vector: hasVectorStoreFiles // Only enable if there are user files
                }
            };

            await toolLoader.loadAllTools(toolConfig);

            console.log('[DeepResearchIntegration] Tools initialized:', toolRegistry.getStats());

        } catch (error) {
            console.error('[DeepResearchIntegration] Error initializing tools:', error);
        }
    }

    /**
     * Determine if a message should use Deep Research
     */
    shouldUseDeepResearch(message: string): boolean {
        return true;
    }

    /**
     * Process a message using Deep Research or fallback
     */
    async processMessage(message: string): Promise<{
        result: string;
        usedDeepResearch: boolean;
        processingTime: number;
    }> {
        const startTime = Date.now();

        try {
            if (this.shouldUseDeepResearch(message)) {
                console.log('[DeepResearchIntegration] Using Deep Research for message');

                const result = await this.deepResearchAgent.processResearch(message);

                return {
                    result,
                    usedDeepResearch: true,
                    processingTime: Date.now() - startTime
                };
            } else {
                console.log('[DeepResearchIntegration] Using standard processing');

                // For non-research messages, we could integrate with the original agent
                // For now, return a simple response indicating this should use the original system
                return {
                    result: 'FALLBACK_TO_ORIGINAL',
                    usedDeepResearch: false,
                    processingTime: Date.now() - startTime
                };
            }

        } catch (error: any) {
            console.error('[DeepResearchIntegration] Error processing message:', error);

            if (this.fallbackToOriginal) {
                console.log('[DeepResearchIntegration] Falling back to original system');
                return {
                    result: 'FALLBACK_TO_ORIGINAL',
                    usedDeepResearch: false,
                    processingTime: Date.now() - startTime
                };
            } else {
                return {
                    result: `Research processing failed: ${error.message}`,
                    usedDeepResearch: true,
                    processingTime: Date.now() - startTime
                };
            }
        }
    }

    /**
     * Stream Deep Research with progress updates
     */
    async *streamMessage(message: string): AsyncGenerator<{
        type: 'progress' | 'result';
        content: string;
        usedDeepResearch: boolean;
        status?: string;
    }> {
        if (this.shouldUseDeepResearch(message)) {
            console.log('[DeepResearchIntegration] Streaming Deep Research');

            for await (const update of this.deepResearchAgent.streamResearch(message)) {
                yield {
                    ...update,
                    usedDeepResearch: true
                };
            }
        } else {
            yield {
                type: 'result',
                content: 'FALLBACK_TO_ORIGINAL',
                usedDeepResearch: false
            };
        }
    }

    /**
     * Update settings and reconfigure
     */
    async updateSettings(): Promise<void> {
        console.log('[DeepResearchIntegration] Updating configuration from settings');

        try {
            // Recreate configuration
            this.configManager = this.createConfigFromSettings();

            // Update Deep Research agent
            this.deepResearchAgent.updateConfig(this.configManager.getConfig());

            // Reinitialize tools
            await this.initializeTools();

            console.log('[DeepResearchIntegration] Settings updated successfully');

        } catch (error) {
            console.error('[DeepResearchIntegration] Error updating settings:', error);
        }
    }

    /**
     * Enable or disable Deep Research
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        console.log(`[DeepResearchIntegration] Deep Research ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Set fallback behavior
     */
    setFallbackEnabled(enabled: boolean): void {
        this.fallbackToOriginal = enabled;
        console.log(`[DeepResearchIntegration] Fallback to original ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Get current status
     */
    getStatus(): {
        enabled: boolean;
        fallbackEnabled: boolean;
        availableTools: string[];
        configuration: DeepResearchConfiguration;
    } {
        return {
            enabled: this.enabled,
            fallbackEnabled: this.fallbackToOriginal,
            availableTools: toolRegistry.getToolNames(),
            configuration: this.configManager.getConfig()
        };
    }

    /**
     * Get Deep Research agent (for advanced usage)
     */
    getDeepResearchAgent(): DeepResearchAgent {
        return this.deepResearchAgent;
    }
}