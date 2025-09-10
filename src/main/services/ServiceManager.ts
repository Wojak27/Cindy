import { EventEmitter } from 'events';
import { DuckDBSettingsService } from './DuckDBSettingsService.ts';
import { LLMProvider } from './LLMProvider.ts';
import { toolRegistry } from '../agents/tools/ToolRegistry.ts';
import { toolLoader } from '../agents/tools/ToolLoader.ts';
import { MainAgentExecution } from '../agents/MainAgentExecution.ts';

/**
 * ServiceManager - Handles dynamic loading of heavy LangChain services
 * 
 * This class breaks circular dependencies by managing service initialization
 * dynamically, preventing heavy ML/AI libraries from loading at startup.
 */
export class ServiceManager extends EventEmitter {
    private settingsService: DuckDBSettingsService | null;
    private llmProvider: LLMProvider | null;

    // Dynamic service references
    private langChainCindyAgent: any = null;
    private toolsInitialized: boolean = false;

    // Loading state tracking
    private isLoadingToolRegistry = false;
    private isLoadingCindyAgent = false;

    constructor(settingsService: DuckDBSettingsService | null = null, llmProvider: LLMProvider | null = null) {
        super();
        this.settingsService = settingsService;
        this.llmProvider = llmProvider;
    }

    /**
     * Update references to core services
     */
    updateCoreServices(settingsService: DuckDBSettingsService | null, llmProvider: LLMProvider | null): void {
        this.settingsService = settingsService;
        this.llmProvider = llmProvider;
    }

    /**
     * Initialize tools using ToolLoader system
     */
    async initializeTools(duckdbVectorStore?: any, connectorInstances?: any): Promise<void> {
        if (this.toolsInitialized) {
            return;
        }

        if (this.isLoadingToolRegistry) {
            // Wait for existing load to complete
            return new Promise((resolve) => {
                this.once('toolsInitialized', resolve);
            });
        }

        this.isLoadingToolRegistry = true;

        try {
            console.log('[ServiceManager] Initializing tools via ToolLoader...');
            console.log('[ServiceManager] DuckDB vector store provided:', !!duckdbVectorStore);

            // Get settings for tool configuration
            const settingsData = await this.settingsService?.getAll();

            // Build tool configuration
            const toolConfig = {
                // Search API keys
                braveApiKey: settingsData?.search?.braveApiKey,
                serpApiKey: settingsData?.search?.serpApiKey,
                tavilyApiKey: settingsData?.search?.tavilyApiKey,

                // Weather API keys
                // accuWeatherApiKey: settingsData?.general?.accuWeatherApiKey, // TODO: add to settings

                // Vector store for document search
                vectorStore: duckdbVectorStore,

                // Connector instances for email and reference tools
                connectors: connectorInstances || {},

                // Enable all tools by default
                enabledTools: {
                    duckduckgo: true,
                    brave: !!settingsData?.search?.braveApiKey,
                    wikipedia: true,
                    serpapi: !!settingsData?.search?.serpApiKey,
                    tavily: !!settingsData?.search?.tavilyApiKey,
                    vector: !!duckdbVectorStore,
                    weather: true,
                    maps: true,
                    // Email and reference connectors
                    email: !!(connectorInstances?.gmail || connectorInstances?.outlook),
                    reference: !!(connectorInstances?.zotero || connectorInstances?.mendeley)
                }
            };

            // Initialize all tools
            await toolLoader.loadAllTools(toolConfig);

            console.log('[ServiceManager] Tools initialized successfully via ToolLoader');

            this.toolsInitialized = true;
            this.emit('toolsInitialized');

        } catch (error) {
            console.error('[ServiceManager] Failed to initialize tools:', error);
            throw error;
        } finally {
            this.isLoadingToolRegistry = false;
        }
    }

    /**
     * Get tool registry (replaces getToolExecutorService)
     */
    async getToolRegistry(duckdbVectorStore?: any, connectorInstances?: any): Promise<any> {
        await this.initializeTools(duckdbVectorStore, connectorInstances);
        return toolRegistry;
    }

    /**
     * Get tools for LLM attachment (replaces getToolsForAgent)
     */
    async getToolsForAgent(duckdbVectorStore?: any, connectorInstances?: any): Promise<any[]> {
        await this.initializeTools(duckdbVectorStore, connectorInstances);
        // Return the actual tool instances for LangChain binding
        return toolRegistry.getTools();
    }


    // Note: LangChainVectorStoreService removed - using DuckDBVectorStore directly in main.ts

    /**
     * Dynamically load LangChain CindyAgent
     */
    async getCindyAgent(duckdbVectorStore?: any): Promise<any> {
        if (this.langChainCindyAgent) {
            return this.langChainCindyAgent;
        }

        if (this.isLoadingCindyAgent) {
            // Wait for existing load to complete
            return new Promise((resolve) => {
                this.once('cindyAgentLoaded', resolve);
            });
        }

        this.isLoadingCindyAgent = true;

        try {
            console.log('[ServiceManager] Dynamically loading LangGraphAgent...');

            if (!this.llmProvider) {
                throw new Error('LLM provider required for Cindy agent initialization');
            }

            if (!this.settingsService) {
                throw new Error('Settings service required for Cindy agent initialization');
            }

            // Ensure tools are initialized for the agent (connectors will be passed when available)
            await this.initializeTools(duckdbVectorStore);

            // Dynamic import to avoid loading at startup - using new LangGraphAgent

            // Get agent config from settings
            const agentConfig = await this.settingsService.get('general') || {};

            // Initialize thinking agent with enhanced capabilities
            this.langChainCindyAgent = new MainAgentExecution({
                config: {
                    enableStreaming: true,
                    ...agentConfig
                },
                llmProvider: this.llmProvider
            });

            console.log('[ServiceManager] LangGraphAgent loaded successfully');
            this.emit('cindyAgentLoaded', this.langChainCindyAgent);

            return this.langChainCindyAgent;
        } catch (error) {
            console.error('[ServiceManager] Failed to load LangChainCindyAgent:', error);
            throw error;
        } finally {
            this.isLoadingCindyAgent = false;
        }
    }

    /**
     * Check if any services are loaded
     */
    getLoadedServices(): {
        toolRegistry: boolean;
        cindyAgent: boolean;
    } {
        return {
            toolRegistry: this.toolsInitialized,
            cindyAgent: !!this.langChainCindyAgent
        };
    }

    /**
     * Get service instances (if loaded)
     */
    getServiceInstances(): {
        toolRegistry: any;
        cindyAgent: any;
    } {
        return {
            toolRegistry: toolRegistry,
            cindyAgent: this.langChainCindyAgent
        };
    }

    /**
     * Clean up all loaded services
     */
    async cleanup(): Promise<void> {
        console.log('[ServiceManager] Cleaning up loaded services...');

        try {
            // Clean up each service if it has cleanup methods
            if (this.langChainCindyAgent && typeof this.langChainCindyAgent.cleanup === 'function') {
                await this.langChainCindyAgent.cleanup();
            }

            // Tool registry cleanup is handled automatically

            // Vector store cleanup handled by DuckDBVectorStore in main.ts
        } catch (error) {
            console.error('[ServiceManager] Error during cleanup:', error);
        }

        // Reset all references
        this.langChainCindyAgent = null;
        this.toolsInitialized = false;

        console.log('[ServiceManager] Cleanup complete');
    }
}