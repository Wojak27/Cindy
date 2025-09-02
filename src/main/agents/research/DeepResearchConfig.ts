/**
 * Configuration management for the Deep Research agent.
 * Converted from Python to TypeScript.
 */

/**
 * Enumeration of available search API providers.
 */
export enum SearchAPI {
    ANTHROPIC = 'anthropic',
    OPENAI = 'openai',
    TAVILY = 'tavily',
    OLLAMA = 'ollama',
    BRAVE = 'brave',
    DUCKDUCKGO = 'duckduckgo',
    WIKIPEDIA = 'wikipedia',
    SERPAPI = 'serpapi',
    NONE = 'none',
}

/**
 * Configuration for Model Context Protocol (MCP) servers.
 */
export interface MCPConfig {
    /** The URL of the MCP server */
    url?: string;

    /** The tools to make available to the LLM */
    tools?: string[];

    /** Whether the MCP server requires authentication */
    auth_required?: boolean;
}

/**
 * UI configuration metadata for settings
 */
export interface UIConfig {
    type: 'number' | 'boolean' | 'slider' | 'select' | 'text' | 'mcp';
    default?: any;
    min?: number;
    max?: number;
    step?: number;
    description: string;
    options?: Array<{ label: string; value: string }>;
}

/**
 * Model configuration interface
 */
export interface ModelConfig {
    name: string;
    maxTokens: number;
    temperature?: number;
    provider?: 'openai' | 'anthropic' | 'ollama';
}

/**
 * Search provider configuration
 */
export interface SearchProviderConfig {
    provider: SearchAPI;
    apiKey?: string;
    maxResults?: number;
    timeout?: number;
}

/**
 * Main configuration interface for the Deep Research agent.
 */
export interface DeepResearchConfiguration {
    // General Configuration
    max_structured_output_retries: number;
    allow_clarification: boolean;
    max_concurrent_research_units: number;

    // Research Configuration
    search_api: SearchAPI;
    max_researcher_iterations: number;
    max_react_tool_calls: number;

    // Model Configuration
    summarization_model: string;
    summarization_model_max_tokens: number;
    max_content_length: number;
    research_model: string;
    research_model_max_tokens: number;
    compression_model: string;
    compression_model_max_tokens: number;
    final_report_model: string;
    final_report_model_max_tokens: number;

    // MCP server configuration
    mcp_config?: MCPConfig;
    mcp_prompt?: string;

    // Extended configuration for TypeScript implementation
    search_providers?: SearchProviderConfig[];
    model_configs?: Record<string, ModelConfig>;
    vector_store_config?: {
        enabled: boolean;
        provider: 'duckdb' | 'faiss' | 'chroma';
        embedding_model: string;
    };
}

/**
 * Default configuration values
 */
export const DEFAULT_DEEP_RESEARCH_CONFIG: DeepResearchConfiguration = {
    // General Configuration
    max_structured_output_retries: 3,
    allow_clarification: true,
    max_concurrent_research_units: 5,

    // Research Configuration
    search_api: SearchAPI.TAVILY,
    max_researcher_iterations: 2,
    max_react_tool_calls: 10,

    // Model Configuration
    summarization_model: 'openai:gpt-4o-mini',
    summarization_model_max_tokens: 8192,
    max_content_length: 50000,
    research_model: 'openai:gpt-4o',
    research_model_max_tokens: 10000,
    compression_model: 'openai:gpt-4o',
    compression_model_max_tokens: 8192,
    final_report_model: 'openai:gpt-4o',
    final_report_model_max_tokens: 10000,

    // Extended configuration
    search_providers: [
        {
            provider: SearchAPI.DUCKDUCKGO,
            maxResults: 10,
            timeout: 30000
        },
        {
            provider: SearchAPI.TAVILY,
            maxResults: 2,
            timeout: 30000
        }
    ],

    model_configs: {
        'openai:gpt-4o': {
            name: 'gpt-4o',
            maxTokens: 10000,
            temperature: 0.1,
            provider: 'openai'
        },
        'openai:gpt-4o-mini': {
            name: 'gpt-4o-mini',
            maxTokens: 8192,
            temperature: 0.1,
            provider: 'openai'
        },
        'ollama:llama3.1': {
            name: 'llama3.1',
            maxTokens: 8192,
            temperature: 0.1,
            provider: 'ollama'
        }
    },

    vector_store_config: {
        enabled: true,
        provider: 'duckdb',
        embedding_model: 'text-embedding-3-small'
    }
};

