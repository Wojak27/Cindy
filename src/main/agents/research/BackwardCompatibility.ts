/**
 * Backward compatibility layer for Deep Research integration
 * Ensures existing agent systems continue to work seamlessly
 */

import { ThinkingCindyAgent } from '../ThinkingCindyAgent';
import { LangGraphAgent } from '../LangGraphAgent';
import { DeepResearchIntegration } from './DeepResearchIntegration';
import { LLMProvider } from '../../services/LLMProvider';
import { LangChainToolExecutorService } from '../../services/LangChainToolExecutorService';
import { LangChainMemoryService } from '../../services/LangChainMemoryService';
import { SettingsService } from '../../services/SettingsService';

/**
 * Enhanced Agent Wrapper that integrates Deep Research capabilities
 * with existing agent architectures
 */
export class EnhancedAgentWrapper {
    private originalAgent: ThinkingCindyAgent | LangGraphAgent;
    private deepResearchIntegration: DeepResearchIntegration;
    private agentType: 'thinking' | 'langgraph';
    
    constructor(
        originalAgent: ThinkingCindyAgent | LangGraphAgent,
        llmProvider: LLMProvider,
        toolExecutor: LangChainToolExecutorService,
        settingsService: SettingsService,
        memoryService?: LangChainMemoryService
    ) {
        this.originalAgent = originalAgent;
        this.agentType = originalAgent instanceof ThinkingCindyAgent ? 'thinking' : 'langgraph';
        
        // Create Deep Research integration
        this.deepResearchIntegration = new DeepResearchIntegration({
            llmProvider,
            toolExecutor,
            settingsService,
            enableDeepResearch: true, // Default to enabled
            fallbackToOriginal: true  // Default to enabled
        });
        
        console.log(`[EnhancedAgentWrapper] Initialized with ${this.agentType} agent and Deep Research integration`);
    }

    /**
     * Process a message with intelligent routing between Deep Research and original agent
     */
    async processMessage(
        userMessage: string,
        conversationHistory?: any[],
        options?: any
    ): Promise<string> {
        try {
            console.log('[EnhancedAgentWrapper] Processing message with intelligent routing');
            
            // Check if this should use Deep Research
            const processResult = await this.deepResearchIntegration.processMessage(userMessage);
            
            if (processResult.usedDeepResearch && processResult.result !== 'FALLBACK_TO_ORIGINAL') {
                // Deep Research was used successfully
                console.log(`[EnhancedAgentWrapper] Deep Research completed in ${processResult.processingTime}ms`);
                return processResult.result;
            } else {
                // Use original agent
                console.log('[EnhancedAgentWrapper] Using original agent');
                return await this.processWithOriginalAgent(userMessage, conversationHistory, options);
            }

        } catch (error: any) {
            console.error('[EnhancedAgentWrapper] Error in enhanced processing:', error);
            
            // Fallback to original agent
            try {
                return await this.processWithOriginalAgent(userMessage, conversationHistory, options);
            } catch (fallbackError: any) {
                console.error('[EnhancedAgentWrapper] Fallback also failed:', fallbackError);
                return `I encountered an error while processing your request: ${error.message}`;
            }
        }
    }

