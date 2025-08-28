/**
 * Unit tests for ServiceManager
 */

import { ServiceManager } from '../ServiceManager';
import { DuckDBSettingsService } from '../DuckDBSettingsService';
import { LLMProvider } from '../LLMProvider';
import { EventEmitter } from 'events';

// Mock Electron
jest.mock('electron', () => ({
    app: {
        getPath: jest.fn().mockReturnValue('/tmp')
    }
}));

// Mock the tool registry and loader
jest.mock('../agents/tools/ToolRegistry', () => ({
    toolRegistry: {
        getToolNames: jest.fn().mockReturnValue(['duckduckgo', 'wikipedia']),
        getAllTools: jest.fn().mockReturnValue([
            { tool: { name: 'duckduckgo' } },
            { tool: { name: 'wikipedia' } }
        ])
    }
}));

jest.mock('../agents/tools/ToolLoader', () => ({
    toolLoader: {
        loadAllTools: jest.fn().mockResolvedValue(undefined)
    }
}));

// Mock dynamic imports
const mockLangChainMemoryService = {
    initialize: jest.fn().mockResolvedValue(undefined),
    cleanup: jest.fn().mockResolvedValue(undefined)
};

const mockLangGraphAgent = {
    cleanup: jest.fn().mockResolvedValue(undefined)
};

jest.mock('../LangChainMemoryService', () => ({
    LangChainMemoryService: jest.fn().mockImplementation(() => mockLangChainMemoryService)
}));

jest.mock('../agents/LangGraphAgent', () => ({
    LangGraphAgent: jest.fn().mockImplementation(() => mockLangGraphAgent)
}));

// Mock DuckDB
jest.mock('duckdb-async', () => ({
    Database: {
        create: jest.fn().mockResolvedValue({
            run: jest.fn().mockResolvedValue(undefined),
            all: jest.fn().mockResolvedValue([]),
            prepare: jest.fn().mockResolvedValue({
                run: jest.fn().mockResolvedValue(undefined),
                all: jest.fn().mockResolvedValue([]),
                finalize: jest.fn().mockResolvedValue(undefined)
            }),
            close: jest.fn().mockResolvedValue(undefined)
        })
    }
}));

