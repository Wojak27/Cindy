import { z } from 'zod';

/**
 * Schema for supervisor decisions in SupervisorNode
 * Validates the next action to take in the research process
 */
export const SupervisorActionSchema = z.enum(['conduct_research', 'research_complete', 'continue']);

export const SupervisorDecisionSchema = z.object({
  action: SupervisorActionSchema,
  research_topic: z.string().optional(),
  reasoning: z.string().optional(),
  confidence: z.number().min(0).max(1).optional()
});

export type SupervisorDecision = z.infer<typeof SupervisorDecisionSchema>;

/**
 * Schema for research task assignments
 */
export const ResearchTaskSchema = z.object({
  topic: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  context: z.string().optional(),
  expected_sources: z.number().min(1).max(10).default(3),
  time_limit: z.number().min(30).max(600).optional() // seconds
});

export type ResearchTask = z.infer<typeof ResearchTaskSchema>;

/**
 * Extended supervisor decision with task details
 */
export const DetailedSupervisorDecisionSchema = z.object({
  action: SupervisorActionSchema,
  research_topic: z.string().optional(),
  reasoning: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  task: ResearchTaskSchema.optional(),
  next_steps: z.array(z.string()).optional(),
  completion_status: z.number().min(0).max(1).optional() // 0-1 progress indicator
});

export type DetailedSupervisorDecision = z.infer<typeof DetailedSupervisorDecisionSchema>;

/**
 * Validation function for supervisor decisions
 */
export function validateSupervisorDecision(data: unknown): {
  success: true;
  data: SupervisorDecision;
} | {
  success: false;
  error: string;
  issues: string[];
  fallback: SupervisorDecision;
} {
  try {
    const result = SupervisorDecisionSchema.safeParse(data);
    
    if (result.success) {
      return { success: true, data: result.data };
    }
    
    // Provide a fallback for failed validation
    const fallback: SupervisorDecision = {
      action: 'continue',
      reasoning: 'Failed to parse supervisor decision, continuing with default action'
    };
    
    return {
      success: false,
      error: 'Supervisor decision validation failed',
      issues: result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`),
      fallback
    };
  } catch (error) {
    const fallback: SupervisorDecision = {
      action: 'continue',
      reasoning: 'Error during validation, using fallback action'
    };
    
    return {
      success: false,
      error: 'Failed to validate supervisor decision',
      issues: [error instanceof Error ? error.message : 'Unknown error'],
      fallback
    };
  }
}

/**
 * Helper functions for creating common supervisor decisions
 */
export const SupervisorDecisions = {
  conductResearch: (topic: string, reasoning?: string): SupervisorDecision => ({
    action: 'conduct_research',
    research_topic: topic,
    reasoning: reasoning || `Starting research on: ${topic}`
  }),
  
  researchComplete: (reasoning?: string): SupervisorDecision => ({
    action: 'research_complete',
    reasoning: reasoning || 'All research tasks have been completed successfully'
  }),
  
  continue: (reasoning?: string): SupervisorDecision => ({
    action: 'continue',
    reasoning: reasoning || 'Continuing with current research process'
  })
};

/**
 * Parse supervisor decision from text response
 */
export function parseSupervisorDecision(text: string): SupervisorDecision | null {
  try {
    // Remove <think> tags if present
    const thinkTagRegex = /<think[^>]*>([\s\S]*?)<\/think>/g;
    const cleanedResponse = text.replace(thinkTagRegex, '').trim();
    
    // Try JSON parsing first
    try {
      const parsed = JSON.parse(cleanedResponse);
      const validation = validateSupervisorDecision(parsed);
      return validation.success ? validation.data : ('fallback' in validation ? validation.fallback : null);
    } catch (jsonError) {
      // Fall back to text pattern matching
      const lowerText = cleanedResponse.toLowerCase();
      
      if (lowerText.includes('conduct_research') || lowerText.includes('start research')) {
        // Try to extract research topic
        const topicMatch = cleanedResponse.match(/research[:\s]+([^.!?\n]+)/i);
        const topic = topicMatch ? topicMatch[1].trim() : 'General research';
        
        return SupervisorDecisions.conductResearch(topic);
      }
      
      if (lowerText.includes('research_complete') || lowerText.includes('complete') || lowerText.includes('finished')) {
        return SupervisorDecisions.researchComplete();
      }
      
      // Default to continue
      return SupervisorDecisions.continue();
    }
  } catch (error) {
    console.warn('[SupervisorSchema] Failed to parse supervisor decision:', error);
    return SupervisorDecisions.continue('Error parsing decision, using fallback');
  }
}