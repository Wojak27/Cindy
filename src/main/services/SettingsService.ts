import { EventEmitter } from 'events';
import { ConfigManager } from '../utils/ConfigManager';
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
    };

    // User profile settings
    profile: {
        name: string;
        surname: string;
        hasCompletedSetup: boolean;
    };

    // Storage permissions
    storage: {
        // Flag to track if storage permission has been granted
        permissionGranted: boolean;
        // Timestamp of when permission was granted
        permissionGrantedAt: string | null;
    };
}

class SettingsService extends EventEmitter {
    private configManager: ConfigManager;
    private settings: Settings;
    private isInitialized: boolean = false;
    private readonly SERVICE_NAME = 'Cindy';
    private readonly ACCOUNT_NAME = 'openai_api_key';

    constructor() {
        super();
        this.configManager = new ConfigManager();
        this.settings = this.getDefaultSettings();
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            console.log('Starting SettingsService initialization');
            console.log('Config path:', this.configManager.getConfigPath());

            // Load settings from persistence
            console.log('Attempting to load settings from config manager');
            const loadedSettings = await this.configManager.load();
            console.log('ConfigManager.load() returned:', loadedSettings);

            if (loadedSettings) {
                console.log('Merging loaded settings with defaults');
                this.settings = this.mergeSettings(this.settings, loadedSettings);
                console.log('Settings merged successfully');
            } else {
                console.log('No settings found, using defaults');
            }

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

        // Save to persistence
        try {
            console.log('SettingsService.set() - About to save settings');
            console.log('SettingsService.set() - Current storage permission status:', this.settings.storage.permissionGranted);
            console.log('SettingsService.set() - Settings object:', JSON.stringify(this.settings, null, 2));
            await this.save();
            console.log('SettingsService.set() - Settings saved successfully');
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
            console.log('SettingsService.save() - Starting save process');
            console.log('SettingsService.save() - Config path:', this.configManager.getConfigPath());
            console.log('SettingsService.save() - Settings object keys:', Object.keys(this.settings));
            console.log('SettingsService.save() - Attempting to save settings with length:', JSON.stringify(this.settings, null, 2).length);

            await this.configManager.save(this.settings);

            console.log('SettingsService.save() - Settings saved successfully');
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
        this.settings = this.getDefaultSettings();
        await this.save();
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
                    model: 'qwen3:8b',
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
                embeddingModel: 'qwen3:8b',
                chunkSize: 1000,
                chunkOverlap: 200,
                autoIndex: true
            },

            profile: {
                name: '',
                surname: '',
                hasCompletedSetup: false
            },

            storage: {
                permissionGranted: false,
                permissionGrantedAt: null
            }
        };
    }

    private mergeSettings(defaultSettings: Settings, loadedSettings: Partial<Settings>): Settings {
        const merged = { ...defaultSettings };

        for (const [section, values] of Object.entries(loadedSettings)) {
            if (merged[section as keyof Settings] && values) {
                merged[section as keyof Settings] = {
                    ...merged[section as keyof Settings],
                    ...values
                } as any;
            }
        }

        return merged;
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

    /**
     * Grant storage permission
     */
    async grantStoragePermission(): Promise<void> {
        console.log('SettingsService.grantStoragePermission() - Method called');
        if (!this.isInitialized) {
            console.log('SettingsService.grantStoragePermission() - Service not initialized, initializing...');
            await this.initialize();
            console.log('SettingsService.grantStoragePermission() - Initialization completed');
        }

        this.settings.storage.permissionGranted = true;
        this.settings.storage.permissionGrantedAt = new Date().toISOString();

        // Save the updated settings
        await this.save();

        // Emit change event
        this.emit('settingsChanged', {
            section: 'storage',
            value: {
                permissionGranted: true,
                permissionGrantedAt: this.settings.storage.permissionGrantedAt
            }
        });
    }

    /**
     * Revoke storage permission
     */
    async revokeStoragePermission(): Promise<void> {
        console.log('SettingsService.revokeStoragePermission() - Method called');
        if (!this.isInitialized) {
            console.log('SettingsService.revokeStoragePermission() - Service not initialized, initializing...');
            await this.initialize();
            console.log('SettingsService.revokeStoragePermission() - Initialization completed');
        }

        this.settings.storage.permissionGranted = false;
        this.settings.storage.permissionGrantedAt = null;

        // Save the updated settings
        await this.save();

        // Emit change event
        this.emit('settingsChanged', {
            section: 'storage',
            value: {
                permissionGranted: false,
                permissionGrantedAt: null
            }
        });
    }

    /**
     * Check if storage permission has been granted
     */
    async hasStoragePermission(): Promise<boolean> {
        console.log('SettingsService.hasStoragePermission() - Method called');
        if (!this.isInitialized) {
            console.log('SettingsService.hasStoragePermission() - Service not initialized, initializing...');
            await this.initialize();
            console.log('SettingsService.hasStoragePermission() - Initialization completed');
        }

        return this.settings.storage.permissionGranted;
    }
}

export { SettingsService, Settings };