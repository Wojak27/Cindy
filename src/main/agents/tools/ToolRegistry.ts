/**
 * Central registry for managing all agent tools
 */

import { EventEmitter } from 'events';
import { ToolCategory } from './ToolDefinitions';
import type { 
    ToolDefinition, 
    ToolSpecification, 
    ToolConfig
} from './ToolDefinitions';

/**
 * Tool Registry for centralized tool management
 */
export class ToolRegistry extends EventEmitter {
    private static instance: ToolRegistry;
    private tools: Map<string, ToolSpecification>;
    private toolsByCategory: Map<ToolCategory, Set<string>>;
    private initialized: boolean;

    private constructor() {
        super();
        this.tools = new Map();
        this.toolsByCategory = new Map();
        this.initialized = false;
        
        // Initialize category sets
        Object.values(ToolCategory).forEach(category => {
            this.toolsByCategory.set(category as ToolCategory, new Set());
        });
        
        console.log('[ToolRegistry] Initialized');
    }

    /**
     * Get singleton instance
     */
    static getInstance(): ToolRegistry {
        if (!ToolRegistry.instance) {
            ToolRegistry.instance = new ToolRegistry();
        }
        return ToolRegistry.instance;
    }

    /**
     * Register a tool with the registry
     */
    registerTool(specification: ToolSpecification): void {
        const { name, metadata } = specification;
        
        if (this.tools.has(name)) {
            console.warn(`[ToolRegistry] Tool ${name} already registered, updating...`);
        }
        
        this.tools.set(name, specification);
        
        // Add to category index
        const categorySet = this.toolsByCategory.get(metadata.category);
        if (categorySet) {
            categorySet.add(name);
        }
        
        console.log(`[ToolRegistry] Registered tool: ${name} (${metadata.category})`);
        this.emit('tool-registered', { name, specification });
    }

    /**
     * Register multiple tools at once
     */
    registerTools(specifications: ToolSpecification[]): void {
        specifications.forEach(spec => this.registerTool(spec));
    }

    /**
     * Unregister a tool
     */
    unregisterTool(name: string): boolean {
        const tool = this.tools.get(name);
        if (!tool) {
            console.warn(`[ToolRegistry] Tool ${name} not found`);
            return false;
        }
        
        // Remove from category index
        const categorySet = this.toolsByCategory.get(tool.metadata.category);
        if (categorySet) {
            categorySet.delete(name);
        }
        
        this.tools.delete(name);
        console.log(`[ToolRegistry] Unregistered tool: ${name}`);
        this.emit('tool-unregistered', { name });
        return true;
    }

    /**
     * Get a tool by name
     */
    getTool(name: string): ToolSpecification | undefined {
        return this.tools.get(name);
    }

    /**
     * Get tool definition (without metadata) for LangChain compatibility
     */
    getToolDefinition(name: string): ToolDefinition | undefined {
        const spec = this.tools.get(name);
        if (!spec) return undefined;
        
        return {
            name: spec.name,
            description: spec.description,
            parameters: spec.parameters,
            tool: spec.tool
        };
    }

    /**
     * Get all tools
     */
    getAllTools(): ToolSpecification[] {
        return Array.from(this.tools.values());
    }

    /**
     * Get all tool definitions for LangChain
     */
    getAllToolDefinitions(): ToolDefinition[] {
        return this.getAllTools().map(spec => ({
            name: spec.name,
            description: spec.description,
            parameters: spec.parameters,
            tool: spec.tool
        }));
    }

    /**
     * Get tools by category
     */
    getToolsByCategory(category: ToolCategory): ToolSpecification[] {
        const toolNames = this.toolsByCategory.get(category);
        if (!toolNames) return [];
        
        return Array.from(toolNames)
            .map(name => this.tools.get(name))
            .filter((tool): tool is ToolSpecification => tool !== undefined);
    }

    /**
     * Get tools by tags
     */
    getToolsByTags(tags: string[]): ToolSpecification[] {
        return this.getAllTools().filter(tool => {
            if (!tool.metadata.tags) return false;
            return tags.some(tag => tool.metadata.tags?.includes(tag));
        });
    }

    /**
     * Check if a tool exists
     */
    hasTool(name: string): boolean {
        return this.tools.has(name);
    }

    /**
     * Get tool names
     */
    getToolNames(): string[] {
        return Array.from(this.tools.keys());
    }

