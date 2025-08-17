import { LLMProvider } from '../services/LLMProvider';
import { LangChainMemoryService } from '../services/LangChainMemoryService';
import { LangChainToolExecutorService } from '../services/LangChainToolExecutorService';
import { SettingsService } from '../services/SettingsService';
import { DeepResearchIntegration } from './research/DeepResearchIntegration';

/**
 * Configuration options for the LangGraphAgent
 */
export interface LangGraphAgentOptions {
    llmProvider: LLMProvider;
    memoryService: LangChainMemoryService;
    toolExecutor: LangChainToolExecutorService;
    config?: any;
}

/**
 * Deep Research-enhanced LangGraph Agent.
 * Intelligent routing between Deep Research capabilities and standard processing.
 */
export class LangGraphAgent {
    private deepResearchIntegration: DeepResearchIntegration;
    private llmProvider: LLMProvider;
    private toolExecutor: LangChainToolExecutorService;
    private settingsService: SettingsService | null = null;

    constructor(options: LangGraphAgentOptions) {
        this.llmProvider = options.llmProvider;
        this.toolExecutor = options.toolExecutor;

        // Create a minimal settings service for compatibility
        this.settingsService = this.createCompatibilitySettingsService();

        // Initialize Deep Research integration
        this.deepResearchIntegration = new DeepResearchIntegration({
            llmProvider: this.llmProvider,
            toolExecutor: this.toolExecutor,
            settingsService: this.settingsService,
            enableDeepResearch: true,
            fallbackToOriginal: true
        });

        console.log('[LangGraphAgent] Initialized with Deep Research architecture');
        console.log('[LangGraphAgent] Using provider:', this.llmProvider.getCurrentProvider());
    }

    /**
     * Create a compatibility settings service for Deep Research integration
     */
    private createCompatibilitySettingsService(): SettingsService {
        // Return a minimal settings service that provides default values
        return {
            getCurrentProvider: () => this.llmProvider.getCurrentProvider(),
            // Add other minimal methods as needed for compatibility
        } as any;
    }

    /**
     * Process a message through the Deep Research system (non-streaming)
     */
    async process(input: string, context?: any): Promise<string> {
        try {
            console.log('[LangGraphAgent] Processing input with Deep Research routing:', input);

            // Use Deep Research integration for intelligent processing
            const result = await this.deepResearchIntegration.processMessage(input);

            if (result.usedDeepResearch && result.result !== 'FALLBACK_TO_ORIGINAL') {
                console.log(`[LangGraphAgent] Deep Research completed in ${result.processingTime}ms`);
                return result.result;
            } else {
                // For fallback cases, provide a simple response
                console.log('[LangGraphAgent] Using fallback processing');
                return this.createFallbackResponse(input, context);
            }

        } catch (error) {
            console.error('[LangGraphAgent] Processing error:', error);
            return `I encountered an error: ${(error as Error).message}`;
        }
    }

    /**
     * Create a fallback response for non-research queries
     */
    private async createFallbackResponse(input: string, context?: any): Promise<string> {
        try {
            // Simple LLM response for non-research queries
            const result = await this.llmProvider.invoke([
                { role: 'user', content: input }
            ]);

            return result.content as string || 'I can help you with that. Could you provide more details?';

        } catch (error) {
            console.error('[LangGraphAgent] Fallback processing error:', error);
            return 'I can help you with questions and research tasks. Please let me know what you\'d like to explore!';
        }
    }

    /**
     * Process a message through Deep Research with streaming output
     */
    async *processStreaming(input: string, context?: any): AsyncGenerator<string> {
        try {
            console.log("\n🎬 [LangGraphAgent] STARTING DEEP RESEARCH STREAMING");
            console.log("═".repeat(80));
            console.log(`📥 INPUT: "${input}"`);
            console.log("═".repeat(80));

            // Check if this should use Deep Research streaming
            if (this.deepResearchIntegration.shouldUseDeepResearch(input)) {
                console.log("[LangGraphAgent] Using Deep Research streaming");

                yield "<think>Processing your request with Deep Research capabilities...</think>\n\n";

                for await (const update of this.deepResearchIntegration.streamMessage(input)) {
                    if (update.usedDeepResearch && update.content !== 'FALLBACK_TO_ORIGINAL') {
                        // Format Deep Research updates
                        if (update.type === 'progress') {
                            yield `📋 ${update.content}\n\n`;
                        } else if (update.type === 'result') {
                            yield update.content;
                        }
                    } else {
                        // Fallback to simple streaming

                        for await (const fallbackChunk of this.streamFallbackResponse(input, context)) {
                            yield fallbackChunk;
                        }
                        return;
                    }
                }
            } else {
                // Use standard processing for non-research queries
                console.log("[LangGraphAgent] Using standard streaming");

                for await (const chunk of this.streamFallbackResponse(input, context)) {
                    yield chunk;
                }
            }

        } catch (error) {
            console.log("\n❌ [LangGraphAgent] Streaming process error");
            console.log("═".repeat(80));
            console.error("[LangGraphAgent] Streaming error:", error);
            yield `\n❌ **Error:** I encountered an issue while processing your request: ${(error as Error).message}`;
        }
    }

    /**
     * Stream fallback response for non-research queries
     */
    private async *streamFallbackResponse(input: string, context?: any): AsyncGenerator<string> {
        try {
            // Simple LLM response with simulated streaming
            const result = await this.llmProvider.invoke([
                { role: 'user', content: input }
            ]);

            const response = result.content as string || 'I can help you with that. Could you provide more details?';

            // Simulate streaming by chunking the response
            const chunkSize = 50;
            for (let i = 0; i < response.length; i += chunkSize) {
                yield response.slice(i, i + chunkSize);
                // Small delay to simulate streaming
                await new Promise(resolve => setTimeout(resolve, 20));
            }

        } catch (error) {
            console.error('[LangGraphAgent] Fallback streaming error:', error);
            yield 'I can help you with questions and research tasks. Please let me know what you\'d like to explore!';
        }
    }


    /**
     * Get the current provider being used
     */
    getCurrentProvider(): string {
        return this.llmProvider.getCurrentProvider();
    }

    /**
     * Get available tools
     */
    getAvailableTools(): string[] {
        return this.toolExecutor.getAvailableTools();
    }

    /**
     * Update settings and propagate to Deep Research integration
     */
    async updateSettings(): Promise<void> {
        try {
            await this.deepResearchIntegration.updateSettings();
            console.log('[LangGraphAgent] Settings updated successfully');
        } catch (error) {
            console.error('[LangGraphAgent] Error updating settings:', error);
        }
    }

    /**
     * Get enhanced status information
     */
    getStatus(): {
        provider: string;
        availableTools: string[];
        deepResearchStatus: any;
    } {
        return {
            provider: this.getCurrentProvider(),
            availableTools: this.getAvailableTools(),
            deepResearchStatus: this.deepResearchIntegration.getStatus()
        };
    }

    /**
     * Enable or disable Deep Research capabilities
     */
    setDeepResearchEnabled(enabled: boolean): void {
        this.deepResearchIntegration.setEnabled(enabled);
        console.log(`[LangGraphAgent] Deep Research ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Set fallback behavior for when Deep Research fails
     */
    setFallbackEnabled(enabled: boolean): void {
        this.deepResearchIntegration.setFallbackEnabled(enabled);
        console.log(`[LangGraphAgent] Fallback to standard processing ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Get the Deep Research integration (for advanced configuration)
     */
    getDeepResearchIntegration(): DeepResearchIntegration {
        return this.deepResearchIntegration;
    }
}