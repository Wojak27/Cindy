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
import { createAccuWeatherTool } from './weather/AccuWeatherTool';
import { getApiKeyService, ApiKeyConfig } from '../../services/ApiKeyService';
import { createMapsDisplayTool } from './maps/MapsDisplayTool';
import { createEmailSearchTool } from './connectors/EmailSearchTool';
import { createReferenceSearchTool } from './connectors/ReferenceSearchTool';
import { GmailConnector } from '../../connectors/GmailConnector';
import { OutlookConnector } from '../../connectors/OutlookConnector';
import { ZoteroConnector } from '../../connectors/ZoteroConnector';
import { MendeleyConnector } from '../../connectors/MendeleyConnector';

/**
 * Tool configuration interface for initialization
 */
export interface ToolConfiguration {
    // Search API keys
    braveApiKey?: string;
    serpApiKey?: string;
    tavilyApiKey?: string;

    // Weather API keys
    accuWeatherApiKey?: string;

    // Vector store instance
    vectorStore?: any;

    // Connector instances
    connectors?: {
        gmail?: GmailConnector;
        outlook?: OutlookConnector;
        zotero?: ZoteroConnector;
        mendeley?: MendeleyConnector;
    };

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
        weather?: boolean;
        maps?: boolean;
        email?: boolean;
        references?: boolean;
    };
}

/**
 * Tool loader class for managing tool registration
 */
export class ToolLoader {
    private static instance: ToolLoader;
    private initialized: boolean = false;
    private loadedTools: Set<string> = new Set();

    private constructor() { }

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

        // Load weather tools
        await this.loadWeatherTools(config, enabledTools, registeredTools, failedTools);

        // Load maps tools
        await this.loadMapsTools(config, enabledTools, registeredTools, failedTools);

        // Load connector tools
        await this.loadConnectorTools(config, enabledTools, registeredTools, failedTools);

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
        // Load search providers in priority order (most reliable first, DuckDuckGo as fallback)
        // Use centralized API key service for consistent key loading
        const apiKeyService = getApiKeyService();
        const apiKeys = apiKeyService.getAllApiKeys();
        
        console.log('[ToolLoader] Loading search tools with centralized API key service');
        