    /**
     * Stream processing with intelligent routing
     */
    async *streamMessage(
        userMessage: string,
        conversationHistory?: any[],
        options?: any
    ): AsyncGenerator<{
        type: 'thinking' | 'content' | 'progress' | 'result';
        content: string;
        agentType?: 'deep_research' | 'original';
        [key: string]: any;
    }> {
        try {
            // Check if this should use Deep Research streaming
            if (this.deepResearchIntegration.shouldUseDeepResearch(userMessage)) {
                console.log('[EnhancedAgentWrapper] Using Deep Research streaming');
                
                yield { 
                    type: 'progress', 
                    content: 'Initializing Deep Research process...', 
                    agentType: 'deep_research' 
                };

                for await (const update of this.deepResearchIntegration.streamMessage(userMessage)) {
                    if (update.usedDeepResearch && update.content !== 'FALLBACK_TO_ORIGINAL') {
                        yield {
                            ...update,
                            agentType: 'deep_research'
                        };
                    } else {
                        // Fallback to original streaming
                        yield { 
                            type: 'progress', 
                            content: 'Switching to standard processing...', 
                            agentType: 'original' 
                        };
                        
                        for await (const originalUpdate of this.streamWithOriginalAgent(userMessage, conversationHistory, options)) {
                            yield {
                                ...originalUpdate,
                                agentType: 'original'
                            };
                        }
                        return;
                    }
                }
            } else {
                // Use original agent streaming
                console.log('[EnhancedAgentWrapper] Using original agent streaming');
                
                for await (const update of this.streamWithOriginalAgent(userMessage, conversationHistory, options)) {
                    yield {
                        ...update,
                        agentType: 'original'
                    };
                }
            }

        } catch (error: any) {
            console.error('[EnhancedAgentWrapper] Error in enhanced streaming:', error);
            
            yield { 
                type: 'result', 
                content: `Processing error: ${error.message}`, 
                agentType: 'original' 
            };
        }
    }

    /**
     * Process with original agent (backward compatibility)
     */
    private async processWithOriginalAgent(
        userMessage: string,
        conversationHistory?: any[],
        options?: any
    ): Promise<string> {
        if (this.agentType === 'thinking') {
            const thinkingAgent = this.originalAgent as ThinkingCindyAgent;
            // ThinkingCindyAgent uses different method signature
            return await (thinkingAgent as any).processUserMessage(userMessage, conversationHistory || []);
        } else {
            const langGraphAgent = this.originalAgent as LangGraphAgent;
            
            // Create context for LangGraph agent
            const context = {
                userMessage,
                conversationHistory: conversationHistory || [],
                ...options
            };
            
            const result = await (langGraphAgent as any).invoke(context);
            return result.response || result.content || result.final_response || 'No response generated';
        }
    }

    /**
     * Stream with original agent (backward compatibility)
     */
    private async *streamWithOriginalAgent(
        userMessage: string,
        conversationHistory?: any[],
        options?: any
    ): AsyncGenerator<any> {
        if (this.agentType === 'thinking') {
            const thinkingAgent = this.originalAgent as ThinkingCindyAgent;
            
            // ThinkingCindyAgent might not have streaming, so simulate it
            try {
                const result = await (thinkingAgent as any).processUserMessage(userMessage, conversationHistory || []);
                yield { type: 'result', content: result };
            } catch (error: any) {
                yield { type: 'result', content: `Processing failed: ${error.message}` };
            }
        } else {
            const langGraphAgent = this.originalAgent as LangGraphAgent;
            
            // Check if LangGraph agent supports streaming
            if (typeof (langGraphAgent as any).stream === 'function') {
                const context = {
                    userMessage,
                    conversationHistory: conversationHistory || [],
                    ...options
                };
                
                try {
                    for await (const update of (langGraphAgent as any).stream(context)) {
                        yield update;
                    }
                } catch (streamError: any) {
                    yield { type: 'result', content: `Streaming failed: ${streamError.message}` };
                }
            } else {
                // Fallback to non-streaming
                try {
                    const context = {
                        userMessage,
                        conversationHistory: conversationHistory || [],
                        ...options
                    };
                    
                    const result = await (langGraphAgent as any).invoke(context);
                    yield { type: 'result', content: result.response || result.content || result.final_response || 'No response generated' };
                } catch (error: any) {
                    yield { type: 'result', content: `Processing failed: ${error.message}` };
                }
            }
        }
    }

    /**
     * Update settings and propagate to all components
     */
    async updateSettings(): Promise<void> {
        console.log('[EnhancedAgentWrapper] Updating settings across all components');
        
        try {
            // Update Deep Research integration
            await this.deepResearchIntegration.updateSettings();
            
            // Update original agent if it supports settings updates
            if ('updateSettings' in this.originalAgent && typeof this.originalAgent.updateSettings === 'function') {
                await (this.originalAgent as any).updateSettings();
            }

            console.log('[EnhancedAgentWrapper] Settings updated successfully');

        } catch (error) {
            console.error('[EnhancedAgentWrapper] Error updating settings:', error);
        }
    }

