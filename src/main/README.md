# Main Process

The main process is the heart of the Cindy application, running in a Node.js environment and handling all system-level operations, AI processing, and business logic.

## Directory Structure

### 📁 `agents/` - AI Agents & Tools
Intelligent agents and tools that power Cindy's capabilities:

- **Agent Types**: Different AI agents for various tasks (research, tools, conversation)
- **Tool System**: Extensible tool registry with search, weather, maps, etc.
- **Research Workflows**: Deep research agents using LangGraph for complex workflows
- **Tool Categories**: Organized tools by functionality (search, weather, maps, connectors)

### 📁 `connectors/` - External Service Integrations
Connectors for integrating with external services and platforms:

- **Email Connectors**: Gmail, Outlook integration
- **Reference Managers**: Zotero, Mendeley integration
- **Base Connector**: Abstract base class for all connectors
- **Type Definitions**: Shared types for connector implementations

### 📁 `prompts/` - AI Prompts
Centralized prompt management for AI interactions:

- **Agent Prompts**: System prompts for different agent types
- **Template System**: Reusable prompt templates
- **Context Management**: Dynamic prompt construction with context

### 📁 `services/` - Core Business Logic
The service layer that implements core functionality:

#### AI & LLM Services
- **LLMProvider**: Multi-provider interface (OpenAI, Ollama, etc.)
- **LangChainServices**: Memory management and vector operations
- **ServiceManager**: Centralized service initialization and management

#### Storage & Data
- **ChatStorageService**: SQLite-based conversation persistence
- **DuckDBServices**: Modern DuckDB-based storage and settings
- **VectorStore**: Semantic search and document indexing

#### Voice & Audio
- **SpeechToTextService**: Voice recognition with multiple providers
- **TextToSpeechService**: Voice synthesis with local and cloud options
- **WakeWordService**: Always-on voice activation
- **RealTimeTranscriptionService**: Live audio processing

#### System Integration
- **TrayService**: System tray integration
- **AutostartService**: Application auto-launch
- **LinkPreviewService**: URL preview generation

### 📁 `stubs/` - TypeScript Stubs
TypeScript declaration files for external libraries without proper types.

### 📁 `utils/` - Utilities
Helper classes and utilities for system-level operations:

- **ConfigManager**: Configuration management
- **PathValidator**: File path validation and security
- **PlatformDetector**: Cross-platform compatibility utilities
- **TokenCounter**: Token counting for AI models

## Key Files

- **`main.ts`** - Application entry point and IPC handler registration
- **`menu.ts`** - Application menu definition
- **`preload.ts`** - Preload script for secure renderer communication
- **`index.ts`** - Module exports for the main process

## Architecture Patterns

### Service Pattern
Services are singleton classes that encapsulate specific functionality:

```typescript
export class ChatStorageService {
    private static instance: ChatStorageService;
    
    public static getInstance(): ChatStorageService {
        if (!ChatStorageService.instance) {
            ChatStorageService.instance = new ChatStorageService();
        }
        return ChatStorageService.instance;
    }
}
```

### Agent Pattern
Agents are intelligent components that can make decisions and use tools:

```typescript
export class CindyAgent {
    async processMessage(message: string, conversationId: string): Promise<string> {
        const route = await this.determineRoute(message);
        return await this.executeRoute(route, message, conversationId);
    }
}
```

### Tool Pattern
Tools are reusable components that agents can invoke:

```typescript
export class WeatherTool extends Tool {
    name = 'weather';
    description = 'Get weather information for any location';
    
    async _call(input: string): Promise<string> {
        return await this.getWeatherData(input);
    }
}
```

## IPC Handlers

The main process exposes functionality to the renderer through IPC handlers:

```typescript
// Message processing
ipcMain.handle('process-message', async (event, message, conversationId) => {
    return await cindyAgent.processMessage(message, conversationId);
});

// Settings management
ipcMain.handle('settings-get', async (event, key) => {
    return await settingsService.get(key);
});

// Vector operations
ipcMain.handle('vector-store:search', async (event, query, options) => {
    return await vectorStore.search(query, options);
});
```

## Error Handling

Comprehensive error handling with logging:

```typescript
try {
    const result = await service.performOperation();
    return { success: true, data: result };
} catch (error) {
    console.error('[ServiceName] Operation failed:', error);
    return { success: false, error: error.message };
}
```

## Security Considerations

- **Input Validation**: All user inputs are validated and sanitized
- **Path Security**: File paths are validated to prevent directory traversal
- **API Key Management**: Secure storage and handling of API credentials
- **IPC Security**: Controlled communication between processes