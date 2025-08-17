/**
 * Graph state definitions and data structures for the Deep Research agent.
 * Converted from Python to TypeScript with LangGraph compatibility.
 */

import { BaseMessage } from '@langchain/core/messages';
import { Annotation, MessagesAnnotation } from '@langchain/langgraph';

//##################
// Structured Outputs
//##################

/**
 * Call this tool to conduct research on a specific topic.
 */
export interface ConductResearch {
    /**
     * The topic to research. Should be a single topic, and should be described 
     * in high detail (at least a paragraph).
     */
    research_topic: string;
}

/**
 * Call this tool to indicate that the research is complete.
 */
export interface ResearchComplete {
    // Marker interface - no additional fields needed
}

/**
 * Research summary with key findings.
 */
export interface Summary {
    summary: string;
    key_excerpts: string;
}

/**
 * Model for user clarification requests.
 */
export interface ClarifyWithUser {
    /**
     * Whether the user needs to be asked a clarifying question.
     */
    need_clarification: boolean;
    
    /**
     * A question to ask the user to clarify the report scope.
     */
    question: string;
    
    /**
     * Verify message that we will start research after the user has 
     * provided the necessary information.
     */
    verification: string;
}

/**
 * Research question and brief for guiding research.
 */
export interface ResearchQuestion {
    /**
     * A research question that will be used to guide the research.
     */
    research_brief: string;
}

//##################
// State Definitions  
//##################

/**
 * Reducer function that allows overriding values in state.
 * This mimics the Python override_reducer function.
 */
function overrideReducer<T>(currentValue: T[], newValue: T[] | { type: 'override'; value: T[] }): T[] {
    if (Array.isArray(newValue)) {
        // Normal append operation
        return [...currentValue, ...newValue];
    } else if (typeof newValue === 'object' && newValue !== null && 'type' in newValue && newValue.type === 'override') {
        // Override operation
        return newValue.value || [];
    } else {
        // Fallback - treat as normal append
        return [...currentValue, newValue as any];
    }
}

/**
 * InputState is only 'messages' - extends MessagesAnnotation.
 */
export const AgentInputStateAnnotation = Annotation.Root({
    ...MessagesAnnotation.spec,
});

export type AgentInputState = typeof AgentInputStateAnnotation.State;

/**
 * Main agent state containing messages and research data.
 */
export const AgentStateAnnotation = Annotation.Root({
    ...MessagesAnnotation.spec,
    
    supervisor_messages: Annotation<BaseMessage[]>({
        reducer: overrideReducer,
        default: () => [],
    }),
    
    research_brief: Annotation<string | null>({
        reducer: (current, update) => update ?? current,
        default: () => null,
    }),
    
    raw_notes: Annotation<string[]>({
        reducer: overrideReducer,
        default: () => [],
    }),
    
    notes: Annotation<string[]>({
        reducer: overrideReducer,
        default: () => [],
    }),
    
    final_report: Annotation<string>({
        reducer: (current, update) => update ?? current,
        default: () => '',
    }),
});

export type AgentState = typeof AgentStateAnnotation.State;

/**
 * State for the supervisor that manages research tasks.
 */
export const SupervisorStateAnnotation = Annotation.Root({
    supervisor_messages: Annotation<BaseMessage[]>({
        reducer: overrideReducer,
        default: () => [],
    }),
    
    research_brief: Annotation<string>({
        reducer: (current, update) => update ?? current,
        default: () => '',
    }),
    
    notes: Annotation<string[]>({
        reducer: overrideReducer,
        default: () => [],
    }),
    
    research_iterations: Annotation<number>({
        reducer: (current, update) => update ?? current,
        default: () => 0,
    }),
    
    raw_notes: Annotation<string[]>({
        reducer: overrideReducer,
        default: () => [],
    }),
});

export type SupervisorState = typeof SupervisorStateAnnotation.State;

/**
 * State for individual researchers conducting research.
 */
export const ResearcherStateAnnotation = Annotation.Root({
    researcher_messages: Annotation<BaseMessage[]>({
        reducer: (current: BaseMessage[], update: BaseMessage[]) => [...current, ...update],
        default: () => [],
    }),
    
    tool_call_iterations: Annotation<number>({
        reducer: (current, update) => update ?? current,
        default: () => 0,
    }),
    
    research_topic: Annotation<string>({
        reducer: (current, update) => update ?? current,
        default: () => '',
    }),
    
    compressed_research: Annotation<string>({
        reducer: (current, update) => update ?? current,
        default: () => '',
    }),
    
    raw_notes: Annotation<string[]>({
        reducer: overrideReducer,
        default: () => [],
    }),
});

export type ResearcherState = typeof ResearcherStateAnnotation.State;

/**
 * Output state from individual researchers.
 */
export interface ResearcherOutputState {
    compressed_research: string;
    raw_notes: string[];
}

//##################
// Helper Functions
//##################

/**
 * Create override instruction for state updates.
 * This helps mimic the Python override behavior.
 */
export function createOverride<T>(value: T[]): { type: 'override'; value: T[] } {
    return { type: 'override', value };
}

/**
 * Type guards for structured outputs
 */
export function isConductResearch(obj: any): obj is ConductResearch {
    return obj && typeof obj.research_topic === 'string';
}

export function isResearchComplete(obj: any): obj is ResearchComplete {
    return obj !== null && typeof obj === 'object';
}

export function isSummary(obj: any): obj is Summary {
    return obj && typeof obj.summary === 'string' && typeof obj.key_excerpts === 'string';
}

export function isClarifyWithUser(obj: any): obj is ClarifyWithUser {
    return obj && 
           typeof obj.need_clarification === 'boolean' &&
           typeof obj.question === 'string' &&
           typeof obj.verification === 'string';
}

export function isResearchQuestion(obj: any): obj is ResearchQuestion {
    return obj && typeof obj.research_brief === 'string';
}

//##################
// Constants
//##################

/**
 * Default limits and configuration for research operations
 */
export const RESEARCH_CONFIG = {
    MAX_RESEARCH_ITERATIONS: 10,
    MAX_TOOL_CALL_ITERATIONS: 5,
    MAX_NOTES_PER_ITERATION: 20,
    MIN_RESEARCH_TOPIC_LENGTH: 50,
    MAX_RESEARCH_TOPIC_LENGTH: 2000,
    DEFAULT_RESEARCH_DEPTH: 3,
} as const;

/**
 * Research status enumeration
 */
export enum ResearchStatus {
    CLARIFYING = 'clarifying',
    PLANNING = 'planning', 
    RESEARCHING = 'researching',
    SYNTHESIZING = 'synthesizing',
    COMPLETE = 'complete',
    ERROR = 'error'
}

/**
 * Extended state interface with status tracking
 */
export interface ExtendedAgentState extends AgentState {
    status: ResearchStatus;
    error?: string;
    progress?: {
        current_step: number;
        total_steps: number;
        description: string;
    };
}