describe('ServiceManager', () => {
    let serviceManager: ServiceManager;
    let mockSettingsService: jest.Mocked<DuckDBSettingsService>;
    let mockLLMProvider: jest.Mocked<LLMProvider>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Create mock settings service
        mockSettingsService = {
            getAll: jest.fn().mockResolvedValue({
                search: {
                    braveApiKey: 'test-brave-key',
                    serpApiKey: 'test-serp-key',
                    tavilyApiKey: 'test-tavily-key'
                }
            }),
            get: jest.fn().mockResolvedValue({}),
            set: jest.fn().mockResolvedValue(undefined),
            initialize: jest.fn().mockResolvedValue(undefined),
            cleanup: jest.fn().mockResolvedValue(undefined)
        } as any;

        // Create mock LLM provider
        mockLLMProvider = {
            getChatModel: jest.fn().mockReturnValue({ name: 'test-model' }),
            initialize: jest.fn().mockResolvedValue(undefined)
        } as any;

        serviceManager = new ServiceManager(mockSettingsService, mockLLMProvider);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should create ServiceManager with default null services', () => {
            const manager = new ServiceManager();
            expect(manager).toBeInstanceOf(ServiceManager);
            expect(manager).toBeInstanceOf(EventEmitter);
        });

        it('should create ServiceManager with provided services', () => {
            const manager = new ServiceManager(mockSettingsService, mockLLMProvider);
            expect(manager).toBeInstanceOf(ServiceManager);
            expect(manager).toBeInstanceOf(EventEmitter);
        });
    });

    describe('updateCoreServices', () => {
        it('should update both settings service and LLM provider', () => {
            const newSettingsService = mockSettingsService;
            const newLLMProvider = mockLLMProvider;

            serviceManager.updateCoreServices(newSettingsService, newLLMProvider);

            // Test by checking if services are used correctly in subsequent method calls
            expect(() => serviceManager.updateCoreServices(newSettingsService, newLLMProvider)).not.toThrow();
        });

        it('should accept null services', () => {
            serviceManager.updateCoreServices(null, null);
            expect(() => serviceManager.updateCoreServices(null, null)).not.toThrow();
        });
    });

    describe('initializeTools', () => {
        beforeEach(() => {
            // Reset tool initialization state
            serviceManager = new ServiceManager(mockSettingsService, mockLLMProvider);
        });

        it('should initialize tools successfully with all parameters', async () => {
            const mockVectorStore = { name: 'mock-vector-store' };
            const mockConnectors = { gmail: {}, outlook: {} };

            await serviceManager.initializeTools(mockVectorStore, mockConnectors);

            const { toolLoader } = require('../agents/tools/ToolLoader');
            expect(toolLoader.loadAllTools).toHaveBeenCalledWith({
                braveApiKey: 'test-brave-key',
                serpApiKey: 'test-serp-key',
                tavilyApiKey: 'test-tavily-key',
                vectorStore: mockVectorStore,
                connectors: mockConnectors,
                enabledTools: {
                    duckduckgo: true,
                    brave: true,
                    wikipedia: true,
                    serpapi: true,
                    tavily: true,
                    vector: true,
                    weather: true,
                    maps: true,
                    email: true,
                    reference: false
                }
            });
        });

        it('should initialize tools without optional parameters', async () => {
            await serviceManager.initializeTools();

            const { toolLoader } = require('../agents/tools/ToolLoader');
            expect(toolLoader.loadAllTools).toHaveBeenCalledWith({
                braveApiKey: 'test-brave-key',
                serpApiKey: 'test-serp-key',
                tavilyApiKey: 'test-tavily-key',
                vectorStore: undefined,
                connectors: {},
                enabledTools: {
                    duckduckgo: true,
                    brave: true,
                    wikipedia: true,
                    serpapi: true,
                    tavily: true,
                    vector: false,
                    weather: true,
                    maps: true,
                    email: false,
                    reference: false
                }
            });
        });

        it('should not initialize tools twice', async () => {
            await serviceManager.initializeTools();
            await serviceManager.initializeTools(); // Second call

            const { toolLoader } = require('../agents/tools/ToolLoader');
            expect(toolLoader.loadAllTools).toHaveBeenCalledTimes(1);
        });

        it('should handle concurrent initialization requests', async () => {
            // Start multiple initializations simultaneously
            const promise1 = serviceManager.initializeTools();
            const promise2 = serviceManager.initializeTools();
            const promise3 = serviceManager.initializeTools();

            await Promise.all([promise1, promise2, promise3]);

            const { toolLoader } = require('../agents/tools/ToolLoader');
            expect(toolLoader.loadAllTools).toHaveBeenCalledTimes(1);
        });

        it('should handle settings service returning null', async () => {
            mockSettingsService.getAll.mockResolvedValueOnce(null);

            await serviceManager.initializeTools();

            const { toolLoader } = require('../agents/tools/ToolLoader');
            expect(toolLoader.loadAllTools).toHaveBeenCalledWith({
                braveApiKey: undefined,
                serpApiKey: undefined,
                tavilyApiKey: undefined,
                vectorStore: undefined,
                connectors: {},
                enabledTools: {
                    duckduckgo: true,
                    brave: false,
                    wikipedia: true,
                    serpapi: false,
                    tavily: false,
                    vector: false,
                    weather: true,
                    maps: true,
                    email: false,
                    reference: false
                }
            });
        });

        it('should throw error when tool loading fails', async () => {
            const { toolLoader } = require('../agents/tools/ToolLoader');
            const error = new Error('Tool loading failed');
            toolLoader.loadAllTools.mockRejectedValueOnce(error);

            await expect(serviceManager.initializeTools()).rejects.toThrow('Tool loading failed');
        });

        it('should emit toolsInitialized event on success', async () => {
            const eventSpy = jest.fn();
            serviceManager.on('toolsInitialized', eventSpy);

            await serviceManager.initializeTools();

            expect(eventSpy).toHaveBeenCalled();
        });
    });

    describe('getToolRegistry', () => {
        it('should return tool registry after initialization', async () => {
            const mockVectorStore = { name: 'mock-store' };
            const result = await serviceManager.getToolRegistry(mockVectorStore);

            const { toolRegistry } = require('../agents/tools/ToolRegistry');
            expect(result).toBe(toolRegistry);
        });

        it('should initialize tools if not already initialized', async () => {
            await serviceManager.getToolRegistry();

            const { toolLoader } = require('../agents/tools/ToolLoader');
            expect(toolLoader.loadAllTools).toHaveBeenCalled();
        });
    });

    describe('getToolsForAgent', () => {
        it('should return array of tool instances', async () => {
            const result = await serviceManager.getToolsForAgent();

            expect(Array.isArray(result)).toBe(true);
            expect(result).toEqual([
                { name: 'duckduckgo' },
                { name: 'wikipedia' }
            ]);
        });

        it('should initialize tools before returning', async () => {
            await serviceManager.getToolsForAgent();

            const { toolLoader } = require('../agents/tools/ToolLoader');
            expect(toolLoader.loadAllTools).toHaveBeenCalled();
        });
    });

    describe('getMemoryService', () => {
        it('should create and return memory service on first call', async () => {
            const result = await serviceManager.getMemoryService();

            expect(result).toBe(mockLangChainMemoryService);
            expect(mockLangChainMemoryService.initialize).toHaveBeenCalled();
        });

        it('should return cached memory service on subsequent calls', async () => {
            const result1 = await serviceManager.getMemoryService();
            const result2 = await serviceManager.getMemoryService();

            expect(result1).toBe(result2);
            expect(mockLangChainMemoryService.initialize).toHaveBeenCalledTimes(1);
        });

        it('should handle concurrent requests for memory service', async () => {
            const promise1 = serviceManager.getMemoryService();
            const promise2 = serviceManager.getMemoryService();
            
            const [result1, result2] = await Promise.all([promise1, promise2]);
            
            expect(result1).toBe(result2);
            expect(mockLangChainMemoryService.initialize).toHaveBeenCalledTimes(1);
        });

        it('should handle LLM provider errors gracefully', async () => {
            mockLLMProvider.getChatModel.mockImplementationOnce(() => {
                throw new Error('LLM provider error');
            });

            const result = await serviceManager.getMemoryService();
            expect(result).toBe(mockLangChainMemoryService);
        });

        it('should emit memoryServiceLoaded event', async () => {
            const eventSpy = jest.fn();
            serviceManager.on('memoryServiceLoaded', eventSpy);

            await serviceManager.getMemoryService();

            expect(eventSpy).toHaveBeenCalledWith(mockLangChainMemoryService);
        });

        it('should throw error when memory service initialization fails', async () => {
            mockLangChainMemoryService.initialize.mockRejectedValueOnce(new Error('Init failed'));

            await expect(serviceManager.getMemoryService()).rejects.toThrow('Init failed');
        });
    });

    describe('getCindyAgent', () => {
        beforeEach(() => {
            // Ensure memory service is available for agent initialization
            serviceManager = new ServiceManager(mockSettingsService, mockLLMProvider);
        });

        it('should create and return Cindy agent on first call', async () => {
            const mockVectorStore = { name: 'mock-store' };
            const result = await serviceManager.getCindyAgent(mockVectorStore);

            expect(result).toBe(mockLangGraphAgent);
        });

        it('should return cached agent on subsequent calls', async () => {
            const result1 = await serviceManager.getCindyAgent();
            const result2 = await serviceManager.getCindyAgent();

            expect(result1).toBe(result2);
        });

        it('should handle concurrent requests for Cindy agent', async () => {
            const promise1 = serviceManager.getCindyAgent();
            const promise2 = serviceManager.getCindyAgent();
            
            const [result1, result2] = await Promise.all([promise1, promise2]);
            
            expect(result1).toBe(result2);
        });

        it('should throw error when LLM provider is missing', async () => {
            const managerWithoutLLM = new ServiceManager(mockSettingsService, null);

            await expect(managerWithoutLLM.getCindyAgent()).rejects.toThrow('LLM provider required for Cindy agent initialization');
        });

        it('should throw error when settings service is missing', async () => {
            const managerWithoutSettings = new ServiceManager(null, mockLLMProvider);

            await expect(managerWithoutSettings.getCindyAgent()).rejects.toThrow('Settings service required for Cindy agent initialization');
        });

        it('should emit cindyAgentLoaded event', async () => {
            const eventSpy = jest.fn();
            serviceManager.on('cindyAgentLoaded', eventSpy);

            await serviceManager.getCindyAgent();

            expect(eventSpy).toHaveBeenCalledWith(mockLangGraphAgent);
        });
    });

    describe('getLoadedServices', () => {
        it('should return correct service status when nothing is loaded', () => {
            const status = serviceManager.getLoadedServices();

            expect(status).toEqual({
                toolRegistry: false,
                memory: false,
                cindyAgent: false
            });
        });

        it('should return correct service status after tools are initialized', async () => {
            await serviceManager.initializeTools();
            
            const status = serviceManager.getLoadedServices();

            expect(status.toolRegistry).toBe(true);
            expect(status.memory).toBe(false);
            expect(status.cindyAgent).toBe(false);
        });

        it('should return correct service status after all services are loaded', async () => {
            await serviceManager.initializeTools();
            await serviceManager.getMemoryService();
            await serviceManager.getCindyAgent();
            
            const status = serviceManager.getLoadedServices();

            expect(status).toEqual({
                toolRegistry: true,
                memory: true,
                cindyAgent: true
            });
        });
    });

    describe('getServiceInstances', () => {
        it('should return service instances when loaded', async () => {
            await serviceManager.initializeTools();
            await serviceManager.getMemoryService();
            await serviceManager.getCindyAgent();

            const instances = serviceManager.getServiceInstances();

            const { toolRegistry } = require('../agents/tools/ToolRegistry');
            expect(instances.toolRegistry).toBe(toolRegistry);
            expect(instances.memory).toBe(mockLangChainMemoryService);
            expect(instances.cindyAgent).toBe(mockLangGraphAgent);
        });

        it('should return null for unloaded services', () => {
            const instances = serviceManager.getServiceInstances();

            const { toolRegistry } = require('../agents/tools/ToolRegistry');
            expect(instances.toolRegistry).toBe(toolRegistry); // Always available
            expect(instances.memory).toBeNull();
            expect(instances.cindyAgent).toBeNull();
        });
    });

    describe('cleanup', () => {
        it('should cleanup all loaded services', async () => {
            // Load all services first
            await serviceManager.initializeTools();
            await serviceManager.getMemoryService();
            await serviceManager.getCindyAgent();

            await serviceManager.cleanup();

            expect(mockLangChainCindyAgent.cleanup).toHaveBeenCalled();
            expect(mockLangChainMemoryService.cleanup).toHaveBeenCalled();
        });

        it('should reset service references after cleanup', async () => {
            await serviceManager.getMemoryService();
            await serviceManager.cleanup();

            const status = serviceManager.getLoadedServices();
            expect(status).toEqual({
                toolRegistry: false,
                memory: false,
                cindyAgent: false
            });
        });

        it('should handle cleanup errors gracefully', async () => {
            await serviceManager.getMemoryService();
            mockLangChainMemoryService.cleanup.mockRejectedValueOnce(new Error('Cleanup error'));

            // Should not throw
            await expect(serviceManager.cleanup()).resolves.not.toThrow();
        });

        it('should handle services without cleanup methods', async () => {
            // Create services without cleanup methods
            const serviceWithoutCleanup = {};
            
            await serviceManager.getMemoryService();
            // Replace with service without cleanup
            (serviceManager as any).langChainMemoryService = serviceWithoutCleanup;

            // Should not throw
            await expect(serviceManager.cleanup()).resolves.not.toThrow();
        });
    });

    describe('error handling', () => {
        it('should handle missing settings service gracefully in initializeTools', async () => {
            const managerWithoutSettings = new ServiceManager(null, mockLLMProvider);

            // Should not throw when settings is null
            await expect(managerWithoutSettings.initializeTools()).resolves.not.toThrow();
        });

        it('should handle settings service errors', async () => {
            mockSettingsService.getAll.mockRejectedValueOnce(new Error('Settings error'));

            await expect(serviceManager.initializeTools()).rejects.toThrow('Settings error');
        });
    });
});