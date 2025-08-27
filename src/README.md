# Source Code Directory

This directory contains the main source code for the Cindy AI Voice Assistant, organized into the core components of the Electron application.

## Directory Structure

### 📁 `main/` - Main Process (Node.js)
The Electron main process that handles system integration, AI services, and business logic. This process runs in a Node.js environment and manages:

- **System Integration**: File system access, OS APIs, window management
- **AI Services**: LLM providers, agents, tool execution
- **Data Management**: Database operations, settings, chat storage
- **Network Services**: API calls, web searches, external integrations

### 📁 `renderer/` - Renderer Process (React)
The Electron renderer process containing the user interface built with React. This process runs in a Chromium browser environment and provides:

- **User Interface**: React components, Material-UI styling
- **State Management**: Redux store, actions, reducers
- **User Interaction**: Forms, voice controls, visualization
- **Client Services**: UI-specific logic and utilities

### 📁 `shared/` - Shared Code
Common types, interfaces, and utilities used by both main and renderer processes:

- **Type Definitions**: Shared TypeScript interfaces
- **Constants**: Application-wide constants
- **Utilities**: Helper functions used across processes

### 📁 `store/` - Redux State Management
Centralized state management for the application:

- **Actions**: Redux action creators
- **Reducers**: State update logic
- **Middleware**: Custom middleware for persistence, logging
- **Selectors**: State selection utilities (when present)

## Inter-Process Communication (IPC)

The main and renderer processes communicate through Electron's IPC system:

```typescript
// Main process - registering handlers
ipcMain.handle('process-message', async (event, message, conversationId) => {
    return await cindyAgent.processMessage(message, conversationId);
});

// Renderer process - calling handlers
const result = await ipcRenderer.invoke('process-message', message, conversationId);
```

## Key Files

- **`main/main.ts`** - Entry point for the main process
- **`renderer/App.tsx`** - Main React application component
- **`renderer/index.tsx`** - React app initialization
- **`shared/AgentFlowStandard.ts`** - Standardized agent workflow definitions

## Development Workflow

1. **Main Process Development**: Business logic, services, AI agents
2. **Renderer Process Development**: UI components, user experience
3. **IPC Integration**: Communication between processes
4. **Testing**: Unit tests for services, integration tests for workflows
5. **Building**: TypeScript compilation and bundling

## Architecture Principles

- **Separation of Concerns**: Clean separation between UI and business logic
- **Service-Oriented Design**: Modular services with clear interfaces
- **Type Safety**: Full TypeScript coverage with strict typing
- **Async/Await**: Modern asynchronous programming patterns
- **Error Handling**: Comprehensive error handling and logging