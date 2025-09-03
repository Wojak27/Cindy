# Enhanced Decision Agent Architecture

A sophisticated LangGraph-based agent system that uses strategic decision-making, enhanced state management, and planning capabilities to process complex queries intelligently.

## Overview

The Enhanced Decision Agent represents a complete architectural redesign that eliminates direct response routing and tool agents in favor of a sophisticated decision-making graph. The agent maintains rich internal state, creates and executes plans, and makes strategic decisions about when to conduct research, use tools, or synthesize responses.

## Key Features

### 🧠 Strategic Decision Making
- **Decision Nodes**: Dedicated decision-making logic that evaluates context, confidence, and available information
- **Multi-criteria Analysis**: Considers confidence levels, research depth, tool availability, and time constraints
- **Dynamic Routing**: Intelligent routing between research, tool usage, response synthesis, and planning nodes

### 📋 Enhanced State Management
- **Planning System**: Creates, tracks, and updates multi-step plans
- **Thought Tracking**: Maintains current thoughts and strategic considerations
- **Decision History**: Complete audit trail of all decisions and reasoning
- **Learning Memory**: Accumulates facts and insights throughout the process

### 🔬 Intelligent Research System
- **Adaptive Depth**: Configurable research depth with intelligent stopping conditions
- **Query Generation**: Dynamic research query generation based on current context
- **Context Management**: Sophisticated document deduplication and context synthesis
- **Research History**: Tracks all research queries and results

### 🛠️ Tool Integration Framework
- **Dynamic Tool Selection**: Determines which tools are needed based on question analysis
- **Tool Result Management**: Tracks tool execution, success/failure, and performance metrics
- **Error Handling**: Robust error handling and fallback mechanisms

### 🎯 Confidence-Based Completion
- **Confidence Tracking**: Maintains confidence levels throughout the process
- **Threshold-Based Decisions**: Uses confidence thresholds to determine when to complete
- **Quality Assessment**: Self-assessment of answer quality and completeness

## Architecture Components

### Core State Interface

```typescript
export interface EnhancedAgentState {
    // Core conversation
    question: string;
    answer: string;
    context: Document[];
    
    // Planning and thoughts
    current_plan: string[];
    completed_steps: string[];
    current_thoughts: string;
    reasoning_chain: string[];
    
    // Decision tracking
    decision_history: AgentDecision[];
    current_decision: string;
    confidence_level: number;
    
    // Research state
    research_queries: string[];
    research_results: Document[];
    research_needed: boolean;
    research_depth: number;
    max_research_depth: number;
    
    // Tool usage state
    tools_needed: string[];
    tool_results: ToolResult[];
    tools_used: string[];
    
    // Meta state
    iteration_count: number;
    max_iterations: number;
    is_complete: boolean;
    error?: string;
    
    // Memory and learning
    learned_facts: string[];
    strategic_notes: string[];
}
```

### Decision Workflow Graph

```
START → Initialize Planning → Analyze Question → Make Decision
                                                      ↓
                                    ┌─────────────────┼─────────────────┐
                                    ↓                 ↓                 ↓
                            Conduct Research    Use Tools      Synthesize Response
                                    ↓                 ↓                 ↓
                                    └─────────────────┼─────────────────┘
                                                      ↓
                                            Update Plan ← (if needed)
                                                      ↓
                                            Reflect and Learn
                                                      ↓
                                    Check Completion → END
```

### Node Functions

1. **Initialize Planning**: Creates initial strategic plan and sets up agent state
2. **Analyze Question**: Deep analysis of question requirements and complexity
3. **Make Decision**: Central decision-making logic for next action
4. **Conduct Research**: Performs vector database research with intelligent querying
5. **Use Tools**: Executes required tools and manages results
6. **Synthesize Response**: Creates final response from all available information
7. **Update Plan**: Revises plan based on new information or changing circumstances
8. **Reflect and Learn**: Final reflection and knowledge extraction

## Usage Examples

### Basic Usage

```typescript
import { EnhancedDecisionAgent } from './enhanced-decision-agent';
import { LLMProvider } from '../../services/LLMProvider';

const agent = new EnhancedDecisionAgent({
    llmProvider: new LLMProvider(config),
    maxIterations: 8,
    maxResearchDepth: 3,
    confidenceThreshold: 0.8,
    verbose: true
});

await agent.initialize();

const result = await agent.processQuestion(
    "Which company was founded first, Apple or Microsoft?"
);

console.log('Answer:', result.answer);
console.log('Confidence:', result.confidence_level);
console.log('Research Conducted:', result.research_depth);
```

### Advanced Configuration

```typescript
const agent = new EnhancedDecisionAgent({
    llmProvider: llmProvider,
    vectorStore: vectorStore,
    maxIterations: 12,
    maxResearchDepth: 5,
    confidenceThreshold: 0.85,
    verbose: true
});

// Process complex multi-step question
const result = await agent.processQuestion(
    "How would climate change affect global food security, and what adaptation strategies should developing countries prioritize?"
);

// Get detailed state information
const stateSummary = agent.getAgentStateSummary(result);
console.log('State Summary:', stateSummary);
```

## Testing

### Running the Test Suite

```bash
# Basic testing with default configuration
npm run ts-node src/main/agents/scripts/test-enhanced-agent.ts

# Test with OpenAI models
npm run ts-node src/main/agents/scripts/test-enhanced-agent.ts --llm openai --embedding openai

# Quiet mode testing
npm run ts-node src/main/agents/scripts/test-enhanced-agent.ts --quiet

# Show help
npm run ts-node src/main/agents/scripts/test-enhanced-agent.ts --help
```

