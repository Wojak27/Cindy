/**
 * Centralized tool loader for importing and registering all available tools
 */

import { toolRegistry } from './ToolRegistry';
import { TavilySearch } from "@langchain/tavily";
import { SerpAPI } from "@langchain/community/tools/serpapi";
import { BraveSearch } from "@langchain/community/tools/brave_search";
import { DuckDuckGoSearch } from "@langchain/community/tools/duckduckgo_search";

// Import all tool creators
import { getApiKeyService } from '../../services/ApiKeyService';
import { GmailConnector } from '../../connectors/GmailConnector';
import { OutlookConnector } from '../../connectors/OutlookConnector';
import { ZoteroConnector } from '../../connectors/ZoteroConnector';
import { WikipediaQueryRun } from "@langchain/community/tools/wikipedia_query_run";
import { MendeleyConnector } from '../../connectors/MendeleyConnector';
import VectorSearchTool from './vector/VectorSearchTool';
import { AccuWeatherTool } from './weather/AccuWeatherTool';
import MapsDisplayTool from './maps/MapsDisplayTool';
import { StructuredTool } from '@langchain/core/tools';
import {
    GmailCreateDraft,
    GmailGetMessage,
    GmailGetThread,
    GmailSearch,
    GmailSendMessage,
} from "@langchain/community/tools/gmail";

/**
 * Tool configuration interface for initialization
 */
export interface ToolConfiguration {
    // Search API keys
    braveApiKey?: string;
    serpApiKey?: string;
    tavilyApiKey?: string;
    gmailApiKey?: {
        cliendEmail: string;
        privateKey: string;
        redirectUri?: string;
    }

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

        // await this.loadEmailAndReferenceTools(config, enabledTools, registeredTools, failedTools);

        // Load weather tools
        await this.loadWeatherTools(config, enabledTools, registeredTools, failedTools);

        // Load maps tools
        await this.loadMapsTools(config, enabledTools, registeredTools, failedTools);


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
     * Load email and reference management tools
     */

    private async loadEmailAndReferenceTools(
        config: ToolConfiguration,
        enabledTools: any,
        registeredTools: string[],
        failedTools: string[]
    ): Promise<void> {
        // Email Tools (Gmail, Outlook)
        const apiKeyService = getApiKeyService();
        const apiKeys = apiKeyService.getAllApiKeys();
        if (enabledTools.email !== false) {
            // Gmail Tool
            process.env.GOOGLE_CLIENT_EMAIL = apiKeys.gmailApiKey?.cliendEmail || "";
            process.env.GOOGLE_PRIVATE_KEY = apiKeys.gmailApiKey?.privateKey ? apiKeys.gmailApiKey.privateKey.replace(/\\n/g, '\n') : "";
            const tools: StructuredTool[] = [
                new GmailCreateDraft(),
                new GmailGetMessage(),
                new GmailGetThread(),
                new GmailSearch(),
                new GmailSendMessage(),
            ];
            // Register the tools separately to handle multiple tools
            for (const tool of tools) {
                try {
                    if (tool && !this.loadedTools.has(tool.name)) {
                        toolRegistry.registerTool(tool);
                        this.loadedTools.add(tool.name);
                        registeredTools.push(tool.name);
                    }
                } catch (error: any) {
                    console.error(`[ToolLoader] Failed to load Gmail tool ${tool.name}:`, error.message);
                    failedTools.push(`gmail_${tool.name}`);
                }
            }
        }
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
                process.env.BRAVE_API_KEY = apiKeys.braveApiKey;
                const spec = new BraveSearch();
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
                const spec = new WikipediaQueryRun({
                    topKResults: config.searchSettings?.maxResults || 5,
                })
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
                process.env.SERPAPI_API_KEY = apiKeys.serpApiKey;
                const spec = new SerpAPI();
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
                process.env.TAVILY_API_KEY = apiKeys.tavilyApiKey;
                // Note: TavilySearch constructor handles API key internally
                const spec = new TavilySearch({
                    maxResults: config.searchSettings?.maxResults || 5,
                })
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
                const spec = new DuckDuckGoSearch({
                    maxResults: config.searchSettings?.maxResults || 5,
                })
                if (spec && !this.loadedTools.has(spec.name)) {
                    toolRegistry.registerTool(spec);
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
                const spec = new VectorSearchTool(config.vectorStore);
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
        _config: ToolConfiguration,
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
                const spec = new AccuWeatherTool(accuWeatherKey);

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
        _config: ToolConfiguration,
        enabledTools: any,
        registeredTools: string[],
        failedTools: string[]
    ): Promise<void> {
        // Maps Display Tool (always available, no API key required)
        if (enabledTools.maps !== false) {
            try {
                const spec = new MapsDisplayTool();
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
            registeredCount: toolRegistry.getAllToolNames().length,
            availableTools: this.getLoadedTools()
        };
    }
}

// Export singleton instance
export const toolLoader = ToolLoader.getInstance();

// Export default
export default toolLoader;