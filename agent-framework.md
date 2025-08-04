# Cindy - Agent Framework and State Management

## Requirements

1. Graph/orchestration library for complex workflows
2. State persistence mechanism across restarts
3. Memory schema for conversation context
4. Tool execution capabilities
5. Streaming response handling
6. Error recovery and fault tolerance

## Selected Technologies

### LangChain (Core Framework)
- Established agent framework with TypeScript support
- Flexible orchestration capabilities
- Extensible tool system
- Memory management features
- Streaming support

### Redux (State Management)
- Predictable state container
- Time-travel debugging
- Middleware support
- Serialization capabilities
- Cross-platform compatibility

## Implementation Architecture

```
src/
├── main/
│   ├── agents/
│   │   ├── CindyAgent.ts
│   │   ├── ConversationAgent.ts
│   │   └── ResearchAgent.ts
│   ├── services/
│   │   ├── AgentService.ts
│   │   ├── MemoryService.ts
│   │   └── ToolExecutorService.ts
│   ├── tools/
│   │   ├── FileSystemTool.ts
│   │   ├── WebSearchTool.ts
│   │   ├── WebCrawlTool.ts
│   │   └── EmailCalendarTool.ts
│   └── store/
│       ├── index.ts
│       ├── reducers/
│       │   ├── conversationReducer.ts
│       │   ├── agentReducer.ts
│       │   └── systemReducer.ts
│       └── middleware/
│           └── persistenceMiddleware.ts
└── renderer/
    └── components/
        └── AgentStatus.tsx
```

## Core Components

### 1. Agent Service (Main Interface)

```typescript
// AgentService.ts
import { EventEmitter } from 'events';
import { createStore, applyMiddleware } from 'redux';
import { CindyAgent } from '../agents/CindyAgent';
import { persistenceMiddleware } from '../store/middleware/persistenceMiddleware';
import { rootReducer } from '../store/reducers';
import { MemoryService } from './MemoryService';
import { ToolExecutorService } from './ToolExecutorService';

interface AgentConfig {
  maxIterations: number;
  timeout: number; // in milliseconds
  memorySize: number;
  enableStreaming: boolean;
}

class AgentService extends EventEmitter {
  private agent: CindyAgent;
  private store: any;
  private memoryService: MemoryService;
  private toolExecutor: ToolExecutorService;
  private config: AgentConfig;
  private isProcessing: boolean = false;

  constructor(config: AgentConfig) {
    super();
    this.config = config;
    
    // Initialize Redux store with persistence middleware
    this.store = createStore(
      rootReducer,
      applyMiddleware(persistenceMiddleware)
    );
    
    // Initialize services
    this.memoryService = new MemoryService(this.store);
    this.toolExecutor = new ToolExecutorService();
    
    // Initialize agent
    this.agent = new CindyAgent({
      store: this.store,
      memoryService: this.memoryService,
      toolExecutor: this.toolExecutor,
      config: this.config
    });
    
    // Subscribe to store changes
    this.store.subscribe(() => {
      this.emit('stateChanged', this.store.getState());
    });
  }

  async processUserInput(input: string, context?: any): Promise<AsyncGenerator<string> | string> {
    if (this.isProcessing) {
      throw new Error('Agent is already processing a request');
    }

    this.isProcessing = true;
    this.emit('processingStarted', { input, context });

    try {
      const result = await this.agent.process(input, context);
      
      if (typeof result === 'string') {
        this.emit('processingCompleted', { input, result });
        return result;
      } else {
        // Streaming response
        const streamingWrapper = async function* () {
          for await (const chunk of result) {
            yield chunk;
          }
        };
        
        this.emit('streamingStarted', { input });
        return streamingWrapper();
      }
    } catch (error) {
      this.emit('processingError', { input, error });
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  async executeTool(toolName: string, parameters: any): Promise<any> {
    try {
      const result = await this.toolExecutor.execute(toolName, parameters);
      this.emit('toolExecuted', { toolName, parameters, result });
      return result;
    } catch (error) {
      this.emit('toolError', { toolName, parameters, error });
      throw error;
    }
  }

  getState(): any {
    return this.store.getState();
  }

  async saveState(): Promise<void> {
    // State is automatically persisted through middleware
    // This method can be used for manual saves
    await this.store.dispatch({ type: 'SAVE_STATE' });
  }

  async loadState(): Promise<void> {
    // State is automatically loaded at startup
    // This method can be used for manual reloads
    await this.store.dispatch({ type: 'LOAD_STATE' });
  }

  async clearState(): Promise<void> {
    await this.store.dispatch({ type: 'CLEAR_STATE' });
  }

  async updateConfig(newConfig: Partial<AgentConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    this.agent.updateConfig(this.config);
    this.emit('configUpdated', this.config);
  }

  getConfig(): AgentConfig {
    return { ...this.config };
  }

  isCurrentlyProcessing(): boolean {
    return this.isProcessing;
  }
}
```

