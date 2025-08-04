import { EventEmitter } from 'events';
import { FileSystemTool } from '../tools/FileSystemTool';
import { WebSearchTool } from '../tools/WebSearchTool';
import { WebCrawlTool } from '../tools/WebCrawlTool';
import { EmailCalendarTool } from '../tools/EmailCalendarTool';

interface ToolResult {
    success: boolean;
    data?: any;
    error?: string;
}

class ToolExecutorService extends EventEmitter {
    private tools: Record<string, any> = {};

    constructor() {
        super();
        this.initializeTools();
    }

    private initializeTools(): void {
        this.tools = {
            'create_note': new FileSystemTool(),
            'edit_note': new FileSystemTool(),
            'search_notes': new FileSystemTool(),
            'web_search': new WebSearchTool(),
            'web_crawl': new WebCrawlTool(),
            'schedule_task': new EmailCalendarTool()
        };
    }

    async execute(toolName: string, parameters: any): Promise<ToolResult> {
        this.emit('toolExecutionStarted', { toolName, parameters });

        try {
            const tool = this.tools[toolName];

            if (!tool) {
                throw new Error(`Tool not found: ${toolName}`);
            }

            let result;

            switch (toolName) {
                case 'create_note':
                    result = await tool.createNote(parameters);
                    break;
                case 'edit_note':
                    result = await tool.editNote(parameters);
                    break;
                case 'search_notes':
                    result = await tool.searchNotes(parameters);
                    break;
                case 'web_search':
                    result = await tool.search(parameters.query, parameters.options);
                    break;
                case 'web_crawl':
                    result = await tool.crawl(parameters.url, parameters.options);
                    break;
                case 'schedule_task':
                    result = await tool.scheduleTask(parameters);
                    break;
                default:
                    throw new Error(`Unsupported tool: ${toolName}`);
            }

            const toolResult: ToolResult = {
                success: true,
                data: result
            };

            this.emit('toolExecutionCompleted', { toolName, result: toolResult });
            return toolResult;
        } catch (error) {
            const toolResult: ToolResult = {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };

            this.emit('toolExecutionError', { toolName, error: toolResult.error });
            return toolResult;
        }
    }

    getAvailableTools(): string[] {
        return Object.keys(this.tools);
    }
}

export { ToolExecutorService, ToolResult };