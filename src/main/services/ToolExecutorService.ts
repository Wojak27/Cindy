import { EventEmitter } from 'events';
import { FileSystemTool } from '../tools/FileSystemTool';
import { WebSearchTool } from '../tools/WebSearchTool';
import { WebCrawlTool } from '../tools/WebCrawlTool';
import { EmailCalendarTool } from '../tools/EmailCalendarTool';
import { CalculatorTool } from '../tools/CalculatorTool';
import { BrowserTool } from '../tools/BrowserTool';
import { CitationTool } from '../tools/CitationTool';
import { RAGTool } from '../tools/RAGTool';
import { VectorStoreService } from '../services/VectorStoreService';

export interface ToolResult {
    success: boolean;
    data?: any;
    error?: string;
    metadata?: {
        executionTime?: number;
        toolName?: string;
        parameters?: any;
    };
}

class ToolExecutorService extends EventEmitter {
    private tools: Record<string, any> = {};
    private ragTool: RAGTool | null = null;

    constructor(vectorStore?: VectorStoreService) {
        super();
        if (vectorStore) {
            this.ragTool = new RAGTool(vectorStore);
        }
        this.initializeTools();
    }

    private initializeTools(): void {
        this.tools = {
            'create_note': new FileSystemTool(),
            'edit_note': new FileSystemTool(),
            'search_notes': new FileSystemTool(),
            'web_search': new WebSearchTool(),
            'web_crawl': new WebCrawlTool(),
            'schedule_task': new EmailCalendarTool(),
            'calculate': new CalculatorTool(),
            'unit_convert': new CalculatorTool(),
            'browser_open': new BrowserTool(),
            'browser_extract': new BrowserTool(),
            'browser_search': new BrowserTool(),
            'cite_article': new CitationTool(),
            'create_bibliography': new CitationTool()
        };

        // Add RAG tools if available
        if (this.ragTool) {
            this.tools['rag_query'] = this.ragTool;
            this.tools['rag_index_document'] = this.ragTool;
            this.tools['rag_index_webpage'] = this.ragTool;
            this.tools['rag_index_directory'] = this.ragTool;
        }
    }

    async execute(toolName: string, parameters: any): Promise<ToolResult> {
        this.emit('toolExecutionStarted', { toolName, parameters });
        const startTime = Date.now();

        try {
            const tool = this.tools[toolName];

            if (!tool) {
                throw new Error(`Tool not found: ${toolName}`);
            }

            let result: any;

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
                    result = await tool.execute(parameters.query);
                    break;
                case 'web_crawl':
                    result = await tool.crawl(parameters.url, parameters.options);
                    break;
                case 'schedule_task':
                    result = await tool.scheduleTask(parameters);
                    break;
                case 'calculate':
                    result = await tool.execute(parameters.expression);
                    break;
                case 'unit_convert':
                    result = await tool.convert(parameters.value, parameters.fromUnit, parameters.toUnit);
                    break;
                case 'browser_open':
                    result = await tool.openUrl(parameters.url, parameters.options);
                    break;
                case 'browser_extract':
                    result = await tool.extractContent(parameters.url, parameters.options);
                    break;
                case 'browser_search':
                    result = await tool.searchPage(parameters.url, parameters.searchTerm, parameters.options);
                    break;
                case 'cite_article':
                    result = await tool.extractCitation(parameters.url, parameters.options);
                    break;
                case 'create_bibliography':
                    result = await tool.createBibliography(parameters.urls, parameters.options);
                    break;
                case 'rag_query':
                    result = await tool.queryKnowledge(parameters.query, parameters.options);
                    break;
                case 'rag_index_document':
                    result = await tool.indexDocument(parameters.filePath, parameters.options);
                    break;
                case 'rag_index_webpage':
                    result = await tool.indexWebPage(parameters.url, parameters.options);
                    break;
                case 'rag_index_directory':
                    result = await tool.indexDirectory(parameters.dirPath, parameters.options);
                    break;
                default:
                    throw new Error(`Unsupported tool: ${toolName}`);
            }

            const executionTime = Date.now() - startTime;
            const toolResult: ToolResult = {
                success: true,
                data: result,
                metadata: {
                    executionTime,
                    toolName,
                    parameters
                }
            };

            this.emit('toolExecutionCompleted', { toolName, result: toolResult });
            return toolResult;
        } catch (error) {
            const executionTime = Date.now() - startTime;
            const toolResult: ToolResult = {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                metadata: {
                    executionTime,
                    toolName,
                    parameters
                }
            };

            this.emit('toolExecutionError', { toolName, error: toolResult.error });
            return toolResult;
        }
    }

    getAvailableTools(): string[] {
        return Object.keys(this.tools);
    }
}

export { ToolExecutorService };