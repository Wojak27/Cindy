/**
 * Unit tests for DuckDBSettingsService
 */

import { DuckDBSettingsService, Settings } from '../DuckDBSettingsService';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs/promises';

// Mock Electron app
jest.mock('electron', () => ({
    app: {
        getPath: jest.fn().mockReturnValue('/tmp/test-app-data')
    }
}));

// Mock DuckDB
const mockDatabase = {
    exec: jest.fn().mockResolvedValue(undefined),
    all: jest.fn().mockResolvedValue([]),
    prepare: jest.fn().mockResolvedValue({
        run: jest.fn().mockResolvedValue(undefined),
        all: jest.fn().mockResolvedValue([]),
        finalize: jest.fn().mockResolvedValue(undefined)
    }),
    close: jest.fn().mockResolvedValue(undefined)
};

jest.mock('duckdb-async', () => ({
    Database: {
        create: jest.fn().mockResolvedValue(mockDatabase)
    }
}));

// Mock keytar for secure storage
const mockKeytar = {
    getPassword: jest.fn(),
    setPassword: jest.fn().mockResolvedValue(undefined),
    deletePassword: jest.fn().mockResolvedValue(undefined)
};

jest.mock('keytar', () => mockKeytar);

// Mock fs/promises
const mockFs = {
    access: jest.fn(),
    readFile: jest.fn(),
    copyFile: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    stat: jest.fn()
};

jest.mock('fs/promises', () => mockFs);

