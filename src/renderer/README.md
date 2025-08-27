# Renderer Process

The renderer process contains the user interface of the Cindy application, built with React, TypeScript, and Material-UI. It runs in a Chromium browser environment and handles all user interactions and visual feedback.

## Directory Structure

### 📁 `components/` - UI Components
React components that make up the user interface:

#### Core UI Components
- **`App.tsx`** - Main application component and layout
- **`ChatList.tsx`** - Conversation list and management
- **`ChatSidePanel.tsx`** - Side panel for widgets and tools
- **`ModernSettingsPanel.tsx`** - Settings configuration interface
- **`ModernDatabasePanel.tsx`** - Vector database management

#### Visualization Components  
- **`AgentFlowVisualization.tsx`** - Agent workflow timeline visualization
- **`AgentGraphVisualization.tsx`** - Agent architecture diagrams
- **`SoundReactiveBlob.tsx`** - Animated audio visualization
- **`WakeWordVisualization.tsx`** - Wake word detection indicator
- **`SpeechVisualization.tsx`** - Real-time speech visualization

#### Widget Components
- **`WeatherWidget.tsx`** - Weather information display
- **`MapsWidget.tsx`** - Interactive map display
- **`DocumentWidget.tsx`** - Document preview and interaction
- **`LinkPreview.tsx`** - URL preview cards

#### Content Components
- **`ThinkingBlock.tsx`** - AI thinking process visualization
- **`ToolBlock.tsx`** - Tool execution display
- **`StreamdownRenderer.tsx`** - Markdown rendering with streaming
- **`DocumentViewer.tsx`** - Document content viewer

#### Utility Components
- **`ToolSelector.tsx`** - Tool selection dropdown interface
- **`ThemeToggle.tsx`** - Dark/light theme switcher
- **`LLMProviderCard.tsx`** - LLM provider selection
- **`ConnectorIntegrations.tsx`** - External service integrations

### 📁 `services/` - Client-Side Services
Services that run in the renderer process:

#### `AgentFlowTracker.ts`
Tracks and manages agent workflow visualization:
- **Step Tracking**: Records agent processing steps
- **Real-time Updates**: Updates visualization in real-time
- **State Management**: Manages flow state across components
- **Event Handling**: Handles agent workflow events

#### `AudioCaptureService.ts`
Handles audio capture and processing:
- **Audio Recording**: Capture microphone input
- **Real-time Processing**: Process audio streams
- **Format Conversion**: Convert audio formats
- **Visualization Data**: Provide data for audio visualization

#### `ThinkingTokenHandler.ts`
Processes AI thinking tokens and content:
- **Token Parsing**: Extract thinking content from responses
- **Stream Processing**: Handle streaming thinking content
- **UI Updates**: Update thinking blocks in real-time

#### `ToolTokenHandler.ts`
Handles tool execution tokens and updates:
- **Tool Detection**: Detect tool usage in responses
- **Progress Tracking**: Track tool execution progress
- **Result Processing**: Process tool execution results

### 📁 `hooks/` - React Hooks
Custom React hooks for shared functionality:

#### `useSettings.ts`
Settings management hook:
- **Settings Access**: Get/set application settings
- **Real-time Updates**: React to settings changes
- **Type Safety**: Type-safe settings interface
- **Persistence**: Automatic settings persistence

#### `usePersonalizedMessages.ts`
Personalized greeting and message management:
- **Dynamic Greetings**: Time-based greetings
- **User Context**: Personalized based on usage
- **Message Variants**: Multiple greeting options

#### `useDocumentDetection.ts`
Document interaction detection:
- **Document Recognition**: Detect document-related queries
- **Context Extraction**: Extract document context
- **Action Suggestions**: Suggest document actions

### 📁 `contexts/` - React Context
React context providers for global state:

#### `ThemeContext.tsx`
Theme management context:
- **Theme State**: Current theme (dark/light)
- **Theme Switching**: Toggle between themes
- **Persistence**: Remember theme preference
- **System Detection**: Auto-detect system theme

### 📁 `utils/` - Utility Functions
Helper functions and utilities:

#### Content Processing
- **`contentProcessor.ts`** - Process and format content
- **`documentDetector.ts`** - Detect document types and content
- **`citationManager.ts`** - Manage research citations
- **`personalizedMessages.ts`** - Generate personalized messages

#### Rendering Utilities
- **`markdownRenderer.tsx`** - Enhanced markdown rendering
- **`linkParser.tsx`** - Parse and render links
- **`hashtagRenderer.tsx`** - Render hashtags (legacy)

### 📁 `styles/` - CSS Styles
Styling for components and layouts:

