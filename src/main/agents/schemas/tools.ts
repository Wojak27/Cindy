import { z } from 'zod';

/**
 * Schema for weather tool responses
 */
export const WeatherDataSchema = z.object({
  location: z.string(),
  temperature: z.number(),
  description: z.string(),
  humidity: z.number().min(0).max(100).optional(),
  windSpeed: z.number().min(0).optional(),
  pressure: z.number().optional(),
  forecast: z.array(z.object({
    date: z.string(),
    high: z.number(),
    low: z.number(),
    description: z.string()
  })).optional()
});

export type WeatherData = z.infer<typeof WeatherDataSchema>;

/**
 * Schema for map/location data
 */
export const LocationSchema = z.object({
  name: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().optional(),
  country: z.string().optional(),
  region: z.string().optional()
});

export type LocationData = z.infer<typeof LocationSchema>;

export const MapDisplaySchema = z.object({
  locations: z.array(LocationSchema),
  zoom: z.number().min(1).max(20).default(10),
  center: LocationSchema.optional(),
  title: z.string().optional(),
  description: z.string().optional()
});

export type MapDisplayData = z.infer<typeof MapDisplaySchema>;

/**
 * Schema for search result data
 */
export const SearchResultSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  snippet: z.string(),
  relevance: z.number().min(0).max(1).optional(),
  source: z.string().optional(),
  publishedDate: z.string().optional()
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

export const SearchResponseSchema = z.object({
  query: z.string(),
  results: z.array(SearchResultSchema),
  totalResults: z.number().min(0).optional(),
  searchTime: z.number().min(0).optional(),
  suggestions: z.array(z.string()).optional()
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;

/**
 * Schema for tool execution results
 */
export const ToolResultSchema = z.object({
  success: z.boolean(),
  data: z.any(), // Can be validated with specific schemas
  error: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  executionTime: z.number().min(0).optional()
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

/**
 * Validation functions for tool responses
 */
export const ToolValidators = {
  weather: (data: unknown) => {
    const result = WeatherDataSchema.safeParse(data);
    return result.success ? { success: true, data: result.data } : { success: false, error: result.error };
  },
  
  location: (data: unknown) => {
    const result = LocationSchema.safeParse(data);
    return result.success ? { success: true, data: result.data } : { success: false, error: result.error };
  },
  
  map: (data: unknown) => {
    const result = MapDisplaySchema.safeParse(data);
    return result.success ? { success: true, data: result.data } : { success: false, error: result.error };
  },
  
  search: (data: unknown) => {
    const result = SearchResponseSchema.safeParse(data);
    return result.success ? { success: true, data: result.data } : { success: false, error: result.error };
  }
};

/**
 * Helper function to create a successful tool result
 */
export function createToolResult<T>(data: T, metadata?: Record<string, any>): ToolResult {
  return {
    success: true,
    data,
    metadata
  };
}

/**
 * Helper function to create a failed tool result
 */
export function createToolError(error: string, metadata?: Record<string, any>): ToolResult {
  return {
    success: false,
    data: null,
    error,
    metadata
  };
}