### 2. Cindy Agent (Main Agent Implementation)

```typescript
// CindyAgent.ts
import { LLMRouterService } from '../services/LLMRouterService';
import { MemoryService } from '../services/MemoryService';
import { ToolExecutorService } from '../services/ToolExecutorService';

interface AgentContext {
  conversationId: string;
  userId?: string;
  sessionId: string;
  timestamp: Date;
  preferences: any;
}

interface AgentOptions {
  store: any;
  memoryService: MemoryService;
  toolExecutor: ToolExecutorService;
  config: any;
}

class CindyAgent {
  private memoryService: MemoryService;
  private toolExecutor: ToolExecutorService;
  private config: any;
  private store: any;

  constructor(options: AgentOptions) {
    this.store = options.store;
    this.memoryService = options.memoryService;
    this.toolExecutor = options.toolExecutor;
    this.config = options.config;
  }

  async process(input: string, context?: AgentContext): Promise<AsyncGenerator<string> | string> {
    // Retrieve conversation history from memory
    const history = await this.memoryService.getConversationHistory(
      context?.conversationId || 'default'
    );

    // Prepare messages for LLM
    const messages = [
      {
        role: 'system',
        content: this.getSystemPrompt()
      },
      ...history.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      {
        role: 'user',
        content: input
      }
    ];

    // Process with LLM
    const llmRouter = new LLMRouterService(this.store.getState().llmConfig);
    
    if (this.config.enableStreaming) {
      const stream = await llmRouter.chat(messages, { streaming: true });
      
      // Handle streaming response with tool calling
      return this.handleStreamingResponse(stream, context);
    } else {
      const response = await llmRouter.chat(messages, { streaming: false }) as any;
      
      // Handle non-streaming response with tool calling
      return this.handleResponse(response.content, context);
    }
  }

  private async *handleStreamingResponse(
    stream: AsyncGenerator<string>,
    context?: AgentContext
  ): AsyncGenerator<string> {
    let buffer = '';
    
    for await (const chunk of stream) {
      buffer += chunk;
      
      // Check for tool calls in buffer
      const toolCalls = this.extractToolCalls(buffer);
      
      if (toolCalls.length > 0) {
        // Execute tools and get results
        for (const toolCall of toolCalls) {
          try {
            const result = await this.toolExecutor.execute(
              toolCall.name,
              toolCall.parameters
            );
            
            // Add tool result to conversation
            await this.memoryService.addMessage({
              conversationId: context?.conversationId || 'default',
              role: 'tool',
              content: JSON.stringify(result),
              toolName: toolCall.name,
              timestamp: new Date()
            });
          } catch (error) {
            console.error(`Tool execution failed: ${toolCall.name}`, error);
          }
        }
        
        // Continue processing with tool results
        const followUp = await this.processToolResults(toolCalls, context);
        yield followUp;
      } else {
        yield chunk;
      }
    }
  }

  private async handleResponse(
    response: string,
    context?: AgentContext
  ): Promise<string> {
    // Check for tool calls in response
    const toolCalls = this.extractToolCalls(response);
    
    if (toolCalls.length > 0) {
      // Execute tools and get results
      const results = [];
      
      for (const toolCall of toolCalls) {
        try {
          const result = await this.toolExecutor.execute(
            toolCall.name,
            toolCall.parameters
          );
          results.push({ tool: toolCall.name, result });
        } catch (error) {
          console.error(`Tool execution failed: ${toolCall.name}`, error);
          results.push({ tool: toolCall.name, error: error.message });
        }
      }
      
      // Continue processing with tool results
      return await this.processToolResults(results, context);
    } else {
      // Save response to memory
      await this.memoryService.addMessage({
        conversationId: context?.conversationId || 'default',
        role: 'assistant',
        content: response,
        timestamp: new Date()
      });
      
      return response;
    }
  }

  private extractToolCalls(text: string): Array<{name: string, parameters: any}> {
    // Extract tool calls from text using regex or JSON parsing
    // This is a simplified implementation
    
    const toolCallRegex = /<tool>(.*?)<\/tool>/g;
    const matches = [];
    let match;
    
    while ((match = toolCallRegex.exec(text)) !== null) {
      try {
        const toolCall = JSON.parse(match[1]);
        matches.push(toolCall);
      } catch (error) {
        console.warn('Failed to parse tool call:', match[1]);
      }
    }
    
    return matches;
  }

  private async processToolResults(
    results: any[],
    context?: AgentContext
  ): Promise<string> {
    // Process tool results and generate follow-up response
    const toolResults = results.map(r => 
      `Tool: ${r.tool}\nResult: ${JSON.stringify(r.result || r.error)}`
    ).join('\n\n');
    
    // Get follow-up from LLM
    const messages = [
      {
        role: 'system',
        content: this.getSystemPrompt()
      },
      {
        role: 'user',
        content: `Here are the results from the tools I executed:\n\n${toolResults}\n\nPlease provide a final response.`
      }
    ];
    
    const llmRouter = new LLMRouterService(this.store.getState().llmConfig);
    const response = await llmRouter.chat(messages, { streaming: false }) as any;
    
    // Save final response to memory
    await this.memoryService.addMessage({
      conversationId: context?.conversationId || 'default',
      role: 'assistant',
      content: response.content,
      timestamp: new Date()
    });
    
    return response.content;
  }

  private getSystemPrompt(): string {
    return `You are Cindy, an intelligent voice research assistant. 
    Your capabilities include:
    1. Voice conversation with users
    2. Creating and editing Markdown notes in a vault
    3. Performing web research and generating reports with citations
    4. Managing schedules and reminders
    
    When you need to use tools, format your response like this:
    <tool>{"name": "tool_name", "parameters": {"param1": "value1"}}</tool>
    
    Available tools:
    - create_note: Create a new Markdown note
    - edit_note: Edit an existing Markdown note
    - search_notes: Search for notes in the vault
    - web_search: Search the web for information
    - web_crawl: Crawl a specific website
    - schedule_task: Schedule a research task
    
    Always be helpful, concise, and accurate. When creating research reports, 
    include proper citations for your sources.`;
  }

  async updateConfig(newConfig: any): Promise<void> {
    this.config = { ...this.config, ...newConfig };
  }
}

export { CindyAgent };
```

