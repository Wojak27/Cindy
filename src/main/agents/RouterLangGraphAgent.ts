import { LLMProvider } from '../services/LLMProvider';
import { LangChainMemoryService } from '../services/LangChainMemoryService';
import { toolRegistry } from './tools/ToolRegistry';
import { SettingsService } from '../services/SettingsService';
import { DeepResearchIntegration } from './research/DeepResearchIntegration';
import { logger } from '../utils/ColorLogger';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import {
    TodoItem,
    createTodoItem,
    updateTodoStatus,
    getTodoStats,
    ResearchStatus
} from './research/DeepResearchState';

/**
 * Configuration options for the LangGraphAgent
 */
export interface RouterLangGraphAgentOptions {
    llmProvider: LLMProvider;
    memoryService: LangChainMemoryService;
    config?: any;
    enableStateManagement?: boolean;
    persistState?: boolean;
}

/**
 * Agent session state interface
 */
export interface AgentSessionState {
    sessionId: string;
    startTime: Date;
    currentStatus: ResearchStatus;
    todoList: TodoItem[];
    // Remove benchmark-specific fields
    // These were moved to the benchmark file as requested
    metadata: { [key: string]: any };
}

/**
 * Deep Research-enhanced LangGraph Agent.
 * Intelligent routing between Deep Research capabilities and standard processing.
 */
export class RouterLangGraphAgent {
    private routerAgent: DeepResearchIntegration;
    private llmProvider: LLMProvider;
    private memoryService: LangChainMemoryService;
    private settingsService: SettingsService | null = null;

    // State management properties
    private sessionState: AgentSessionState | null = null;
    private enableStateManagement: boolean;
    private persistState: boolean;
    private stateUpdateCallbacks: Array<(state: AgentSessionState) => void> = [];

    constructor(options: RouterLangGraphAgentOptions) {
        this.llmProvider = options.llmProvider;
        this.memoryService = options.memoryService;
        this.enableStateManagement = options.enableStateManagement !== false; // Default to enabled
        this.persistState = options.persistState !== false; // Default to enabled

        // Create a minimal settings service for compatibility
        this.settingsService = this.createCompatibilitySettingsService();

        // Initialize Deep Research integration
        this.routerAgent = new DeepResearchIntegration({
            llmProvider: this.llmProvider,
            settingsService: this.settingsService,
            enableDeepResearch: true,
            fallbackToOriginal: true
        });

        // Initialize state management
        if (this.enableStateManagement) {
            this.initializeState();
        }

        logger.success('RouterLangGraphAgent', 'Initialized with Deep Research routing and state management', {
            provider: this.llmProvider.getCurrentProvider(),
            deepResearchEnabled: true,
            fallbackEnabled: true,
            stateManagementEnabled: this.enableStateManagement,
            persistentState: this.persistState
        });
    }

    /**
     * Create a compatibility settings service for Deep Research integration
     */
    private createCompatibilitySettingsService(): SettingsService {
        // Return a minimal settings service that provides default values
        return {
            getCurrentProvider: () => this.llmProvider.getCurrentProvider(),
            // Add other minimal methods as needed for compatibility
        } as any;
    }

    //##################
    // State Management Methods
    //##################

    /**
     * Initialize agent session state
     */
    private initializeState(): void {
        this.sessionState = {
            sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            startTime: new Date(),
            currentStatus: ResearchStatus.PLANNING,
            todoList: [],
            metadata: {}
        };

        logger.info('RouterLangGraphAgent', 'Agent state initialized', {
            sessionId: this.sessionState.sessionId,
            status: this.sessionState.currentStatus
        });
    }

    /**
     * Get current agent state
     */
    public getAgentState(): AgentSessionState | null {
        return this.sessionState;
    }

    /**
     * Get the memory service for external access (used by benchmark)
     */
    public getMemoryService(): LangChainMemoryService {
        return this.memoryService;
    }

    /**
     * Update agent status
     */
    public updateStatus(status: ResearchStatus): void {
        if (this.sessionState) {
            this.sessionState.currentStatus = status;
            this.notifyStateUpdate();

            logger.info('RouterLangGraphAgent', `Status updated to ${status}`);
        }
    }

