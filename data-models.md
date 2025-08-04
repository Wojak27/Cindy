# Cindy - Data Models and Persistence Strategy

## Data Models

### 1. Conversation Models

```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  tokens?: number;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
}

interface ConversationContext {
  conversationId: string;
  activeTools: ActiveTool[];
  memory: Record<string, any>;
  preferences: UserPreferences;
}
```

### 2. Vault and File Models

```typescript
interface Note {
  id: string;
  title: string;
  content: string;
  path: string;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  wordCount: number;
}

interface VaultConfig {
  path: string;
  name: string;
  lastIndexed: Date;
  indexingStatus: 'idle' | 'indexing' | 'completed' | 'error';
}

interface Document {
  id: string;
  title: string;
  content: string;
  path: string;
  embedding: number[];
  createdAt: Date;
  updatedAt: Date;
  sourceUrl?: string;
}
```

### 3. Research Models

```typescript
interface ResearchTask {
  id: string;
  topic: string;
  schedule: string; // cron expression
  lastRun?: Date;
  nextRun: Date;
  status: 'active' | 'paused' | 'completed';
  outputFolder: string;
}

interface ResearchReport {
  id: string;
  taskId: string;
  topic: string;
  content: string;
  sources: Source[];
  createdAt: Date;
  filePath: string;
}

interface Source {
  url: string;
  title: string;
  excerpt: string;
  retrievedAt: Date;
}
```

### 4. Settings Models

```typescript
interface UserPreferences {
  // Voice settings
  activationPhrase: string;
  wakeWordSensitivity: number;
  voiceSpeed: number;
  voicePitch: number;
  
  // LLM settings
  defaultProvider: 'openai' | 'ollama';
  openaiModel: string;
  ollamaModel: string;
  temperature: number;
  maxTokens: number;
  
  // Vault settings
  vaultPath: string;
  autoIndexVault: boolean;
  
  // Research settings
  researchSchedule: string;
  dailySummaryTime: string;
  enableWebSearch: boolean;
  
  // Privacy settings
  offlineOnlyMode: boolean;
  autoDeleteHistory: boolean;
  encryptLocalStorage: boolean;
  
  // System settings
  startAtLogin: boolean;
  minimizeToTray: boolean;
  notifications: boolean;
}

interface EncryptedSecrets {
  openaiApiKey: string; // encrypted
  openaiOrganizationId: string; // encrypted
}
```

### 5. State Management Models

```typescript
interface ApplicationState {
  conversations: Record<string, Conversation>;
  currentConversationId: string | null;
  vault: VaultConfig;
  researchTasks: Record<string, ResearchTask>;
  settings: UserPreferences;
  system: SystemStatus;
}

interface SystemStatus {
  isListening: boolean;
  isProcessing: boolean;
  isOnline: boolean;
  cpuUsage: number;
  memoryUsage: number;
  lastError?: string;
}
```

## Persistence Strategy

### 1. Local Storage (Unencrypted)

For non-sensitive data that needs fast access:

- Current conversation state
- UI preferences
- Vault configuration
- Research task schedules
- Application settings (non-sensitive)

### 2. Encrypted Storage

For sensitive data using platform-specific secure storage:

- API keys (OpenAI)
- Organization IDs
- Encrypted conversation history (if enabled)

### 3. File System Storage

For larger data and user content:

- Conversation history (as JSON files)
- Vault notes (Markdown files)
- Research reports (Markdown files)
- Vector database (SQLite with vector extension)
- Application logs

### 4. Storage Locations

#### Cross-Platform Paths:
- **macOS**: `~/Library/Application Support/Cindy/`
- **Windows**: `%APPDATA%\Cindy\`
- **Linux**: `~/.config/Cindy/`

#### Directory Structure:
```
Cindy/
├── config/
│   ├── settings.json
│   └── secrets.json (encrypted)
├── data/
│   ├── conversations/
│   │   ├── conversation-1.json
│   │   └── conversation-2.json
│   ├── vault/
│   │   ├── notes/
│   │   └── index.sqlite
│   └── research/
│       ├── topic-1/
│       │   ├── 2025-08-01.md
│       │   └── 2025-08-02.md
│       └── tasks.json
├── logs/
│   ├── app.log
│   └── error.log
└── cache/
    └── embeddings/
```

### 5. Data Serialization

- **JSON**: For configuration, settings, and structured data
- **Markdown**: For notes and research reports
- **SQLite**: For vector database and indexed content
- **Binary**: For encrypted secrets

### 6. Backup and Recovery

- Automatic daily backups of configuration and conversation history
- Export/import functionality for settings and conversations
- Versioned storage for important data
- Recovery mechanism for corrupted data

### 7. Performance Considerations

- Lazy loading of conversation history
- Pagination for large datasets
- In-memory caching for frequently accessed data
- Background indexing for vault content
- Efficient serialization/deserialization