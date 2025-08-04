# Cindy - Voice Research Assistant Architecture

## High-Level Architecture

Cindy is built on Electron React Boilerplate with TypeScript, providing a cross-platform desktop application that runs in the system tray. The architecture is organized into several key components:

### Core Components

1. **Electron Main Process**
   - Manages the application lifecycle
   - Handles system tray integration
   - Coordinates communication between services

2. **Tray Application**
   - System tray icon and menu
   - Settings UI
   - Status indicators

3. **Voice Processing Service**
   - Wake-word detection
   - Speech-to-Text (STT) pipeline
   - Text-to-Speech (TTS) pipeline

4. **LLM Router Service**
   - Switches between OpenAI and Ollama backends
   - Manages API connections and authentication
   - Handles streaming responses

5. **Vector Store Service**
   - Local vector database for vault content
   - Semantic search capabilities
   - Index management

6. **Scheduler Service**
   - Automated research tasks
   - Daily summary generation
   - Task queuing and execution

7. **Settings Service**
   - Configuration management
   - User preferences storage
   - Security settings

### Key Modules

1. **Wake-word Detection**
   - Uses lightweight engine for always-on listening
   - Supports hot-swapping of activation phrases
   - Minimal CPU usage when armed

2. **Speech Processing**
   - Online (cloud) and offline (local) pipelines
   - Automatic fallback mechanisms
   - Latency optimization

3. **LLM Integration**
   - OpenAI API integration
   - Ollama local model support
   - Streaming response handling

4. **Agent Framework**
   - Conversation state management
   - Tool execution orchestration
   - Memory persistence

5. **Tool Layer**
   - Safe file I/O operations
   - Web search and crawling
   - Markdown generation with citations

6. **Vector Store**
   - Embedded vector database
   - Vault content indexing
   - Semantic retrieval

7. **Scheduler**
   - Research task automation
   - Daily summary generation
   - Job management

## Data Flow

1. User speaks activation phrase → Wake-word detection triggers
2. Voice captured → STT converts to text
3. Text sent to LLM router → Selects appropriate backend
4. LLM processes request → May call tools (file operations, web search)
5. Response sent to TTS → Converts to speech
6. Results saved to vector store and file system
7. Conversation state persisted for future sessions

## Cross-Platform Considerations

- Electron provides consistent API across macOS, Windows, and Linux
- Platform-specific implementations for autostart and system integration
- Uniform UI experience with native look and feel