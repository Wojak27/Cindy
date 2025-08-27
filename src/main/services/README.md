# Services

This directory contains the core business logic and system integration services that power the Cindy application. Services are singleton classes that provide specific functionality across the application.

## Service Categories

### 🤖 AI & LLM Services

#### `LLMProvider.ts`
Multi-provider interface for Large Language Models:
- **Provider Support**: OpenAI GPT, Ollama local models
- **Dynamic Switching**: Runtime provider switching
- **Tool Binding**: Attach tools to models for function calling
- **Context Management**: Handles conversation context and memory
- **Rate Limiting**: Built-in request throttling
- **Error Handling**: Robust error recovery and fallbacks

#### `LangChainMemoryService.ts`
Memory management for AI conversations:
- **Conversation Memory**: Maintains context across messages
- **Memory Compression**: Summarizes old conversations
- **Context Windows**: Manages token limits efficiently
- **Memory Persistence**: Saves memory to database
- **Multi-conversation**: Separate memory per conversation

#### `LangChainVectorStoreService.ts`
Legacy vector store service (superseded by DuckDBVectorStore):
- **FAISS Integration**: Vector similarity search
- **Document Indexing**: Index various document types
- **Semantic Search**: Find relevant content by meaning

### 💾 Data & Storage Services

#### `ChatStorageService.ts`
SQLite-based conversation persistence:
- **Message Storage**: Persistent chat history
- **Conversation Management**: Organize messages by conversation
- **Search**: Full-text search across conversations
- **Metadata**: Store message metadata and context
- **Migration**: Database schema migrations
- **Cleanup**: Automatic old data cleanup

#### `DuckDBChatStorageService.ts`
Modern DuckDB-based chat storage:
- **Better Performance**: Optimized for analytics queries
- **Modern SQL**: Advanced SQL features
- **Compression**: Efficient data compression
- **Concurrent Access**: Better multi-process handling

#### `DuckDBSettingsService.ts`
Application settings with DuckDB:
- **Structured Settings**: Type-safe setting storage
- **Atomic Updates**: ACID-compliant setting changes
- **Schema Evolution**: Automatic schema updates
- **Encrypted Storage**: Sensitive data encryption

#### `DuckDBVectorStore.ts`
Advanced vector database with multiple embedding providers:
- **Multiple Providers**: OpenAI, Ollama, HuggingFace embeddings
- **No API Key Required**: Local embeddings support
- **High Performance**: Optimized vector operations
- **Directory Indexing**: Index entire directories
- **Document Support**: PDF, DOCX, MD, TXT, JSON
- **Provider Auto-detection**: Automatically chooses embedding provider

### 🎤 Voice & Audio Services

#### `SpeechToTextService.ts`
Voice recognition with multiple providers:
- **Whisper Integration**: OpenAI Whisper for offline STT
- **Microsoft Speech**: Azure Speech Services
- **Real-time Transcription**: Live audio processing
- **Language Detection**: Automatic language detection
- **Noise Reduction**: Audio preprocessing
- **Format Support**: Multiple audio formats

#### `TextToSpeechService.ts`
Voice synthesis with local and cloud options:
- **Local TTS**: Offline text-to-speech using transformers
- **Multiple Voices**: Various voice options
- **Emotion Control**: Expressive speech synthesis
- **Streaming**: Real-time audio generation
- **Caching**: Audio response caching

#### `WakeWordService.ts`
Always-on voice activation:
- **Picovoice Integration**: "Hey Cindy" wake word detection
- **Low Power**: Optimized for continuous operation
- **Sensitivity Control**: Adjustable detection threshold
- **Privacy**: All processing done locally

#### `RealTimeTranscriptionService.ts`
Live audio processing and transcription:
- **Streaming Audio**: Real-time audio capture
- **Live Transcription**: Immediate speech-to-text
- **Voice Activity Detection**: Automatic speech detection
- **Audio Visualization**: Real-time audio visualization

### 🔗 Integration Services

#### `ConnectorManagerService.ts`
Manages external service integrations:
- **Connector Registry**: Available service connectors
- **Authentication**: OAuth and API key management
- **Connection Health**: Monitor connector status
- **Data Sync**: Synchronize external data

