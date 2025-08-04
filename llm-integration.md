# Cindy - LLM Integration with OpenAI and Ollama

## Requirements

1. Switchable LLM back-ends (OpenAI cloud or Ollama local)
2. Streaming responses required
3. Consistent interface across providers
4. Error handling and fallback mechanisms
5. Configuration management
6. Performance monitoring

## Selected Technologies

### OpenAI API
- Primary cloud-based LLM provider
- GPT-4 and GPT-3.5-turbo models
- Streaming support
- Robust API with good TypeScript support

### Ollama
- Local LLM runtime
- Support for various open-source models
- REST API interface
- Cross-platform compatibility

## Implementation Architecture

```
src/
├── main/
│   ├── services/
│   │   ├── LLMRouterService.ts
│   │   ├── OpenAIProvider.ts
│   │   └── OllamaProvider.ts
│   └── utils/
│       └── TokenCounter.ts
└── renderer/
    └── components/
        └── ModelSettings.tsx
```

## Core Components

### 1. LLM Router Service (Main Interface)

```typescript
// LLMRouterService.ts
import { EventEmitter } from 'events';
import OpenAIProvider from './OpenAIProvider';
import OllamaProvider from './OllamaProvider';
import { TokenCounter } from '../utils/TokenCounter';

interface LLMConfig {
  provider: 'openai' | 'ollama' | 'auto';
  openai: {
    model: string;
    apiKey: string;
    organizationId?: string;
    temperature: number;
    maxTokens: number;
  };
  ollama: {
    model: string;
    baseUrl: string;
    temperature: number;
  };
  streaming: boolean;
  timeout: number; // in milliseconds
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
}

interface ChatResponse {
  content: string;
  finishReason: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

class LLMRouterService extends EventEmitter {
  private openaiProvider: OpenAIProvider;
  private ollamaProvider: OllamaProvider;
  private config: LLMConfig;
  private tokenCounter: TokenCounter;

  constructor(config: LLMConfig) {
    super();
    this.config = config;
    this.openaiProvider = new OpenAIProvider(config.openai);
    this.ollamaProvider = new OllamaProvider(config.ollama);
    this.tokenCounter = new TokenCounter();
  }

  async chat(messages: ChatMessage[], options?: { streaming?: boolean }): Promise<AsyncGenerator<string> | ChatResponse> {
    const streaming = options?.streaming ?? this.config.streaming;
    
    try {
      // Try primary provider first
      if (this.config.provider === 'openai') {
        return await this.chatWithProvider(this.openaiProvider, messages, streaming);
      } else if (this.config.provider === 'ollama') {
        return await this.chatWithProvider(this.ollamaProvider, messages, streaming);
      } else {
        // Auto mode - try online first, fallback to local
        try {
          return await this.chatWithProvider(this.openaiProvider, messages, streaming);
        } catch (onlineError) {
          console.warn('OpenAI failed, falling back to Ollama:', onlineError);
          return await this.chatWithProvider(this.ollamaProvider, messages, streaming);
        }
      }
    } catch (error) {
      this.emit('chatError', error);
      throw error;
    }
  }

  private async chatWithProvider(
    provider: OpenAIProvider | OllamaProvider,
    messages: ChatMessage[],
    streaming: boolean
  ): Promise<AsyncGenerator<string> | ChatResponse> {
    this.emit('chatStarted', { provider: provider.constructor.name, messages });
    
    try {
      const result = await provider.chat(messages, { streaming });
      
      if (result instanceof AsyncGenerator) {
        // Streaming response
        const streamingWrapper = async function* () {
          for await (const chunk of result) {
            yield chunk;
          }
        };
        
        this.emit('chatStreamingStarted', { provider: provider.constructor.name });
        return streamingWrapper();
      } else {
        // Non-streaming response
        this.emit('chatCompleted', { 
          provider: provider.constructor.name, 
          response: result,
          tokenCount: this.tokenCounter.countMessages(messages)
        });
        return result;
      }
    } catch (error) {
      this.emit('chatProviderError', { 
        provider: provider.constructor.name, 
        error 
      });
      throw error;
    }
  }

  async updateConfig(newConfig: Partial<LLMConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.openai) {
      await this.openaiProvider.updateConfig(newConfig.openai);
    }
    
    if (newConfig.ollama) {
      await this.ollamaProvider.updateConfig(newConfig.ollama);
    }
    
    this.emit('configUpdated', this.config);
  }

  getConfig(): LLMConfig {
    return { ...this.config };
  }

  async testConnection(provider: 'openai' | 'ollama'): Promise<boolean> {
    try {
      if (provider === 'openai') {
        return await this.openaiProvider.testConnection();
      } else {
        return await this.ollamaProvider.testConnection();
      }
    } catch (error) {
      console.error(`Failed to test connection to ${provider}:`, error);
      return false;
    }
  }

  getAvailableModels(provider: 'openai' | 'ollama'): Promise<string[]> {
    if (provider === 'openai') {
      return this.openaiProvider.getAvailableModels();
    } else {
      return this.ollamaProvider.getAvailableModels();
    }
  }
}
```

