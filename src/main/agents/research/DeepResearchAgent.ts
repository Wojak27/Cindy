/**
 * Deep Research Agent - LangGraph implementation
 * A sophisticated research agent that conducts comprehensive research using multiple nodes
 */

import { StateGraph } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { LLMProvider } from '../../services/LLMProvider';
import {
    AgentState,
    AgentStateAnnotation,
    SupervisorState,
    SupervisorStateAnnotation,
    ResearcherState,
    ResearcherStateAnnotation,
    ResearchStatus,
} from './DeepResearchState';
import {
    DeepResearchConfiguration,
    DeepResearchConfigManager,
} from './DeepResearchConfig';

// Import node creators
import { createClarificationNode } from './nodes/ClarificationNode';
import { createSupervisorNode } from './nodes/SupervisorNode';
import { createResearcherNode } from './nodes/ResearcherNode';
import { createSynthesisNode } from './nodes/SynthesisNode';

/**
 * Configuration options for the Deep Research Agent
 */
export interface DeepResearchAgentOptions {
    llmProvider: LLMProvider;
    config?: Partial<DeepResearchConfiguration>;
}

/**
 * Deep Research Agent using LangGraph for sophisticated research workflows
 */
export class DeepResearchAgent {
    private graph: any;
    private supervisorGraph: any;
    private researcherGraph: any;
    private llmProvider: LLMProvider;
    private config: DeepResearchConfiguration;
    private configManager: DeepResearchConfigManager;

    constructor(options: DeepResearchAgentOptions) {
        this.llmProvider = options.llmProvider;

        // Initialize configuration
        this.configManager = new DeepResearchConfigManager(options.config);
        this.config = this.configManager.getConfig();

        // Build the graphs
        this.buildGraphs();

        console.log('[DeepResearchAgent] Initialized with Deep Research architecture');
        console.log('[DeepResearchAgent] Configuration:', {
            searchAPI: this.config.search_api,
            maxIterations: this.config.max_researcher_iterations,
            allowClarification: this.config.allow_clarification
        });
    }

    /**
     * Build all the graphs (main, supervisor, researcher)
     */
    private buildGraphs(): void {
        this.graph = this.buildMainGraph();
        this.supervisorGraph = this.buildSupervisorGraph();
        this.researcherGraph = this.buildResearcherGraph();
    }

    /**
     * Build the main research workflow graph
     */
    private buildMainGraph() {
        const workflow = new StateGraph(AgentStateAnnotation);

        // Add nodes
        workflow.addNode('clarification', createClarificationNode(this.llmProvider, this.config));
        workflow.addNode('research_process', this.createResearchProcessNode());
        workflow.addNode('synthesis', createSynthesisNode(this.llmProvider, this.config));

        // Add edges
        workflow.addEdge('__start__' as any, 'clarification' as any);

        // Conditional routing after clarification
        workflow.addConditionalEdges(
            'clarification' as any,
            (state: AgentState) => {
                // If we have a research brief, proceed to research
                if (state.research_brief && state.research_brief.length > 10) {
                    return 'research_process';
                }
                // If clarification is needed (no research brief), stay in clarification
                return '__end__';
            }
        );

        // Research process to synthesis
        workflow.addEdge('research_process' as any, 'synthesis' as any);

        // Synthesis to end
        workflow.addEdge('synthesis' as any, '__end__' as any);

        return workflow.compile();
    }

    /**
     * Build the supervisor graph for research management
     */
    private buildSupervisorGraph() {
        const workflow = new StateGraph(SupervisorStateAnnotation);

        // Add supervisor node
        workflow.addNode('supervisor', createSupervisorNode(this.llmProvider, this.config));
        workflow.addNode('delegate_research', this.createResearchDelegationNode());

        // Add edges
        workflow.addEdge('__start__' as any, 'supervisor' as any);

        // Conditional routing from supervisor
        workflow.addConditionalEdges(
            'supervisor' as any,
            (state: SupervisorState) => {
                // Check if we've reached max iterations or research is complete
                if (state.research_iterations >= this.config.max_researcher_iterations) {
                    return '__end__';
                }

                // Continue research
                return 'delegate_research';
            }
        );

        // Research delegation back to supervisor or end
        workflow.addConditionalEdges(
            'delegate_research' as any,
            (state: SupervisorState) => {
                if (state.research_iterations < this.config.max_researcher_iterations &&
                    state.notes.length < 10) { // Continue if not enough research
                    return 'supervisor';
                }
                return '__end__';
            }
        );

        return workflow.compile();
    }

