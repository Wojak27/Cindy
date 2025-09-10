/**
 * Centralized API Key Management Service
 * Handles loading and validation of API keys from multiple sources:
 * 1. Settings Service (user configuration)
 * 2. .env file (development/deployment)
 * 3. Environment variables (system/docker)
 */

import 'dotenv/config'; // Ensure .env is loaded early
import { SettingsService } from './SettingsService.ts';

export interface ApiKeyConfig {
    // Search APIs
    braveApiKey?: string;
    tavilyApiKey?: string;
    serpApiKey?: string;
    gmailApiKey?: {
        cliendEmail: string;
        privateKey: string;
        redirectUri?: string;
    }
    // Weather APIs
    accuWeatherApiKey?: string;

    // LLM Provider APIs
    openaiApiKey?: string;
    anthropicApiKey?: string;
    googleAiApiKey?: string;
    groqApiKey?: string;

    // Microsoft Services
    microsoftClientId?: string;
    microsoftClientSecret?: string;

    // Development/Debugging
    langchainApiKey?: string;
}

export interface ApiKeySource {
    key: string;
    value: string | undefined;
    source: 'settings' | 'env_file' | 'process_env' | 'not_found';
    isValid: boolean;
}

/**
 * Centralized API Key Service
 * Provides consistent API key loading with priority: Settings > .env > process.env
 */
export class ApiKeyService {
    private settingsService?: SettingsService;
    private cache: Map<string, ApiKeySource> = new Map();
    private cacheExpiry: number = 5 * 60 * 1000; // 5 minutes
    private lastCacheUpdate: number = 0;

    constructor(settingsService?: SettingsService) {
        this.settingsService = settingsService;
        console.log('[ApiKeyService] Initialized with multi-source API key loading');
    }

    /**
     * Get all available API keys with their sources
     */
    getAllApiKeys(): ApiKeyConfig {
        this.refreshCacheIfNeeded();

        return {
            // Search APIs
            braveApiKey: this.getApiKey('BRAVE_API_KEY'),
            tavilyApiKey: this.getApiKey('TAVILY_API_KEY'),
            serpApiKey: this.getApiKey('SERP_API_KEY'),

            // Weather APIs
            accuWeatherApiKey: this.getApiKey('ACCUWEATHER_API_KEY'),

            // LLM Provider APIs
            openaiApiKey: this.getApiKey('OPENAI_API_KEY'),
            anthropicApiKey: this.getApiKey('ANTHROPIC_API_KEY'),
            googleAiApiKey: this.getApiKey('GOOGLE_AI_API_KEY'),
            groqApiKey: this.getApiKey('GROQ_API_KEY'),

            // Microsoft Services
            microsoftClientId: this.getApiKey('MICROSOFT_CLIENT_ID'),
            microsoftClientSecret: this.getApiKey('MICROSOFT_CLIENT_SECRET'),

            // Development/Debugging
            langchainApiKey: this.getApiKey('LANGCHAIN_API_KEY')
        };
    }

    /**
     * Get a specific API key with source information
     */
    getApiKeyWithSource(keyName: string): ApiKeySource {
        this.refreshCacheIfNeeded();

        if (this.cache.has(keyName)) {
            return this.cache.get(keyName)!;
        }

        const result = this.loadApiKeyFromSources(keyName);
        this.cache.set(keyName, result);
        return result;
    }

    /**
     * Get a specific API key (just the value)
     */
    getApiKey(keyName: string): string | undefined {
        const keyInfo = this.getApiKeyWithSource(keyName);
        return keyInfo.isValid ? keyInfo.value : undefined;
    }

    /**
     * Check if an API key is available from any source
     */
    hasApiKey(keyName: string): boolean {
        const key = this.getApiKey(keyName);
        return key !== undefined && key.length > 0;
    }

    /**
     * Get diagnostic information about all API keys
     */
    getDiagnostics(): {
        totalKeys: number;
        availableKeys: string[];
        missingKeys: string[];
        sourceBreakdown: Record<string, number>;
    } {
        const allKeys = [
            'BRAVE_API_KEY', 'TAVILY_API_KEY', 'SERP_API_KEY',
            'ACCUWEATHER_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY',
            'GOOGLE_AI_API_KEY', 'GROQ_API_KEY', 'MICROSOFT_CLIENT_ID',
            'MICROSOFT_CLIENT_SECRET', 'LANGSMITH_API_KEY'
        ];

        const availableKeys: string[] = [];
        const missingKeys: string[] = [];
        const sourceBreakdown: Record<string, number> = {
            settings: 0,
            env_file: 0,
            process_env: 0,
            not_found: 0
        };

        for (const keyName of allKeys) {
            const keyInfo = this.getApiKeyWithSource(keyName);
            if (keyInfo.isValid) {
                availableKeys.push(keyName);
            } else {
                missingKeys.push(keyName);
            }
            sourceBreakdown[keyInfo.source]++;
        }

        return {
            totalKeys: allKeys.length,
            availableKeys,
            missingKeys,
            sourceBreakdown
        };
    }

