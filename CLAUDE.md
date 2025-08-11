# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cindy is an always-on, cross-platform voice research assistant built with Electron, React, and TypeScript. It uses wake word detection for hands-free activation and integrates with multiple LLM providers (OpenAI, Ollama) for conversational AI capabilities.

## Essential Commands

### Development
- `npm run dev` - Start both main and renderer processes with hot reload
- `npm run dev:main` - Main process only (Node.js backend)
- `npm run dev:renderer` - Renderer process only (React UI on port 3004)

### Building & Testing
- `npm run build` - Build production bundles
- `npm test` - Run all tests
- `npm run test:unit` - Unit tests only
- `npm run test:watch` - Watch mode for TDD
- `npm run lint` - Check TypeScript linting
- `npm run lint:fix` - Auto-fix linting issues

### Packaging
- `npm run package` - Package for current platform
- `npm run package:all` - Package for macOS, Windows, and Linux
- `npm run release` - Build and publish release

## Architecture

### Process Architecture
The application uses Electron's multi-process architecture:

- **Main Process** (`/src/main/`): Node.js environment handling system integration, services, and business logic
- **Renderer Process** (`/src/renderer/`): React UI with Redux state management
- **IPC Communication**: Extensive use of Electron IPC channels for process communication

### Service Layer Architecture
Core functionality is implemented as services in `/src/main/services/`:

- **LLMRouterService**: Routes between OpenAI and Ollama based on configuration
- **CindyAgent**: Main conversational agent orchestrating LLM interactions and tool execution
- **VectorStoreService**: FAISS-based semantic search and document indexing
- **ChatStorageService**: SQLite-based conversation persistence
- **SpeechToTextService**: Audio transcription using Whisper/Microsoft Speech SDK
- **WakeWordService**: Always-on voice activation using Picovoice Porcupine

### Data Flow
```
Voice Input → Wake Word Detection → Audio Capture → Speech-to-Text →
LLM Processing (OpenAI/Ollama) → Agent Tool Execution → 
Response Generation → Text-to-Speech → UI Update & Storage
```

### Key Architectural Patterns
- **Repository Pattern**: Data persistence through service classes
- **Strategy Pattern**: LLM provider selection
- **Plugin Architecture**: Extensible tool system for agent capabilities
- **Redux Middleware**: Custom persistence middleware for state management

## Development Guidelines

### TypeScript Path Aliases
The project uses path aliases for cleaner imports:
- `@main/*` - Main process modules
- `@renderer/*` - Renderer process modules  
- `@shared/*` - Shared types and utilities

### IPC Channels
All IPC communication follows the pattern defined in `/src/shared/ipc.ts`. Main handlers are registered in `/src/main/main.ts`.

### Adding New Features
1. **New Service**: Create in `/src/main/services/` and initialize in main.ts
2. **New Tool**: Add to `/src/main/services/tools/` following existing tool patterns
3. **UI Components**: Create in `/src/renderer/components/` with MUI styling
4. **Redux State**: Update store slices in `/src/store/slices/`

### Database Operations
- Chat storage uses SQLite via `ChatStorageService`
- Vector embeddings stored via `VectorStoreService` 
- Settings persisted through `SettingsService` with secure encryption

### Audio Pipeline
The audio system requires careful handling:
- Wake word detection runs continuously in background
- Audio capture triggered by wake word or manual activation
- Streaming transcription for real-time feedback
- Response audio played through system speakers

## Important Considerations

### Performance
- Main process services are CPU-intensive (STT, embeddings)
- Use IPC sparingly for large data transfers
- Vector store operations can be memory-intensive

### Security
- API keys stored encrypted in settings
- No credentials in code or version control
- Secure IPC channel validation

### Platform Differences
- Wake word detection may vary by platform
- Audio device handling differs between OS
- Package signing required for distribution
- ⚙️ [STREAMING] Phase 3: Executing tools...
[LangChainToolExecutorService] Executing tool: web_search { input: 'information about hi' }
[LangChainToolExecutorService] Tool web_search failed: Error: DDG detected an anomaly in the request, you are likely making requests too quickly.
    at search (/Users/karwo09/code/voice-assistant/node_modules/duck-duck-scrape/lib/search/search.js:80:15)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)
    at async DuckDuckGoSearch._call (/Users/karwo09/code/voice-assistant/node_modules/@langchain/community/dist/tools/duckduckgo_search.cjs:110:29)
    at async DuckDuckGoSearch.call (/Users/karwo09/code/voice-assistant/node_modules/@langchain/core/dist/tools/index.cjs:156:22)
    at async LangChainToolExecutorService.executeTool (/Users/karwo09/code/voice-assistant/src/main/services/LangChainToolExecutorService.ts:175:28)
    at async ThinkingCindyAgent.processStreaming (/Users/karwo09/code/voice-assistant/src/main/agents/ThinkingCindyAgent.ts:389:40)
    at async /Users/karwo09/code/voice-assistant/src/main/main.ts:1490:38
    at async WebContents.<anonymous> (node:electron/js2c/browser_init:2:89137)