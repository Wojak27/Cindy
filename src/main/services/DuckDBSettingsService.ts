import { Database } from 'duckdb-async';
import * as path from 'path';
import { app } from 'electron';
import { EventEmitter } from 'events';
import * as keytar from 'keytar';

export interface Settings {
    // General settings
    general: {
        startAtLogin: boolean;
        minimizeToTray: boolean;
        notifications: boolean;
        language: string;
    };

    // Voice settings
    voice: {
        activationPhrase: string;
        wakeWordSensitivity: number;
        audioThreshold: number;
        voiceSpeed: number;
        voicePitch: number;
        sttProvider: 'online' | 'offline' | 'auto';
        ttsProvider: 'kokoro' | 'auto';
    };

    // TTS settings
    tts?: {
        modelPermissions?: Record<string, 'granted' | 'denied'>;
    };

    // LLM settings
    llm: {
        provider: 'openai' | 'ollama' | 'anthropic' | 'openrouter' | 'groq' | 'google' | 'cohere' | 'azure' | 'huggingface' | 'auto';
        openai: {
            model: string;
            apiKey?: string;
            organizationId?: string;
            temperature: number;
            maxTokens?: number;
        };
        ollama: {
            model: string;
            baseUrl: string;
            temperature: number;
        };
        anthropic: {
            model: string;
            apiKey?: string;
            temperature: number;
            maxTokens: number;
        };
        openrouter: {
            model: string;
            apiKey?: string;
            temperature: number;
            maxTokens: number;
            siteUrl: string;
            appName: string;
        };
        groq: {
            model: string;
            apiKey?: string;
            temperature: number;
            maxTokens: number;
        };
        google: {
            model: string;
            apiKey?: string;
            temperature: number;
            maxOutputTokens: number;
        };
        cohere: {
            model: string;
            apiKey?: string;
            temperature: number;
        };
        azure: {
            deploymentName: string;
            apiKey?: string;
            apiVersion: string;
            instanceName: string;
            temperature: number;
            maxTokens: number;
        };
        huggingface: {
            model: string;
            apiKey?: string;
            temperature: number;
            maxTokens: number;
        };
    };

    // Vault settings
    vault: {
        path: string;
        autoIndex: boolean;
        indexSchedule: string; // cron expression
    };

    // Research settings
    research: {
        enabled: boolean;
        maxConcurrentTasks: number;
        dailySummaryTime: string; // cron expression
        researchInterval: string; // cron expression
        maxSourcesPerResearch: number;
        outputPath: string;
    };

    // Privacy settings
    privacy: {
        offlineOnlyMode: boolean;
        autoDeleteHistory: boolean;
        autoDeleteHistoryAfterDays: number;
        encryptLocalStorage: boolean;
        disableAnalytics: boolean;
    };

    // System settings
    system: {
        maxMemoryUsage: number; // in MB
        logLevel: 'error' | 'warn' | 'info' | 'debug';
        autoUpdate: boolean;
    };

    // Search API settings
    search: {
        preferredProvider: 'duckduckgo' | 'brave' | 'tavily' | 'serp' | 'auto';
        braveApiKey?: string;
        tavilyApiKey?: string;
        serpApiKey?: string;
        fallbackProviders: string[]; // Priority order of fallback providers
        rateLimit: {
            enabled: boolean;
            requestsPerMinute: number;
            cooldownSeconds: number;
        };
    };

    // Database settings
    database: {
        path: string;
        embeddingModel: string;
        chunkSize: number;
        chunkOverlap: number;
        autoIndex: boolean;
        notesPath: string;
    };

    // User profile settings
    profile: {
        name: string;
        surname: string;
        hasCompletedSetup: boolean;
    };
}

export class DuckDBSettingsService extends EventEmitter {
    private db: Database | null = null;
    private DB_PATH: string;
    private settings: Settings;
    private isInitialized: boolean = false;
    private isMigrating: boolean = false;
    private migrationComplete: boolean = false;
    private readonly SERVICE_NAME = 'Cindy';
    private readonly ACCOUNT_NAME = 'openai_api_key';

