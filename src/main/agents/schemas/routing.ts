import { z } from 'zod';

/**
 * Schema for routing decisions in DeepResearchIntegration
 * Validates which processing path to take for a given message
 */
export const RoutingDecisionSchema = z.object({
  route: z.enum(['deep_research', 'tool_agent', 'direct_response']),
  response: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  reasoning: z.string().optional()
});

export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;

/**
 * Schema for parsing LLM routing responses
 * Handles the specific format expected from routing prompts
 */
export const RoutingResponseSchema = z.union([
  // ROUTE_DEEP_RESEARCH format
  z.object({
    type: z.literal('ROUTE_DEEP_RESEARCH'),
    route: z.literal('deep_research')
  }),
  // ROUTE_TOOL_AGENT format
  z.object({
    type: z.literal('ROUTE_TOOL_AGENT'),
    route: z.literal('tool_agent')
  }),
  // ROUTE_DIRECT format with response
  z.object({
    type: z.literal('ROUTE_DIRECT'),
    route: z.literal('direct_response'),
    response: z.string().min(1)
  })
]);

export type RoutingResponse = z.infer<typeof RoutingResponseSchema>;

/**
 * Utility function to parse routing text response
 */
export function parseRoutingResponse(text: string): RoutingDecision | null {
  const cleanText = text.trim();
  
  // Try to match exact routing patterns
  if (cleanText === 'ROUTE_DEEP_RESEARCH') {
    return { route: 'deep_research' };
  }
  
  if (cleanText === 'ROUTE_TOOL_AGENT') {
    return { route: 'tool_agent' };
  }
  
  // Handle ROUTE_DIRECT with response
  const directMatch = cleanText.match(/^ROUTE_DIRECT\s+(.+)$/);
  if (directMatch) {
    return {
      route: 'direct_response',
      response: directMatch[1].trim()
    };
  }
  
  return null;
}

/**
 * Validation function with detailed error reporting
 */
export function validateRoutingDecision(data: unknown): {
  success: true;
  data: RoutingDecision;
} | {
  success: false;
  error: string;
  issues: string[];
} {
  try {
    const result = RoutingDecisionSchema.safeParse(data);
    
    if (result.success) {
      return { success: true, data: result.data };
    }
    
    return {
      success: false,
      error: 'Routing decision validation failed',
      issues: result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`)
    };
  } catch (error) {
    return {
      success: false,
      error: 'Failed to validate routing decision',
      issues: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}