#### `LinkPreviewService.ts`
URL preview generation:
- **Metadata Extraction**: Title, description, images
- **Caching**: Preview result caching
- **Security**: Safe URL processing
- **Multiple Formats**: Support various link types

### 🖥️ System Services

#### `ServiceManager.ts`
Centralized service initialization and management:
- **Dependency Injection**: Service dependency resolution
- **Lifecycle Management**: Service startup/shutdown
- **Service Registry**: Central service registry
- **Health Monitoring**: Service health checks
- **Configuration**: Service configuration management

#### `TrayService.ts`
System tray integration:
- **Tray Icon**: Always-visible system tray presence
- **Context Menu**: Right-click menu with actions
- **Status Indicators**: Visual connection status
- **Cross-platform**: Works on Windows, macOS, Linux

#### `AutostartService.ts`
Application auto-launch functionality:
- **System Integration**: Register with OS startup
- **User Preference**: Configurable auto-start
- **Platform Specific**: OS-appropriate integration

### 🛠️ Utility Services

#### `BackpressureController.ts`
Request throttling and rate limiting:
- **Rate Limiting**: Prevent API rate limit violations
- **Request Queuing**: Queue requests when overloaded
- **Priority Handling**: Prioritize important requests

#### `MicroChunker.ts`
Text chunking for AI processing:
- **Smart Chunking**: Preserve sentence boundaries
- **Overlap Handling**: Maintain context between chunks
- **Size Optimization**: Optimize for model token limits

#### `ProsodySmoother.ts`
Audio processing for natural speech:
- **Prosody Enhancement**: Improve speech naturalness
- **Audio Normalization**: Consistent audio levels
- **Artifact Removal**: Clean audio processing

#### `ToolTokenHandler.ts`
Token management for AI tools:
- **Token Counting**: Accurate token usage tracking
- **Budget Management**: Manage API token budgets
- **Usage Analytics**: Track token usage patterns

#### `UMLDiagramService.ts`
System diagram generation:
- **Architecture Visualization**: Generate system diagrams
- **Service Mapping**: Visualize service relationships
- **Documentation**: Automated documentation generation

#### `WhisperInitializer.ts`
Whisper model initialization:
- **Model Loading**: Initialize Whisper models
- **Performance Optimization**: Optimize for hardware
- **Error Recovery**: Robust model loading

## Service Patterns

### Singleton Pattern
```typescript
export class ServiceName {
    private static instance: ServiceName;
    
    public static getInstance(): ServiceName {
        if (!ServiceName.instance) {
            ServiceName.instance = new ServiceName();
        }
        return ServiceName.instance;
    }
    
    private constructor() {
        // Private constructor
    }
}
```

### Async Initialization
```typescript
export class AsyncService {
    private initialized = false;
    
    async initialize(): Promise<void> {
        if (this.initialized) return;
        
        // Initialization logic
        await this.setupDependencies();
        
        this.initialized = true;
    }
    
    async operation(): Promise<void> {
        await this.ensureInitialized();
        // Service operation
    }
}
```

### Error Handling
```typescript
export class RobustService {
    async operation(): Promise<Result> {
        try {
            const result = await this.performOperation();
            return { success: true, data: result };
        } catch (error) {
            console.error('[ServiceName] Operation failed:', error);
            return { success: false, error: error.message };
        }
    }
}
```

### Event Emission
```typescript
export class EventService extends EventEmitter {
    async performAction(): Promise<void> {
        this.emit('action-started');
        
        try {
            await this.doAction();
            this.emit('action-completed');
        } catch (error) {
            this.emit('action-failed', error);
        }
    }
}
```

## Service Dependencies

```
ServiceManager
├── LLMProvider
├── ChatStorageService
├── VectorStoreService
├── SpeechToTextService
├── TextToSpeechService
├── WakeWordService
├── ConnectorManagerService
└── TrayService
```

## Configuration

Services are configured through:
- **Environment Variables**: API keys, external service URLs
- **Configuration Files**: Service-specific settings
- **Database Settings**: Persistent configuration
- **Runtime Parameters**: Dynamic configuration changes

## Monitoring & Health

- **Service Health Checks**: Regular health monitoring
- **Performance Metrics**: Track service performance
- **Error Tracking**: Comprehensive error logging
- **Resource Usage**: Monitor memory and CPU usage