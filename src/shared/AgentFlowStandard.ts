/**
 * Agent Flow Standard
 * Defines the standard format for agent workflow updates
 */

export interface AgentFlowStepUpdate {
    stepId: string;
    title: string;
    description?: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    details?: string;
    timestamp?: number;
    duration?: number;
    context?: {
        userQuery?: string;
        toolName?: string;
        dataSize?: number;
        searchQuery?: string;
        researchTopic?: string;
        [key: string]: any;
    };
}

/**
 * Standard agent step types with templates
 */
export const AGENT_STEP_TEMPLATES = {
    // Initial processing
    PROCESSING_REQUEST: {
        title: 'Processing request',
        description: (context?: any) => 
            context?.userQuery 
                ? `Analyzing "${context.userQuery.length > 50 ? context.userQuery.substring(0, 50) + '...' : context.userQuery}"`
                : 'Analyzing user input and determining response strategy'
    },
    
    // Research workflow
    STARTING_RESEARCH: {
        title: 'Starting research',
        description: (context?: any) => 
            context?.researchTopic 
                ? `Researching "${context.researchTopic}"`
                : 'Initializing research workflow'
    },
    
    ANALYZING_REQUIREMENTS: {
        title: 'Analyzing requirements',
        description: (context?: any) => 
            context?.researchTopic 
                ? `Planning research strategy for "${context.researchTopic}"`
                : 'Determining research strategy and scope'
    },
    
    CONDUCTING_RESEARCH: {
        title: 'Conducting research',
        description: (context?: any) => 
            context?.searchQuery 
                ? `Searching for "${context.searchQuery}"`
                : 'Gathering information from multiple sources'
    },
    
    GENERATING_REPORT: {
        title: 'Generating report',
        description: (context?: any) => 
            context?.dataSize 
                ? `Synthesizing ${context.dataSize} findings into report`
                : 'Synthesizing findings into final report'
    },
    
    // Tool execution
    EXECUTING_TOOL: {
        title: (context?: any) => `Executing ${context?.toolName || 'tool'}`,
        description: (context?: any) => 
            context?.toolName && context?.query
                ? `${context.toolName}: "${context.query}"`
                : context?.toolName 
                ? `Using ${context.toolName} tool`
                : 'Tool execution in progress'
    },
    
    // Thinking
    THINKING: {
        title: 'Thinking',
        description: (context?: any) => 
            context?.contentLength 
                ? `Internal reasoning (${context.contentLength} characters)`
                : 'Processing and reasoning'
    },
    
    // Agent routing
    AGENT_ROUTING: {
        title: 'AI Agent processing',
        description: (context?: any) => 
            context?.agentType 
                ? `Routing to ${context.agentType} agent`
                : 'Determining appropriate response approach'
    },
    
    // Completion
    ANALYSIS_COMPLETE: {
        title: 'Analysis complete',
        description: (context?: any) => 
            context?.outputLength 
                ? `Generated response (${context.outputLength} characters)`
                : 'Response generation completed'
    }
};

/**
 * Generate a contextual step description
 */
export function generateStepDescription(
    templateKey: keyof typeof AGENT_STEP_TEMPLATES, 
    context?: any
): { title: string; description: string } {
    const template = AGENT_STEP_TEMPLATES[templateKey];
    if (!template) {
        return { title: 'Processing', description: 'Agent processing in progress' };
    }
    
    const title = typeof template.title === 'function' 
        ? template.title(context)
        : template.title;
        
    const description = typeof template.description === 'function'
        ? template.description(context)
        : template.description;
    
    return { title, description };
}

/**
 * Extract context from user message for research steps
 */
export function extractResearchContext(userMessage: string): {
    researchTopic: string;
    searchQuery: string;
} {
    // Clean up the message for better display
    const cleanMessage = userMessage
        .replace(/^(write|create|make|generate)\s+(a\s+)?(report|summary|analysis)\s+(about|on|for)\s+/i, '')
        .replace(/^(research|find|search)\s+(about|for|on)\s+/i, '')
        .replace(/^(tell me about|what is|who is|where is)\s+/i, '')
        .trim();
    
    return {
        researchTopic: cleanMessage.length > 100 ? cleanMessage.substring(0, 100) + '...' : cleanMessage,
        searchQuery: cleanMessage.length > 50 ? cleanMessage.substring(0, 50) + '...' : cleanMessage
    };
}