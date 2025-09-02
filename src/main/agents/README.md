# AI Agents

This directory contains the intelligent agents that power Cindy's AI capabilities. Agents are autonomous components that can understand user requests, make decisions, and execute actions using available tools.

## Agent Types

### 🧠 Main Agents

#### `LangGraphAgent.ts` 
Advanced agent using LangGraph for complex workflows:
- **State Management**: Maintains complex state across interactions
- **Graph-based Logic**: Uses directed graphs for decision making
- **Multi-step Processing**: Can handle complex, multi-step tasks
- **Tool Orchestration**: Coordinates multiple tools

#### `ToolAgent.ts`
Specialized agent for tool-based interactions:
- **Tool Focus**: Optimized for tool usage
- **Quick Responses**: Fast execution for simple tool tasks
- **Tool Selection**: Intelligent tool selection based on user intent

### 🔍 Research Agents

#### `research/` Directory
Advanced research capabilities with multiple specialized agents:

##### `DeepResearchAgent.ts`
LangGraph-based deep research agent:
- **Multi-node Architecture**: Clarification, Research, Synthesis nodes
- **Iterative Research**: Multiple rounds of information gathering
- **Source Validation**: Verifies and cross-references information
- **Comprehensive Reports**: Generates detailed research reports

##### `DeepResearchIntegration.ts`
Integration layer for research workflows:
- **Routing Logic**: Determines when to use deep research
- **Compatibility Layer**: Bridges different agent interfaces
- **Streaming Integration**: Real-time research updates
- **Error Handling**: Robust error handling for research failures

##### `DeepResearchConfig.ts`
Configuration management for research agents:
- **Research Parameters**: Max iterations, source limits, etc.
- **Tool Configuration**: Which tools to use for research
- **Quality Settings**: Research depth and accuracy settings

##### `DeepResearchState.ts`
State management for research workflows:
- **Research State**: Current research progress and context
- **Node States**: Individual node state management
- **State Transitions**: Manages transitions between research phases

##### Research Nodes (`nodes/`)
Individual components of the research workflow:

- **`ClarificationNode.ts`**: Clarifies ambiguous research requests
- **`ResearcherNode.ts`**: Conducts actual research using tools
- **`SupervisorNode.ts`**: Oversees research progress and quality
- **`SynthesisNode.ts`**: Synthesizes findings into final reports

## 🛠️ Tools System

### `tools/` Directory
Extensible tool system that agents can use:

#### Core Components
- **`ToolRegistry.ts`**: Central registry for all available tools
- **`ToolLoader.ts`**: Dynamic tool loading and initialization
- **`ToolDefinitions.ts`**: Type definitions and interfaces

#### Tool Categories

##### Search Tools (`search/`)
Web search and information retrieval:
- **`DuckDuckGoSearchTool.ts`**: Privacy-focused web search
- **`BraveSearchTool.ts`**: Brave search API integration
- **`WikipediaSearchTool.ts`**: Wikipedia article search
- **`SerpAPISearchTool.ts`**: Google search via SerpAPI
- **`TavilySearchTool.ts`**: AI-optimized search

##### Weather Tools (`weather/`)
Weather information and forecasts:
- **`AccuWeatherTool.ts`**: Current conditions and forecasts
- **Mock Data Support**: Fallback when API unavailable
- **Location Parsing**: Handles various location formats

##### Maps Tools (`maps/`)
Location visualization and geographical information:
- **`MapsDisplayTool.ts`**: Interactive map display
- **Location Search**: Finds coordinates for locations
- **Map Widget Integration**: Displays maps in UI

##### Vector Tools (`vector/`)
Semantic search and document retrieval:
- **`VectorSearchTool.ts`**: Search indexed documents
- **Semantic Matching**: Finds relevant content by meaning
- **Multi-format Support**: PDF, DOCX, MD, TXT, JSON

##### Connector Tools (`connectors/`)
Integration with external services:
- **`EmailSearchTool.ts`**: Search email content
- **`ReferenceSearchTool.ts`**: Academic reference management

## Agent Workflow

### 1. Request Processing
```typescript
async processMessage(message: string, conversationId: string) {
    // 1. Analyze user intent
    const intent = await this.analyzeIntent(message);
    
    // 2. Route to appropriate handler
    const route = await this.determineRoute(intent);
    
    // 3. Execute with context
    return await this.executeRoute(route, message, conversationId);
}
```

### 2. Tool Selection
```typescript
async selectTools(intent: UserIntent): Promise<Tool[]> {
    const availableTools = this.toolRegistry.getAvailableTools();
    return this.filterToolsByIntent(availableTools, intent);
}
```

### 3. Response Generation
```typescript
async generateResponse(context: ConversationContext): Promise<string> {
    const thinking = await this.think(context);
    return await this.formulate(thinking, context);
}
```

## Agent Communication

### IPC Integration
```typescript
// Register agent handlers
ipcMain.handle('agent:process', async (event, message, conversationId) => {
    return await cindyAgent.processMessage(message, conversationId);
});

// Streaming updates
mainWindow.webContents.send('agent-update', {
    type: 'thinking',
    content: thinkingContent
});
```

### Inter-Agent Communication
```typescript
class AgentCoordinator {
    async routeRequest(message: string): Promise<AgentResponse> {
        if (this.isResearchRequest(message)) {
            return await this.deepResearchAgent.handle(message);
        } else if (this.isToolRequest(message)) {
            return await this.toolAgent.handle(message);
        } else {
            return await this.conversationAgent.handle(message);
        }
    }
}
```

## Error Handling

### Agent-Level Errors
```typescript
try {
    const response = await this.processMessage(message);
    return { success: true, response };
} catch (error) {
    console.error('[Agent] Processing failed:', error);
    return { 
        success: false, 
        response: "I encountered an issue processing your request."
    };
}
```

### Tool-Level Errors
```typescript
try {
    const result = await tool.execute(input);
    return result;
} catch (toolError) {
    console.error(`[Tool:${tool.name}] Execution failed:`, toolError);
    return `Tool ${tool.name} is temporarily unavailable.`;
}
```

## Extending the System

### Adding New Agents
1. Extend base agent class
2. Implement required methods
3. Register with agent coordinator
4. Add routing logic

### Adding New Tools
1. Extend Tool base class
2. Implement `_call` method
3. Register with ToolRegistry
4. Add to appropriate category

### Custom Research Nodes
1. Implement node interface
2. Define input/output state
3. Add to research graph
4. Configure transitions