### 3. Memory Service

```typescript
// MemoryService.ts
import { EventEmitter } from 'events';

interface MemoryEntry {
  id: string;
  type: 'conversation' | 'fact' | 'preference';
  key: string;
  value: any;
  timestamp: Date;
  expiresAt?: Date;
}

class MemoryService extends EventEmitter {
  private store: any;
  private memoryCache: Map<string, MemoryEntry> = new Map();

  constructor(store: any) {
    super();
    this.store = store;
  }

  async addMessage(message: {
    conversationId: string;
    role: string;
    content: string;
    toolName?: string;
    timestamp: Date;
  }): Promise<void> {
    // Add message to Redux store
    this.store.dispatch({
      type: 'ADD_MESSAGE',
      payload: message
    });

    // Also store in persistent memory
    await this.set(`conversation:${message.conversationId}:messages`, [
      ...(await this.get(`conversation:${message.conversationId}:messages`, [])),
      message
    ]);
  }

  async getConversationHistory(conversationId: string, limit?: number): Promise<any[]> {
    const messages = await this.get(`conversation:${conversationId}:messages`, []);
    
    if (limit) {
      return messages.slice(-limit);
    }
    
    return messages;
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    const entry: MemoryEntry = {
      id: this.generateId(),
      type: 'fact',
      key,
      value,
      timestamp: new Date(),
      expiresAt: ttl ? new Date(Date.now() + ttl) : undefined
    };

    this.memoryCache.set(key, entry);
    
    // Also persist to store
    this.store.dispatch({
      type: 'SET_MEMORY',
      payload: entry
    });
  }

  async get<T>(key: string, defaultValue?: T): Promise<T> {
    const entry = this.memoryCache.get(key);
    
    if (!entry) {
      return defaultValue as T;
    }
    
    // Check expiration
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this.memoryCache.delete(key);
      return defaultValue as T;
    }
    
    return entry.value as T;
  }

  async delete(key: string): Promise<void> {
    this.memoryCache.delete(key);
    
    this.store.dispatch({
      type: 'DELETE_MEMORY',
      payload: key
    });
  }

  async clearExpired(): Promise<void> {
    const now = new Date();
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        this.memoryCache.delete(key);
      }
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

export { MemoryService };
```

### 4. Redux Store Setup

```typescript
// store/index.ts
import { createStore, combineReducers, applyMiddleware } from 'redux';
import { conversationReducer } from './reducers/conversationReducer';
import { agentReducer } from './reducers/agentReducer';
import { systemReducer } from './reducers/systemReducer';
import { persistenceMiddleware } from './middleware/persistenceMiddleware';

const rootReducer = combineReducers({
  conversations: conversationReducer,
  agent: agentReducer,
  system: systemReducer
});

const store = createStore(
  rootReducer,
  applyMiddleware(persistenceMiddleware)
);

export { store, rootReducer };
```

