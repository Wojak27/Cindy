import { z } from 'zod';

/**
 * Schema for clarification decisions in ClarificationNode
 * Validates whether the agent needs to ask the user for more information
 */
export const ClarificationSchema = z.object({
  need_clarification: z.boolean(),
  question: z.string(),
  verification: z.string()
});

export type ClarificationResult = z.infer<typeof ClarificationSchema>;

/**
 * More detailed schema with optional fields for advanced use cases
 */
export const DetailedClarificationSchema = z.object({
  need_clarification: z.boolean(),
  question: z.string(),
  verification: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  missing_information: z.array(z.string()).optional(),
  suggested_questions: z.array(z.string()).optional(),
  research_scope: z.string().optional()
});

export type DetailedClarificationResult = z.infer<typeof DetailedClarificationSchema>;

/**
 * Validation function for clarification responses
 */
export function validateClarification(data: unknown): {
  success: true;
  data: ClarificationResult;
} | {
  success: false;
  error: string;
  issues: string[];
  fallback: ClarificationResult;
} {
  try {
    const result = ClarificationSchema.safeParse(data);
    
    if (result.success) {
      return { success: true, data: result.data };
    }
    
    // Provide a fallback for failed validation
    const fallback: ClarificationResult = {
      need_clarification: false,
      question: '',
      verification: 'I have sufficient information to proceed with the research.'
    };
    
    return {
      success: false,
      error: 'Clarification validation failed',
      issues: result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`),
      fallback
    };
  } catch (error) {
    const fallback: ClarificationResult = {
      need_clarification: false,
      question: '',
      verification: 'I have sufficient information to proceed with the research.'
    };
    
    return {
      success: false,
      error: 'Failed to validate clarification response',
      issues: [error instanceof Error ? error.message : 'Unknown error'],
      fallback
    };
  }
}

/**
 * Helper function to create a "no clarification needed" response
 */
export function createNoClarificationResponse(verification?: string): ClarificationResult {
  return {
    need_clarification: false,
    question: '',
    verification: verification || 'I have sufficient information to proceed with the research.'
  };
}

/**
 * Helper function to create a clarification request
 */
export function createClarificationRequest(question: string): ClarificationResult {
  return {
    need_clarification: true,
    question,
    verification: ''
  };
}

/**
 * Utility to clean and parse JSON responses with <think> tag removal
 */
export function parseClarificationFromText(text: string): ClarificationResult | null {
  try {
    // Remove <think> tags if present
    const thinkTagRegex = /<think[^>]*>([\s\S]*?)<\/think>/g;
    const cleanedResponse = text.replace(thinkTagRegex, '').trim();
    
    // Try to parse as JSON
    const parsed = JSON.parse(cleanedResponse);
    const validation = validateClarification(parsed);
    
    return validation.success ? validation.data : ('fallback' in validation ? validation.fallback : null);
  } catch (error) {
    console.warn('[ClarificationSchema] Failed to parse text as JSON:', error);
    return null;
  }
}