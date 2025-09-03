import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { DuckDBVectorStore } from '../../services/DuckDBVectorStore';
import { LLMProvider } from '../../services/LLMProvider';
import { Document } from '@langchain/core/documents';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Enhanced Agent State with Planning and Thought Management
 * This state maintains the agent's reasoning process, plans, and decision history
 */
export interface EnhancedAgentState {
    // Core conversation
    question: string;
    answer: string;
    context: Document[];
    
    // Planning and thoughts
    current_plan: string[];
    completed_steps: string[];
    current_thoughts: string;
    reasoning_chain: string[];
    
    // Decision tracking
    decision_history: AgentDecision[];
    current_decision: string;
    confidence_level: number;
    
    // Research state
    research_queries: string[];
    research_results: Document[];
    research_needed: boolean;
    research_depth: number;
    max_research_depth: number;
    
    // Tool usage state
    tools_needed: string[];
    tool_results: ToolResult[];
    tools_used: string[];
    
    // Meta state
    iteration_count: number;
    max_iterations: number;
    is_complete: boolean;
    error?: string;
    
    // Memory and learning
    learned_facts: string[];
    strategic_notes: string[];
}

export interface AgentDecision {
    decision_type: 'research' | 'tool_use' | 'direct_response' | 'plan_revision';
    reasoning: string;
    confidence: number;
    timestamp: Date;
    inputs_considered: string[];
    expected_outcome: string;
}

export interface ToolResult {
    tool_name: string;
    input: any;
    output: any;
    success: boolean;
    error?: string;
    execution_time: number;
}

// Define the state annotation for LangGraph
const EnhancedAgentStateAnnotation = Annotation.Root({
    question: Annotation<string>,
    answer: Annotation<string>,
    context: Annotation<Document[]>,
    
    current_plan: Annotation<string[]>,
    completed_steps: Annotation<string[]>,
    current_thoughts: Annotation<string>,
    reasoning_chain: Annotation<string[]>,
    
    decision_history: Annotation<AgentDecision[]>,
    current_decision: Annotation<string>,
    confidence_level: Annotation<number>,
    
    research_queries: Annotation<string[]>,
    research_results: Annotation<Document[]>,
    research_needed: Annotation<boolean>,
    research_depth: Annotation<number>,
    max_research_depth: Annotation<number>,
    
    tools_needed: Annotation<string[]>,
    tool_results: Annotation<ToolResult[]>,
    tools_used: Annotation<string[]>,
    
    iteration_count: Annotation<number>,
    max_iterations: Annotation<number>,
    is_complete: Annotation<boolean>,
    error: Annotation<string | undefined>,
    
    learned_facts: Annotation<string[]>,
    strategic_notes: Annotation<string[]>
});

interface AgentConfig {
    llmProvider: LLMProvider;
    vectorStore?: DuckDBVectorStore;
    maxIterations?: number;
    maxResearchDepth?: number;
    confidenceThreshold?: number;
    verbose?: boolean;
}

/**
 * Enhanced Decision-Making Agent with LangGraph Architecture
 * 
 * This agent uses a sophisticated decision-making process to determine
 * whether to conduct research, use tools, or provide direct responses.
 * It maintains a rich internal state with planning capabilities.
 */
export class EnhancedDecisionAgent {
    private config: AgentConfig;
    private graph?: any; // Compiled graph
    private llmProvider: LLMProvider;
    private vectorStore?: DuckDBVectorStore;

    constructor(config: AgentConfig) {
        this.config = {
            maxIterations: 10,
            maxResearchDepth: 3,
            confidenceThreshold: 0.8,
            verbose: false,
            ...config
        };
        this.llmProvider = config.llmProvider;
        this.vectorStore = config.vectorStore;
    }

    async initialize(): Promise<void> {
        this.log('🚀 Initializing Enhanced Decision Agent');
        await this.buildDecisionGraph();
        this.log('✅ Agent initialization complete');
    }