/**
 * UI configuration metadata for each field
 */
export const CONFIG_UI_METADATA: Record<keyof DeepResearchConfiguration, UIConfig> = {
    max_structured_output_retries: {
        type: 'number',
        default: 3,
        min: 1,
        max: 10,
        description: 'Maximum number of retries for structured output calls from models'
    },

    allow_clarification: {
        type: 'boolean',
        default: true,
        description: 'Whether to allow the researcher to ask the user clarifying questions before starting research'
    },

    max_concurrent_research_units: {
        type: 'slider',
        default: 5,
        min: 1,
        max: 20,
        step: 1,
        description: 'Maximum number of research units to run concurrently. Note: with more concurrency, you may run into rate limits.'
    },

    search_api: {
        type: 'select',
        default: SearchAPI.TAVILY,
        description: 'Search API to use for research',
        options: [
            { label: 'Tavily', value: SearchAPI.TAVILY },
            { label: 'DuckDuckGo', value: SearchAPI.DUCKDUCKGO },
            { label: 'Brave', value: SearchAPI.BRAVE },
            { label: 'Wikipedia', value: SearchAPI.WIKIPEDIA },
            { label: 'SerpAPI', value: SearchAPI.SERPAPI },
            { label: 'OpenAI Native Web Search', value: SearchAPI.OPENAI },
            { label: 'Anthropic Native Web Search', value: SearchAPI.ANTHROPIC },
            { label: 'None', value: SearchAPI.NONE }
        ]
    },

    max_researcher_iterations: {
        type: 'slider',
        default: 6,
        min: 1,
        max: 10,
        step: 1,
        description: 'Maximum number of research iterations for the Research Supervisor'
    },

    max_react_tool_calls: {
        type: 'slider',
        default: 10,
        min: 1,
        max: 30,
        step: 1,
        description: 'Maximum number of tool calling iterations to make in a single researcher step'
    },

    summarization_model: {
        type: 'text',
        default: 'openai:gpt-4o-mini',
        description: 'Model for summarizing research results from search results'
    },

    summarization_model_max_tokens: {
        type: 'number',
        default: 8192,
        description: 'Maximum output tokens for summarization model'
    },

    max_content_length: {
        type: 'number',
        default: 50000,
        min: 1000,
        max: 200000,
        description: 'Maximum character length for webpage content before summarization'
    },

    research_model: {
        type: 'text',
        default: 'openai:gpt-4o',
        description: 'Model for conducting research'
    },

    research_model_max_tokens: {
        type: 'number',
        default: 10000,
        description: 'Maximum output tokens for research model'
    },

    compression_model: {
        type: 'text',
        default: 'openai:gpt-4o',
        description: 'Model for compressing research findings from sub-agents'
    },

    compression_model_max_tokens: {
        type: 'number',
        default: 8192,
        description: 'Maximum output tokens for compression model'
    },

    final_report_model: {
        type: 'text',
        default: 'openai:gpt-4o',
        description: 'Model for writing the final report from all research findings'
    },

    final_report_model_max_tokens: {
        type: 'number',
        default: 10000,
        description: 'Maximum output tokens for final report model'
    },

    mcp_config: {
        type: 'mcp',
        description: 'MCP server configuration'
    },

    mcp_prompt: {
        type: 'text',
        description: 'Additional instructions regarding MCP tools available to the agent'
    },

    search_providers: {
        type: 'text',
        description: 'Search provider configurations'
    },

    model_configs: {
        type: 'text',
        description: 'Model configuration mappings'
    },

    vector_store_config: {
        type: 'text',
        description: 'Vector store configuration'
    }
};

