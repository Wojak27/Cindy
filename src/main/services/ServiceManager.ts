import { EventEmitter } from 'events';
import { SettingsService } from './SettingsService';
import { LLMProvider } from './LLMProvider';

/**
 * ServiceManager - Handles dynamic loading of heavy LangChain services
 * 
 * This class breaks circular dependencies by managing service initialization
 * dynamically, preventing heavy ML/AI libraries from loading at startup.
 */
export class ServiceManager extends EventEmitter {
    private settingsService: SettingsService | null;
    private llmProvider: LLMProvider | null;

    // Dynamic service references
    private langChainToolExecutorService: any = null;
    private langChainMemoryService: any = null;
    private langChainCindyAgent: any = null;

    // Loading state tracking
    private isLoadingToolExecutor = false;
    private isLoadingMemoryService = false;
    private isLoadingCindyAgent = false;

    constructor(settingsService: SettingsService | null = null, llmProvider: LLMProvider | null = null) {
        super();
        this.settingsService = settingsService;
        this.llmProvider = llmProvider;
    }

    /**
     * Update references to core services
     */
    updateCoreServices(settingsService: SettingsService | null, llmProvider: LLMProvider | null): void {
        this.settingsService = settingsService;
        this.llmProvider = llmProvider;
    }

    /**
     * Dynamically load LangChain ToolExecutorService
     */
    async getToolExecutorService(duckdbVectorStore?: any): Promise<any> {
        if (this.langChainToolExecutorService) {
            return this.langChainToolExecutorService;
        }

        if (this.isLoadingToolExecutor) {
            // Wait for existing load to complete
            return new Promise((resolve) => {
                this.once('toolExecutorLoaded', resolve);
            });
        }

        this.isLoadingToolExecutor = true;

        try {
            console.log('[ServiceManager] Dynamically loading LangChainToolExecutorService...');

            // Dynamic import to avoid loading at startup - using completely lightweight version with NO LangChain imports
            const { LangChainToolExecutorService } = await import('./LangChainToolExecutorService');

            // Pass DuckDB vector store instead of LangChain vector store
            this.langChainToolExecutorService = new LangChainToolExecutorService(duckdbVectorStore);
            await this.langChainToolExecutorService.initialize();

            console.log('[ServiceManager] LangChainToolExecutorService loaded successfully');
            this.emit('toolExecutorLoaded', this.langChainToolExecutorService);

            return this.langChainToolExecutorService;
        } catch (error) {
            console.error('[ServiceManager] Failed to load LangChainToolExecutorService:', error);
            throw error;
        } finally {
            this.isLoadingToolExecutor = false;
        }
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
            console.log('[ServiceManager] Dynamically loading ThinkingCindyAgent...');

            if (!this.llmProvider) {
                throw new Error('LLM provider required for Cindy agent initialization');
            }

            if (!this.settingsService) {
                throw new Error('Settings service required for Cindy agent initialization');
            }

            // Load dependencies
            const memoryService = await this.getMemoryService();
            const toolExecutorService = await this.getToolExecutorService(duckdbVectorStore);

            // Dynamic import to avoid loading at startup - using new ThinkingCindyAgent
            const { ThinkingCindyAgent } = await import('../agents/ThinkingCindyAgent');

            // Get agent config from settings
            const agentConfig = await this.settingsService.get('general') || {};

            // Initialize thinking agent with enhanced capabilities
            this.langChainCindyAgent = new ThinkingCindyAgent({
                store: {},
                memoryService: memoryService,
                toolExecutor: toolExecutorService,
                config: {
                    enableStreaming: true,
                    ...agentConfig
                },
                llmRouter: this.llmProvider
            });

            console.log('[ServiceManager] ThinkingCindyAgent loaded successfully');
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
        toolExecutor: boolean;
        memory: boolean;
        cindyAgent: boolean;
    } {
        return {
            toolExecutor: !!this.langChainToolExecutorService,
            memory: !!this.langChainMemoryService,
            cindyAgent: !!this.langChainCindyAgent
        };
    }

    /**
     * Get service instances (if loaded)
     */
    getServiceInstances(): {
        toolExecutor: any;
        memory: any;
        cindyAgent: any;
    } {
        return {
            toolExecutor: this.langChainToolExecutorService,
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

            if (this.langChainToolExecutorService && typeof this.langChainToolExecutorService.cleanup === 'function') {
                await this.langChainToolExecutorService.cleanup();
            }

            // Vector store cleanup handled by DuckDBVectorStore in main.ts
        } catch (error) {
            console.error('[ServiceManager] Error during cleanup:', error);
        }

        // Reset all references
        this.langChainCindyAgent = null;
        this.langChainMemoryService = null;
        this.langChainToolExecutorService = null;

        console.log('[ServiceManager] Cleanup complete');
    }
}