    /**
     * Execute a tool by name (compatibility with LangChainToolExecutorService)
     */
    async executeTool(toolName: string, parameters: any): Promise<{
        success: boolean;
        result?: any;
        error?: string;
        duration?: number;
    }> {
        const startTime = Date.now();
        
        try {
            console.log(`[ToolRegistry] Executing tool: ${toolName} with parameters:`, parameters);
            
            const toolSpec = this.tools.get(toolName);
            if (!toolSpec) {
                console.error(`[ToolRegistry] Tool not found: ${toolName}`);
                console.error(`[ToolRegistry] Available tools: [${Array.from(this.tools.keys()).join(', ')}]`);
                throw new Error(`Tool not found: ${toolName}`);
            }

            // Extract the input parameter for the tool
            let input = parameters?.input || parameters;
            
            // Convert object parameters to JSON string for LangChain tools that expect string input
            if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
                input = JSON.stringify(input);
            }
            
            console.log(`[ToolRegistry] Passing to tool ${toolName}:`, input, typeof input);
            
            // Execute the tool
            const result = await toolSpec.tool.invoke(input);
            const duration = Date.now() - startTime;
            
            console.log(`[ToolRegistry] Tool ${toolName} executed successfully in ${duration}ms`);
            
            return {
                success: true,
                result,
                duration
            };
            
        } catch (error: any) {
            const duration = Date.now() - startTime;
            console.error(`[ToolRegistry] Tool ${toolName} failed after ${duration}ms:`, error.message);
            
            return {
                success: false,
                error: error.message,
                duration
            };
        }
    }

    /**
     * Get available tools (compatibility alias)
     */
    getAvailableTools(): string[] {
        return this.getToolNames();
    }

    /**
     * Get tools (compatibility alias) 
     */
    getTools(): string[] {
        return this.getToolNames();
    }

    /**
     * Get tools requiring authentication
     */
    getAuthRequiredTools(): ToolSpecification[] {
        return this.getAllTools().filter(tool => tool.metadata.requiresAuth);
    }

    /**
     * Configure a tool with new settings
     */
    configureTool(name: string, config: ToolConfig): boolean {
        const tool = this.tools.get(name);
        if (!tool) {
            console.warn(`[ToolRegistry] Tool ${name} not found for configuration`);
            return false;
        }
        
        tool.config = { ...tool.config, ...config };
        console.log(`[ToolRegistry] Configured tool ${name}:`, config);
        this.emit('tool-configured', { name, config });
        return true;
    }

    /**
     * Get tool configuration
     */
    getToolConfig(name: string): ToolConfig | undefined {
        return this.tools.get(name)?.config;
    }

    /**
     * Clear all tools
     */
    clear(): void {
        this.tools.clear();
        this.toolsByCategory.forEach(set => set.clear());
        console.log('[ToolRegistry] All tools cleared');
        this.emit('registry-cleared');
    }

    /**
     * Get registry statistics
     */
    getStats(): {
        totalTools: number;
        toolsByCategory: Record<string, number>;
        authRequiredTools: number;
    } {
        const stats: Record<string, number> = {};
        this.toolsByCategory.forEach((tools, category) => {
            stats[category] = tools.size;
        });
        
        return {
            totalTools: this.tools.size,
            toolsByCategory: stats,
            authRequiredTools: this.getAuthRequiredTools().length
        };
    }

    /**
     * Export registry as JSON
     */
    exportRegistry(): any {
        const tools: any[] = [];
        this.tools.forEach((spec, name) => {
            tools.push({
                name,
                description: spec.description,
                category: spec.metadata.category,
                requiresAuth: spec.metadata.requiresAuth,
                tags: spec.metadata.tags
            });
        });
        return { tools, stats: this.getStats() };
    }

    /**
     * Initialize registry with default tools
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            console.log('[ToolRegistry] Already initialized');
            return;
        }
        
        console.log('[ToolRegistry] Initializing with default tools...');
        
        // Tool initialization will be done by individual tool modules
        // They will self-register when imported
        
        this.initialized = true;
        console.log('[ToolRegistry] Initialization complete');
        this.emit('registry-initialized');
    }

    /**
     * Check if registry is initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }
}

// Export singleton instance
export const toolRegistry = ToolRegistry.getInstance();