/**
 * Configuration manager class
 */
export class DeepResearchConfigManager {
    private config: DeepResearchConfiguration;

    constructor(initialConfig?: Partial<DeepResearchConfiguration>) {
        this.config = { ...DEFAULT_DEEP_RESEARCH_CONFIG, ...initialConfig };
    }

    /**
     * Get the current configuration
     */
    getConfig(): DeepResearchConfiguration {
        return { ...this.config };
    }

    /**
     * Update configuration with partial values
     */
    updateConfig(updates: Partial<DeepResearchConfiguration>): void {
        this.config = { ...this.config, ...updates };
    }

    /**
     * Get configuration from environment variables and settings
     */
    static fromEnvironmentAndSettings(settings?: Record<string, any>): DeepResearchConfigManager {
        const config: Partial<DeepResearchConfiguration> = {};

        // Load from environment variables
        const envMappings: Record<string, keyof DeepResearchConfiguration> = {
            'MAX_STRUCTURED_OUTPUT_RETRIES': 'max_structured_output_retries',
            'ALLOW_CLARIFICATION': 'allow_clarification',
            'MAX_CONCURRENT_RESEARCH_UNITS': 'max_concurrent_research_units',
            'SEARCH_API': 'search_api',
            'MAX_RESEARCHER_ITERATIONS': 'max_researcher_iterations',
            'MAX_REACT_TOOL_CALLS': 'max_react_tool_calls',
        };

        for (const [envKey, configKey] of Object.entries(envMappings)) {
            const envValue = process.env[envKey];
            if (envValue !== undefined) {
                if (configKey === 'search_api') {
                    (config as any)[configKey] = envValue as SearchAPI;
                } else if (typeof DEFAULT_DEEP_RESEARCH_CONFIG[configKey] === 'number') {
                    (config as any)[configKey] = parseInt(envValue, 10);
                } else if (typeof DEFAULT_DEEP_RESEARCH_CONFIG[configKey] === 'boolean') {
                    (config as any)[configKey] = envValue.toLowerCase() === 'true';
                } else {
                    (config as any)[configKey] = envValue;
                }
            }
        }

        // Override with settings if provided
        if (settings) {
            Object.assign(config, settings);
        }

        return new DeepResearchConfigManager(config);
    }

    /**
     * Validate configuration
     */
    validate(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (this.config.max_structured_output_retries < 1 || this.config.max_structured_output_retries > 10) {
            errors.push('max_structured_output_retries must be between 1 and 10');
        }

        if (this.config.max_concurrent_research_units < 1 || this.config.max_concurrent_research_units > 20) {
            errors.push('max_concurrent_research_units must be between 1 and 20');
        }

        if (this.config.max_researcher_iterations < 1 || this.config.max_researcher_iterations > 10) {
            errors.push('max_researcher_iterations must be between 1 and 10');
        }

        if (this.config.max_react_tool_calls < 1 || this.config.max_react_tool_calls > 30) {
            errors.push('max_react_tool_calls must be between 1 and 30');
        }

        if (!Object.values(SearchAPI).includes(this.config.search_api)) {
            errors.push(`Invalid search_api: ${this.config.search_api}`);
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Get search provider configuration for a specific API
     */
    getSearchProviderConfig(api: SearchAPI): SearchProviderConfig | undefined {
        return this.config.search_providers?.find(provider => provider.provider === api);
    }

    /**
     * Get model configuration for a specific model
     */
    getModelConfig(modelName: string): ModelConfig | undefined {
        return this.config.model_configs?.[modelName];
    }

    /**
     * Export configuration as JSON
     */
    toJSON(): string {
        return JSON.stringify(this.config, null, 2);
    }

    /**
     * Load configuration from JSON
     */
    static fromJSON(json: string): DeepResearchConfigManager {
        const config = JSON.parse(json) as DeepResearchConfiguration;
        return new DeepResearchConfigManager(config);
    }
}