    constructor() {
        super();
        this.settings = this.getDefaultSettings();
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        // Initialize database path
        this.DB_PATH = path.join(app.getPath('userData'), 'cindy-settings.db');

        try {
            console.log('[DuckDBSettingsService] Initializing database at:', this.DB_PATH);
            this.db = await Database.create(this.DB_PATH);

            // Create enhanced settings table
            await this.db.exec(`
                CREATE TABLE IF NOT EXISTS settings (
                    key VARCHAR PRIMARY KEY,
                    section VARCHAR NOT NULL,
                    value TEXT NOT NULL,
                    data_type VARCHAR DEFAULT 'string'
                );
            `);

            // Create indexes for better performance
            await this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);
                CREATE INDEX IF NOT EXISTS idx_settings_section ON settings(section);
            `);

            // Check if migration is needed and perform it (only once)
            if (!this.migrationComplete && !this.isMigrating) {
                const migrationNeeded = await this.isMigrationNeeded();
                if (migrationNeeded) {
                    console.log('[DuckDBSettingsService] Migration from JSON detected as needed');
                    this.isMigrating = true;
                    try {
                        const migrationSuccess = await this.migrateFromJSON();
                        if (migrationSuccess) {
                            console.log('[DuckDBSettingsService] Settings successfully migrated from JSON to database');
                            this.migrationComplete = true;
                        } else {
                            console.log('[DuckDBSettingsService] Migration was not performed');
                        }
                    } finally {
                        this.isMigrating = false;
                    }
                }
            }

            // Load settings from database
            await this.loadSettings();

            this.isInitialized = true;
            console.log('[DuckDBSettingsService] Initialization completed successfully');
            this.emit('initialized', this.settings);
        } catch (error) {
            console.error('[DuckDBSettingsService] Failed to initialize:', error);
            throw error;
        }
    }

    private async loadSettings(): Promise<void> {
        if (!this.db) return;

        try {
            const rows = await this.db.all('SELECT key, value FROM settings');
            const dbSettings: any = {};

            for (const row of rows) {
                const keys = row.key.split('.');
                let current = dbSettings;

                for (let i = 0; i < keys.length - 1; i++) {
                    if (!current[keys[i]]) {
                        current[keys[i]] = {};
                    }
                    current = current[keys[i]];
                }

                try {
                    current[keys[keys.length - 1]] = JSON.parse(row.value);
                } catch {
                    current[keys[keys.length - 1]] = row.value;
                }
            }

            // Merge with defaults
            this.settings = this.mergeSettings(this.getDefaultSettings(), dbSettings);
            console.log('[DuckDBSettingsService] Settings loaded from database');
        } catch (error) {
            console.warn('[DuckDBSettingsService] Failed to load settings:', error);
            this.settings = this.getDefaultSettings();
        }
    }

    private mergeSettings(defaults: any, loaded: any): any {
        const merged = { ...defaults };

        for (const key in loaded) {
            if (loaded.hasOwnProperty(key)) {
                if (typeof loaded[key] === 'object' && !Array.isArray(loaded[key]) && loaded[key] !== null) {
                    merged[key] = this.mergeSettings(defaults[key] || {}, loaded[key]);
                } else {
                    merged[key] = loaded[key];
                }
            }
        }

        return merged;
    }

    async get<T extends keyof Settings>(section: T): Promise<Settings[T]> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        return { ...this.settings[section] } as Settings[T];
    }

    async set<T extends keyof Settings>(section: T, value: Partial<Settings[T]>): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        // Update settings in memory
        this.settings[section] = { ...this.settings[section], ...value } as Settings[T];

        // Handle sensitive data (API keys)
        if (section === 'llm') {
            // Handle OpenAI API key (store in keychain)
            if ('openai' in value && value.openai) {
                const openaiSettings = value.openai as Partial<Settings['llm']['openai'] & { apiKey?: string }>;
                if (openaiSettings.apiKey) {
                    await this.setApiKey(openaiSettings.apiKey);
                    // Store placeholder to indicate key exists
                    (this.settings.llm.openai as any).apiKey = '***';
                }
            }

            // Handle other provider API keys (store in database for now)
            const providers = ['anthropic', 'openrouter', 'groq', 'google', 'cohere', 'azure', 'huggingface'] as const;
            for (const provider of providers) {
                if (provider in value && (value as any)[provider]?.apiKey) {
                    console.log(`[DuckDBSettingsService] Storing ${provider} API key in database`);
                    // For now, keep the API keys in database for these providers
                    // TODO: Move to keychain for better security
                }
            }
        }

        // Save to database
        await this.saveSection(section);

        // Emit change event
        this.emit('settingsChanged', { section, value });
    }

    private async saveSection<T extends keyof Settings>(section: T): Promise<void> {
        if (!this.db) return;

        try {
            const sectionData = this.settings[section];
            const flattenedData = this.flattenObject(sectionData, section as string);

            for (const [key, value] of Object.entries(flattenedData)) {
                const dataType = Array.isArray(value) ? 'array' : 
                                typeof value === 'object' && value !== null ? 'object' :
                                typeof value;
                
                await this.db.run(
                    `INSERT OR REPLACE INTO settings (key, section, value, data_type) 
                     VALUES (?, ?, ?, ?)`,
                    [key, section as string, JSON.stringify(value), dataType]
                );
            }

            console.log(`[DuckDBSettingsService] Saved section: ${section}`);
        } catch (error) {
            console.error(`[DuckDBSettingsService] Failed to save section ${section}:`, error);
            throw error;
        }
    }

    private flattenObject(obj: any, prefix: string = ''): Record<string, any> {
        const flattened: Record<string, any> = {};

        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const fullKey = prefix ? `${prefix}.${key}` : key;

                if (typeof obj[key] === 'object' && !Array.isArray(obj[key]) && obj[key] !== null) {
                    Object.assign(flattened, this.flattenObject(obj[key], fullKey));
                } else {
                    flattened[fullKey] = obj[key];
                }
            }
        }

        return flattened;
    }

    async getAll(): Promise<Settings> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        return JSON.parse(JSON.stringify(this.settings));
    }

    async save(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        // Save all sections
        for (const section of Object.keys(this.settings) as (keyof Settings)[]) {
            await this.saveSection(section);
        }

        this.emit('settingsSaved');
    }

    async resetToDefaults(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        this.settings = this.getDefaultSettings();

        if (this.db) {
            await this.db.exec('DELETE FROM settings');
            await this.save();
        }

        this.emit('settingsReset');
    }

    // API Key management methods using keytar
    async getApiKey(): Promise<string> {
        const apiKey = await keytar.getPassword(this.SERVICE_NAME, this.ACCOUNT_NAME);
        return apiKey || '';
    }

    private async setApiKey(apiKey: string): Promise<void> {
        await keytar.setPassword(this.SERVICE_NAME, this.ACCOUNT_NAME, apiKey);
    }

    async getBraveApiKey(): Promise<string> {
        try {
            const apiKey = await keytar.getPassword(this.SERVICE_NAME, 'brave_api_key');
            if (apiKey) {
                return apiKey;
            }
            const searchSettings = await this.get('search');
            return searchSettings?.braveApiKey || '';
        } catch (error) {
            console.warn('[DuckDBSettingsService] Failed to get Brave API key:', error);
            return '';
        }
    }

    async getTavilyApiKey(): Promise<string> {
        try {
            const apiKey = await keytar.getPassword(this.SERVICE_NAME, 'tavily_api_key');
            if (apiKey) {
                return apiKey;
            }
            const searchSettings = await this.get('search');
            return searchSettings?.tavilyApiKey || '';
        } catch (error) {
            console.warn('[DuckDBSettingsService] Failed to get Tavily API key:', error);
            return '';
        }
    }

    async getSerpApiKey(): Promise<string> {
        try {
            const apiKey = await keytar.getPassword(this.SERVICE_NAME, 'serp_api_key');
            if (apiKey) {
                return apiKey;
            }
            const searchSettings = await this.get('search');
            return searchSettings?.serpApiKey || '';
        } catch (error) {
            console.warn('[DuckDBSettingsService] Failed to get SERP API key:', error);
            return '';
        }
    }

    async validatePath(path: string): Promise<{ valid: boolean; message?: string }> {
        const fs = await import('fs').then(m => m.promises);
        try {
            await fs.access(path);
            return { valid: true };
        } catch {
            return { valid: false, message: 'Path does not exist or is not accessible' };
        }
    }


    private getDefaultSettings(): Settings {
        return {
            general: {
                startAtLogin: true,
                minimizeToTray: true,
                notifications: true,
                language: 'en-US'
            },

            voice: {
                activationPhrase: 'Hi Cindy!',
                wakeWordSensitivity: 0.5,
                audioThreshold: 0.01,
                voiceSpeed: 1.0,
                voicePitch: 1.0,
                sttProvider: 'auto',
                ttsProvider: 'kokoro'
            },

            llm: {
                provider: 'auto',
                openai: {
                    model: 'gpt-3.5-turbo',
                    organizationId: '',
                    temperature: 0.7,
                    maxTokens: 1500
                },
                ollama: {
                    model: 'qwen3:1.7b',
                    baseUrl: 'http://127.0.0.1:11434',
                    temperature: 0.7
                },
                anthropic: {
                    model: 'claude-3-haiku-20240307',
                    temperature: 0.7,
                    maxTokens: 4000
                },
                openrouter: {
                    model: 'openai/gpt-4-turbo',
                    temperature: 0.7,
                    maxTokens: 4096,
                    siteUrl: 'https://localhost:3000',
                    appName: 'Cindy Voice Assistant'
                },
                groq: {
                    model: 'llama3-8b-8192',
                    temperature: 0.7,
                    maxTokens: 4096
                },
                google: {
                    model: 'gemini-pro',
                    temperature: 0.7,
                    maxOutputTokens: 2048
                },
                cohere: {
                    model: 'command',
                    temperature: 0.7
                },
                azure: {
                    deploymentName: '',
                    apiVersion: '2024-02-01',
                    instanceName: '',
                    temperature: 0.7,
                    maxTokens: 4096
                },
                huggingface: {
                    model: 'meta-llama/Llama-2-70b-chat-hf',
                    temperature: 0.7,
                    maxTokens: 2048
                }
            },

            vault: {
                path: '',
                autoIndex: true,
                indexSchedule: '0 * * * *' // Hourly
            },

            research: {
                enabled: true,
                maxConcurrentTasks: 3,
                dailySummaryTime: '0 9 * * *', // 9 AM daily
                researchInterval: '0 0 * * 1', // Weekly
                maxSourcesPerResearch: 10,
                outputPath: './Research'
            },

            privacy: {
                offlineOnlyMode: false,
                autoDeleteHistory: false,
                autoDeleteHistoryAfterDays: 30,
                encryptLocalStorage: true,
                disableAnalytics: false
            },

            system: {
                maxMemoryUsage: 1024, // 1GB
                logLevel: 'info',
                autoUpdate: true
            },

            database: {
                path: '',
                embeddingModel: 'qwen3:1.7b',
                chunkSize: 1000,
                chunkOverlap: 200,
                autoIndex: true,
                notesPath: ''
            },

            profile: {
                name: '',
                surname: '',
                hasCompletedSetup: false
            },

            search: {
                preferredProvider: 'auto',
                braveApiKey: '',
                tavilyApiKey: '',
                serpApiKey: '',
                fallbackProviders: ['duckduckgo', 'brave', 'tavily', 'serp'],
                rateLimit: {
                    enabled: true,
                    requestsPerMinute: 10,
                    cooldownSeconds: 5
                }
            }
        };
    }

    /**
     * Migrate existing JSON settings to database
     */
    async migrateFromJSON(jsonFilePath?: string): Promise<boolean> {
        const fs = await import('fs').then(m => m.promises);
        const path = await import('path');
        
        try {
            // Determine JSON file path
            const settingsPath = jsonFilePath || path.join(app.getPath('userData'), 'cindy-settings.json');
            
            // Check if JSON file exists
            try {
                await fs.access(settingsPath);
            } catch {
                console.log('[DuckDBSettingsService] No existing JSON settings file found, skipping migration');
                return false;
            }

            // Read and parse JSON settings
            const jsonData = await fs.readFile(settingsPath, 'utf-8');
            const jsonSettings: Partial<Settings> = JSON.parse(jsonData);
            
            console.log('[DuckDBSettingsService] Found existing JSON settings, starting migration');

            // Merge JSON settings with defaults
            const mergedSettings = this.mergeSettings(this.getDefaultSettings(), jsonSettings);
            this.settings = mergedSettings;

            // Handle API key migration for all LLM providers
            if (jsonSettings.llm) {
                // Migrate OpenAI API key to keytar (if it exists and isn't already a placeholder)
                if (jsonSettings.llm.openai?.apiKey && jsonSettings.llm.openai.apiKey !== '***' && jsonSettings.llm.openai.apiKey.trim() !== '') {
                    await this.setApiKey(jsonSettings.llm.openai.apiKey);
                    console.log('[DuckDBSettingsService] Migrated OpenAI API key to keychain');
                }

                // Handle other LLM provider API keys (for now, keep them in database)
                const providers = ['anthropic', 'openrouter', 'groq', 'google', 'cohere', 'azure', 'huggingface'] as const;
                for (const provider of providers) {
                    const providerSettings = (jsonSettings.llm as any)[provider];
                    if (providerSettings?.apiKey && providerSettings.apiKey !== '***' && providerSettings.apiKey.trim() !== '') {
                        console.log(`[DuckDBSettingsService] Preserving ${provider} API key in database`);
                        // Keep in settings for database storage
                    }
                }
            }

            // Handle search API keys migration to keytar
            if (jsonSettings.search) {
                if (jsonSettings.search.braveApiKey && jsonSettings.search.braveApiKey !== '***' && jsonSettings.search.braveApiKey.trim() !== '') {
                    await keytar.setPassword(this.SERVICE_NAME, 'brave_api_key', jsonSettings.search.braveApiKey);
                    console.log('[DuckDBSettingsService] Migrated Brave API key to keychain');
                }
                if (jsonSettings.search.tavilyApiKey && jsonSettings.search.tavilyApiKey !== '***' && jsonSettings.search.tavilyApiKey.trim() !== '') {
                    await keytar.setPassword(this.SERVICE_NAME, 'tavily_api_key', jsonSettings.search.tavilyApiKey);
                    console.log('[DuckDBSettingsService] Migrated Tavily API key to keychain');
                }
                if (jsonSettings.search.serpApiKey && jsonSettings.search.serpApiKey !== '***' && jsonSettings.search.serpApiKey.trim() !== '') {
                    await keytar.setPassword(this.SERVICE_NAME, 'serp_api_key', jsonSettings.search.serpApiKey);
                    console.log('[DuckDBSettingsService] Migrated SERP API key to keychain');
                }
            }

            // Save migrated settings to database
            await this.save();

            // Create backup of original JSON file
            const backupPath = settingsPath + '.backup.' + Date.now();
            await fs.copyFile(settingsPath, backupPath);
            console.log(`[DuckDBSettingsService] Created backup of JSON settings: ${backupPath}`);

            // Mark migration as complete
            this.migrationComplete = true;

            console.log('[DuckDBSettingsService] Migration from JSON completed successfully');
            this.emit('migrationCompleted', { from: 'json', backup: backupPath });
            
            return true;
        } catch (error) {
            console.error('[DuckDBSettingsService] Failed to migrate from JSON:', error);
            throw error;
        }
    }

    /**
     * Check if migration is needed (database is empty but JSON file exists)
     */
    async isMigrationNeeded(): Promise<boolean> {
        if (!this.db || this.migrationComplete || this.isMigrating) return false;

        try {
            const fs = await import('fs').then(m => m.promises);
            const path = await import('path');
            
            // Check if database has any settings
            const rows = await this.db.all('SELECT COUNT(*) as count FROM settings');
            const hasDbSettings = rows[0]?.count > 0;

            // Check if JSON file exists
            const jsonPath = path.join(app.getPath('userData'), 'cindy-settings.json');
            let hasJsonFile = false;
            try {
                await fs.access(jsonPath);
                hasJsonFile = true;
            } catch {
                hasJsonFile = false;
            }

            // Migration needed if no DB settings but JSON file exists
            return !hasDbSettings && hasJsonFile;
        } catch (error) {
            console.warn('[DuckDBSettingsService] Failed to check migration status:', error);
            return false;
        }
    }

    async cleanup(): Promise<void> {
        if (this.db) {
            await this.db.close();
            this.db = null;
        }
    }
}