/**
 * Ollama Error Handler Wrapper
 * Provides comprehensive error handling and recovery for Ollama operations
 */

import { ChatOllama } from '@langchain/ollama';
import { BaseMessage, AIMessage } from '@langchain/core/messages';
import { logger } from './ColorLogger.ts';
import { OllamaResponseSanitizer } from './OllamaResponseSanitizer.ts';

export interface OllamaErrorHandlerOptions {
    maxRetries?: number;
    retryDelay?: number;
    enableFallback?: boolean;
    logErrors?: boolean;
    sanitizeResponses?: boolean;
}

export class OllamaErrorHandler {
    private static readonly DEFAULT_OPTIONS: OllamaErrorHandlerOptions = {
        maxRetries: 3,
        retryDelay: 1000,
        enableFallback: true,
        logErrors: true,
        sanitizeResponses: true
    };

    /**
     * Wrap Ollama model invocation with comprehensive error handling
     */
    public static async safeInvoke(
        model: ChatOllama,
        messages: BaseMessage[],
        options: OllamaErrorHandlerOptions = {}
    ): Promise<AIMessage> {
        const opts = { ...this.DEFAULT_OPTIONS, ...options };
        let lastError: any = null;

        for (let attempt = 1; attempt <= (opts.maxRetries || 3); attempt++) {
            try {
                if (opts.logErrors && attempt > 1) {
                    logger.info('OllamaErrorHandler', `Retry attempt ${attempt}/${opts.maxRetries}`);
                }

                const response = await model.invoke(messages);
                
                // Sanitize response if enabled
                if (opts.sanitizeResponses && response.content) {
                    const sanitized = this.sanitizeResponse(response);
                    if (sanitized) {
                        return sanitized;
                    }
                }

                return response;

            } catch (error: any) {
                lastError = error;
                
                // Check if this is a JSON parsing error
                if (this.isJSONParsingError(error)) {
                    if (opts.logErrors) {
                        logger.warn('OllamaErrorHandler', `JSON parsing error on attempt ${attempt}`, {
                            error: error.message,
                            attempt,
                            maxRetries: opts.maxRetries
                        });
                    }
                    
                    // If we have more retries, wait and try again
                    if (attempt < (opts.maxRetries || 3)) {
                        await this.delay(opts.retryDelay || 1000);
                        continue;
                    }
                } else {
                    // For non-JSON errors, log and rethrow immediately
                    if (opts.logErrors) {
                        logger.error('OllamaErrorHandler', 'Non-JSON error occurred', {
                            error: error.message,
                            type: error.constructor.name
                        });
                    }
                    throw error;
                }
            }
        }

        // All retries failed
        if (opts.enableFallback) {
            return this.createFallbackResponse(lastError, opts);
        }

        throw lastError;
    }

    /**
     * Wrap streaming operations with error handling
     */
    public static async *safeStream(
        model: ChatOllama,
        messages: BaseMessage[],
        options: OllamaErrorHandlerOptions = {}
    ): AsyncGenerator<any, void, unknown> {
        const opts = { ...this.DEFAULT_OPTIONS, ...options };
        let buffer = '';
        let errorCount = 0;
        const maxErrors = 5;

        try {
            const stream = await model.stream(messages);

            for await (const chunk of stream) {
                try {
                    // Handle streaming chunk with potential JSON parsing
                    if (opts.sanitizeResponses) {
                        const { processable, remainder } = OllamaResponseSanitizer.sanitizeStreamingChunk(
                            chunk.content || JSON.stringify(chunk),
                            buffer
                        );

                        buffer = remainder;

                        for (const processed of processable) {
                            yield processed;
                        }
                    } else {
                        yield chunk;
                    }

                    // Reset error count on successful processing
                    errorCount = 0;

                } catch (chunkError: any) {
                    errorCount++;
                    
                    if (opts.logErrors) {
                        logger.warn('OllamaErrorHandler', `Streaming chunk error ${errorCount}/${maxErrors}`, {
                            error: chunkError.message,
                            chunkContent: typeof chunk === 'string' ? chunk.substring(0, 100) : 'non-string'
                        });
                    }

                    // If too many chunk errors, break streaming
                    if (errorCount >= maxErrors) {
                        logger.error('OllamaErrorHandler', 'Too many streaming errors, terminating stream');
                        break;
                    }

                    // For chunk errors, continue to next chunk
                    continue;
                }
            }

            // Process any remaining buffer content
            if (buffer.trim() && opts.sanitizeResponses) {
                const result = OllamaResponseSanitizer.safeParseJSON(buffer);
                if (result.success) {
                    yield JSON.stringify(result.data);
                } else if (result.isPlainText) {
                    yield buffer;
                }
            }

        } catch (streamError: any) {
            if (this.isJSONParsingError(streamError)) {
                if (opts.logErrors) {
                    logger.error('OllamaErrorHandler', 'Stream failed with JSON parsing error', {
                        error: streamError.message
                    });
                }

                // Yield fallback response for stream failure
                if (opts.enableFallback) {
                    const fallback = this.createFallbackResponse(streamError, opts);
                    yield fallback.content;
                }
            } else {
                throw streamError;
            }
        }
    }