    /**
     * Add todo item to agent state
     */
    public addTodo(todo: TodoItem): void {
        if (this.sessionState) {
            this.sessionState.todoList.push(todo);
            this.notifyStateUpdate();

            logger.bullet('RouterLangGraphAgent', `Todo added: ${todo.content}`, 1);
        }
    }

    /**
     * Update todo status
     */
    public updateTodoStatus(todoId: string, status: 'pending' | 'in_progress' | 'completed'): void {
        if (this.sessionState) {
            this.sessionState.todoList = updateTodoStatus(this.sessionState.todoList, todoId, status);
            this.notifyStateUpdate();

            logger.bullet('RouterLangGraphAgent', `Todo ${todoId} status: ${status}`, 1);
        }
    }

    /**
     * Add conversation context
     */
    // Removed benchmark-specific methods as requested by user

    /**
     * Get todo statistics
     */
    public getTodoStats() {
        if (!this.sessionState) return null;
        return getTodoStats(this.sessionState.todoList);
    }

    // Removed LoCoMo-specific initialization as requested by user

    /**
     * Register state update callback
     */
    public onStateUpdate(callback: (state: AgentSessionState) => void): void {
        this.stateUpdateCallbacks.push(callback);
    }

    /**
     * Notify all registered callbacks of state updates
     */
    private notifyStateUpdate(): void {
        if (this.sessionState && this.stateUpdateCallbacks.length > 0) {
            this.stateUpdateCallbacks.forEach(callback => {
                try {
                    callback(this.sessionState!);
                } catch (error) {
                    logger.warn('RouterLangGraphAgent', 'State update callback failed', error);
                }
            });
        }
    }

    /**
     * Process a message through the Deep Research system (non-streaming)
     */
    async process(input: string, context?: any): Promise<string> {
        try {
            // Update state to indicate processing has started
            if (this.sessionState) {
                this.updateStatus(ResearchStatus.RESEARCHING);

                // Add processing todo
                const processingTodo = createTodoItem({
                    content: `Process query: ${input.slice(0, 50)}${input.length > 50 ? '...' : ''}`,
                    activeForm: `Processing query: ${input.slice(0, 50)}${input.length > 50 ? '...' : ''}`,
                    status: 'in_progress',
                    category: 'processing'
                });
                this.addTodo(processingTodo);
            }

            logger.stage('RouterLangGraphAgent', 'Processing with State Management', input.slice(0, 100));

            // Use Deep Research integration for intelligent processing
            const result = await this.routerAgent.processMessage(input, context);

            // Update state based on processing result
            if (this.sessionState) {
                const processingTodo = this.sessionState.todoList.find(
                    t => t.category === 'processing' && t.status === 'in_progress'
                );
                if (processingTodo) {
                    this.updateTodoStatus(processingTodo.id!, 'completed');
                }
            }

            if (result.usedDeepResearch && result.result !== 'FALLBACK_TO_ORIGINAL') {
                logger.success('RouterLangGraphAgent', `Deep Research completed in ${result.processingTime}ms`);
                this.updateStatus(ResearchStatus.SYNTHESIZING);
                return result.result;
            } else if (result.usedToolAgent) {
                logger.success('RouterLangGraphAgent', `Tool Agent completed in ${result.processingTime}ms`);
                this.updateStatus(ResearchStatus.COMPLETE);
                return result.result;
            } else {
                // For direct response cases
                logger.success('RouterLangGraphAgent', `Direct response completed in ${result.processingTime}ms`);
                this.updateStatus(ResearchStatus.COMPLETE);
                return result.result;
            }

        } catch (error) {
            logger.error('RouterLangGraphAgent', 'Processing error', error);
            this.updateStatus(ResearchStatus.ERROR);
            return `I encountered an error: ${(error as Error).message}`;
        }
    }