    /**
     * Get enhanced status information
     */
    getStatus(): {
        agentType: 'thinking' | 'langgraph';
        deepResearchStatus: any;
        originalAgentStatus?: any;
    } {
        const status = {
            agentType: this.agentType,
            deepResearchStatus: this.deepResearchIntegration.getStatus(),
            originalAgentStatus: undefined as any
        };

        // Get original agent status if available
        if ('getStatus' in this.originalAgent && typeof this.originalAgent.getStatus === 'function') {
            status.originalAgentStatus = (this.originalAgent as any).getStatus();
        }

        return status;
    }

    /**
     * Enable or disable Deep Research
     */
    setDeepResearchEnabled(enabled: boolean): void {
        this.deepResearchIntegration.setEnabled(enabled);
        console.log(`[EnhancedAgentWrapper] Deep Research ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Set fallback behavior
     */
    setFallbackEnabled(enabled: boolean): void {
        this.deepResearchIntegration.setFallbackEnabled(enabled);
        console.log(`[EnhancedAgentWrapper] Fallback to original agent ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Get the original agent (for direct access if needed)
     */
    getOriginalAgent(): ThinkingCindyAgent | LangGraphAgent {
        return this.originalAgent;
    }

    /**
     * Get the Deep Research integration (for advanced configuration)
     */
    getDeepResearchIntegration(): DeepResearchIntegration {
        return this.deepResearchIntegration;
    }
}

/**
 * Factory function to create enhanced agents with backward compatibility
 */
export function createEnhancedAgent(
    agentType: 'thinking' | 'langgraph',
    services: {
        llmProvider: LLMProvider;
        toolExecutor: LangChainToolExecutorService;
        memoryService: LangChainMemoryService;
        settingsService: SettingsService;
    }
): EnhancedAgentWrapper {
    console.log(`[BackwardCompatibility] Creating enhanced ${agentType} agent`);

    let originalAgent: ThinkingCindyAgent | LangGraphAgent;

    if (agentType === 'thinking') {
        // Use any cast since we're dealing with backward compatibility
        originalAgent = new (ThinkingCindyAgent as any)(
            services.llmProvider,
            services.memoryService,
            services.toolExecutor
        );
    } else {
        originalAgent = new LangGraphAgent({
            llmProvider: services.llmProvider,
            memoryService: services.memoryService,
            toolExecutor: services.toolExecutor
        });
    }

    return new EnhancedAgentWrapper(
        originalAgent,
        services.llmProvider,
        services.toolExecutor,
        services.settingsService,
        services.memoryService
    );
}

/**
 * Migration helper for existing codebases
 */
export class AgentMigrationHelper {
    /**
     * Check if existing agent calls can be migrated
     */
    static isCompatible(agentInstance: any): boolean {
        return agentInstance instanceof ThinkingCindyAgent || 
               agentInstance instanceof LangGraphAgent ||
               'processMessage' in agentInstance;
    }

    /**
     * Wrap existing agent with enhanced capabilities
     */
    static enhance(
        existingAgent: ThinkingCindyAgent | LangGraphAgent,
        services: {
            llmProvider: LLMProvider;
            toolExecutor: LangChainToolExecutorService;
            settingsService: SettingsService;
        }
    ): EnhancedAgentWrapper {
        return new EnhancedAgentWrapper(
            existingAgent,
            services.llmProvider,
            services.toolExecutor,
            services.settingsService
        );
    }

    /**
     * Provide migration guidelines
     */
    static getMigrationGuidelines(): string[] {
        return [
            '1. Replace direct agent instantiation with createEnhancedAgent() factory',
            '2. Update processMessage() calls - they remain compatible',
            '3. Add streamMessage() support for enhanced streaming capabilities',
            '4. Configure Deep Research settings via SettingsService',
            '5. Use setDeepResearchEnabled() to control research functionality',
            '6. Monitor status via getStatus() for both original and Deep Research capabilities',
            '7. Existing error handling remains compatible',
            '8. Performance monitoring now includes both agent types'
        ];
    }
}