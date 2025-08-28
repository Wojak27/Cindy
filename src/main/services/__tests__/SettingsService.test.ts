/**
 * Unit tests for SettingsService (legacy electron-store based)
 */

import { SettingsService } from '../SettingsService';
import { EventEmitter } from 'events';

// Mock PathValidator
jest.mock('../utils/PathValidator', () => ({
    PathValidator: {
        validatePath: jest.fn()
    }
}));

// Mock keytar
const mockKeytar = {
    getPassword: jest.fn(),
    setPassword: jest.fn().mockResolvedValue(undefined),
    deletePassword: jest.fn().mockResolvedValue(undefined)
};

jest.mock('keytar', () => mockKeytar);

// Mock electron-store
const mockStore = {
    store: {},
    path: '/tmp/test-settings.json',
    set: jest.fn(),
    get: jest.fn(),
    clear: jest.fn()
};

// Mock dynamic import of electron-store
const originalImport = global.eval('require');
jest.spyOn(global, 'eval').mockImplementation((code: string) => {
    if (code === 'require') {
        return (moduleName: string) => {
            if (moduleName === 'electron-store') {
                return jest.fn().mockImplementation(() => mockStore);
            }
            return originalImport(moduleName);
        };
    }
    return originalImport(code);
});

describe('SettingsService', () => {
    let settingsService: SettingsService;

    beforeEach(() => {
        jest.clearAllMocks();
        settingsService = new SettingsService();

        // Reset mock responses
        mockKeytar.getPassword.mockResolvedValue(null);
        mockStore.store = {};
        
        const { PathValidator } = require('../utils/PathValidator');
        PathValidator.validatePath.mockResolvedValue({ valid: true });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should create SettingsService with default settings', () => {
            expect(settingsService).toBeInstanceOf(SettingsService);
            expect(settingsService).toBeInstanceOf(EventEmitter);
        });
    });

    describe('initialize', () => {
        it('should initialize with electron-store', async () => {
            mockStore.store = {
                general: { startAtLogin: true },
                llm: { provider: 'openai' }
            };

            await settingsService.initialize();

            // Should load settings from store
            const settings = await settingsService.getAll();
            expect(settings.general.startAtLogin).toBe(true);
        });

        it('should emit initialized event', async () => {
            const eventSpy = jest.fn();
            settingsService.on('initialized', eventSpy);

            await settingsService.initialize();

            expect(eventSpy).toHaveBeenCalledWith(expect.any(Object));
        });

        it('should handle electron-store import error', async () => {
            // Mock import failure
            jest.spyOn(global, 'eval').mockImplementation(() => {
                throw new Error('electron-store not found');
            });

            await expect(settingsService.initialize()).rejects.toThrow(
                'Unable to load electron-store module'
            );
        });

        it('should validate settings after loading', async () => {
            const invalidSettings = {
                vault: { path: '/invalid/path' }
            };
            mockStore.store = invalidSettings;

            const { PathValidator } = require('../utils/PathValidator');
            PathValidator.validatePath.mockResolvedValueOnce({ valid: false });

            await settingsService.initialize();

            const settings = await settingsService.getAll();
            expect(settings.vault.path).toBe(''); // Should be reset to empty
        });

        it('should not initialize twice', async () => {
            await settingsService.initialize();
            await settingsService.initialize(); // Second call

            // Should only create one store instance
            expect(global.eval).toHaveBeenCalledTimes(1);
        });
    });

    describe('get', () => {
        beforeEach(async () => {
            await settingsService.initialize();
        });

        it('should return specific section settings', async () => {
            const generalSettings = await settingsService.get('general');

            expect(generalSettings).toHaveProperty('startAtLogin');
            expect(generalSettings).toHaveProperty('minimizeToTray');
            expect(generalSettings).toHaveProperty('notifications');
            expect(generalSettings).toHaveProperty('language');
        });

        it('should return a copy of settings', async () => {
            const settings1 = await settingsService.get('general');
            const settings2 = await settingsService.get('general');

            expect(settings1).toEqual(settings2);
            expect(settings1).not.toBe(settings2); // Different objects
        });

        it('should handle search API keys with placeholders', async () => {
            mockKeytar.getPassword
                .mockResolvedValueOnce('brave-api-key') // braveApiKey
                .mockResolvedValueOnce('tavily-api-key') // tavilyApiKey
                .mockResolvedValueOnce('serp-api-key');  // serpApiKey

            const searchSettings = await settingsService.get('search');

            expect(searchSettings.braveApiKey).toBe('***');
            expect(searchSettings.tavilyApiKey).toBe('***');
            expect(searchSettings.serpApiKey).toBe('***');
        });

        it('should handle keytar errors gracefully', async () => {
            mockKeytar.getPassword.mockRejectedValue(new Error('Keytar error'));

            // Should not throw
            const searchSettings = await settingsService.get('search');

            expect(searchSettings).toBeDefined();
        });

        it('should initialize if not already done', async () => {
            const uninitializedService = new SettingsService();

            const settings = await uninitializedService.get('general');

            expect(settings).toBeDefined();
        });
    });

    describe('set', () => {
        beforeEach(async () => {
            await settingsService.initialize();
        });

        it('should update specific section settings', async () => {
            const newSettings = {
                startAtLogin: true,
                language: 'es'
            };

            await settingsService.set('general', newSettings);

            const updatedSettings = await settingsService.get('general');
            expect(updatedSettings.startAtLogin).toBe(true);
            expect(updatedSettings.language).toBe('es');
            expect(updatedSettings.minimizeToTray).toBeDefined(); // Other properties preserved
        });

        it('should handle OpenAI API key securely', async () => {
            const newLLMSettings = {
                openai: {
                    model: 'gpt-4',
                    apiKey: 'test-api-key',
                    organizationId: 'test-org',
                    temperature: 0.7,
                    maxTokens: 2000
                }
            };

            await settingsService.set('llm', newLLMSettings);

            expect(mockKeytar.setPassword).toHaveBeenCalledWith(
                'Cindy',
                'openai_api_key',
                'test-api-key'
            );

            // API key should be masked in settings
            const settings = await settingsService.getAll();
            expect(settings.llm.openai.apiKey).toBe('***');
        });

        it('should handle search API keys securely', async () => {
            const newSearchSettings = {
                braveApiKey: 'brave-key',
                tavilyApiKey: 'tavily-key',
                serpApiKey: 'serp-key'
            };

            await settingsService.set('search', newSearchSettings);

            expect(mockKeytar.setPassword).toHaveBeenCalledWith('Cindy', 'brave_api_key', 'brave-key');
            expect(mockKeytar.setPassword).toHaveBeenCalledWith('Cindy', 'tavily_api_key', 'tavily-key');
            expect(mockKeytar.setPassword).toHaveBeenCalledWith('Cindy', 'serp_api_key', 'serp-key');

            // Keys should be masked
            const settings = await settingsService.getAll();
            expect(settings.search.braveApiKey).toBe('***');
            expect(settings.search.tavilyApiKey).toBe('***');
            expect(settings.search.serpApiKey).toBe('***');
        });

        it('should emit settingsChanged event', async () => {
            const eventSpy = jest.fn();
            settingsService.on('settingsChanged', eventSpy);

            await settingsService.set('general', { startAtLogin: true });

            expect(eventSpy).toHaveBeenCalledWith({
                section: 'general',
                value: { startAtLogin: true }
            });
        });

        it('should save to electron-store', async () => {
            await settingsService.set('general', { startAtLogin: true });

            // Should update the store
            expect(mockStore.store).toMatchObject({
                general: expect.objectContaining({
                    startAtLogin: true
                })
            });
        });

        it('should handle store save errors gracefully', async () => {
            // Make store assignment fail
            Object.defineProperty(mockStore, 'store', {
                set: () => { throw new Error('Store save failed'); },
                configurable: true
            });

            // Should not throw, but log error
            await expect(settingsService.set('general', { startAtLogin: true }))
                .resolves.not.toThrow();
        });
    });

    describe('getAll', () => {
        beforeEach(async () => {
            await settingsService.initialize();
        });

        it('should return all settings as deep copy', async () => {
            const allSettings = await settingsService.getAll();

            expect(allSettings).toHaveProperty('general');
            expect(allSettings).toHaveProperty('llm');
            expect(allSettings).toHaveProperty('voice');
            expect(allSettings).toHaveProperty('vault');
            
            // Should be a deep copy
            allSettings.general.startAtLogin = !allSettings.general.startAtLogin;
            const allSettings2 = await settingsService.getAll();
            expect(allSettings.general.startAtLogin).not.toBe(allSettings2.general.startAtLogin);
        });
    });

    describe('save', () => {
        beforeEach(async () => {
            await settingsService.initialize();
        });

        it('should save settings to electron-store', async () => {
            await settingsService.save();

            // Should update the store
            expect(mockStore.store).toEqual(expect.any(Object));
        });

        it('should emit settingsSaved event', async () => {
            const eventSpy = jest.fn();
            settingsService.on('settingsSaved', eventSpy);

            await settingsService.save();

            expect(eventSpy).toHaveBeenCalled();
        });

        it('should initialize if not already done', async () => {
            const uninitializedService = new SettingsService();

            // Should not throw
            await expect(uninitializedService.save()).resolves.not.toThrow();
        });

        it('should handle store save errors', async () => {
            Object.defineProperty(mockStore, 'store', {
                set: () => { throw new Error('Store error'); },
                configurable: true
            });

            // Should not throw, but log error
            await expect(settingsService.save()).resolves.not.toThrow();
        });
    });

    describe('resetToDefaults', () => {
        beforeEach(async () => {
            await settingsService.initialize();
        });

        it('should reset settings to defaults', async () => {
            // First modify some settings
            await settingsService.set('general', { startAtLogin: true });

            // Then reset
            await settingsService.resetToDefaults();

            const settings = await settingsService.getAll();
            expect(settings.general.startAtLogin).toBe(false); // Default value
        });

        it('should save defaults to store', async () => {
            await settingsService.resetToDefaults();

            expect(mockStore.store).toEqual(expect.objectContaining({
                general: expect.objectContaining({
                    startAtLogin: false
                })
            }));
        });

        it('should emit settingsReset event', async () => {
            const eventSpy = jest.fn();
            settingsService.on('settingsReset', eventSpy);

            await settingsService.resetToDefaults();

            expect(eventSpy).toHaveBeenCalled();
        });
    });

    describe('API Key Management', () => {
        beforeEach(async () => {
            await settingsService.initialize();
        });

        describe('getApiKey', () => {
            it('should retrieve OpenAI API key from secure storage', async () => {
                mockKeytar.getPassword.mockResolvedValueOnce('test-api-key');

                const apiKey = await settingsService.getApiKey();

                expect(apiKey).toBe('test-api-key');
                expect(mockKeytar.getPassword).toHaveBeenCalledWith('Cindy', 'openai_api_key');
            });

            it('should return empty string when no key stored', async () => {
                mockKeytar.getPassword.mockResolvedValueOnce(null);

                const apiKey = await settingsService.getApiKey();

                expect(apiKey).toBe('');
            });
        });

        describe('getBraveApiKey', () => {
            it('should retrieve Brave API key from secure storage', async () => {
                mockKeytar.getPassword.mockResolvedValueOnce('brave-api-key');

                const apiKey = await settingsService.getBraveApiKey();

                expect(apiKey).toBe('brave-api-key');
                expect(mockKeytar.getPassword).toHaveBeenCalledWith('Cindy', 'brave_api_key');
            });

            it('should fallback to settings when secure storage fails', async () => {
                mockKeytar.getPassword.mockRejectedValueOnce(new Error('Keytar failed'));
                
                // Update settings with API key
                await settingsService.set('search', { braveApiKey: 'fallback-key' });

                const apiKey = await settingsService.getBraveApiKey();

                expect(apiKey).toBe('fallback-key');
            });
        });

        describe('getTavilyApiKey', () => {
            it('should retrieve Tavily API key', async () => {
                mockKeytar.getPassword.mockResolvedValueOnce('tavily-key');

                const apiKey = await settingsService.getTavilyApiKey();

                expect(apiKey).toBe('tavily-key');
                expect(mockKeytar.getPassword).toHaveBeenCalledWith('Cindy', 'tavily_api_key');
            });

            it('should fallback to settings', async () => {
                mockKeytar.getPassword.mockRejectedValueOnce(new Error('Keytar failed'));
                await settingsService.set('search', { tavilyApiKey: 'fallback-key' });

                const apiKey = await settingsService.getTavilyApiKey();

                expect(apiKey).toBe('fallback-key');
            });
        });

        describe('getSerpApiKey', () => {
            it('should retrieve SERP API key', async () => {
                mockKeytar.getPassword.mockResolvedValueOnce('serp-key');

                const apiKey = await settingsService.getSerpApiKey();

                expect(apiKey).toBe('serp-key');
                expect(mockKeytar.getPassword).toHaveBeenCalledWith('Cindy', 'serp_api_key');
            });

            it('should fallback to settings', async () => {
                mockKeytar.getPassword.mockRejectedValueOnce(new Error('Keytar failed'));
                await settingsService.set('search', { serpApiKey: 'fallback-key' });

                const apiKey = await settingsService.getSerpApiKey();

                expect(apiKey).toBe('fallback-key');
            });
        });
    });

    describe('validatePath', () => {
        beforeEach(async () => {
            await settingsService.initialize();
        });

        it('should validate path using PathValidator', async () => {
            const { PathValidator } = require('../utils/PathValidator');
            PathValidator.validatePath.mockResolvedValueOnce({
                valid: true,
                message: 'Path is valid'
            });

            const result = await settingsService.validatePath('/valid/path');

            expect(result.valid).toBe(true);
            expect(result.message).toBe('Path is valid');
            expect(PathValidator.validatePath).toHaveBeenCalledWith('/valid/path');
        });

        it('should return validation errors', async () => {
            const { PathValidator } = require('../utils/PathValidator');
            PathValidator.validatePath.mockResolvedValueOnce({
                valid: false,
                message: 'Path does not exist'
            });

            const result = await settingsService.validatePath('/invalid/path');

            expect(result.valid).toBe(false);
            expect(result.message).toBe('Path does not exist');
        });
    });

    describe('settings validation', () => {
        beforeEach(async () => {
            await settingsService.initialize();
        });

        it('should validate vault path on initialization', async () => {
            const { PathValidator } = require('../utils/PathValidator');
            PathValidator.validatePath.mockResolvedValueOnce({ valid: false });

            mockStore.store = {
                vault: { path: '/invalid/path' }
            };

            const freshService = new SettingsService();
            await freshService.initialize();

            const settings = await freshService.getAll();
            expect(settings.vault.path).toBe(''); // Should be reset
        });

        it('should validate OpenAI API key when provider is openai', async () => {
            mockKeytar.getPassword.mockResolvedValueOnce(''); // Empty API key

            mockStore.store = {
                llm: { provider: 'openai' }
            };

            const freshService = new SettingsService();
            
            // Should not throw during validation
            await expect(freshService.initialize()).resolves.not.toThrow();
        });

        it('should validate cron expressions', async () => {
            mockStore.store = {
                research: {
                    dailySummaryTime: 'invalid-cron',
                    researchInterval: '0 0 * * *'
                }
            };

            const freshService = new SettingsService();
            await freshService.initialize();

            const settings = await freshService.getAll();
            // Invalid cron should be reset to default
            expect(settings.research.dailySummaryTime).not.toBe('invalid-cron');
        });
    });

    describe('cron validation helper', () => {
        it('should validate correct cron expressions', () => {
            const validCrons = [
                '0 0 * * *',      // Daily at midnight
                '0 */6 * * *',    // Every 6 hours
                '30 14 * * 1-5',  // Weekdays at 2:30 PM
                '0 9-17 * * *'    // Business hours
            ];

            validCrons.forEach(cron => {
                const isValid = (settingsService as any).isValidCron(cron);
                expect(isValid).toBe(true);
            });
        });

        it('should reject invalid cron expressions', () => {
            const invalidCrons = [
                'invalid',
                '60 0 * * *',     // Invalid minute
                '0 25 * * *',     // Invalid hour
                '0 0 32 * *',     // Invalid day
                '0 0 * 13 *',     // Invalid month
                '0 0 * * 8'       // Invalid weekday
            ];

            invalidCrons.forEach(cron => {
                const isValid = (settingsService as any).isValidCron(cron);
                expect(isValid).toBe(false);
            });
        });
    });

    describe('error handling', () => {
        it('should handle initialization errors gracefully', async () => {
            // Mock store creation failure
            jest.spyOn(global, 'eval').mockImplementation(() => {
                return () => {
                    throw new Error('Store creation failed');
                };
            });

            await expect(settingsService.initialize()).rejects.toThrow();
        });

        it('should handle keytar errors in set operations', async () => {
            await settingsService.initialize();
            
            mockKeytar.setPassword.mockRejectedValueOnce(new Error('Keytar error'));

            // Should not throw, just log error
            await expect(settingsService.set('llm', {
                openai: { apiKey: 'test-key', model: 'gpt-4', organizationId: '', temperature: 0.7, maxTokens: 2000 }
            })).resolves.not.toThrow();
        });

        it('should handle various validation errors', async () => {
            const { PathValidator } = require('../utils/PathValidator');
            PathValidator.validatePath.mockRejectedValueOnce(new Error('Validation failed'));

            const result = await settingsService.validatePath('/test/path');

            // Should return invalid on validation error
            expect(result.valid).toBe(false);
            expect(result.message).toContain('Error validating path');
        });
    });

    describe('getDefaultSettings', () => {
        it('should return complete default settings structure', () => {
            const defaults = (settingsService as any).getDefaultSettings();

            expect(defaults).toHaveProperty('general');
            expect(defaults).toHaveProperty('voice');
            expect(defaults).toHaveProperty('llm');
            expect(defaults).toHaveProperty('vault');
            expect(defaults).toHaveProperty('research');
            expect(defaults).toHaveProperty('privacy');
            expect(defaults).toHaveProperty('system');
            expect(defaults).toHaveProperty('search');
            expect(defaults).toHaveProperty('database');
            expect(defaults).toHaveProperty('profile');

            // Check some specific defaults
            expect(defaults.general.startAtLogin).toBe(false);
            expect(defaults.llm.provider).toBe('auto');
            expect(defaults.voice.sttProvider).toBe('auto');
        });
    });
});