describe('DuckDBSettingsService', () => {
    let settingsService: DuckDBSettingsService;

    beforeEach(() => {
        jest.clearAllMocks();
        settingsService = new DuckDBSettingsService();

        // Reset mock responses
        mockDatabase.all.mockResolvedValue([]);
        mockKeytar.getPassword.mockResolvedValue(null);
        mockFs.access.mockRejectedValue(new Error('File not found'));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should create DuckDBSettingsService with default settings', () => {
            expect(settingsService).toBeInstanceOf(DuckDBSettingsService);
            expect(settingsService).toBeInstanceOf(EventEmitter);
        });
    });

    describe('initialize', () => {
        it('should initialize successfully with database creation', async () => {
            await settingsService.initialize();

            const { Database } = require('duckdb-async');
            expect(Database.create).toHaveBeenCalledWith('/tmp/test-app-data/cindy-settings.db');
            
            // Should create settings table and indexes
            expect(mockDatabase.exec).toHaveBeenCalledWith(
                expect.stringContaining('CREATE TABLE IF NOT EXISTS settings')
            );
            expect(mockDatabase.exec).toHaveBeenCalledWith(
                expect.stringContaining('CREATE INDEX IF NOT EXISTS')
            );
        });

        it('should not initialize twice', async () => {
            await settingsService.initialize();
            await settingsService.initialize(); // Second call

            const { Database } = require('duckdb-async');
            expect(Database.create).toHaveBeenCalledTimes(1);
        });

        it('should emit initialized event', async () => {
            const eventSpy = jest.fn();
            settingsService.on('initialized', eventSpy);

            await settingsService.initialize();

            expect(eventSpy).toHaveBeenCalledWith(expect.any(Object));
        });

        it('should handle database creation error', async () => {
            const { Database } = require('duckdb-async');
            Database.create.mockRejectedValueOnce(new Error('DB creation failed'));

            await expect(settingsService.initialize()).rejects.toThrow('DB creation failed');
        });

        it('should perform migration when needed', async () => {
            // Mock migration detection
            mockDatabase.all.mockResolvedValueOnce([{ count: 0 }]); // Empty database
            mockFs.access.mockResolvedValueOnce(undefined); // JSON file exists
            mockFs.readFile.mockResolvedValueOnce(JSON.stringify({
                llm: { openai: { apiKey: 'test-key' } }
            }));

            await settingsService.initialize();

            expect(mockFs.readFile).toHaveBeenCalled();
            expect(mockFs.copyFile).toHaveBeenCalled(); // Backup created
        });
    });

    describe('loadSettings', () => {
        beforeEach(async () => {
            await settingsService.initialize();
        });

        it('should load settings from database', async () => {
            const mockRows = [
                { key: 'general.startAtLogin', value: 'true' },
                { key: 'llm.provider', value: '"openai"' },
                { key: 'voice.wakeWordSensitivity', value: '0.7' }
            ];

            mockDatabase.all.mockResolvedValueOnce(mockRows);
            
            // Reinitialize to trigger loading
            settingsService = new DuckDBSettingsService();
            await settingsService.initialize();

            const settings = await settingsService.getAll();
            expect(settings.general.startAtLogin).toBe(true);
            expect(settings.llm.provider).toBe('openai');
            expect(settings.voice.wakeWordSensitivity).toBe(0.7);
        });

        it('should handle malformed JSON values gracefully', async () => {
            const mockRows = [
                { key: 'general.startAtLogin', value: 'invalid-json' }
            ];

            mockDatabase.all.mockResolvedValueOnce(mockRows);
            
            settingsService = new DuckDBSettingsService();
            await settingsService.initialize();

            const settings = await settingsService.getAll();
            expect(settings.general.startAtLogin).toBe('invalid-json'); // Fallback to string
        });

        it('should fallback to defaults on loading error', async () => {
            mockDatabase.all.mockRejectedValueOnce(new Error('DB query failed'));

            settingsService = new DuckDBSettingsService();
            await settingsService.initialize();

            const settings = await settingsService.getAll();
            expect(settings).toBeDefined();
            expect(settings.general).toBeDefined();
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

        it('should return correct settings for different sections', async () => {
            const llmSettings = await settingsService.get('llm');
            const voiceSettings = await settingsService.get('voice');

            expect(llmSettings).toHaveProperty('provider');
            expect(llmSettings).toHaveProperty('openai');
            expect(voiceSettings).toHaveProperty('activationPhrase');
            expect(voiceSettings).toHaveProperty('wakeWordSensitivity');
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
                    temperature: 0.7
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

        it('should emit settingsChanged event', async () => {
            const eventSpy = jest.fn();
            settingsService.on('settingsChanged', eventSpy);

            await settingsService.set('general', { startAtLogin: true });

            expect(eventSpy).toHaveBeenCalledWith({
                section: 'general',
                value: { startAtLogin: true }
            });
        });

        it('should save to database', async () => {
            await settingsService.set('general', { startAtLogin: true });

            const preparedStatement = await mockDatabase.prepare();
            expect(preparedStatement.run).toHaveBeenCalled();
        });

        it('should handle database save errors', async () => {
            const preparedStatement = await mockDatabase.prepare();
            preparedStatement.run.mockRejectedValueOnce(new Error('Save failed'));

            // Should not throw, but log error
            await expect(settingsService.set('general', { startAtLogin: true })).resolves.not.toThrow();
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

        it('should save all sections to database', async () => {
            await settingsService.save();

            // Should prepare and run multiple statements for each section
            expect(mockDatabase.prepare).toHaveBeenCalled();
            const preparedStatement = await mockDatabase.prepare();
            expect(preparedStatement.run).toHaveBeenCalled();
        });

        it('should emit settingsSaved event', async () => {
            const eventSpy = jest.fn();
            settingsService.on('settingsSaved', eventSpy);

            await settingsService.save();

            expect(eventSpy).toHaveBeenCalled();
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

        it('should clear database', async () => {
            await settingsService.resetToDefaults();

            expect(mockDatabase.exec).toHaveBeenCalledWith('DELETE FROM settings');
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
            it('should retrieve API key from secure storage', async () => {
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
        });

        describe('getSerpApiKey', () => {
            it('should retrieve SERP API key', async () => {
                mockKeytar.getPassword.mockResolvedValueOnce('serp-key');

                const apiKey = await settingsService.getSerpApiKey();

                expect(apiKey).toBe('serp-key');
                expect(mockKeytar.getPassword).toHaveBeenCalledWith('Cindy', 'serp_api_key');
            });
        });
    });

    describe('OAuth Credentials Management', () => {
        beforeEach(async () => {
            await settingsService.initialize();
        });

        describe('getOAuthCredentials', () => {
            it('should retrieve OAuth credentials from secure storage', async () => {
                mockKeytar.getPassword
                    .mockResolvedValueOnce('test-client-id')
                    .mockResolvedValueOnce('test-client-secret');

                const credentials = await settingsService.getOAuthCredentials('gmail');

                expect(credentials).toEqual({
                    clientId: 'test-client-id',
                    clientSecret: 'test-client-secret'
                });
            });

            it('should return null when credentials not found', async () => {
                mockKeytar.getPassword.mockResolvedValue(null);

                const credentials = await settingsService.getOAuthCredentials('gmail');

                expect(credentials).toBeNull();
            });

            it('should fallback to settings when secure storage fails', async () => {
                mockKeytar.getPassword.mockRejectedValue(new Error('Keytar failed'));
                
                // Set up connector settings
                await settingsService.set('connectors', {
                    oauth: {
                        gmail: {
                            clientId: 'settings-client-id',
                            clientSecret: 'settings-client-secret'
                        }
                    }
                });

                const credentials = await settingsService.getOAuthCredentials('gmail');

                expect(credentials).toEqual({
                    clientId: 'settings-client-id',
                    clientSecret: 'settings-client-secret'
                });
            });
        });

        describe('setOAuthCredentials', () => {
            it('should store OAuth credentials securely', async () => {
                await settingsService.setOAuthCredentials('gmail', 'client-id', 'client-secret');

                expect(mockKeytar.setPassword).toHaveBeenCalledWith('Cindy', 'gmail_client_id', 'client-id');
                expect(mockKeytar.setPassword).toHaveBeenCalledWith('Cindy', 'gmail_client_secret', 'client-secret');
            });

            it('should update settings with placeholder', async () => {
                await settingsService.setOAuthCredentials('gmail', 'client-id', 'client-secret');

                const connectorSettings = await settingsService.get('connectors');
                expect(connectorSettings?.oauth?.gmail).toEqual({
                    clientId: '***',
                    clientSecret: '***'
                });
            });

            it('should handle storage errors gracefully', async () => {
                mockKeytar.setPassword.mockRejectedValueOnce(new Error('Storage failed'));

                // Should not throw
                await expect(
                    settingsService.setOAuthCredentials('gmail', 'client-id', 'client-secret')
                ).resolves.not.toThrow();
            });
        });

        describe('deleteOAuthCredentials', () => {
            it('should delete OAuth credentials from secure storage', async () => {
                await settingsService.deleteOAuthCredentials('gmail');

                expect(mockKeytar.deletePassword).toHaveBeenCalledWith('Cindy', 'gmail_client_id');
                expect(mockKeytar.deletePassword).toHaveBeenCalledWith('Cindy', 'gmail_client_secret');
            });

            it('should remove placeholder from settings', async () => {
                // First set credentials
                await settingsService.setOAuthCredentials('gmail', 'client-id', 'client-secret');
                
                // Then delete
                await settingsService.deleteOAuthCredentials('gmail');

                const connectorSettings = await settingsService.get('connectors');
                expect(connectorSettings?.oauth?.gmail).toBeUndefined();
            });
        });
    });

    describe('validatePath', () => {
        beforeEach(async () => {
            await settingsService.initialize();
        });

        it('should validate existing directory path', async () => {
            mockFs.stat.mockResolvedValueOnce({ isDirectory: () => true });

            const result = await settingsService.validatePath('/valid/path');

            expect(result.valid).toBe(true);
            expect(result.message).toBeUndefined();
        });

        it('should reject non-existent paths', async () => {
            mockFs.stat.mockRejectedValueOnce(new Error('Path not found'));

            const result = await settingsService.validatePath('/invalid/path');

            expect(result.valid).toBe(false);
            expect(result.message).toContain('does not exist');
        });

        it('should reject file paths (expecting directories)', async () => {
            mockFs.stat.mockResolvedValueOnce({ isDirectory: () => false });

            const result = await settingsService.validatePath('/path/to/file');

            expect(result.valid).toBe(false);
            expect(result.message).toContain('is not a directory');
        });
    });

    describe('migrateFromJSON', () => {
        beforeEach(async () => {
            await settingsService.initialize();
        });

        it('should migrate JSON settings to database', async () => {
            const jsonSettings = {
                llm: {
                    openai: {
                        apiKey: 'migrated-key',
                        model: 'gpt-4'
                    }
                },
                search: {
                    braveApiKey: 'brave-key'
                }
            };

            mockFs.access.mockResolvedValueOnce(undefined);
            mockFs.readFile.mockResolvedValueOnce(JSON.stringify(jsonSettings));

            const success = await settingsService.migrateFromJSON();

            expect(success).toBe(true);
            expect(mockKeytar.setPassword).toHaveBeenCalledWith('Cindy', 'openai_api_key', 'migrated-key');
            expect(mockKeytar.setPassword).toHaveBeenCalledWith('Cindy', 'brave_api_key', 'brave-key');
            expect(mockFs.copyFile).toHaveBeenCalled(); // Backup created
        });

        it('should return false when no JSON file exists', async () => {
            mockFs.access.mockRejectedValueOnce(new Error('File not found'));

            const success = await settingsService.migrateFromJSON();

            expect(success).toBe(false);
        });

        it('should handle invalid JSON gracefully', async () => {
            mockFs.access.mockResolvedValueOnce(undefined);
            mockFs.readFile.mockResolvedValueOnce('invalid-json');

            const success = await settingsService.migrateFromJSON();

            expect(success).toBe(false);
        });

        it('should handle migration errors', async () => {
            mockFs.access.mockResolvedValueOnce(undefined);
            mockFs.readFile.mockRejectedValueOnce(new Error('Read error'));

            const success = await settingsService.migrateFromJSON();

            expect(success).toBe(false);
        });
    });

    describe('isMigrationNeeded', () => {
        beforeEach(async () => {
            await settingsService.initialize();
        });

        it('should return true when database is empty and JSON exists', async () => {
            mockDatabase.all.mockResolvedValueOnce([{ count: 0 }]);
            mockFs.access.mockResolvedValueOnce(undefined);

            const needed = await settingsService.isMigrationNeeded();

            expect(needed).toBe(true);
        });

        it('should return false when database has settings', async () => {
            mockDatabase.all.mockResolvedValueOnce([{ count: 5 }]);

            const needed = await settingsService.isMigrationNeeded();

            expect(needed).toBe(false);
        });

        it('should return false when no JSON file exists', async () => {
            mockDatabase.all.mockResolvedValueOnce([{ count: 0 }]);
            mockFs.access.mockRejectedValueOnce(new Error('File not found'));

            const needed = await settingsService.isMigrationNeeded();

            expect(needed).toBe(false);
        });
    });

    describe('cleanup', () => {
        beforeEach(async () => {
            await settingsService.initialize();
        });

        it('should close database connection', async () => {
            await settingsService.cleanup();

            expect(mockDatabase.close).toHaveBeenCalled();
        });

        it('should handle cleanup errors gracefully', async () => {
            mockDatabase.close.mockRejectedValueOnce(new Error('Close failed'));

            // Should not throw
            await expect(settingsService.cleanup()).resolves.not.toThrow();
        });
    });

    describe('mergeSettings', () => {
        beforeEach(async () => {
            await settingsService.initialize();
        });

        it('should merge nested objects correctly', () => {
            const defaults = {
                general: { startAtLogin: false, language: 'en' },
                llm: { provider: 'openai' }
            };

            const loaded = {
                general: { startAtLogin: true },
                voice: { wakeWordSensitivity: 0.8 }
            };

            const merged = (settingsService as any).mergeSettings(defaults, loaded);

            expect(merged.general.startAtLogin).toBe(true); // Overridden
            expect(merged.general.language).toBe('en'); // Preserved
            expect(merged.llm.provider).toBe('openai'); // Preserved
            expect(merged.voice.wakeWordSensitivity).toBe(0.8); // Added
        });

        it('should handle null values correctly', () => {
            const defaults = { test: { value: 'default' } };
            const loaded = { test: null };

            const merged = (settingsService as any).mergeSettings(defaults, loaded);

            expect(merged.test).toBeNull();
        });

        it('should handle array values correctly', () => {
            const defaults = { array: ['a', 'b'] };
            const loaded = { array: ['c', 'd'] };

            const merged = (settingsService as any).mergeSettings(defaults, loaded);

            expect(merged.array).toEqual(['c', 'd']); // Replaced, not merged
        });
    });
});