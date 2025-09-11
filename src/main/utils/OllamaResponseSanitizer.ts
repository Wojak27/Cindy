/**
 * Ollama Response Sanitization Utilities
 * Handles malformed JSON responses and streaming chunk errors from Ollama
 */

import { logger } from './ColorLogger.ts';

export interface SanitizeOptions {
    maxRetries?: number;
    logErrors?: boolean;
    fallbackToPlainText?: boolean;
}

export interface SanitizeResult {
    success: boolean;
    data?: any;
    originalInput?: string;
    error?: string;
    isPlainText?: boolean;
}

/**
 * Comprehensive JSON sanitization for Ollama responses
 */
export class OllamaResponseSanitizer {
    private static readonly DEFAULT_OPTIONS: SanitizeOptions = {
        maxRetries: 3,
        logErrors: true,
        fallbackToPlainText: true
    };

    /**
     * Safely parse JSON with comprehensive error handling and sanitization
     */
    public static safeParseJSON(input: string, options: SanitizeOptions = {}): SanitizeResult {
        const opts = { ...this.DEFAULT_OPTIONS, ...options };
        
        if (!input || typeof input !== 'string') {
            return {
                success: false,
                error: 'Invalid input: not a string',
                originalInput: String(input)
            };
        }

        // Attempt direct parsing first
        try {
            const parsed = JSON.parse(input);
            return {
                success: true,
                data: parsed,
                originalInput: input
            };
        } catch (directError: any) {
            if (opts.logErrors) {
                logger.warn('OllamaResponseSanitizer', 'Direct JSON parse failed, attempting sanitization', {
                    error: directError.message,
                    input: input.substring(0, 200) + (input.length > 200 ? '...' : '')
                });
            }
        }

        // Apply sanitization techniques
        let attempt = 0;
        const sanitizers = [
            this.fixTrailingCommas,
            this.fixQuoteEscaping,
            this.fixObjectKeyValues,
            this.fixControlCharacters,
            this.extractJSONFromText,
            this.fixMalformedObjects
        ];

        for (const sanitizer of sanitizers) {
            attempt++;
            if (attempt > (opts.maxRetries || 3)) break;

            try {
                const sanitized = sanitizer(input);
                if (sanitized !== input) {
                    try {
                        const parsed = JSON.parse(sanitized);
                        if (opts.logErrors) {
                            logger.info('OllamaResponseSanitizer', `Sanitization successful with ${sanitizer.name}`, {
                                attempt,
                                originalLength: input.length,
                                sanitizedLength: sanitized.length
                            });
                        }
                        return {
                            success: true,
                            data: parsed,
                            originalInput: input
                        };
                    } catch (sanitizeError: any) {
                        if (opts.logErrors) {
                            logger.debug('OllamaResponseSanitizer', `Sanitizer ${sanitizer.name} failed`, {
                                error: sanitizeError.message
                            });
                        }
                        continue;
                    }
                }
            } catch (sanitizerError: any) {
                if (opts.logErrors) {
                    logger.debug('OllamaResponseSanitizer', `Sanitizer ${sanitizer.name} threw error`, {
                        error: sanitizerError.message
                    });
                }
                continue;
            }
        }

        // Fallback to plain text if enabled
        if (opts.fallbackToPlainText) {
            if (opts.logErrors) {
                logger.warn('OllamaResponseSanitizer', 'All JSON sanitization attempts failed, falling back to plain text');
            }
            return {
                success: true,
                data: { content: input, type: 'plain_text' },
                originalInput: input,
                isPlainText: true
            };
        }

        return {
            success: false,
            error: 'All sanitization attempts failed',
            originalInput: input
        };
    }

