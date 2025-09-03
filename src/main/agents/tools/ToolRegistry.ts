/**
 * Central registry for managing all agent tools
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/ColorLogger';
import { StructuredTool, Tool } from '@langchain/core/tools';

/**
 * Tool Registry for centralized tool management
 */
export class ToolRegistry extends EventEmitter {
    private static instance: ToolRegistry;
    private tools: Tool[] & StructuredTool[];

    private constructor() {
        super();
        this.tools = [];
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

    public registerTool(tool: Tool | StructuredTool) {
        if (this.tools.find(t => t.name === tool.name)) {
            logger.error('', `Tool with name ${tool.name} is already registered. Skipping.`);
            return;
        }
        this.tools.push(tool);
        this.emit('toolRegistered', tool);
        logger.info('', `Registered tool: ${tool.name}`);
    }

    public unregisterTool(toolName: string) {
        const index = this.tools.findIndex(t => t.name === toolName);
        if (index !== -1) {
            const [removed] = this.tools.splice(index, 1);
            this.emit('toolUnregistered', removed);
            logger.info('', `Unregistered tool: ${toolName}`);
        } else {
            logger.warn('', `Tool with name ${toolName} not found. Cannot unregister.`);
        }
    }

    public getTools(): Tool[] & StructuredTool[] {
        return this.tools;
    }

    public hasTool(toolName: string): boolean {
        return this.tools.some(t => t.name === toolName);
    }

    public getAllToolNames(): string[] {
        return this.tools.map(t => t.name);
    }
}

// Export singleton instance
export const toolRegistry = ToolRegistry.getInstance();