    /**
     * Check if error is related to JSON parsing
     */
    private static isJSONParsingError(error: any): boolean {
        if (!error || !error.message) return false;
        
        const message = error.message.toLowerCase();
        const jsonErrorPatterns = [
            'invalid character',
            'unexpected token',
            'json parse',
            'malformed json',
            'invalid json',
            'json.parse',
            'syntax error',
            'after object key:value pair'
        ];

        return jsonErrorPatterns.some(pattern => message.includes(pattern));
    }

    /**
     * Sanitize response to prevent JSON parsing issues
     */
    private static sanitizeResponse(response: AIMessage): AIMessage | null {
        if (!response.content) return response;

        try {
            if (typeof response.content === 'string') {
                const result = OllamaResponseSanitizer.safeParseJSON(response.content);
                if (result.success && !result.isPlainText) {
                    return new AIMessage({
                        content: JSON.stringify(result.data),
                        additional_kwargs: response.additional_kwargs,
                        response_metadata: response.response_metadata
                    });
                }
            }
            return response;
        } catch (error: any) {
            logger.warn('OllamaErrorHandler', 'Response sanitization failed', {
                error: error.message
            });
            return response;
        }
    }

    /**
     * Create a fallback response when all retries fail
     */
    private static createFallbackResponse(error: any, options: OllamaErrorHandlerOptions): AIMessage {
        const message = `I encountered a technical issue while processing your request. The Ollama service returned an error: ${error?.message || 'Unknown error'}. Please try rephrasing your question or try again in a moment.`;
        
        if (options.logErrors) {
            logger.error('OllamaErrorHandler', 'Creating fallback response due to persistent errors', {
                originalError: error?.message,
                fallbackMessage: message
            });
        }

        return new AIMessage({
            content: message,
            additional_kwargs: {
                error_recovery: true,
                original_error: error?.message
            }
        });
    }

    /**
     * Delay utility for retry logic
     */
    private static delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Validate Ollama model configuration
     */
    public static validateConfiguration(model: ChatOllama): {
        isValid: boolean;
        issues: string[];
        recommendations: string[];
    } {
        const issues: string[] = [];
        const recommendations: string[] = [];

        // Check basic configuration
        if (!(model as any).baseUrl) {
            issues.push('Missing baseUrl configuration');
        }

        if (!(model as any).model) {
            issues.push('Missing model name');
        }

        // Check for optimal settings to reduce JSON errors
        const maxRetries = (model as any).maxRetries;
        if (!maxRetries || maxRetries < 3) {
            recommendations.push('Increase maxRetries to at least 3 for better error recovery');
        }

        const temperature = (model as any).temperature;
        if (temperature && temperature > 0.8) {
            recommendations.push('Consider lowering temperature (≤0.8) to reduce response variability');
        }

        return {
            isValid: issues.length === 0,
            issues,
            recommendations
        };
    }
}

export default OllamaErrorHandler;