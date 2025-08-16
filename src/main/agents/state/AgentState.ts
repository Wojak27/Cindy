import { BaseMessage } from '@langchain/core/messages';
import { Annotation } from '@langchain/langgraph';

/**
 * Tool execution intent
 */
export interface ToolIntent {
    tool: string;
    forced: boolean; // true if forced by hashtag
    parameters: any;
    reasoning: string;
}

/**
 * Execution plan for the agent
 */
export interface ThinkingPlan {
    intent: string;
    forcedTools: string[];
    suggestedTools: string[];
    reasoning: string;
    steps: ToolIntent[];
}

/**
 * Result from tool execution
 */
export interface ToolResult {
    success: boolean;
    result?: any;
    error?: string;
    duration?: number;
}

/**
 * Citation extracted from tool results
 */
export interface Citation {
    title: string;
    url: string;
    source?: string;
}

/**
 * Thinking step in the agent's reasoning process
 */
export interface ThinkingStep {
    step: 'analyze' | 'think' | 'tool' | 'synthesize';
    content: string;
    timestamp: Date;
}

/**
 * Context information for the agent
 */
export interface AgentContext {
    conversationId: string;
    userId?: string;
    sessionId: string;
    timestamp: Date;
    preferences: any;
}

/**
 * The main state definition for the LangGraph agent.
 * Uses LangGraph's Annotation system for state management.
 */
export const AgentStateAnnotation = Annotation.Root({
    // Input from user
    input: Annotation<string>({
        reducer: (_, b) => b, // Always use the latest value
    }),
    
    // Processed input without hashtags
    cleanInput: Annotation<string>({
        reducer: (_, b) => b,
    }),
    
    // Hashtags extracted from input
    hashtags: Annotation<string[]>({
        reducer: (_, b) => b,
        default: () => [],
    }),
    
    // Tools forced by hashtags
    forcedTools: Annotation<string[]>({
        reducer: (_, b) => b,
        default: () => [],
    }),
    
    // Whether this is a simple direct response
    directResponse: Annotation<boolean>({
        reducer: (_, b) => b,
        default: () => false,
    }),
    
    // Execution plan
    plan: Annotation<ThinkingPlan | null>({
        reducer: (_, b) => b,
        default: () => null,
    }),
    
    // Results from tool executions
    toolResults: Annotation<Record<string, ToolResult>>({
        reducer: (a, b) => ({ ...a, ...b }), // Merge tool results
        default: () => ({}),
    }),
    
    // Thinking steps for transparency
    thinkingSteps: Annotation<ThinkingStep[]>({
        reducer: (a, b) => [...a, ...b], // Append new steps
        default: () => [],
    }),
    
    // Final synthesized response
    finalResponse: Annotation<string>({
        reducer: (_, b) => b,
        default: () => '',
    }),
    
    // Citations extracted from tool results
    citations: Annotation<Citation[]>({
        reducer: (_, b) => b,
        default: () => [],
    }),
    
    // Agent context (conversation ID, etc.)
    context: Annotation<AgentContext | null>({
        reducer: (_, b) => b,
        default: () => null,
    }),
    
    // Messages for LLM interactions
    messages: Annotation<BaseMessage[]>({
        reducer: (a, b) => [...a, ...b],
        default: () => [],
    }),
    
    // Current phase of processing
    phase: Annotation<'input' | 'planning' | 'tools' | 'synthesis' | 'complete'>({
        reducer: (_, b) => b,
        default: () => 'input',
    }),
    
    // Error tracking
    error: Annotation<string | null>({
        reducer: (_, b) => b,
        default: () => null,
    }),
    
    // Streaming output buffer
    streamBuffer: Annotation<string[]>({
        reducer: (a, b) => [...a, ...b],
        default: () => [],
    }),
});

// Type for the state object
export type AgentState = typeof AgentStateAnnotation.State;

// Type for state updates
export type AgentStateUpdate = Partial<AgentState>;

/**
 * Helper function to create initial state
 */
export function createInitialState(input: string, context?: AgentContext): AgentState {
    return {
        input,
        cleanInput: '',
        hashtags: [],
        forcedTools: [],
        directResponse: false,
        plan: null,
        toolResults: {},
        thinkingSteps: [],
        finalResponse: '',
        citations: [],
        context: context || null,
        messages: [],
        phase: 'input',
        error: null,
        streamBuffer: [],
    };
}