        // Brave Search (primary - reliable with API key)
        if (enabledTools.brave !== false && apiKeys.braveApiKey) {
            try {
                const spec = createBraveSearchTool(apiKeys.braveApiKey);
                if (spec && !this.loadedTools.has(spec.name)) {
                    toolRegistry.registerTool(spec);
                    this.loadedTools.add(spec.name);
                    registeredTools.push(spec.name);
                    console.log('[ToolLoader] ✅ Brave Search loaded (primary search provider)');
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
        if (enabledTools.serpapi !== false && apiKeys.serpApiKey) {
            try {
                const spec = createSerpAPISearchTool(apiKeys.serpApiKey);
                if (spec && !this.loadedTools.has(spec.name)) {
                    toolRegistry.registerTool(spec);
                    this.loadedTools.add(spec.name);
                    registeredTools.push(spec.name);
                    console.log('[ToolLoader] ✅ SerpAPI Search loaded');
                }
            } catch (error: any) {
                console.error('[ToolLoader] Failed to load SerpAPI search:', error.message);
                failedTools.push('serp_search');
            }
        }

        // Tavily Search
        if (enabledTools.tavily !== false && apiKeys.tavilyApiKey) {
            try {
                const spec = createTavilySearchTool({
                    apiKey: apiKeys.tavilyApiKey,
                    maxResults: config.searchSettings?.maxResults
                });
                if (spec && !this.loadedTools.has(spec.name)) {
                    toolRegistry.registerTool(spec);
                    this.loadedTools.add(spec.name);
                    registeredTools.push(spec.name);
                    console.log('[ToolLoader] ✅ Tavily Search loaded');
                }
            } catch (error: any) {
                console.error('[ToolLoader] Failed to load Tavily search:', error.message);
                failedTools.push('tavily_search');
            }
        }

        // DuckDuckGo Search (fallback - free but unreliable due to VQD issues)
        if (enabledTools.duckduckgo !== false) {
            try {
                const spec: ToolSpecification | null = createDuckDuckGoSearchTool();
                if (spec && !this.loadedTools.has(spec.name)) {
                    // Don't auto-register since it's already done in the tool file
                    // Just track that it's loaded
                    this.loadedTools.add(spec.name);
                    registeredTools.push(spec.name);
                    console.log('[ToolLoader] ✅ DuckDuckGo Search loaded (fallback search provider)');
                }
            } catch (error: any) {
                console.error('[ToolLoader] Failed to load DuckDuckGo search:', error.message);
                failedTools.push('duckduckgo_search');
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
     * Load weather tools
     */
    private async loadWeatherTools(
        config: ToolConfiguration,
        enabledTools: any,
        registeredTools: string[],
        failedTools: string[]
    ): Promise<void> {
        // AccuWeather Tool (use API key from centralized service)
        if (enabledTools.weather !== false) {
            try {
                const apiKeyService = getApiKeyService();
                const apiKeys = apiKeyService.getAllApiKeys();
                
                // Use API key from service, fallback to hardcoded for testing
                const accuWeatherKey = apiKeys.accuWeatherApiKey || "7FW644HhxLVHH7r5bVYchwTPle2jo0sC";
                const spec = createAccuWeatherTool(accuWeatherKey);
                
                if (spec && !this.loadedTools.has(spec.name)) {
                    toolRegistry.registerTool(spec);
                    this.loadedTools.add(spec.name);
                    registeredTools.push(spec.name);
                    console.log(`[ToolLoader] ✅ AccuWeather loaded ${apiKeys.accuWeatherApiKey ? '(with API key)' : '(with fallback key)'}`);
                }
            } catch (error: any) {
                console.error('[ToolLoader] Failed to load AccuWeather tool:', error.message);
                failedTools.push('weather');
            }
        }
    }

    /**
     * Load maps tools
     */
    private async loadMapsTools(
        config: ToolConfiguration,
        enabledTools: any,
        registeredTools: string[],
        failedTools: string[]
    ): Promise<void> {
        // Maps Display Tool (always available, no API key required)
        if (enabledTools.maps !== false) {
            try {
                const spec = createMapsDisplayTool();
                if (spec && !this.loadedTools.has(spec.name)) {
                    toolRegistry.registerTool(spec);
                    this.loadedTools.add(spec.name);
                    registeredTools.push(spec.name);
                }
            } catch (error: any) {
                console.error('[ToolLoader] Failed to load Maps Display tool:', error.message);
                failedTools.push('display_map');
            }
        }
    }

    /**
     * Load connector tools
     */
    private async loadConnectorTools(
        config: ToolConfiguration,
        enabledTools: any,
        registeredTools: string[],
        failedTools: string[]
    ): Promise<void> {
        const connectors = config.connectors || {};

        // Email Search Tool
        if (enabledTools.email !== false && (connectors.gmail || connectors.outlook)) {
            try {
                const emailConnectors: { gmail?: GmailConnector; outlook?: OutlookConnector } = {};
                
                if (connectors.gmail && connectors.gmail.isConnected()) {
                    emailConnectors.gmail = connectors.gmail;
                }
                if (connectors.outlook && connectors.outlook.isConnected()) {
                    emailConnectors.outlook = connectors.outlook;
                }

                if (Object.keys(emailConnectors).length > 0) {
                    const spec = createEmailSearchTool(emailConnectors);
                    if (spec && !this.loadedTools.has(spec.name)) {
                        toolRegistry.registerTool(spec);
                        this.loadedTools.add(spec.name);
                        registeredTools.push(spec.name);
                        console.log(`[ToolLoader] Email search tool loaded with ${Object.keys(emailConnectors).join(', ')} connector(s)`);
                    }
                }
            } catch (error: any) {
                console.error('[ToolLoader] Failed to load Email Search tool:', error.message);
                failedTools.push('email_search');
            }
        }

        // Reference Search Tool
        if (enabledTools.references !== false && (connectors.zotero || connectors.mendeley)) {
            try {
                const refConnectors: { zotero?: ZoteroConnector; mendeley?: MendeleyConnector } = {};
                
                if (connectors.zotero && connectors.zotero.isConnected()) {
                    refConnectors.zotero = connectors.zotero;
                }
                if (connectors.mendeley && connectors.mendeley.isConnected()) {
                    refConnectors.mendeley = connectors.mendeley;
                }

                if (Object.keys(refConnectors).length > 0) {
                    const spec = createReferenceSearchTool(refConnectors);
                    if (spec && !this.loadedTools.has(spec.name)) {
                        toolRegistry.registerTool(spec);
                        this.loadedTools.add(spec.name);
                        registeredTools.push(spec.name);
                        console.log(`[ToolLoader] Reference search tool loaded with ${Object.keys(refConnectors).join(', ')} connector(s)`);
                    }
                }
            } catch (error: any) {
                console.error('[ToolLoader] Failed to load Reference Search tool:', error.message);
                failedTools.push('reference_search');
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

                case 'weather':
                    const spec = createAccuWeatherTool("7FW644HhxLVHH7r5bVYchwTPle2jo0sC");
                    // const spec = createAccuWeatherTool(config.accuWeatherApiKey);
                    if (spec) {
                        toolRegistry.registerTool(spec);
                        this.loadedTools.add(spec.name);
                        return true;
                    }
                    break;

                case 'display_map':
                    const mapSpec = createMapsDisplayTool();
                    if (mapSpec) {
                        toolRegistry.registerTool(mapSpec);
                        this.loadedTools.add(mapSpec.name);
                        return true;
                    }
                    break;

                case 'email_search':
                    if (config.connectors && (config.connectors.gmail || config.connectors.outlook)) {
                        const emailConnectors: { gmail?: GmailConnector; outlook?: OutlookConnector } = {};
                        
                        if (config.connectors.gmail && config.connectors.gmail.isConnected()) {
                            emailConnectors.gmail = config.connectors.gmail;
                        }
                        if (config.connectors.outlook && config.connectors.outlook.isConnected()) {
                            emailConnectors.outlook = config.connectors.outlook;
                        }

                        if (Object.keys(emailConnectors).length > 0) {
                            const spec = createEmailSearchTool(emailConnectors);
                            if (spec) {
                                toolRegistry.registerTool(spec);
                                this.loadedTools.add(spec.name);
                                return true;
                            }
                        }
                    }
                    break;

                case 'reference_search':
                    if (config.connectors && (config.connectors.zotero || config.connectors.mendeley)) {
                        const refConnectors: { zotero?: ZoteroConnector; mendeley?: MendeleyConnector } = {};
                        
                        if (config.connectors.zotero && config.connectors.zotero.isConnected()) {
                            refConnectors.zotero = config.connectors.zotero;
                        }
                        if (config.connectors.mendeley && config.connectors.mendeley.isConnected()) {
                            refConnectors.mendeley = config.connectors.mendeley;
                        }

                        if (Object.keys(refConnectors).length > 0) {
                            const spec = createReferenceSearchTool(refConnectors);
                            if (spec) {
                                toolRegistry.registerTool(spec);
                                this.loadedTools.add(spec.name);
                                return true;
                            }
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