    /**
     * Process a message through Deep Research with streaming output
     */
    async *processStreaming(input: string, context?: any): AsyncGenerator<string> {
        try {
            logger.stage('RouterLangGraphAgent', 'Intelligent Routing', `Processing: "${input}"`);
            logger.section('RouterLangGraphAgent', 'Route Analysis', () => {
                logger.keyValue('RouterLangGraphAgent', 'Input', input);
            });


            for await (const update of this.routerAgent.streamMessage(input, context)) {
                if (update.usedDeepResearch) {
                    // Deep Research mode
                    if (update.type === 'progress') {
                        yield `📋 ${update.content}\n\n`;
                    } else if (update.type === 'result') {
                        yield update.content;
                    }
                } else if (update.usedToolAgent) {
                    // Tool Agent mode
                    logger.info('RouterLangGraphAgent', 'Using Tool Agent for specialized execution');
                    if (update.type === 'progress') {
                        yield `🔧 ${update.content}\n\n`;
                    } else if (update.type === 'tool_result') {
                        yield `⚡ ${update.content}\n\n`;
                    } else if (update.type === 'result') {
                        yield update.content;
                    } else if (update.type === 'side_view') {
                        // Handle side view data (will be processed by renderer)
                        if (update.data && update.data.type === 'weather') {
                            // Include the actual weather data JSON for the renderer
                            yield `📊 ${JSON.stringify(update.data.data)}\n\n`;
                        } else if (update.data && update.data.type === 'map') {
                            // Include the actual map data JSON for the renderer
                            yield `📊 ${JSON.stringify(update.data.data)}\n\n`;
                        } else {
                            yield `📊 ${update.content}\n\n`;
                        }
                    }
                } else {
                    // Direct LLM response mode
                    yield update.content;
                }
            }

        } catch (error) {
            logger.error('RouterLangGraphAgent', 'Streaming process error', error);
            yield `\n❌ **Error:** I encountered an issue while processing your request: ${(error as Error).message}`;
        }
    }

    /**
     * Get the current provider being used
     */
    getCurrentProvider(): string {
        return this.llmProvider.getCurrentProvider();
    }

    /**
     * Get available tools
     */
    getAvailableTools(): string[] {
        return toolRegistry.getAvailableTools();
    }

    /**
     * Update settings and propagate to Deep Research integration
     */
    async updateSettings(): Promise<void> {
        try {
            await this.routerAgent.updateSettings();
            logger.success('RouterLangGraphAgent', 'Settings updated successfully');
        } catch (error) {
            logger.error('RouterLangGraphAgent', 'Error updating settings', error);
        }
    }

    /**
     * Get enhanced status information
     */
    getStatus(): {
        provider: string;
        availableTools: string[];
        deepResearchStatus: any;
    } {
        return {
            provider: this.getCurrentProvider(),
            availableTools: this.getAvailableTools(),
            deepResearchStatus: this.routerAgent.getStatus()
        };
    }

