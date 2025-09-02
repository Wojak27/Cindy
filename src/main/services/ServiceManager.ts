import { EventEmitter } from 'events';
import { DuckDBSettingsService } from './DuckDBSettingsService';
import { LLMProvider } from './LLMProvider';
import { toolRegistry } from '../agents/tools/ToolRegistry';
import { toolLoader } from '../agents/tools/ToolLoader';
import { RouterLangGraphAgent } from '../agents/RouterLangGraphAgent';

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
    private langChainMemoryService: any = null;
    private langChainCindyAgent: any = null;
    private toolsInitialized: boolean = false;

    // Loading state tracking
    private isLoadingToolRegistry = false;
    private isLoadingMemoryService = false;
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
            console.log('[ServiceManager] Available tools:', toolRegistry.getToolNames());

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
        return toolRegistry.getAllTools().map(spec => spec.tool);
    }

    /**
     * Dynamically load LangChain MemoryService
     */
    async getMemoryService(): Promise<any> {
        if (this.langChainMemoryService) {
            return this.langChainMemoryService;
        }

        if (this.isLoadingMemoryService) {
            // Wait for existing load to complete
            return new Promise((resolve) => {
                this.once('memoryServiceLoaded', resolve);
            });
        }

        this.isLoadingMemoryService = true;

        try {
            console.log('[ServiceManager] Dynamically loading LangChainMemoryService...');

            // Dynamic import to avoid loading at startup
            const { LangChainMemoryService } = await import('./LangChainMemoryService');

            // Vector store not needed - using DuckDBVectorStore directly
            let vectorStore = null;

            // Get the actual chat model from LLM provider
            let llmModel = null;
            if (this.llmProvider) {
                try {
                    llmModel = this.llmProvider.getChatModel();
                } catch (error) {
                    console.warn('[ServiceManager] Could not get chat model from LLM provider:', error.message);
                }
            }

            this.langChainMemoryService = new LangChainMemoryService({}, vectorStore, llmModel);
            await this.langChainMemoryService.initialize();

            console.log('[ServiceManager] LangChainMemoryService loaded successfully');
            this.emit('memoryServiceLoaded', this.langChainMemoryService);

            return this.langChainMemoryService;
        } catch (error) {
            console.error('[ServiceManager] Failed to load LangChainMemoryService:', error);
            throw error;
        } finally {
            this.isLoadingMemoryService = false;
        }
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

            // Load dependencies
            const memoryService = await this.getMemoryService();
            // Ensure tools are initialized for the agent (connectors will be passed when available)
            await this.initializeTools(duckdbVectorStore);

            // Dynamic import to avoid loading at startup - using new LangGraphAgent

            // Get agent config from settings
            const agentConfig = await this.settingsService.get('general') || {};

            // Initialize thinking agent with enhanced capabilities
            this.langChainCindyAgent = new RouterLangGraphAgent({
                memoryService: memoryService,
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
        memory: boolean;
        cindyAgent: boolean;
    } {
        return {
            toolRegistry: this.toolsInitialized,
            memory: !!this.langChainMemoryService,
            cindyAgent: !!this.langChainCindyAgent
        };
    }

    /**
     * Get service instances (if loaded)
     */
    getServiceInstances(): {
        toolRegistry: any;
        memory: any;
        cindyAgent: any;
    } {
        return {
            toolRegistry: toolRegistry,
            memory: this.langChainMemoryService,
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

            if (this.langChainMemoryService && typeof this.langChainMemoryService.cleanup === 'function') {
                await this.langChainMemoryService.cleanup();
            }

            // Tool registry cleanup is handled automatically

            // Vector store cleanup handled by DuckDBVectorStore in main.ts
        } catch (error) {
            console.error('[ServiceManager] Error during cleanup:', error);
        }

        // Reset all references
        this.langChainCindyAgent = null;
        this.langChainMemoryService = null;
        this.toolsInitialized = false;

        console.log('[ServiceManager] Cleanup complete');
    }
}