    /**
     * Build the researcher graph for conducting research
     */
    private buildResearcherGraph() {
        const workflow = new StateGraph(ResearcherStateAnnotation);

        // Add researcher node
        workflow.addNode('researcher', createResearcherNode(
            this.llmProvider,
            this.config
        ));

        // Simple linear flow for researcher
        workflow.addEdge('__start__' as any, 'researcher' as any);
        workflow.addEdge('researcher' as any, '__end__' as any);

        return workflow.compile();
    }

    /**
     * Create the research process node that orchestrates supervisor and researchers
     */
    private createResearchProcessNode() {
        return async (state: AgentState): Promise<Partial<AgentState>> => {
            console.log('[ResearchProcessNode] ===== RESEARCH PROCESS STARTING =====');
            console.log(`[ResearchProcessNode] Input state:`);
            console.log(`[ResearchProcessNode] - research_brief: ${state.research_brief ? 'EXISTS' : 'NULL'} (${state.research_brief?.length || 0} chars)`);

            try {
                // Initialize supervisor state
                const supervisorState: SupervisorState = {
                    supervisor_messages: state.supervisor_messages || [],
                    research_brief: state.research_brief || '',
                    notes: [],
                    research_iterations: 0,
                    raw_notes: []
                };

                console.log('[ResearchProcessNode] Supervisor state initialized:');
                console.log(`[ResearchProcessNode] - research_brief: "${supervisorState.research_brief}"`);
                console.log(`[ResearchProcessNode] - notes: ${supervisorState.notes.length} items`);
                console.log(`[ResearchProcessNode] - raw_notes: ${supervisorState.raw_notes.length} items`);
                console.log(`[ResearchProcessNode] - research_iterations: ${supervisorState.research_iterations}`);

                // Run the supervisor workflow
                console.log('[ResearchProcessNode] Invoking supervisor graph...');
                const supervisorResult = await this.supervisorGraph.invoke(supervisorState);

                console.log('[ResearchProcessNode] ===== SUPERVISOR WORKFLOW COMPLETE =====');
                console.log(`[ResearchProcessNode] Supervisor results:`);
                console.log(`[ResearchProcessNode] - notes: ${supervisorResult.notes?.length || 0} items`);
                console.log(`[ResearchProcessNode] - raw_notes: ${supervisorResult.raw_notes?.length || 0} items`);
                console.log(`[ResearchProcessNode] - supervisor_messages: ${supervisorResult.supervisor_messages?.length || 0} items`);

                // Debug: Show sample content
                if (supervisorResult.notes && supervisorResult.notes.length > 0) {
                    console.log(`[ResearchProcessNode] First note preview: ${supervisorResult.notes[0].substring(0, 100)}...`);
                }

                // Update main state with supervisor results
                const stateUpdate = {
                    notes: supervisorResult.notes || [],
                    raw_notes: supervisorResult.raw_notes || [],
                    supervisor_messages: supervisorResult.supervisor_messages || []
                };

                console.log('[ResearchProcessNode] ===== RESEARCH PROCESS COMPLETE =====');
                console.log(`[ResearchProcessNode] Returning state update with ${stateUpdate.notes.length} notes`);

                return stateUpdate;

            } catch (error: any) {
                console.error('[ResearchProcessNode] ===== RESEARCH PROCESS ERROR =====');
                console.error('[ResearchProcessNode] Research process error:', error);
                console.error('[ResearchProcessNode] Error stack:', error.stack);

                return {
                    notes: [`Research process failed: ${error.message}`],
                    raw_notes: [`Error: ${error.message}`]
                };
            }
        };
    }

    /**
     * Create the research delegation node for supervisor
     */
    private createResearchDelegationNode() {
        return async (state: SupervisorState): Promise<Partial<SupervisorState>> => {
            console.log('[DeepResearchAgent] Delegating research tasks...');

            try {
                // Generate research topics based on current state
                const researchTopics = await this.generateResearchTopics(state);

                // Execute research for each topic (in parallel for efficiency)
                const researchPromises = researchTopics.slice(0, this.config.max_concurrent_research_units)
                    .map(topic => this.executeResearchTask(topic));

                const researchResults = await Promise.allSettled(researchPromises);

                // Collect successful results
                const newNotes: string[] = [];
                const newRawNotes: string[] = [];

                researchResults.forEach((result, index) => {
                    if (result.status === 'fulfilled') {
                        newNotes.push(result.value.compressed_research);
                        newRawNotes.push(...result.value.raw_notes);
                        console.log(`[DeepResearchAgent] Research task ${index + 1} completed successfully`);
                    } else {
                        console.error(`[DeepResearchAgent] Research task ${index + 1} failed:`, result.reason);
                        newRawNotes.push(`Research task failed: ${result.reason.message}`);
                    }
                });

                return {
                    notes: [...state.notes, ...newNotes],
                    raw_notes: [...state.raw_notes, ...newRawNotes]
                };

            } catch (error: any) {
                console.error('[DeepResearchAgent] Research delegation error:', error);

                return {
                    raw_notes: [...state.raw_notes, `Delegation error: ${error.message}`]
                };
            }
        };
    }