```typescript
// store/reducers/conversationReducer.ts
interface ConversationState {
  currentConversationId: string | null;
  conversations: Record<string, any>;
}

const initialState: ConversationState = {
  currentConversationId: null,
  conversations: {}
};

const conversationReducer = (state = initialState, action: any): ConversationState => {
  switch (action.type) {
    case 'SET_CURRENT_CONVERSATION':
      return {
        ...state,
        currentConversationId: action.payload
      };
    
    case 'ADD_MESSAGE':
      const { conversationId, ...message } = action.payload;
      return {
        ...state,
        conversations: {
          ...state.conversations,
          [conversationId]: {
            ...state.conversations[conversationId],
            messages: [
              ...(state.conversations[conversationId]?.messages || []),
              message
            ]
          }
        }
      };
    
    case 'CLEAR_CONVERSATION':
      return {
        ...state,
        conversations: {
          ...state.conversations,
          [action.payload]: {
            messages: []
          }
        }
      };
    
    default:
      return state;
  }
};

export { conversationReducer };
```

```typescript
// store/middleware/persistenceMiddleware.ts
import { writeFile, readFile, existsSync } from 'fs';
import { join } from 'path';

const STATE_FILE = join(require('os').homedir(), '.cindy', 'state.json');

const persistenceMiddleware = (store: any) => (next: any) => (action: any) => {
  // Process the action
  const result = next(action);
  
  // Persist state after certain actions
  if (action.type.startsWith('ADD_') || 
      action.type.startsWith('SET_') || 
      action.type.startsWith('CLEAR_') ||
      action.type === 'SAVE_STATE') {
    
    // Debounce persistence to avoid excessive writes
    debounce(() => {
      const state = store.getState();
      saveStateToFile(state);
    }, 1000)();
  }
  
  return result;
};

let debounceTimer: NodeJS.Timeout | null = null;

const debounce = (func: () => void, delay: number) => {
  return () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(func, delay);
  };
};

const saveStateToFile = async (state: any) => {
  try {
    // Ensure directory exists
    const dir = join(require('os').homedir(), '.cindy');
    if (!existsSync(dir)) {
      require('fs').mkdirSync(dir, { recursive: true });
    }
    
    // Save state
    await new Promise<void>((resolve, reject) => {
      writeFile(STATE_FILE, JSON.stringify(state, null, 2), (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  } catch (error) {
    console.error('Failed to save state:', error);
  }
};

const loadStateFromFile = async (): Promise<any> => {
  try {
    if (!existsSync(STATE_FILE)) {
      return {};
    }
    
    const data = await new Promise<string>((resolve, reject) => {
      readFile(STATE_FILE, 'utf8', (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to load state:', error);
    return {};
  }
};

export { persistenceMiddleware, loadStateFromFile };
```

## State Persistence Strategy

### 1. Conversation State
- Messages stored with timestamps
- Conversation threading
- Context preservation across sessions

### 2. Agent Memory
- Short-term working memory (in-memory)
- Long-term persistent memory (file-based)
- TTL-based expiration for temporary data

### 3. System State
- Configuration settings
- Service statuses
- Error logs and diagnostics

## Error Handling and Recovery

### 1. Graceful Degradation
```typescript
class AgentError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean = true
  ) {
    super(message);
  }
}

const withErrorHandling = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AgentError && error.recoverable) {
      // Attempt recovery
      console.warn('Recoverable error:', error.message);
      // Implement recovery logic
    }
    throw error;
  }
};
```

### 2. State Recovery
- Automatic state validation on load
- Fallback to default state on corruption
- Incremental state updates
- Backup and restore mechanisms

## Performance Considerations

### 1. Memory Management
- Efficient data structures
- Memory pooling for frequent operations
- Garbage collection optimization
- Cache invalidation strategies

### 2. Serialization Optimization
- Selective state persistence
- Compression for large data
- Incremental updates
- Binary serialization for performance

## Testing Strategy

### 1. Unit Tests
- Agent logic and decision making
- Memory service operations
- Tool execution flows
- State persistence and recovery

### 2. Integration Tests
- End-to-end conversation flows
- Tool chaining scenarios
- State persistence across restarts
- Error recovery workflows

### 3. Load Testing
- Concurrent conversation handling
- Memory usage under load
- Response time consistency
- Resource leak detection

## Dependencies

```json
{
  "dependencies": {
    "langchain": "^0.0.190",
    "redux": "^4.2.1",
    "redux-thunk": "^2.4.2"
  }
}
```

## Future Enhancements

1. **Advanced Memory Systems:**
   - Vector-based memory retrieval
   - Associative memory networks
   - Long-term memory consolidation

2. **Multi-Agent Coordination:**
   - Specialized agents for different tasks
   - Agent communication protocols
   - Load balancing between agents

3. **Learning and Adaptation:**
   - Preference learning
   - Behavioral adaptation
   - Performance optimization