### 2. OpenAI Provider

```typescript
// OpenAIProvider.ts
import OpenAI from 'openai';
import { ChatCompletionMessageParam, ChatCompletionChunk } from 'openai/resources/chat/completions';

interface OpenAIConfig {
  model: string;
  apiKey: string;
  organizationId?: string;
  temperature: number;
  maxTokens: number;
}

class OpenAIProvider {
  private client: OpenAI | null = null;
  private config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    this.config = config;
    this.initializeClient();
  }

  private initializeClient(): void {
    if (!this.config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      organization: this.config.organizationId,
      timeout: 60000, // 60 seconds
    });
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    options: { streaming?: boolean } = {}
  ): Promise<AsyncGenerator<string> | { content: string; finishReason: string; usage?: any }> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const streaming = options.streaming ?? true;

    try {
      if (streaming) {
        const stream = await this.client.chat.completions.create({
          model: this.config.model,
          messages: messages,
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
          stream: true,
        });

        return this.streamResponse(stream);
      } else {
        const response = await this.client.chat.completions.create({
          model: this.config.model,
          messages: messages,
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
          stream: false,
        });

        return {
          content: response.choices[0]?.message?.content || '',
          finishReason: response.choices[0]?.finish_reason || 'stop',
          usage: response.usage,
        };
      }
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${error}`);
    }
  }

  private async *streamResponse(stream: AsyncIterable<ChatCompletionChunk>): AsyncGenerator<string> {
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }

  async updateConfig(newConfig: Partial<OpenAIConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    this.initializeClient();
  }

  async testConnection(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      await this.client.models.list();
      return true;
    } catch (error) {
      console.error('OpenAI connection test failed:', error);
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    // Common OpenAI models
    return [
      'gpt-4',
      'gpt-4-0613',
      'gpt-4-32k',
      'gpt-3.5-turbo',
      'gpt-3.5-turbo-0613',
      'gpt-3.5-turbo-16k',
    ];
  }
}

export default OpenAIProvider;
```

### 3. Ollama Provider

```typescript
// OllamaProvider.ts
import axios, { AxiosInstance } from 'axios';

interface OllamaConfig {
  model: string;
  baseUrl: string;
  temperature: number;
}

interface OllamaChatRequest {
  model: string;
  messages: { role: string; content: string }[];
  stream?: boolean;
  options?: {
    temperature?: number;
  };
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration: number;
  load_duration: number;
  prompt_eval_count: number;
  prompt_eval_duration: number;
  eval_count: number;
  eval_duration: number;
}

class OllamaProvider {
  private client: AxiosInstance;
  private config: OllamaConfig;

