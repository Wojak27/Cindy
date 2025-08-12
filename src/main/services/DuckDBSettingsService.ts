import { Database } from 'duckdb-async';
import path from 'path';
import { app } from 'electron';
import { EventEmitter } from 'events';
import keytar from 'keytar';

interface Settings {
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
        ttsProvider: 'online' | 'offline' | 'auto';
    };

    // LLM settings
    llm: {
        provider: 'openai' | 'ollama' | 'auto';
        openai: {
            model: string;
            apiKey?: string;
            organizationId: string;
            temperature: number;
            maxTokens: number;
        };
        ollama: {
            model: string;
            baseUrl: string;
            temperature: number;
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

            // Create settings table
            await this.db.exec(`
                CREATE TABLE IF NOT EXISTS settings (
                    key VARCHAR PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Create index
            await this.db.exec(`
                CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);
            `);

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
        if (section === 'llm' && 'openai' in value && value.openai) {
            const openaiSettings = value.openai as Partial<Settings['llm']['openai'] & { apiKey?: string }>;
            if (openaiSettings.apiKey) {
                await this.setApiKey(openaiSettings.apiKey);
                // Don't store the actual key in database
                (this.settings.llm.openai as any).apiKey = '';
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
                await this.db.run(
                    `INSERT OR REPLACE INTO settings (key, value, updated_at) 
                     VALUES (?, ?, CURRENT_TIMESTAMP)`,
                    [key, JSON.stringify(value)]
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
                ttsProvider: 'auto'
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

    async cleanup(): Promise<void> {
        if (this.db) {
            await this.db.close();
            this.db = null;
        }
    }
}