#### Main Styles
- **`main.css`** - Global application styles
- **`settings-sidebar.css`** - Settings panel styling
- **`database-sidebar.css`** - Database panel styling
- **`streamdown.css`** - Streaming content styles

#### Component Styles
- **`AgentFlowVisualization.css`** - Agent flow timeline styles
- **`components/`** - Individual component styles

### 📁 `store/` - Client State
Local state management for UI:

#### `store.ts`
Redux store configuration for renderer-specific state:
- **UI State**: Interface state and preferences  
- **Cache**: Client-side data caching
- **Temporary State**: Non-persistent state

### 📁 `assets/` - Static Assets
Icons, sounds, and other static resources used by the UI.

## Key Files

### `App.tsx` - Main Application
The central component that orchestrates the entire UI:

```typescript
const App: React.FC = () => {
    // State management
    const [messages, setMessages] = useState([]);
    const [isRecording, setIsRecording] = useState(false);
    
    // IPC communication
    useEffect(() => {
        ipcRenderer.on('agent-update', handleAgentUpdate);
        return () => ipcRenderer.removeAllListeners('agent-update');
    }, []);
    
    // Render main layout
    return (
        <ThemeProvider>
            <MainLayout>
                <ChatInterface />
                <SidePanel />
            </MainLayout>
        </ThemeProvider>
    );
};
```

### `index.tsx` - React Initialization
Entry point for the React application:

```typescript
const root = createRoot(document.getElementById('root')!);
root.render(
    <Provider store={store}>
        <App />
    </Provider>
);
```

### `index.html` - HTML Template
Basic HTML structure with React root element.

## Communication with Main Process

### IPC Calls
```typescript
// Send message for processing
const response = await ipcRenderer.invoke('process-message', message, conversationId);

// Get application settings
const settings = await ipcRenderer.invoke('settings-get-all');

// Vector store operations
const results = await ipcRenderer.invoke('vector-store:search', query);
```

### Event Listeners
```typescript
// Listen for agent updates
ipcRenderer.on('agent-update', (event, data) => {
    if (data.type === 'thinking') {
        updateThinkingBlocks(data.content);
    }
});

// Listen for side view data
ipcRenderer.on('side-view-data', (event, data) => {
    if (data.sideViewData.type === 'weather') {
        displayWeatherWidget(data.sideViewData.data);
    }
});
```

## State Management

### Local State (React)
```typescript
const [messages, setMessages] = useState<Message[]>([]);
const [currentConversation, setCurrentConversation] = useState<string | null>(null);
const [isProcessing, setIsProcessing] = useState(false);
```

### Global State (Redux)
```typescript
interface AppState {
    messages: Message[];
    settings: Settings;
    ui: UIState;
}

// Actions
export const addMessage = (message: Message) => ({
    type: 'ADD_MESSAGE',
    payload: message
});

// Reducers
export const messagesReducer = (state = [], action: any) => {
    switch (action.type) {
        case 'ADD_MESSAGE':
            return [...state, action.payload];
        default:
            return state;
    }
};
```

### Context State
```typescript
const ThemeContext = createContext<{
    theme: 'light' | 'dark';
    toggleTheme: () => void;
}>({
    theme: 'light',
    toggleTheme: () => {}
});
```

## Component Patterns

### Hook-based Components
```typescript
const ChatMessage: React.FC<{ message: Message }> = ({ message }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const settings = useSettings();
    
    return (
        <div className={`message ${message.role}`}>
            {/* Message content */}
        </div>
    );
};
```

### Context Consumers
```typescript
const ThemedComponent: React.FC = () => {
    const { theme, toggleTheme } = useContext(ThemeContext);
    
    return (
        <div className={`component ${theme}`}>
            <button onClick={toggleTheme}>Toggle Theme</button>
        </div>
    );
};
```

### IPC Integration
```typescript
const VectorSearchComponent: React.FC = () => {
    const [results, setResults] = useState([]);
    
    const handleSearch = async (query: string) => {
        const searchResults = await ipcRenderer.invoke('vector-store:search', query);
        setResults(searchResults);
    };
    
    return <SearchInterface onSearch={handleSearch} results={results} />;
};
```

## Error Handling

### Error Boundaries
```typescript
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }
    
    static getDerivedStateFromError(error) {
        return { hasError: true };
    }
    
    componentDidCatch(error, errorInfo) {
        console.error('React Error:', error, errorInfo);
    }
    
    render() {
        if (this.state.hasError) {
            return <ErrorFallback />;
        }
        
        return this.props.children;
    }
}
```

### Async Error Handling
```typescript
const handleAsyncOperation = async () => {
    try {
        const result = await ipcRenderer.invoke('some-operation');
        setData(result);
    } catch (error) {
        console.error('Operation failed:', error);
        setError(error.message);
    }
};
```