  constructor(config: OllamaConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: 120000, // 2 minutes
    });
  }

  async chat(
    messages: { role: string; content: string }[],
    options: { streaming?: boolean } = {}
  ): Promise<AsyncGenerator<string> | { content: string; finishReason: string }> {
    const streaming = options.streaming ?? true;

    try {
      if (streaming) {
        const response = await this.client.post('/api/chat', {
          model: this.config.model,
          messages: messages,
          stream: true,
          options: {
            temperature: this.config.temperature,
          },
        }, {
          responseType: 'stream',
        });

        return this.streamResponse(response.data);
      } else {
        const response = await this.client.post<OllamaChatResponse>('/api/chat', {
          model: this.config.model,
          messages: messages,
          stream: false,
          options: {
            temperature: this.config.temperature,
          },
        });

        return {
          content: response.data.message.content,
          finishReason: 'stop',
        };
      }
    } catch (error) {
      console.error('Ollama API error:', error);
      throw new Error(`Ollama API error: ${error}`);
    }
  }

  private async *streamResponse(stream: any): AsyncGenerator<string> {
    let buffer = '';
    
    for await (const chunk of stream) {
      buffer += chunk.toString();
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);
            if (data.message && data.message.content) {
              yield data.message.content;
            }
            if (data.done) {
              return;
            }
          } catch (error) {
            console.warn('Failed to parse Ollama stream chunk:', line);
          }
        }
      }
    }
  }

  async updateConfig(newConfig: Partial<OllamaConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: 120000,
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.get('/api/tags');
      return true;
    } catch (error) {
      console.error('Ollama connection test failed:', error);
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await this.client.get('/api/tags');
      return response.data.models.map((model: any) => model.name);
    } catch (error) {
      console.error('Failed to fetch Ollama models:', error);
      return [];
    }
  }
}

export default OllamaProvider;
```

## Token Management

```typescript
// TokenCounter.ts
class TokenCounter {
  // Simplified token counting - in a real implementation,
  // you would use a proper tokenizer like gpt-tokenizer or similar
  
  countMessages(messages: { role: string; content: string }[]): number {
    // Rough estimation: 1 token ≈ 4 characters
    const totalChars = messages.reduce((acc, msg) => acc + msg.content.length, 0);
    return Math.ceil(totalChars / 4);
  }