### Test Coverage

The test suite includes:
- **Research and Comparison**: Tests ability to research and compare information
- **Synthesis**: Tests ability to synthesize information from multiple sources
- **Planning**: Tests strategic planning and plan execution capabilities
- **Recommendations**: Tests ability to provide well-reasoned recommendations

## Configuration Options

### Agent Configuration

```typescript
interface AgentConfig {
    llmProvider: LLMProvider;        // Required: LLM provider instance
    vectorStore?: DuckDBVectorStore; // Optional: Vector database for research
    maxIterations?: number;          // Maximum processing iterations (default: 10)
    maxResearchDepth?: number;       // Maximum research depth (default: 3)
    confidenceThreshold?: number;    // Confidence threshold for completion (default: 0.8)
    verbose?: boolean;              // Enable verbose logging (default: false)
}
```

### Environment Variables

```bash
# Required for OpenAI usage
OPENAI_API_KEY=your_openai_api_key

# Optional Ollama configuration
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

## State Monitoring

### Real-time State Inspection

```typescript
// Get current agent state summary
const summary = agent.getAgentStateSummary(state);

// Monitor decision history
state.decision_history.forEach(decision => {
    console.log(`Decision: ${decision.decision_type}`);
    console.log(`Reasoning: ${decision.reasoning}`);
    console.log(`Confidence: ${decision.confidence}`);
});

// Track learning and insights
console.log('Learned Facts:', state.learned_facts);
console.log('Strategic Notes:', state.strategic_notes);
```

### Performance Metrics

The agent automatically tracks:
- **Processing Time**: Total time per question
- **Iteration Count**: Number of decision cycles
- **Research Depth**: Depth of research conducted
- **Tool Usage**: Number and types of tools used
- **Confidence Progression**: How confidence evolves
- **Decision Quality**: Success rate of decisions

## Integration

### With Existing Systems

```typescript
// Integration with existing chat system
class ChatService {
    private agent: EnhancedDecisionAgent;
    
    async processMessage(message: string): Promise<string> {
        const result = await this.agent.processQuestion(message);
        
        // Log decision process for analysis
        this.logDecisionProcess(result);
        
        return result.answer;
    }
    
    private logDecisionProcess(result: EnhancedAgentState) {
        // Log decisions, research, and learning for system improvement
    }
}
```

### With Vector Databases

```typescript
// Use existing vector store
const vectorStore = new DuckDBVectorStore(vectorConfig);
await vectorStore.initialize();

const agent = new EnhancedDecisionAgent({
    llmProvider: llmProvider,
    vectorStore: vectorStore,
    // ... other config
});
```

## Advanced Features

### Custom Decision Logic

The decision router can be customized for specific use cases:

```typescript
private routeDecision(state: EnhancedAgentState): string {
    // Custom decision logic based on your requirements
    if (state.question.includes('urgent')) {
        return 'respond'; // Skip research for urgent questions
    }
    
    if (state.confidence_level < 0.6 && state.research_depth < 2) {
        return 'research'; // Force more research for low confidence
    }
    
    return 'respond';
}
```

### Learning Integration

The agent can be extended to learn from interactions:

```typescript
// Extract learnings for training data
const learnings = result.learned_facts;
const decisions = result.decision_history;

// Use for improving future decision-making
await this.updateDecisionModel(learnings, decisions);
```

## Performance Considerations

### Optimization Tips

1. **Research Depth**: Lower research depth for faster responses
2. **Confidence Threshold**: Higher thresholds increase quality but processing time
3. **Context Management**: Vector store performance affects research speed
4. **Tool Selection**: Minimize tool usage for time-critical applications

### Memory Management

The agent automatically manages:
- Context deduplication
- Research result caching
- Decision history pruning
- Strategic note compression

## Troubleshooting

### Common Issues

**Agent Not Making Decisions**
- Check confidence threshold settings
- Verify LLM provider connectivity
- Review maximum iteration limits

**Research Not Working**
- Ensure vector store is properly initialized
- Check embedding provider configuration
- Verify research depth settings

**Tool Execution Failures**
- Implement proper error handling in tool nodes
- Add fallback mechanisms
- Monitor tool result tracking

### Debug Mode

Enable verbose logging for detailed debugging:

```typescript
const agent = new EnhancedDecisionAgent({
    // ... config
    verbose: true
});
```

This provides detailed logs of:
- Decision reasoning
- Research queries and results
- State transitions
- Error conditions

## Future Enhancements

### Planned Features

1. **Learning from Feedback**: Ability to learn from user feedback
2. **Custom Tool Integration**: Framework for adding custom tools
3. **Multi-modal Support**: Support for image and audio inputs
4. **Collaborative Agents**: Multiple agents working together
5. **Performance Analytics**: Detailed performance monitoring

### Extension Points

The architecture is designed for extensibility:
- Custom nodes can be added to the graph
- Decision logic can be customized
- State management can be extended
- Tool integration framework supports custom tools

## Contributing

To extend the Enhanced Decision Agent:

1. Add new node functions following the existing pattern
2. Update the state interface if needed
3. Modify the decision router for new routing logic
4. Add tests for new functionality
5. Update documentation

The agent is designed to be a foundation for sophisticated AI reasoning systems and can be adapted for various use cases requiring strategic decision-making and planning capabilities.