    /**
     * Fix trailing commas in JSON objects and arrays
     */
    private static fixTrailingCommas(input: string): string {
        return input
            .replace(/,\s*}/g, '}')  // Remove trailing commas before }
            .replace(/,\s*]/g, ']'); // Remove trailing commas before ]
    }

    /**
     * Fix common quote escaping issues
     */
    private static fixQuoteEscaping(input: string): string {
        return input
            .replace(/\\"/g, '"')     // Fix over-escaped quotes
            .replace(/([^\\])"/g, '$1\\"') // Escape unescaped quotes
            .replace(/^"/g, '\\"')    // Escape quotes at start
            .replace(/([^\\])":/g, '$1\\":') // Fix quotes before colons
            .replace(/:\s*"([^"]*)"([^,}\]]*)/g, ': "$1$2"'); // Fix quotes around values
    }

    /**
     * Fix malformed object key-value pairs
     */
    private static fixObjectKeyValues(input: string): string {
        // Fix pattern: "key": value" -> "key": "value"
        return input.replace(/"([^"]+)":\s*([^,}\]]+)"/g, (match, key, value) => {
            // If value is already properly quoted or is a number/boolean, leave it
            if (value.startsWith('"') && value.endsWith('"')) {
                return match;
            }
            if (/^(true|false|null|\d+(\.\d+)?)$/.test(value.trim())) {
                return `"${key}": ${value.trim()}`;
            }
            return `"${key}": "${value.replace(/"/g, '\\"')}"`;
        });
    }

    /**
     * Remove or fix control characters that break JSON
     */
    private static fixControlCharacters(input: string): string {
        return input
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
            .replace(/\n/g, '\\n')    // Escape newlines
            .replace(/\r/g, '\\r')    // Escape carriage returns
            .replace(/\t/g, '\\t');   // Escape tabs
    }

    /**
     * Extract JSON from mixed text content
     */
    private static extractJSONFromText(input: string): string {
        // Look for JSON objects or arrays in the text
        const jsonMatches = input.match(/\{[^{}]*\}|\[[^\[\]]*\]/g);
        if (jsonMatches && jsonMatches.length > 0) {
            // Try the first match that looks like complete JSON
            for (const match of jsonMatches) {
                try {
                    JSON.parse(match);
                    return match;
                } catch {
                    continue;
                }
            }
        }
        return input;
    }

    /**
     * Fix malformed objects by attempting to reconstruct valid JSON
     */
    private static fixMalformedObjects(input: string): string {
        // Handle cases where objects are missing closing braces or brackets
        let fixed = input.trim();
        
        // Count braces and brackets to determine if any are missing
        const openBraces = (fixed.match(/\{/g) || []).length;
        const closeBraces = (fixed.match(/\}/g) || []).length;
        const openBrackets = (fixed.match(/\[/g) || []).length;
        const closeBrackets = (fixed.match(/\]/g) || []).length;

        // Add missing closing braces
        for (let i = 0; i < openBraces - closeBraces; i++) {
            fixed += '}';
        }

        // Add missing closing brackets
        for (let i = 0; i < openBrackets - closeBrackets; i++) {
            fixed += ']';
        }

        return fixed;
    }

    /**
     * Sanitize streaming chunks that may be incomplete JSON
     */
    public static sanitizeStreamingChunk(chunk: string, buffer: string = ''): {
        processable: string[];
        remainder: string;
    } {
        const fullContent = buffer + chunk;
        const lines = fullContent.split('\n');
        const processable: string[] = [];
        let remainder = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            if (i === lines.length - 1 && !chunk.endsWith('\n')) {
                // Last line might be incomplete, keep as remainder
                remainder = line;
                continue;
            }

            // Try to parse the line as JSON
            const result = this.safeParseJSON(line, { logErrors: false });
            if (result.success) {
                processable.push(JSON.stringify(result.data));
            } else if (result.isPlainText) {
                processable.push(line);
            }
        }

        return { processable, remainder };
    }

    /**
     * Validate and sanitize tool calling responses from Ollama
     */
    public static sanitizeToolCallResponse(response: any): SanitizeResult {
        if (typeof response === 'string') {
            return this.safeParseJSON(response);
        }

        if (typeof response === 'object' && response !== null) {
            try {
                // Ensure tool calls are properly formatted
                if (response.tool_calls && Array.isArray(response.tool_calls)) {
                    response.tool_calls = response.tool_calls.map((call: any) => {
                        if (call.function && call.function.arguments) {
                            if (typeof call.function.arguments === 'string') {
                                const argResult = this.safeParseJSON(call.function.arguments);
                                if (argResult.success) {
                                    call.function.arguments = argResult.data;
                                }
                            }
                        }
                        return call;
                    });
                }

                return {
                    success: true,
                    data: response
                };
            } catch (error: any) {
                return {
                    success: false,
                    error: `Tool call sanitization failed: ${error.message}`,
                    originalInput: JSON.stringify(response)
                };
            }
        }

        return {
            success: false,
            error: 'Invalid response type for tool call sanitization'
        };
    }
}

export default OllamaResponseSanitizer;