  countText(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  estimateCost(tokens: number, model: string): number {
    // Simplified cost estimation
    // In reality, this would depend on the specific model and pricing
    const costPerThousandTokens = model.includes('gpt-4') ? 0.03 : 0.0015;
    return (tokens / 1000) * costPerThousandTokens;
  }
}

export { TokenCounter };
```

## Settings Integration

```typescript
// ModelSettings.tsx
interface ModelSettingsProps {
  llmConfig: LLMConfig;
  onConfigChange: (config: Partial<LLMConfig>) => void;
  onTestConnection: (provider: 'openai' | 'ollama') => Promise<boolean>;
}

const ModelSettings: React.FC<ModelSettingsProps> = ({
  llmConfig,
  onConfigChange,
  onTestConnection
}) => {
  const [openaiTestResult, setOpenaiTestResult] = useState<{success: boolean; message: string} | null>(null);
  const [ollamaTestResult, setOllamaTestResult] = useState<{success: boolean; message: string} | null>(null);

  const testOpenAI = async () => {
    setOpenaiTestResult({success: false, message: 'Testing...'});
    try {
      const success = await onTestConnection('openai');
      setOpenaiTestResult({
        success,
        message: success ? 'Connection successful!' : 'Connection failed'
      });
    } catch (error) {
      setOpenaiTestResult({
        success: false,
        message: `Error: ${error.message}`
      });
    }
  };

  const testOllama = async () => {
    setOllamaTestResult({success: false, message: 'Testing...'});
    try {
      const success = await onTestConnection('ollama');
      setOllamaTestResult({
        success,
        message: success ? 'Connection successful!' : 'Connection failed'
      });
    } catch (error) {
      setOllamaTestResult({
        success: false,
        message: `Error: ${error.message}`
      });
    }
  };

  return (
    <div className="model-settings">
      <h3>Language Model Settings</h3>
      
      <div className="setting-group">
        <label htmlFor="llm-provider">Primary Provider</label>
        <select
          id="llm-provider"
          value={llmConfig.provider}
          onChange={(e) => onConfigChange({ provider: e.target.value as any })}
        >
          <option value="auto">Auto (Online with Local Fallback)</option>
          <option value="openai">OpenAI (Cloud)</option>
          <option value="ollama">Ollama (Local)</option>
        </select>
      </div>

      <div className="settings-section">
        <h4>OpenAI Settings</h4>
        
        <div className="setting-group">
          <label htmlFor="openai-api-key">API Key</label>
          <input
            id="openai-api-key"
            type="password"
            value={llmConfig.openai.apiKey}
            onChange={(e) => onConfigChange({ 
              openai: { ...llmConfig.openai, apiKey: e.target.value } 
            })}
            placeholder="Enter your OpenAI API key"
          />
          <button onClick={testOpenAI} disabled={!llmConfig.openai.apiKey}>
            Test Connection
          </button>
          {openaiTestResult && (
            <div className={`test-result ${openaiTestResult.success ? 'success' : 'error'}`}>
              {openaiTestResult.message}
            </div>
          )}
        </div>
        
        <div className="setting-group">
          <label htmlFor="openai-model">Model</label>
          <select
            id="openai-model"
            value={llmConfig.openai.model}
            onChange={(e) => onConfigChange({ 
              openai: { ...llmConfig.openai, model: e.target.value } 
            })}
          >
            <option value="gpt-4">GPT-4</option>
            <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
          </select>
        </div>
        
        <div className="setting-group">
          <label htmlFor="openai-temperature">
            Temperature: {llmConfig.openai.temperature}
          </label>
          <input
            id="openai-temperature"
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={llmConfig.openai.temperature}
            onChange={(e) => onConfigChange({ 
              openai: { ...llmConfig.openai, temperature: parseFloat(e.target.value) } 
            })}
          />
        </div>
      </div>

      <div className="settings-section">
        <h4>Ollama Settings</h4>
        
        <div className="setting-group">
          <label htmlFor="ollama-base-url">Base URL</label>
          <input
            id="ollama-base-url"
            type="text"
            value={llmConfig.ollama.baseUrl}
            onChange={(e) => onConfigChange({ 
              ollama: { ...llmConfig.ollama, baseUrl: e.target.value } 
            })}
            placeholder="http://localhost:11434"
          />
          <button onClick={testOllama} disabled={!llmConfig.ollama.baseUrl}>
            Test Connection
          </button>
          {ollamaTestResult && (
            <div className={`test-result ${ollamaTestResult.success ? 'success' : 'error'}`}>
              {ollamaTestResult.message}
            </div>
          )}
        </div>
        
        <div className="setting-group">
          <label htmlFor="ollama-model">Model</label>
          <input
            id="ollama-model"
            type="text"
            value={llmConfig.ollama.model}
            onChange={(e) => onConfigChange({ 
              ollama: { ...llmConfig.ollama, model: e.target.value } 
            })}
            placeholder="Enter model name (e.g., llama2, mistral)"
          />
        </div>
        
        <div className="setting-group">
          <label htmlFor="ollama-temperature">
            Temperature: {llmConfig.ollama.temperature}
          </label>
          <input
            id="ollama-temperature"
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={llmConfig.ollama.temperature}
            onChange={(e) => onConfigChange({ 
              ollama: { ...llmConfig.ollama, temperature: parseFloat(e.target.value) } 
            })}
          />
        </div>
      </div>
    </div>
  );
};
```

## Performance Considerations

### 1. Connection Management
- Persistent connections for streaming
- Connection pooling for concurrent requests
- Timeout handling for unresponsive providers

### 2. Caching Strategy
- Cache model responses for repeated queries
- Implement cache invalidation policies
- Store cached responses securely

### 3. Resource Monitoring
- Track API usage and costs
- Monitor response times
- Alert on performance degradation

## Error Handling

### 1. Retry Logic
```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
      }
    }
  }
  
  throw lastError;
}
```

### 2. Fallback Mechanisms
- Automatic switching between providers
- Graceful degradation to simpler models
- Local caching for offline scenarios

## Dependencies

```json
{
  "dependencies": {
    "openai": "^4.0.0",
    "axios": "^1.4.0"
  }
}
```

## Testing Strategy

### 1. Unit Tests
- Provider initialization
- Configuration updates
- Error handling
- Streaming functionality

### 2. Integration Tests
- End-to-end chat workflows
- Provider switching
- Fallback mechanisms
- Performance under load

### 3. Mock Testing
- Simulate API responses
- Test error conditions
- Validate retry logic
- Performance benchmarking

## Future Enhancements

1. **Multi-model Support:**
   - Simultaneous queries to multiple models
   - Result comparison and consensus
   - Model-specific routing

2. **Advanced Features:**
   - Function calling capabilities
   - Embedding generation
   - Fine-tuning support

3. **Monitoring and Analytics:**
   - Usage tracking dashboard
   - Performance metrics
   - Cost optimization suggestions