    /**
     * Load API key from multiple sources in priority order
     */
    private loadApiKeyFromSources(keyName: string): ApiKeySource {
        // Priority 1: Settings Service (user configuration)
        if (this.settingsService) {
            try {
                const settingsKey = this.keyNameToSettingsKey(keyName);
                const settingsValue = (this.settingsService as any)?.get?.(settingsKey);
                if (this.isValidApiKey(settingsValue)) {
                    return {
                        key: keyName,
                        value: settingsValue,
                        source: 'settings',
                        isValid: true
                    };
                }
            } catch (error) {
                console.warn(`[ApiKeyService] Error loading ${keyName} from settings:`, error);
            }
        }

        // Priority 2: Environment variables (process.env - includes .env file)
        const envValue = process.env[keyName];
        if (this.isValidApiKey(envValue)) {
            return {
                key: keyName,
                value: envValue,
                source: 'process_env', // This includes .env file values
                isValid: true
            };
        }

        // Not found in any source
        return {
            key: keyName,
            value: undefined,
            source: 'not_found',
            isValid: false
        };
    }

    /**
     * Convert environment variable names to settings service keys
     */
    private keyNameToSettingsKey(keyName: string): string {
        const keyMap: Record<string, string> = {
            'BRAVE_API_KEY': 'braveApiKey',
            'TAVILY_API_KEY': 'tavilyApiKey',
            'SERP_API_KEY': 'serpApiKey',
            'ACCUWEATHER_API_KEY': 'accuWeatherApiKey',
            'OPENAI_API_KEY': 'openaiApiKey',
            'ANTHROPIC_API_KEY': 'anthropicApiKey',
            'GOOGLE_AI_API_KEY': 'googleAiApiKey',
            'GROQ_API_KEY': 'groqApiKey',
            'MICROSOFT_CLIENT_ID': 'microsoftClientId',
            'MICROSOFT_CLIENT_SECRET': 'microsoftClientSecret',
            'LANGCHAIN_API_KEY': 'langchainApiKey'
        };

        return keyMap[keyName] || keyName.toLowerCase().replace(/_/g, '');
    }

    /**
     * Validate if an API key value is usable
     */
    private isValidApiKey(value: string | undefined): boolean {
        return value !== undefined &&
            value !== null &&
            typeof value === 'string' &&
            value.trim().length > 0 &&
            !value.includes('your_') && // Exclude placeholder values
            !value.includes('_here');
    }

    /**
     * Refresh cache if expired
     */
    private refreshCacheIfNeeded(): void {
        const now = Date.now();
        if (now - this.lastCacheUpdate > this.cacheExpiry) {
            this.cache.clear();
            this.lastCacheUpdate = now;
            console.log('[ApiKeyService] Cache refreshed');
        }
    }

    /**
     * Clear cache manually (useful for testing or when settings change)
     */
    clearCache(): void {
        this.cache.clear();
        this.lastCacheUpdate = 0;
        console.log('[ApiKeyService] Cache cleared manually');
    }

    /**
     * Log diagnostic information about loaded API keys
     */
    logDiagnostics(): void {
        const diagnostics = this.getDiagnostics();

        console.log('[ApiKeyService] API Key Diagnostics:');
        console.log(`  Total keys checked: ${diagnostics.totalKeys}`);
        console.log(`  Available keys: ${diagnostics.availableKeys.length}`);
        console.log(`  Missing keys: ${diagnostics.missingKeys.length}`);

        if (diagnostics.availableKeys.length > 0) {
            console.log(`  Available: ${diagnostics.availableKeys.join(', ')}`);
        }

        console.log('  Source breakdown:');
        Object.entries(diagnostics.sourceBreakdown).forEach(([source, count]) => {
            if (count > 0) {
                console.log(`    ${source}: ${count} keys`);
            }
        });
    }
}

// Create singleton instance for global use
let globalApiKeyService: ApiKeyService | null = null;

/**
 * Get the global API key service instance
 */
export function getApiKeyService(settingsService?: SettingsService): ApiKeyService {
    if (!globalApiKeyService) {
        globalApiKeyService = new ApiKeyService(settingsService);
    }
    return globalApiKeyService;
}

/**
 * Initialize the global API key service with settings service
 */
export function initializeApiKeyService(settingsService: SettingsService): ApiKeyService {
    globalApiKeyService = new ApiKeyService(settingsService);
    return globalApiKeyService;
}