    /**
     * Enable or disable Deep Research capabilities
     */
    setDeepResearchEnabled(enabled: boolean): void {
        this.routerAgent.setEnabled(enabled);
        console.log(`[RouterLangGraphAgent] Deep Research ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Set fallback behavior for when Deep Research fails
     */
    setFallbackEnabled(enabled: boolean): void {
        this.routerAgent.setFallbackEnabled(enabled);
        console.log(`[RouterLangGraphAgent] Fallback to standard processing ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Get the Deep Research integration (for advanced configuration)
     */
    getDeepResearchIntegration(): DeepResearchIntegration {
        return this.routerAgent;
    }

    /**
     * Export agent graph visualization as PNG file
     */
    async exportGraphAsPNG(options: {
        outputPath?: string;
        enableLangSmith?: boolean;
        projectName?: string;
    } = {}): Promise<string> {
        const {
            outputPath = './agent-graph.png',
            enableLangSmith = false,
            projectName = 'deep-research-debug'
        } = options;

        try {
            console.log('🎨 [RouterLangGraphAgent] Generating graph visualization...');

            // Setup LangSmith if requested
            if (enableLangSmith) {
                this.setupLangSmithTracing(projectName);
            }

            // Get the Deep Research agent
            const deepResearchAgent = this.routerAgent.getDeepResearchAgent();

            // Generate and export the graph
            const finalPath = await this.generateGraphPNG(deepResearchAgent, outputPath);

            console.log(`✅ [RouterLangGraphAgent] Graph exported to: ${finalPath}`);
            return finalPath;

        } catch (error) {
            console.error('❌ [RouterLangGraphAgent] Graph export failed:', error);
            throw error;
        }
    }


    /**
     * Setup LangSmith tracing
     */
    private setupLangSmithTracing(projectName: string) {
        console.log('\n🔬 LANGSMITH SETUP');
        console.log('==================');

        try {
            // Set environment variables for LangSmith
            process.env.LANGCHAIN_TRACING_V2 = 'true';
            process.env.LANGCHAIN_PROJECT = projectName;

            // Check if API key is available
            if (process.env.LANGCHAIN_API_KEY) {
                console.log('✅ LangSmith tracing enabled');
                console.log(`📊 Project: ${projectName}`);
                console.log('🔗 Traces will be available at: https://smith.langchain.com/');
                console.log(`   └─ Project: ${projectName}`);
            } else {
                console.log('⚠️  LANGCHAIN_API_KEY not found');
                console.log('💡 To enable LangSmith tracing:');
                console.log('   1. Get API key from https://smith.langchain.com/');
                console.log('   2. Set environment variable: export LANGCHAIN_API_KEY=your_key');
                console.log('   3. Restart the application');
            }

        } catch (error) {
            console.error('❌ Error setting up LangSmith:', error);
        }
    }

    /**
     * Generate PNG file from the graph
     */
    private async generateGraphPNG(deepResearchAgent: any, outputPath: string): Promise<string> {
        try {
            console.log('🔧 [RouterLangGraphAgent] Accessing graph structure...');

            // Get the main graph from the Deep Research agent
            const mainGraph = deepResearchAgent.getMainGraph();

            if (!mainGraph || !mainGraph.get_graph) {
                throw new Error('Graph structure not accessible from Deep Research agent');
            }

            console.log('📊 [RouterLangGraphAgent] Generating mermaid diagram...');

            // Get the graph representation
            const graph = mainGraph.get_graph();

            // Try to get mermaid representation
            let mermaidCode: string;

            if (graph.draw_mermaid) {
                mermaidCode = graph.draw_mermaid();
            } else {
                // Fallback: generate our own mermaid representation
                mermaidCode = this.generateFallbackMermaidCode();
            }

            console.log('🖼️ [RouterLangGraphAgent] Converting to PNG...');

            // Convert mermaid to PNG using mermaid-cli or puppeteer
            const finalPath = await this.convertMermaidToPNG(mermaidCode, outputPath);

            return finalPath;

        } catch (error) {
            console.error('❌ [RouterLangGraphAgent] Error generating PNG:', error);

            // Fallback: create a basic visualization
            console.log('🔄 [RouterLangGraphAgent] Using fallback visualization...');
            return await this.createFallbackVisualization(outputPath);
        }
    }

    /**
     * Generate fallback mermaid code when graph introspection fails
     */
    private generateFallbackMermaidCode(): string {
        return `
graph TD
    Start([Start]) --> Clarification[ClarificationNode]
    Clarification --> |Need Clarification| NeedClarification[Ask User]
    Clarification --> |No Clarification| Research[ResearchProcess]
    Research --> Supervisor[SupervisorGraph]
    Supervisor --> ResearchLoop[ResearcherGraph]
    ResearchLoop --> |Continue| Supervisor
    Supervisor --> |Complete| Synthesis[SynthesisNode]
    Synthesis --> End([End])
    NeedClarification --> End
    
    subgraph "Supervisor Graph"
        SupervisorNode[SupervisorNode]
        DelegateResearch[DelegateResearch]
        SupervisorNode --> DelegateResearch
        DelegateResearch --> SupervisorNode
    end
    
    subgraph "Researcher Graph"
        ResearcherNode[ResearcherNode]
        ResearcherNode --> |Tool Execution| ResearcherNode
    end
    
    style Start fill:#e1f5fe
    style End fill:#f3e5f5
    style Clarification fill:#fff3e0
    style Research fill:#e8f5e8
    style Synthesis fill:#fce4ec
    style SupervisorNode fill:#fff8e1
    style ResearcherNode fill:#e0f2f1
`;
    }

    /**
     * Convert mermaid code to PNG using available tools
     */
    private async convertMermaidToPNG(mermaidCode: string, outputPath: string): Promise<string> {

        try {
            // First, save the mermaid code to a temporary file
            const mermaidPath = outputPath.replace(/\.png$/i, '.mmd');
            await fs.writeFile(mermaidPath, mermaidCode, 'utf-8');
            console.log(`📝 [RouterLangGraphAgent] Mermaid code saved to: ${mermaidPath}`);

            // Try to use mermaid-cli if available

            return new Promise((resolve, reject) => {
                // Try mmdc (mermaid-cli) first
                const mmdc = spawn('mmdc', ['-i', mermaidPath, '-o', outputPath, '-b', 'white'], {
                    stdio: 'pipe'
                });

                mmdc.on('close', async (code: number) => {
                    if (code === 0) {
                        console.log('✅ [RouterLangGraphAgent] PNG generated using mermaid-cli');
                        resolve(path.resolve(outputPath));
                    } else {
                        console.log('⚠️ [RouterLangGraphAgent] mermaid-cli not available, using fallback...');
                        try {
                            const fallbackPath = await this.createFallbackVisualization(outputPath);
                            resolve(fallbackPath);
                        } catch (error) {
                            reject(error);
                        }
                    }
                });

                mmdc.on('error', async () => {
                    console.log('⚠️ [RouterLangGraphAgent] mermaid-cli not found, using fallback...');
                    try {
                        const fallbackPath = await this.createFallbackVisualization(outputPath);
                        resolve(fallbackPath);
                    } catch (error) {
                        reject(error);
                    }
                });
            });

        } catch (error) {
            console.warn('⚠️ [RouterLangGraphAgent] Mermaid conversion failed, using fallback');
            return await this.createFallbackVisualization(outputPath);
        }
    }

    /**
     * Create a fallback visualization using simple text-based approach
     */
    private async createFallbackVisualization(outputPath: string): Promise<string> {

        try {
            // Check if we can use node-canvas for better visualization
            let createCanvas;

            try {
                const canvas = require('canvas');
                createCanvas = canvas.createCanvas;
            } catch (canvasError) {
                console.log('⚠️ [RouterLangGraphAgent] node-canvas not available, creating text diagram...');
                return await this.createTextDiagram(outputPath);
            }

            // Create canvas
            const width = 1200;
            const height = 800;
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');

            // Set background
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);

            // Draw the graph
            await this.drawGraphOnCanvas(ctx);

            // Save as PNG
            const buffer = canvas.toBuffer('image/png');
            await fs.writeFile(outputPath, buffer);

            console.log('✅ [RouterLangGraphAgent] Canvas-based PNG created');
            return path.resolve(outputPath);

        } catch (error) {
            console.warn('⚠️ [RouterLangGraphAgent] Canvas fallback failed, creating text diagram');
            return await this.createTextDiagram(outputPath);
        }
    }

    /**
     * Draw the graph structure on canvas
     */
    private async drawGraphOnCanvas(ctx: any): Promise<void> {
        // Set up drawing styles
        ctx.strokeStyle = '#333';
        ctx.fillStyle = '#333';
        ctx.lineWidth = 2;
        ctx.font = '14px Arial';

        // Define node positions
        const nodes = {
            start: { x: 100, y: 100, label: 'Start' },
            clarification: { x: 300, y: 100, label: 'Clarification' },
            research: { x: 500, y: 100, label: 'Research Process' },
            supervisor: { x: 700, y: 200, label: 'Supervisor' },
            researcher: { x: 900, y: 300, label: 'Researcher' },
            synthesis: { x: 700, y: 400, label: 'Synthesis' },
            end: { x: 500, y: 500, label: 'End' }
        };

        // Draw nodes
        Object.values(nodes).forEach(node => {
            this.drawNode(ctx, node.x, node.y, node.label);
        });

        // Draw edges
        this.drawEdge(ctx, nodes.start, nodes.clarification);
        this.drawEdge(ctx, nodes.clarification, nodes.research);
        this.drawEdge(ctx, nodes.research, nodes.supervisor);
        this.drawEdge(ctx, nodes.supervisor, nodes.researcher);
        this.drawEdge(ctx, nodes.researcher, nodes.supervisor);
        this.drawEdge(ctx, nodes.supervisor, nodes.synthesis);
        this.drawEdge(ctx, nodes.synthesis, nodes.end);

        // Add title
        ctx.font = '24px Arial';
        ctx.fillStyle = '#000';
        ctx.fillText('Deep Research Agent Graph', 400, 50);
    }

    /**
     * Draw a single node on canvas
     */
    private drawNode(ctx: any, x: number, y: number, label: string): void {
        const width = 120;
        const height = 60;

        // Draw rounded rectangle
        ctx.beginPath();
        ctx.roundRect(x - width / 2, y - height / 2, width, height, 10);
        ctx.fillStyle = '#e3f2fd';
        ctx.fill();
        ctx.strokeStyle = '#1976d2';
        ctx.stroke();

        // Draw text
        ctx.fillStyle = '#000';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, y + 4);
    }

