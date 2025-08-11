import { EventEmitter } from 'events';
import { PathValidator } from '../utils/PathValidator';
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

class SettingsService extends EventEmitter {
    private store: any;
    private settings: Settings;
    private isInitialized: boolean = false;
    private readonly SERVICE_NAME = 'Cindy';
    private readonly ACCOUNT_NAME = 'openai_api_key';

    constructor() {
        super();
        this.settings = this.getDefaultSettings();
        // store will be initialized dynamically in initialize()
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            console.log('Starting SettingsService initialization with electron-store');

            // Use dynamic import for electron-store with eval to prevent ts-node interference
            let Store;
            try {
                // Use eval to prevent TypeScript compilation issues
                const dynamicImport = eval('(moduleName) => import(moduleName)');
                const electronStoreModule = await dynamicImport('electron-store');
                Store = electronStoreModule.default || electronStoreModule;
                console.log('Successfully imported electron-store using eval approach');
            } catch (importError) {
                console.error('Failed to dynamically import electron-store:', importError);
                throw new Error('Unable to load electron-store module');
            }

            // Initialize electron-store with schema and migrations
            this.store = new Store({
                name: 'cindy-settings',
                defaults: this.getDefaultSettings(),
                clearInvalidConfig: true,
                fileExtension: 'json',
                serialize: (value: any) => JSON.stringify(value, null, 2)
            });

            console.log('Store path:', (this.store as any).path);

            // Load settings from electron-store
            console.log('Loading settings from electron-store');
            this.settings = { ...this.getDefaultSettings(), ...(this.store as any).store as Partial<Settings> };
            console.log('Settings loaded successfully from electron-store');

            // Validate critical settings
            console.log('Validating settings');
            await this.validateSettings();
            console.log('Settings validation completed');

            this.isInitialized = true;
            console.log('SettingsService initialization completed successfully');
            this.emit('initialized', this.settings);
        } catch (error) {
            console.error('Failed to initialize settings service:', error);
            console.error('SettingsService initialization failed at:', new Error().stack);
            throw error;
        }
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

        // Update settings
        this.settings[section] = { ...this.settings[section], ...value } as Settings[T];

        // Handle sensitive data
        if (section === 'llm' && 'openai' in value && value.openai) {
            const openaiSettings = value.openai as Partial<Settings['llm']['openai'] & { apiKey?: string }>;
            if (openaiSettings.apiKey) {
                await this.setApiKey(openaiSettings.apiKey);
                // Don't store the actual key in settings
                (this.settings.llm.openai as any).apiKey = '';
            }
        }

        // Validate updated settings
        await this.validateSection(section);

        // Save to electron-store
        try {
            if (!this.store) {
                console.warn('Store not initialized, skipping save');
                return;
            }
            console.log('SettingsService.set() - About to save settings to electron-store');
            (this.store as any).store = this.settings;
            console.log('SettingsService.set() - Settings saved successfully to electron-store');
        } catch (error) {
            console.error('Failed to save settings after update:', error);
            console.error('SettingsService.set() - Error details:', error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error);
            throw error;
        }

        // Emit change event
        this.emit('settingsChanged', { section, value });
    }

    async getAll(): Promise<Settings> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        return JSON.parse(JSON.stringify(this.settings));
    }

    async save(): Promise<void> {
        console.log('SettingsService.save() - Method called');
        console.log('SettingsService.save() - Is initialized:', this.isInitialized);
        if (!this.isInitialized) {
            console.log('SettingsService.save() - Service not initialized, initializing...');
            await this.initialize();
            console.log('SettingsService.save() - Initialization completed');
        }

        try {
            if (!this.store) {
                console.warn('Store not initialized, skipping save');
                return;
            }

            console.log('SettingsService.save() - Starting save process with electron-store');
            console.log('SettingsService.save() - Store path:', (this.store as any).path);
            console.log('SettingsService.save() - Settings object keys:', Object.keys(this.settings));

            (this.store as any).store = this.settings;

            console.log('SettingsService.save() - Settings saved successfully to electron-store');
            this.emit('settingsSaved');
        } catch (error) {
            console.error('SettingsService.save() - Failed to save settings:', error);
            if (error instanceof Error) {
                console.error('SettingsService.save() - Error name:', error.name);
                console.error('SettingsService.save() - Error message:', error.message);
            }
            throw error;
        }
    }

    async resetToDefaults(): Promise<void> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        this.settings = this.getDefaultSettings();
        if (this.store) {
            (this.store as any).clear();
            (this.store as any).store = this.settings;
        }
        this.emit('settingsReset');
    }

    async validatePath(path: string): Promise<{ valid: boolean; message?: string }> {
        return await PathValidator.validate(path);
    }

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

        };
    }


    private async validateSettings(): Promise<void> {
        // Validate each section
        for (const section of Object.keys(this.settings) as (keyof Settings)[]) {
            await this.validateSection(section);
        }
    }

    private async validateSection(section: keyof Settings): Promise<void> {
        switch (section) {
            case 'vault':
                if (this.settings.vault.path) {
                    const validation = await this.validatePath(this.settings.vault.path);
                    if (!validation.valid) {
                        console.warn(`Invalid vault path: ${validation.message}`);
                        // Reset to empty if invalid
                        this.settings.vault.path = '';
                    }
                }
                break;

            case 'llm':
                // Validate LLM settings
                if (this.settings.llm.provider === 'openai') {
                    const apiKey = await this.getApiKey();
                    if (!apiKey) {
                        console.warn('OpenAI API key is required when using OpenAI provider');
                    }
                }
                break;

            case 'research':
                // Validate cron expressions
                if (this.settings.research.dailySummaryTime) {
                    if (!this.isValidCron(this.settings.research.dailySummaryTime)) {
                        console.warn('Invalid daily summary time cron expression');
                    }
                }
                break;
        }
    }

    private isValidCron(expression: string): boolean {
        // Simple validation - in a real implementation, use a proper cron validator
        return expression.split(' ').length === 5;
    }

}

export { SettingsService, Settings };