    private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
        if (!this.config.verbose && level === 'info') return;
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        const emoji = level === 'info' ? '🤖' : level === 'warn' ? '⚠️' : '❌';
        console.log(`${emoji} [${timestamp}] ${message}`);
    }

    /**
     * Build the decision-making graph using LangGraph
     * This creates a sophisticated workflow for agent decision-making
     */
    private async buildDecisionGraph(): Promise<void> {
        this.log('🔄 Building enhanced decision graph...');

        const workflow = new StateGraph(EnhancedAgentStateAnnotation)
            .addNode('initialize_planning', this.initializePlanning.bind(this))
            .addNode('analyze_question', this.analyzeQuestion.bind(this))
            .addNode('make_decision', this.makeDecision.bind(this))
            .addNode('conduct_research', this.conductResearch.bind(this))
            .addNode('use_tools', this.useTools.bind(this))
            .addNode('synthesize_response', this.synthesizeResponse.bind(this))
            .addNode('update_plan', this.updatePlan.bind(this))
            .addNode('reflect_and_learn', this.reflectAndLearn.bind(this))
            .addEdge('__start__', 'initialize_planning')
            .addEdge('initialize_planning', 'analyze_question')
            .addEdge('analyze_question', 'make_decision')
            .addConditionalEdges(
                'make_decision',
                this.routeDecision.bind(this),
                {
                    'research': 'conduct_research',
                    'tools': 'use_tools',
                    'respond': 'synthesize_response',
                    'plan': 'update_plan'
                }
            )
            .addEdge('conduct_research', 'make_decision')
            .addEdge('use_tools', 'make_decision')
            .addEdge('update_plan', 'analyze_question')
            .addEdge('synthesize_response', 'reflect_and_learn')
            .addConditionalEdges(
                'reflect_and_learn',
                this.checkCompletion.bind(this),
                {
                    'continue': 'analyze_question',
                    'complete': '__end__'
                }
            );

        this.graph = workflow.compile();
        this.log('✅ Enhanced decision graph compiled successfully');
    }

    /**
     * Node: Initialize Planning
     * Sets up the initial plan and thoughts for the agent
     */
    private async initializePlanning(state: EnhancedAgentState): Promise<Partial<EnhancedAgentState>> {
        this.log('📋 Initializing planning phase...');

        const planningPrompt = ChatPromptTemplate.fromMessages([
            new SystemMessage(`You are an intelligent planning agent. Given a question, create a comprehensive plan for answering it.
            
            Consider:
            1. What information might be needed
            2. What research might be required
            3. What tools might be useful
            4. Potential challenges or complications
            5. Step-by-step approach
            
            Be strategic and thorough in your planning.`),
            new HumanMessage(`Question: ${state.question}
            
            Create an initial plan for answering this question. Return a JSON with:
            - "plan": array of specific steps to take
            - "thoughts": initial analysis and considerations
            - "expected_challenges": potential difficulties
            - "confidence": initial confidence level (0-1)`)
        ]);

        try {
            const response = await this.llmProvider.getChatModel().invoke(await planningPrompt.format({}));
            const planning = this.parseJsonResponse(response.content as string);

            return {
                current_plan: planning.plan || [
                    'Analyze the question thoroughly',
                    'Determine information needs',
                    'Conduct necessary research',
                    'Synthesize findings',
                    'Provide comprehensive answer'
                ],
                current_thoughts: planning.thoughts || 'Beginning analysis of the question...',
                confidence_level: planning.confidence || 0.5,
                iteration_count: 1,
                max_iterations: this.config.maxIterations!,
                max_research_depth: this.config.maxResearchDepth!,
                research_depth: 0,
                is_complete: false,
                decision_history: [],
                research_queries: [],
                research_results: [],
                tools_needed: [],
                tool_results: [],
                tools_used: [],
                completed_steps: [],
                reasoning_chain: ['Planning initialized'],
                learned_facts: [],
                strategic_notes: planning.expected_challenges || []
            };
        } catch (error) {
            this.log(`❌ Planning initialization failed: ${error}`, 'error');
            return {
                error: `Planning failed: ${error instanceof Error ? error.message : String(error)}`,
                is_complete: true
            };
        }
    }

    /**
     * Node: Analyze Question
     * Deep analysis of the question to understand requirements
     */
    private async analyzeQuestion(state: EnhancedAgentState): Promise<Partial<EnhancedAgentState>> {
        this.log(`🔍 Analyzing question (iteration ${state.iteration_count})...`);

        const analysisPrompt = ChatPromptTemplate.fromMessages([
            new SystemMessage(`You are an expert question analyzer. Analyze questions deeply to understand:
            1. What type of question it is
            2. What information is needed
            3. Whether research is required
            4. What tools might be helpful
            5. Complexity level and approach
            
            Current context:
            - Current plan: ${state.current_plan?.join(', ') || 'None'}
            - Completed steps: ${state.completed_steps?.join(', ') || 'None'}
            - Previous research: ${state.research_results?.length || 0} documents
            - Tools used: ${state.tools_used?.join(', ') || 'None'}
            `),
            new HumanMessage(`Question: ${state.question}
            
            Current thoughts: ${state.current_thoughts}
            
            Provide analysis as JSON:
            - "question_type": type classification
            - "complexity": 1-5 scale
            - "information_needs": what info is required
            - "research_recommended": boolean
            - "tools_recommended": array of tool types
            - "approach": recommended strategy
            - "updated_thoughts": refined analysis`)
        ]);

        try {
            const response = await this.llmProvider.getChatModel().invoke(await analysisPrompt.format({}));
            const analysis = this.parseJsonResponse(response.content as string);

            const newReasoning = [
                ...state.reasoning_chain,
                `Analysis complete: ${analysis.question_type || 'unknown'} question, complexity ${analysis.complexity || 'unknown'}`
            ];

            return {
                current_thoughts: analysis.updated_thoughts || state.current_thoughts,
                reasoning_chain: newReasoning,
                research_needed: analysis.research_recommended || false,
                tools_needed: analysis.tools_recommended || [],
                strategic_notes: [
                    ...state.strategic_notes,
                    `Question type: ${analysis.question_type}`,
                    `Approach: ${analysis.approach}`
                ]
            };
        } catch (error) {
            this.log(`❌ Question analysis failed: ${error}`, 'error');
            return {
                error: `Analysis failed: ${error instanceof Error ? error.message : String(error)}`,
                reasoning_chain: [...state.reasoning_chain, 'Question analysis failed']
            };
        }
    }

    /**
     * Node: Make Decision
     * Central decision-making logic for determining next action
     */
    private async makeDecision(state: EnhancedAgentState): Promise<Partial<EnhancedAgentState>> {
        this.log('🤔 Making strategic decision...');

        const decisionPrompt = ChatPromptTemplate.fromMessages([
            new SystemMessage(`You are a strategic decision-making agent. Based on the current state, decide the best next action.

            Available actions:
            1. "research" - Conduct research to gather information
            2. "tools" - Use specific tools to get data or perform actions
            3. "respond" - Synthesize a response from available information
            4. "plan" - Update or revise the current plan

            Current state analysis:
            - Question: ${state.question}
            - Current plan progress: ${state.completed_steps?.length || 0}/${state.current_plan?.length || 0} steps
            - Research conducted: ${state.research_depth}/${state.max_research_depth} depth
            - Tools used: ${state.tools_used?.length || 0}
            - Confidence level: ${state.confidence_level}
            - Information available: ${state.context?.length || 0} documents
            `),
            new HumanMessage(`Current thoughts: ${state.current_thoughts}

            Research needed: ${state.research_needed}
            Tools needed: ${state.tools_needed?.join(', ') || 'none'}
            
            What should be the next action? Respond with JSON:
            - "decision": one of [research, tools, respond, plan]
            - "reasoning": detailed explanation
            - "confidence": 0-1 confidence in this decision
            - "expected_outcome": what you expect to achieve
            - "next_thoughts": updated strategic thinking`)
        ]);

        try {
            const response = await this.llmProvider.getChatModel().invoke(await decisionPrompt.format({}));
            const decision = this.parseJsonResponse(response.content as string);

            const agentDecision: AgentDecision = {
                decision_type: decision.decision as any,
                reasoning: decision.reasoning || 'No reasoning provided',
                confidence: decision.confidence || 0.5,
                timestamp: new Date(),
                inputs_considered: [
                    `Confidence: ${state.confidence_level}`,
                    `Research depth: ${state.research_depth}/${state.max_research_depth}`,
                    `Tools used: ${state.tools_used?.length || 0}`,
                    `Context available: ${state.context?.length || 0}`
                ],
                expected_outcome: decision.expected_outcome || 'Advance toward goal'
            };

            return {
                current_decision: decision.decision || 'respond',
                current_thoughts: decision.next_thoughts || state.current_thoughts,
                confidence_level: Math.max(decision.confidence || state.confidence_level, state.confidence_level),
                decision_history: [...state.decision_history, agentDecision],
                reasoning_chain: [
                    ...state.reasoning_chain,
                    `Decision: ${decision.decision} (confidence: ${decision.confidence})`
                ]
            };
        } catch (error) {
            this.log(`❌ Decision making failed: ${error}`, 'error');
            return {
                current_decision: 'respond',
                reasoning_chain: [...state.reasoning_chain, 'Decision making failed, defaulting to response']
            };
        }
    }

    /**
     * Node: Conduct Research
     * Performs research using vector database or other sources
     */
    private async conductResearch(state: EnhancedAgentState): Promise<Partial<EnhancedAgentState>> {
        this.log(`🔬 Conducting research (depth ${state.research_depth + 1})...`);

        if (!this.vectorStore) {
            return {
                reasoning_chain: [...state.reasoning_chain, 'No vector store available for research'],
                research_needed: false
            };
        }

        try {
            // Generate research query
            const queryPrompt = ChatPromptTemplate.fromMessages([
                new SystemMessage(`Generate an effective search query for research based on the question and current context.`),
                new HumanMessage(`Question: ${state.question}
                
                Current thoughts: ${state.current_thoughts}
                Previous queries: ${state.research_queries?.join(', ') || 'none'}
                
                Generate a specific, targeted search query for research.`)
            ]);

            const queryResponse = await this.llmProvider.getChatModel().invoke(await queryPrompt.format({}));
            const researchQuery = (queryResponse.content as string).trim();

            this.log(`🔍 Research query: "${researchQuery}"`);

            // Perform similarity search
            const searchResults = await this.vectorStore.similaritySearch(researchQuery, 5);

            const newContext = [...(state.context || []), ...searchResults];
            const uniqueContext = this.deduplicateDocuments(newContext);

            return {
                research_queries: [...state.research_queries, researchQuery],
                research_results: [...state.research_results, ...searchResults],
                context: uniqueContext,
                research_depth: state.research_depth + 1,
                research_needed: state.research_depth + 1 < state.max_research_depth,
                reasoning_chain: [
                    ...state.reasoning_chain,
                    `Research completed: found ${searchResults.length} relevant documents`
                ],
                learned_facts: [
                    ...state.learned_facts,
                    ...searchResults.slice(0, 2).map(doc => `Research fact: ${doc.pageContent.substring(0, 100)}...`)
                ]
            };
        } catch (error) {
            this.log(`❌ Research failed: ${error}`, 'error');
            return {
                reasoning_chain: [...state.reasoning_chain, `Research failed: ${error}`],
                research_needed: false
            };
        }
    }

    /**
     * Node: Use Tools
     * Executes tools based on the current needs
     */
    private async useTools(state: EnhancedAgentState): Promise<Partial<EnhancedAgentState>> {
        this.log('🔧 Using tools...');

        // Simulate tool usage - in a real implementation, you would call actual tools
        const toolResults: ToolResult[] = [];
        const usedTools: string[] = [];

        for (const toolNeeded of state.tools_needed) {
            const startTime = Date.now();
            
            try {
                // Simulate tool execution
                this.log(`🛠️ Executing tool: ${toolNeeded}`);
                
                // Mock tool result
                const mockResult: ToolResult = {
                    tool_name: toolNeeded,
                    input: { query: state.question },
                    output: { result: `Mock result from ${toolNeeded}` },
                    success: true,
                    execution_time: Date.now() - startTime
                };

                toolResults.push(mockResult);
                usedTools.push(toolNeeded);

            } catch (error) {
                toolResults.push({
                    tool_name: toolNeeded,
                    input: { query: state.question },
                    output: null,
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    execution_time: Date.now() - startTime
                });
            }
        }

        return {
            tool_results: [...state.tool_results, ...toolResults],
            tools_used: [...state.tools_used, ...usedTools],
            tools_needed: [], // Clear tools needed
            reasoning_chain: [
                ...state.reasoning_chain,
                `Tools executed: ${usedTools.join(', ')} (${toolResults.filter(r => r.success).length}/${toolResults.length} successful)`
            ]
        };
    }

    /**
     * Node: Synthesize Response
     * Creates the final response based on all gathered information
     */
    private async synthesizeResponse(state: EnhancedAgentState): Promise<Partial<EnhancedAgentState>> {
        this.log('🧠 Synthesizing response...');

        const contextText = state.context?.map(doc => doc.pageContent).join('\n\n') || '';
        const toolResultsText = state.tool_results?.map(tr => 
            `Tool ${tr.tool_name}: ${tr.success ? tr.output : tr.error}`
        ).join('\n') || '';

        const synthesisPrompt = ChatPromptTemplate.fromMessages([
            new SystemMessage(`You are tasked with synthesizing a comprehensive answer based on all available information.
            
            Planning context:
            - Original plan: ${state.current_plan?.join(', ')}
            - Completed steps: ${state.completed_steps?.join(', ')}
            - Strategic notes: ${state.strategic_notes?.join('; ')}
            
            Research and tools:
            - Research queries: ${state.research_queries?.join(', ')}
            - Tools used: ${state.tools_used?.join(', ')}
            - Decision confidence: ${state.confidence_level}
            `),
            new HumanMessage(`Question: ${state.question}

            Available context:
            ${contextText}

            Tool results:
            ${toolResultsText}

            Current thoughts: ${state.current_thoughts}
            
            Synthesize a comprehensive, well-reasoned answer. Be thorough and cite your sources when possible.`)
        ]);

        try {
            const response = await this.llmProvider.getChatModel().invoke(await synthesisPrompt.format({}));
            const answer = response.content as string;

            return {
                answer,
                is_complete: true,
                completed_steps: [...state.completed_steps, 'Response synthesized'],
                reasoning_chain: [
                    ...state.reasoning_chain,
                    'Final response synthesized from all available information'
                ],
                confidence_level: Math.min(state.confidence_level + 0.1, 1.0) // Slight confidence boost for completion
            };
        } catch (error) {
            this.log(`❌ Response synthesis failed: ${error}`, 'error');
            return {
                answer: 'I apologize, but I encountered an error while synthesizing the response.',
                error: error instanceof Error ? error.message : String(error),
                is_complete: true,
                reasoning_chain: [...state.reasoning_chain, 'Response synthesis failed']
            };
        }
    }

    /**
     * Node: Update Plan
     * Revises the plan based on new information or changing circumstances
     */
    private async updatePlan(state: EnhancedAgentState): Promise<Partial<EnhancedAgentState>> {
        this.log('📝 Updating plan...');

        const planUpdatePrompt = ChatPromptTemplate.fromMessages([
            new SystemMessage(`You are a strategic planner. Based on new information and progress, update the plan.`),
            new HumanMessage(`Question: ${state.question}
            
            Current plan: ${state.current_plan?.join(', ')}
            Completed steps: ${state.completed_steps?.join(', ')}
            New information: ${state.learned_facts?.slice(-3).join('; ')}
            Current thoughts: ${state.current_thoughts}
            
            Update the plan as JSON:
            - "updated_plan": revised array of steps
            - "reasoning": why the plan was changed
            - "next_focus": immediate next priority`)
        ]);

        try {
            const response = await this.llmProvider.getChatModel().invoke(await planUpdatePrompt.format({}));
            const planUpdate = this.parseJsonResponse(response.content as string);

            return {
                current_plan: planUpdate.updated_plan || state.current_plan,
                current_thoughts: planUpdate.next_focus || state.current_thoughts,
                reasoning_chain: [
                    ...state.reasoning_chain,
                    `Plan updated: ${planUpdate.reasoning || 'Plan revised based on new information'}`
                ]
            };
        } catch (error) {
            this.log(`❌ Plan update failed: ${error}`, 'error');
            return {
                reasoning_chain: [...state.reasoning_chain, 'Plan update failed, continuing with current plan']
            };
        }
    }

    /**
     * Node: Reflect and Learn
     * Final reflection and learning from the process
     */
    private async reflectAndLearn(state: EnhancedAgentState): Promise<Partial<EnhancedAgentState>> {
        this.log('🤔 Reflecting and learning...');

        const reflectionPrompt = ChatPromptTemplate.fromMessages([
            new SystemMessage(`Reflect on the problem-solving process and extract learnings.`),
            new HumanMessage(`Question: ${state.question}
            Answer: ${state.answer}
            
            Process summary:
            - Total iterations: ${state.iteration_count}
            - Research depth: ${state.research_depth}
            - Tools used: ${state.tools_used?.join(', ')}
            - Final confidence: ${state.confidence_level}
            
            Provide reflection as JSON:
            - "process_quality": 1-5 rating
            - "key_learnings": array of insights
            - "improvement_suggestions": what could be better
            - "confidence_assessment": final confidence evaluation`)
        ]);

        try {
            const response = await this.llmProvider.getChatModel().invoke(await reflectionPrompt.format({}));
            const reflection = this.parseJsonResponse(response.content as string);

            return {
                learned_facts: [
                    ...state.learned_facts,
                    ...(reflection.key_learnings || [])
                ],
                strategic_notes: [
                    ...state.strategic_notes,
                    ...(reflection.improvement_suggestions || [])
                ],
                confidence_level: reflection.confidence_assessment || state.confidence_level,
                reasoning_chain: [
                    ...state.reasoning_chain,
                    `Reflection complete: process quality ${reflection.process_quality || 'unknown'}/5`
                ]
            };
        } catch (error) {
            this.log(`❌ Reflection failed: ${error}`, 'error');
            return {
                reasoning_chain: [...state.reasoning_chain, 'Reflection completed with errors']
            };
        }
    }

    /**
     * Decision Router - determines next node based on current decision
     */
    private routeDecision(state: EnhancedAgentState): string {
        const decision = state.current_decision;
        
        // Check for completion conditions first
        if (state.iteration_count >= state.max_iterations) {
            return 'respond';
        }

        if (state.confidence_level >= this.config.confidenceThreshold! && 
            state.context && state.context.length > 0) {
            return 'respond';
        }

        // Route based on decision
        switch (decision) {
            case 'research':
                return state.research_depth < state.max_research_depth ? 'research' : 'respond';
            case 'tools':
                return state.tools_needed.length > 0 ? 'tools' : 'respond';
            case 'plan':
                return 'plan';
            default:
                return 'respond';
        }
    }

    /**
     * Completion Checker - determines if agent should continue or complete
     */
    private checkCompletion(state: EnhancedAgentState): string {
        if (state.is_complete || state.error) {
            return 'complete';
        }

        if (state.iteration_count >= state.max_iterations) {
            return 'complete';
        }

        return 'continue';
    }

    /**
     * Main entry point for processing questions
     */
    async processQuestion(question: string): Promise<EnhancedAgentState> {
        if (!this.graph) {
            throw new Error('Agent not initialized. Call initialize() first.');
        }

        this.log(`📝 Processing question: "${question}"`);

        const initialState: EnhancedAgentState = {
            question,
            answer: '',
            context: [],
            current_plan: [],
            completed_steps: [],
            current_thoughts: '',
            reasoning_chain: [],
            decision_history: [],
            current_decision: '',
            confidence_level: 0,
            research_queries: [],
            research_results: [],
            research_needed: false,
            research_depth: 0,
            max_research_depth: this.config.maxResearchDepth!,
            tools_needed: [],
            tool_results: [],
            tools_used: [],
            iteration_count: 0,
            max_iterations: this.config.maxIterations!,
            is_complete: false,
            learned_facts: [],
            strategic_notes: []
        };

        try {
            const result = await this.graph.invoke(initialState);
            this.log(`✅ Question processed successfully`);
            this.log(`🎯 Final confidence: ${result.confidence_level}`);
            this.log(`🔄 Total iterations: ${result.iteration_count}`);
            this.log(`📚 Research depth: ${result.research_depth}`);
            return result;
        } catch (error) {
            this.log(`❌ Question processing failed: ${error}`, 'error');
            return {
                ...initialState,
                error: error instanceof Error ? error.message : String(error),
                is_complete: true
            };
        }
    }

    /**
     * Utility Methods
     */
    private parseJsonResponse(response: string): any {
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return {};
        } catch (error) {
            this.log(`⚠️ Failed to parse JSON response: ${error}`, 'warn');
            return {};
        }
    }

    private deduplicateDocuments(documents: Document[]): Document[] {
        const seen = new Set<string>();
        return documents.filter(doc => {
            const key = doc.pageContent.substring(0, 100);
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    /**
     * Get agent state summary for debugging
     */
    getAgentStateSummary(state: EnhancedAgentState): object {
        return {
            question: state.question,
            answer: state.answer ? `${state.answer.substring(0, 100)}...` : 'No answer yet',
            planProgress: `${state.completed_steps?.length || 0}/${state.current_plan?.length || 0} steps`,
            researchDepth: `${state.research_depth}/${state.max_research_depth}`,
            toolsUsed: state.tools_used?.length || 0,
            confidence: state.confidence_level,
            iterations: state.iteration_count,
            isComplete: state.is_complete,
            decisions: state.decision_history?.length || 0,
            learnings: state.learned_facts?.length || 0
        };
    }
}

// Example usage and testing
export async function createExampleAgent(): Promise<EnhancedDecisionAgent> {
    // This would be replaced with your actual LLMProvider initialization
    const mockLLMProvider = {} as LLMProvider;
    
    const agent = new EnhancedDecisionAgent({
        llmProvider: mockLLMProvider,
        maxIterations: 8,
        maxResearchDepth: 3,
        confidenceThreshold: 0.8,
        verbose: true
    });
    
    await agent.initialize();
    return agent;
}

// Export for use in other parts of the application
export default EnhancedDecisionAgent;