    /**
     * Draw an edge between two nodes
     */
    private drawEdge(ctx: any, from: any, to: any): void {
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = '#666';
        ctx.stroke();

        // Draw arrow head
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const arrowLength = 10;

        ctx.beginPath();
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(
            to.x - arrowLength * Math.cos(angle - Math.PI / 6),
            to.y - arrowLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(to.x, to.y);
        ctx.lineTo(
            to.x - arrowLength * Math.cos(angle + Math.PI / 6),
            to.y - arrowLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
    }

    /**
     * Create a simple text-based diagram as final fallback
     */
    private async createTextDiagram(outputPath: string): Promise<string> {
        const fs = require('fs').promises;
        const path = require('path');

        const textDiagram = `
DEEP RESEARCH AGENT GRAPH VISUALIZATION
======================================

[Start] 
   ↓
[ClarificationNode] 
   ↓ (no clarification needed)
[ResearchProcess]
   ↓
[SupervisorGraph] ←→ [ResearcherGraph]
   ↓ (research complete)
[SynthesisNode]
   ↓
[End]

SUPERVISOR GRAPH:
- SupervisorNode ←→ DelegateResearch

RESEARCHER GRAPH:
- ResearcherNode (with tool execution loop)

Generated: ${new Date().toISOString()}
Output requested: ${outputPath}

Note: Install 'mermaid-cli' or 'canvas' npm packages for proper PNG generation.
Command: npm install -g @mermaid-js/mermaid-cli
        `;

        const textPath = outputPath.replace(/\.png$/i, '.txt');
        await fs.writeFile(textPath, textDiagram, 'utf8');

        console.log(`📄 [RouterLangGraphAgent] Text diagram created: ${textPath}`);
        console.log('💡 [RouterLangGraphAgent] Install mermaid-cli for PNG generation: npm install -g @mermaid-js/mermaid-cli');

        return path.resolve(textPath);
    }

    /**
     * Get detailed debug info as JSON
     */
    getDebugInfo(): any {
        const status = this.getStatus();

        return {
            timestamp: new Date().toISOString(),
            architecture: 'Deep Research Enhanced LangGraph Agent',
            provider: status.provider,
            tools: {
                available: status.availableTools,
                count: status.availableTools.length
            },
            deepResearch: {
                enabled: status.deepResearchStatus.enabled,
                fallbackEnabled: status.deepResearchStatus.fallbackEnabled,
                configuration: status.deepResearchStatus.configuration
            },
            graphs: {
                main: 'ClarificationNode → ResearchProcess → SynthesisNode',
                supervisor: 'SupervisorNode ↔ DelegateResearch',
                researcher: 'ResearcherNode (tool execution)'
            },
            langsmith: {
                enabled: !!process.env.LANGCHAIN_TRACING_V2,
                project: process.env.LANGCHAIN_PROJECT || 'not-set',
                apiKeyConfigured: !!process.env.LANGCHAIN_API_KEY
            }
        };
    }
}