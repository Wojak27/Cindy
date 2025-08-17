/**
 * Centralized tool loader for importing and registering all available tools
 */

import { toolRegistry } from './ToolRegistry';
import type { ToolSpecification } from './ToolDefinitions';

// Import all tool creators
import { createDuckDuckGoSearchTool } from './search/DuckDuckGoSearchTool';
import { createBraveSearchTool } from './search/BraveSearchTool';
import { createWikipediaSearchTool } from './search/WikipediaSearchTool';
import { createSerpAPISearchTool } from './search/SerpAPISearchTool';
import { createTavilySearchTool } from './search/TavilySearchTool';
import { createVectorSearchTool } from './vector/VectorSearchTool';

/**
 * Tool configuration interface for initialization
 */
export interface ToolConfiguration {
    // Search API keys
    braveApiKey?: string;
    serpApiKey?: string;
    tavilyApiKey?: string;
    
    // Vector store instance
    vectorStore?: any;
    
    // Tool-specific settings
    searchSettings?: {
        preferredProvider?: string;
        maxResults?: number;
        timeout?: number;
    };
    
    // Enable/disable specific tools
    enabledTools?: {
        duckduckgo?: boolean;
        brave?: boolean;
        wikipedia?: boolean;
        serpapi?: boolean;
        tavily?: boolean;
        vector?: boolean;
    };
}

/**
 * Tool loader class for managing tool registration
 */
export class ToolLoader {
    private static instance: ToolLoader;
    private initialized: boolean = false;
    private loadedTools: Set<string> = new Set();

    private constructor() {}

    /**
     * Get singleton instance
     */
    static getInstance(): ToolLoader {
        if (!ToolLoader.instance) {
            ToolLoader.instance = new ToolLoader();
        }
        return ToolLoader.instance;
    }

    /**
     * Load and register all available tools
     */
    async loadAllTools(config: ToolConfiguration = {}): Promise<void> {
        console.log('[ToolLoader] Starting tool registration process...');
        
        const enabledTools = config.enabledTools || {};
        const registeredTools: string[] = [];
        const failedTools: string[] = [];

        // Load search tools
        await this.loadSearchTools(config, enabledTools, registeredTools, failedTools);
        
        // Load vector tools
        await this.loadVectorTools(config, enabledTools, registeredTools, failedTools);
        
        // Log results
        console.log(`[ToolLoader] ✅ Successfully registered ${registeredTools.length} tools:`, registeredTools);
        if (failedTools.length > 0) {
            console.log(`[ToolLoader] ⚠️  Failed to register ${failedTools.length} tools:`, failedTools);
        }
        
        this.initialized = true;
        console.log('[ToolLoader] Tool loading complete');
        
        // Emit event to notify that tools are loaded
        toolRegistry.emit('tools-loaded', {
            registered: registeredTools,
            failed: failedTools,
            total: registeredTools.length
        });
    }

    /**
     * Load search tools
     */
    private async loadSearchTools(
        config: ToolConfiguration,
        enabledTools: any,
        registeredTools: string[],
        failedTools: string[]
    ): Promise<void> {
        // DuckDuckGo Search (free, no API key required)
        if (enabledTools.duckduckgo !== false) {
            try {
                const spec: ToolSpecification | null = createDuckDuckGoSearchTool();
                if (spec && !this.loadedTools.has(spec.name)) {
                    // Don't auto-register since it's already done in the tool file
                    // Just track that it's loaded
                    this.loadedTools.add(spec.name);
                    registeredTools.push(spec.name);
                }
            } catch (error: any) {
                console.error('[ToolLoader] Failed to load DuckDuckGo search:', error.message);
                failedTools.push('duckduckgo_search');
            }
        }

        // Brave Search
        if (enabledTools.brave !== false && config.braveApiKey) {
            try {
                const spec = createBraveSearchTool(config.braveApiKey);
                if (spec && !this.loadedTools.has(spec.name)) {
                    toolRegistry.registerTool(spec);
                    this.loadedTools.add(spec.name);
                    registeredTools.push(spec.name);
                }
            } catch (error: any) {
                console.error('[ToolLoader] Failed to load Brave search:', error.message);
                failedTools.push('brave_search');
            }
        }

        // Wikipedia Search
        if (enabledTools.wikipedia !== false) {
            try {
                const spec = createWikipediaSearchTool(config.searchSettings);
                if (spec && !this.loadedTools.has(spec.name)) {
                    // Don't auto-register since it's already done in the tool file
                    this.loadedTools.add(spec.name);
                    registeredTools.push(spec.name);
                }
            } catch (error: any) {
                console.error('[ToolLoader] Failed to load Wikipedia search:', error.message);
                failedTools.push('wikipedia_search');
            }
        }

        // SerpAPI Search
        if (enabledTools.serpapi !== false && config.serpApiKey) {
            try {
                const spec = createSerpAPISearchTool(config.serpApiKey);
                if (spec && !this.loadedTools.has(spec.name)) {
                    toolRegistry.registerTool(spec);
                    this.loadedTools.add(spec.name);
                    registeredTools.push(spec.name);
                }
            } catch (error: any) {
                console.error('[ToolLoader] Failed to load SerpAPI search:', error.message);
                failedTools.push('serp_search');
            }
        }

        // Tavily Search
        if (enabledTools.tavily !== false && config.tavilyApiKey) {
            try {
                const spec = createTavilySearchTool({ 
                    apiKey: config.tavilyApiKey,
                    maxResults: config.searchSettings?.maxResults 
                });
                if (spec && !this.loadedTools.has(spec.name)) {
                    toolRegistry.registerTool(spec);
                    this.loadedTools.add(spec.name);
                    registeredTools.push(spec.name);
                }
            } catch (error: any) {
                console.error('[ToolLoader] Failed to load Tavily search:', error.message);
                failedTools.push('tavily_search');
            }
        }
    }