    /**
     * Generate research topics based on current supervisor state
     */
    private async generateResearchTopics(state: SupervisorState): Promise<string[]> {
        try {
            const topicPrompt = `Based on the research brief and current findings, generate 2-3 specific research topics that need investigation.

Research Brief: ${state.research_brief}

Current Research Status:
- Iteration: ${state.research_iterations}
- Findings collected: ${state.notes.length}

${state.notes.length > 0 ? `Recent findings:\n${state.notes.slice(-2).join('\n\n')}` : ''}

Generate specific, actionable research topics (one per line) that will help complete this research comprehensively:`;

            const result = await this.llmProvider.invoke([
                new HumanMessage({ content: topicPrompt })
            ]);

            const response = result.content as string;

            const topics = response.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 10)
                .slice(0, 3);

            return topics.length > 0 ? topics : [state.research_brief];

        } catch (error) {
            console.error('[DeepResearchAgent] Error generating research topics:', error);
            return [state.research_brief];
        }
    }

    /**
     * Execute a single research task using the researcher graph
     */
    private async executeResearchTask(researchTopic: string): Promise<{
        compressed_research: string;
        raw_notes: string[];
    }> {
        const researcherState: ResearcherState = {
            researcher_messages: [],
            tool_call_iterations: 0,
            research_topic: researchTopic,
            compressed_research: '',
            raw_notes: []
        };

        const result = await this.researcherGraph.invoke(researcherState);
        return result;
    }

    /**
     * Process a research request (main entry point)
     */
    async processResearch(message: string): Promise<string> {
        console.log('[DeepResearchAgent] ===== PROCESSING RESEARCH REQUEST =====');
        console.log(`[DeepResearchAgent] Input message: ${message}`);

        try {
            // Create initial state
            const initialState: AgentState = {
                messages: [new HumanMessage({ content: message })],
                supervisor_messages: [],
                research_brief: null,
                raw_notes: [],
                notes: [],
                final_report: ''
            };

            console.log('[DeepResearchAgent] Initial state created:');
            console.log(`[DeepResearchAgent] - messages: ${initialState.messages.length} items`);
            console.log(`[DeepResearchAgent] - supervisor_messages: ${initialState.supervisor_messages.length} items`);
            console.log(`[DeepResearchAgent] - research_brief: ${initialState.research_brief}`);
            console.log(`[DeepResearchAgent] - raw_notes: ${initialState.raw_notes.length} items`);
            console.log(`[DeepResearchAgent] - notes: ${initialState.notes.length} items`);
            console.log(`[DeepResearchAgent] - final_report: "${initialState.final_report}"`);

            // Run the main graph
            console.log('[DeepResearchAgent] Invoking main graph...');
            const result = await this.graph.invoke(initialState);

            console.log('[DeepResearchAgent] ===== MAIN GRAPH EXECUTION COMPLETE =====');
            console.log('[DeepResearchAgent] Final result state:');
            console.log(`[DeepResearchAgent] - messages: ${result.messages?.length || 0} items`);
            console.log(`[DeepResearchAgent] - supervisor_messages: ${result.supervisor_messages?.length || 0} items`);
            console.log(`[DeepResearchAgent] - research_brief: ${result.research_brief ? 'EXISTS' : 'NULL'} (${result.research_brief?.length || 0} chars)`);
            console.log(`[DeepResearchAgent] - raw_notes: ${result.raw_notes?.length || 0} items`);
            console.log(`[DeepResearchAgent] - notes: ${result.notes?.length || 0} items`);
            console.log(`[DeepResearchAgent] - final_report: ${result.final_report ? 'EXISTS' : 'NULL'} (${result.final_report?.length || 0} chars)`);

            // Check if clarification is needed
            if (result.supervisor_messages && result.supervisor_messages.length > 0) {
                const lastMessage = result.supervisor_messages[result.supervisor_messages.length - 1];
                if (lastMessage._getType() === 'ai' && lastMessage.content) {
                    // If there's no research brief but there are supervisor messages, this is likely a clarification request
                    if (!result.research_brief) {
                        console.log('[DeepResearchAgent] Returning clarification question');
                        return lastMessage.content as string;
                    }
                }
            }

            // Validate final report
            if (result.final_report && result.final_report.trim()) {
                console.log('[DeepResearchAgent] ✅ Final report exists and is not empty');
                console.log(`[DeepResearchAgent] Final report preview: ${result.final_report.substring(0, 200)}...`);
                return result.final_report;
            } else {
                console.warn('[DeepResearchAgent] ⚠️ No final report generated or report is empty');
                console.log('[DeepResearchAgent] Debugging available data:');
                
                if (result.notes && result.notes.length > 0) {
                    console.log(`[DeepResearchAgent] - Found ${result.notes.length} processed notes`);
                    result.notes.forEach((note, index) => {
                        console.log(`[DeepResearchAgent] Note ${index + 1}: ${note.substring(0, 100)}...`);
                    });
                }
                
                if (result.raw_notes && result.raw_notes.length > 0) {
                    console.log(`[DeepResearchAgent] - Found ${result.raw_notes.length} raw notes`);
                }

                return 'Research completed but no final report generated. Check the logs for debugging information.';
            }

        } catch (error: any) {
            console.error('[DeepResearchAgent] ===== RESEARCH ERROR =====');
            console.error('[DeepResearchAgent] Research processing error:', error);
            console.error('[DeepResearchAgent] Error stack:', error.stack);
            return `Research failed: ${error.message}`;
        }
    }

    /**
     * Stream research process with progress updates
     */
    async *streamResearch(message: string): AsyncGenerator<{
        type: 'progress' | 'result';
        content: string;
        status?: ResearchStatus;
    }> {
        console.log('[DeepResearchAgent] Starting streaming research...');

        try {
            yield { type: 'progress', content: 'Starting research process...', status: ResearchStatus.CLARIFYING };

            // Create initial state
            const initialState: AgentState = {
                messages: [new HumanMessage({ content: message })],
                supervisor_messages: [],
                research_brief: null,
                raw_notes: [],
                notes: [],
                final_report: ''
            };

            // Stream through the graph (if supported)
            // For now, we'll simulate streaming with progress updates

            yield { type: 'progress', content: 'Analyzing research requirements...', status: ResearchStatus.PLANNING };

            const result = await this.graph.invoke(initialState);

            // Check if clarification is needed
            if (result.supervisor_messages && result.supervisor_messages.length > 0) {
                const lastMessage = result.supervisor_messages[result.supervisor_messages.length - 1];
                if (lastMessage._getType() === 'ai' && lastMessage.content && !result.research_brief) {
                    yield {
                        type: 'result',
                        content: lastMessage.content as string,
                        status: ResearchStatus.CLARIFYING
                    };
                    return;
                }
            }

            yield { type: 'progress', content: 'Research completed, generating final report...', status: ResearchStatus.COMPLETE };

            yield {
                type: 'result',
                content: result.final_report || 'Research completed but no final report generated.',
                status: ResearchStatus.COMPLETE
            };

        } catch (error: any) {
            console.error('[DeepResearchAgent] Streaming research error:', error);
            yield {
                type: 'result',
                content: `Research failed: ${error.message}`,
                status: ResearchStatus.ERROR
            };
        }
    }

    /**
     * Update configuration
     */
    updateConfig(updates: Partial<DeepResearchConfiguration>): void {
        this.configManager.updateConfig(updates);
        this.config = this.configManager.getConfig();

        // Rebuild graphs with new configuration
        this.buildGraphs();

        console.log('[DeepResearchAgent] Configuration updated and graphs rebuilt');
    }

    /**
     * Get current configuration
     */
    getConfig(): DeepResearchConfiguration {
        return this.config;
    }

    /**
     * Get configuration manager
     */
    getConfigManager(): DeepResearchConfigManager {
        return this.configManager;
    }

    /**
     * Get the main graph for visualization
     */
    getMainGraph(): any {
        return this.graph;
    }

    /**
     * Get the supervisor graph for visualization
     */
    getSupervisorGraph(): any {
        return this.supervisorGraph;
    }

    /**
     * Get the researcher graph for visualization
     */
    getResearcherGraph(): any {
        return this.researcherGraph;
    }

    /**
     * Get all graphs for visualization
     */
    getAllGraphs(): {
        main: any;
        supervisor: any;
        researcher: any;
    } {
        return {
            main: this.graph,
            supervisor: this.supervisorGraph,
            researcher: this.researcherGraph
        };
    }
}