    /**
     * Load vector tools
     */
    private async loadVectorTools(
        config: ToolConfiguration,
        enabledTools: any,
        registeredTools: string[],
        failedTools: string[]
    ): Promise<void> {
        // Vector Search Tool
        if (enabledTools.vector !== false && config.vectorStore) {
            try {
                const spec = createVectorSearchTool(config.vectorStore);
                if (spec && !this.loadedTools.has(spec.name)) {
                    toolRegistry.registerTool(spec);
                    this.loadedTools.add(spec.name);
                    registeredTools.push(spec.name);
                }
            } catch (error: any) {
                console.error('[ToolLoader] Failed to load vector search:', error.message);
                failedTools.push('search_documents');
            }
        }
    }

    /**
     * Reload specific tool with new configuration
     */
    async reloadTool(toolName: string, config: Partial<ToolConfiguration>): Promise<boolean> {
        try {
            // Unregister existing tool if it exists
            if (toolRegistry.hasTool(toolName)) {
                toolRegistry.unregisterTool(toolName);
                this.loadedTools.delete(toolName);
            }

            // Reload based on tool name
            switch (toolName) {
                case 'brave_search':
                    if (config.braveApiKey) {
                        const spec = createBraveSearchTool(config.braveApiKey);
                        if (spec) {
                            toolRegistry.registerTool(spec);
                            this.loadedTools.add(spec.name);
                            return true;
                        }
                    }
                    break;

                case 'serp_search':
                    if (config.serpApiKey) {
                        const spec = createSerpAPISearchTool(config.serpApiKey);
                        if (spec) {
                            toolRegistry.registerTool(spec);
                            this.loadedTools.add(spec.name);
                            return true;
                        }
                    }
                    break;

                case 'tavily_search':
                    if (config.tavilyApiKey) {
                        const spec = createTavilySearchTool({ 
                            apiKey: config.tavilyApiKey,
                            maxResults: config.searchSettings?.maxResults 
                        });
                        if (spec) {
                            toolRegistry.registerTool(spec);
                            this.loadedTools.add(spec.name);
                            return true;
                        }
                    }
                    break;

                case 'search_documents':
                    if (config.vectorStore) {
                        const spec = createVectorSearchTool(config.vectorStore);
                        if (spec) {
                            toolRegistry.registerTool(spec);
                            this.loadedTools.add(spec.name);
                            return true;
                        }
                    }
                    break;

                default:
                    console.warn(`[ToolLoader] Unknown tool for reload: ${toolName}`);
                    return false;
            }

            return false;
        } catch (error: any) {
            console.error(`[ToolLoader] Failed to reload tool ${toolName}:`, error.message);
            return false;
        }
    }

    /**
     * Get loading status
     */
    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Get loaded tool names
     */
    getLoadedTools(): string[] {
        return Array.from(this.loadedTools);
    }

    /**
     * Clear all loaded tools
     */
    clear(): void {
        this.loadedTools.clear();
        this.initialized = false;
        console.log('[ToolLoader] Cleared all loaded tools');
    }

    /**
     * Get tool loading statistics
     */
    getStats(): {
        initialized: boolean;
        loadedCount: number;
        registeredCount: number;
        availableTools: string[];
    } {
        return {
            initialized: this.initialized,
            loadedCount: this.loadedTools.size,
            registeredCount: toolRegistry.getAllTools().length,
            availableTools: this.getLoadedTools()
        };
    }
}

// Export singleton instance
export const toolLoader = ToolLoader.getInstance();

// Export default
export default toolLoader;