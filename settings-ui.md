# Cindy - Settings UI and Configuration Management

## Requirements

1. Settings UI for all configurable items
2. Activation phrase configuration
3. Model choice selection
4. Vault path management
5. Research cadence settings
6. Privacy toggles
7. Persistent configuration storage
8. Cross-platform compatibility
9. User-friendly interface

## Implementation Architecture

```
src/
├── main/
│   ├── services/
│   │   ├── SettingsService.ts
│   │   └── ConfigManager.ts
│   └── utils/
│       └── PathValidator.ts
├── renderer/
│   ├── components/
│   │   ├── SettingsModal.tsx
│   │   ├── GeneralSettings.tsx
│   │   ├── VoiceSettings.tsx
│   │   ├── ModelSettings.tsx
│   │   ├── VaultSettings.tsx
│   │   ├── ResearchSettings.tsx
│   │   └── PrivacySettings.tsx
│   ├── contexts/
│   │   └── SettingsContext.tsx
│   └── hooks/
│       └── useSettings.ts
└── shared/
    └── types/
        └── settings.types.ts
```

## Core Components

### 1. Settings Service (Main Interface)

```typescript
// SettingsService.ts
import { EventEmitter } from 'events';
import { ConfigManager } from './ConfigManager';
import { PathValidator } from '../utils/PathValidator';

interface Settings {
  // General settings
  general: {
    startAtLogin: boolean;
    minimizeToTray: boolean;
    notifications: boolean;
    language: string;
  };
  
  // Voice settings
  voice: {
    activationPhrase: string;
    wakeWordSensitivity: number;
    voiceSpeed: number;
    voicePitch: number;
    sttProvider: 'online' | 'offline' | 'auto';
    ttsProvider: 'online' | 'offline' | 'auto';
  };
  
  // LLM settings
  llm: {
    provider: 'openai' | 'ollama' | 'auto';
    openai: {
      model: string;
      apiKey: string;
      organizationId: string;
      temperature: number;
      maxTokens: number;
    };
    ollama: {
      model: string;
      baseUrl: string;
      temperature: number;
    };
  };
  
  // Vault settings
  vault: {
    path: string;
    autoIndex: boolean;
    indexSchedule: string; // cron expression
  };
  
  // Research settings
  research: {
    enabled: boolean;
    maxConcurrentTasks: number;
    dailySummaryTime: string; // cron expression
    researchInterval: string; // cron expression
    maxSourcesPerResearch: number;
    outputPath: string;
  };
  
  // Privacy settings
  privacy: {
    offlineOnlyMode: boolean;
    autoDeleteHistory: boolean;
    autoDeleteHistoryAfterDays: number;
    encryptLocalStorage: boolean;
    disableAnalytics: boolean;
  };
  
  // System settings
  system: {
    maxMemoryUsage: number; // in MB
    logLevel: 'error' | 'warn' | 'info' | 'debug';
    autoUpdate: boolean;
  };
}

class SettingsService extends EventEmitter {
  private configManager: ConfigManager;
  private settings: Settings;
  private isInitialized: boolean = false;

  constructor() {
    super();
    this.configManager = new ConfigManager();
    this.settings = this.getDefaultSettings();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load settings from persistence
      const loadedSettings = await this.configManager.load();
      
      if (loadedSettings) {
        this.settings = this.mergeSettings(this.settings, loadedSettings);
      }
      
      // Validate critical settings
      await this.validateSettings();
      
      this.isInitialized = true;
      this.emit('initialized', this.settings);
    } catch (error) {
      console.error('Failed to initialize settings service:', error);
      throw error;
    }
  }

  async get<T extends keyof Settings>(section: T): Promise<Settings[T]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return { ...this.settings[section] } as Settings[T];
  }

  async set<T extends keyof Settings>(section: T, value: Partial<Settings[T]>): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Update settings
    this.settings[section] = { ...this.settings[section], ...value } as Settings[T];
    
    // Validate updated settings
    await this.validateSection(section);
    
    // Save to persistence
    await this.save();
    
    // Emit change event
    this.emit('settingsChanged', { section, value });
  }

  async getAll(): Promise<Settings> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return JSON.parse(JSON.stringify(this.settings));
  }

  async save(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      await this.configManager.save(this.settings);
      this.emit('settingsSaved');
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  }

  async resetToDefaults(): Promise<void> {
    this.settings = this.getDefaultSettings();
    await this.save();
    this.emit('settingsReset');
  }

  async validatePath(path: string): Promise<{ valid: boolean; message?: string }> {
    return await PathValidator.validate(path);
  }

  private getDefaultSettings(): Settings {
    return {
      general: {
        startAtLogin: true,
        minimizeToTray: true,
        notifications: true,
        language: 'en-US'
      },
      
      voice: {
        activationPhrase: 'Hey Cindy',
        wakeWordSensitivity: 0.5,
        voiceSpeed: 1.0,
        voicePitch: 1.0,
        sttProvider: 'auto',
        ttsProvider: 'auto'
      },
      
      llm: {
        provider: 'auto',
        openai: {
          model: 'gpt-3.5-turbo',
          apiKey: '',
          organizationId: '',
          temperature: 0.7,
          maxTokens: 1500
        },
        ollama: {
          model: 'qwen3:8b',
          baseUrl: 'http://localhost:11434',
          temperature: 0.7
        }
      },
      
      vault: {
        path: '',
        autoIndex: true,
        indexSchedule: '0 * * * *' // Hourly
      },
      
      research: {
        enabled: true,
        maxConcurrentTasks: 3,
        dailySummaryTime: '0 9 * * *', // 9 AM daily
        researchInterval: '0 0 * * 1', // Weekly
        maxSourcesPerResearch: 10,
        outputPath: './Research'
      },
      
      privacy: {
        offlineOnlyMode: false,
        autoDeleteHistory: false,
        autoDeleteHistoryAfterDays: 30,
        encryptLocalStorage: true,
        disableAnalytics: false
      },
      
      system: {
        maxMemoryUsage: 1024, // 1GB
        logLevel: 'info',
        autoUpdate: true
      }
    };
  }

  private mergeSettings(defaultSettings: Settings, loadedSettings: Partial<Settings>): Settings {
    const merged = { ...defaultSettings };
    
    for (const [section, values] of Object.entries(loadedSettings)) {
      if (merged[section as keyof Settings] && values) {
        merged[section as keyof Settings] = {
          ...merged[section as keyof Settings],
          ...values
        };
      }
    }
    
    return merged;
  }

  private async validateSettings(): Promise<void> {
    // Validate each section
    for (const section of Object.keys(this.settings) as (keyof Settings)[]) {
      await this.validateSection(section);
    }
  }

  private async validateSection(section: keyof Settings): Promise<void> {
    switch (section) {
      case 'vault':
        if (this.settings.vault.path) {
          const validation = await this.validatePath(this.settings.vault.path);
          if (!validation.valid) {
            console.warn(`Invalid vault path: ${validation.message}`);
            // Reset to empty if invalid
            this.settings.vault.path = '';
          }
        }
        break;
      
      case 'llm':
        // Validate LLM settings
        if (this.settings.llm.provider === 'openai' && 
            !this.settings.llm.openai.apiKey) {
          console.warn('OpenAI API key is required when using OpenAI provider');
        }
        break;
      
      case 'research':
        // Validate cron expressions
        if (this.settings.research.dailySummaryTime) {
          if (!this.isValidCron(this.settings.research.dailySummaryTime)) {
            console.warn('Invalid daily summary time cron expression');
          }
        }
        break;
    }
  }

  private isValidCron(expression: string): boolean {
    // Simple validation - in a real implementation, use a proper cron validator
    return expression.split(' ').length === 5;
  }
}

export { SettingsService, Settings };
```

### 2. Config Manager

```typescript
// ConfigManager.ts
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { app } from 'electron';

class ConfigManager {
  private configPath: string;

  constructor() {
    // Determine config path based on platform
    const userDataPath = app?.getPath('userData') || 
                         join(require('os').homedir(), '.cindy');
    this.configPath = join(userDataPath, 'config.json');
  }

  async load(): Promise<any> {
    try {
      const data = await readFile(this.configPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return null
        return null;
      }
      console.error('Failed to load config:', error);
      throw error;
    }
  }

  async save(config: any): Promise<void> {
    try {
      // Ensure directory exists
      await mkdir(dirname(this.configPath), { recursive: true });
      
      // Write config file
      await writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf8');
    } catch (error) {
      console.error('Failed to save config:', error);
      throw error;
    }
  }

  async reset(): Promise<void> {
    try {
      await writeFile(this.configPath, '{}', 'utf8');
    } catch (error) {
      console.error('Failed to reset config:', error);
      throw error;
    }
  }

  getConfigPath(): string {
    return this.configPath;
  }
}

export { ConfigManager };
```

### 3. Path Validator

```typescript
// PathValidator.ts
import { stat, access, constants } from 'fs/promises';

class PathValidator {
  static async validate(path: string): Promise<{ valid: boolean; message?: string }> {
    if (!path) {
      return { valid: false, message: 'Path is required' };
    }

    try {
      // Check if path exists
      await stat(path);
      
      // Check if we have read permissions
      await access(path, constants.R_OK);
      
      return { valid: true };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { valid: false, message: 'Path does not exist' };
      } else if (error.code === 'EACCES') {
        return { valid: false, message: 'Insufficient permissions to access path' };
      } else {
        return { valid: false, message: `Invalid path: ${error.message}` };
      }
    }
  }

  static async isDirectory(path: string): Promise<boolean> {
    try {
      const stats = await stat(path);
      return stats.isDirectory();
    } catch (error) {
      return false;
    }
  }

  static async isWritable(path: string): Promise<boolean> {
    try {
      await access(path, constants.W_OK);
      return true;
    } catch (error) {
      return false;
    }
  }
}

export { PathValidator };
```

## Settings UI Components

### 1. Main Settings Modal

```typescript
// SettingsModal.tsx
import React, { useState } from 'react';
import { SettingsContext } from '../contexts/SettingsContext';
import { GeneralSettings } from './GeneralSettings';
import { VoiceSettings } from './VoiceSettings';
import { ModelSettings } from './ModelSettings';
import { VaultSettings } from './VaultSettings';
import { ResearchSettings } from './ResearchSettings';
import { PrivacySettings } from './PrivacySettings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState('general');

  if (!isOpen) return null;

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'voice', label: 'Voice' },
    { id: 'model', label: 'Models' },
    { id: 'vault', label: 'Vault' },
    { id: 'research', label: 'Research' },
    { id: 'privacy', label: 'Privacy' }
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralSettings />;
      case 'voice':
        return <VoiceSettings />;
      case 'model':
        return <ModelSettings />;
      case 'vault':
        return <VaultSettings />;
      case 'research':
        return <ResearchSettings />;
      case 'privacy':
        return <PrivacySettings />;
      default:
        return <GeneralSettings />;
    }
  };

  return (
    <SettingsContext.Consumer>
      {({ settings, updateSettings }) => (
        <div className="settings-modal">
          <div className="settings-overlay" onClick={onClose}></div>
          <div className="settings-content">
            <div className="settings-header">
              <h2>Settings</h2>
              <button className="close-button" onClick={onClose}>×</button>
            </div>
            
            <div className="settings-tabs">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            
            <div className="settings-body">
              {renderTabContent()}
            </div>
            
            <div className="settings-footer">
              <button onClick={() => updateSettings.resetToDefaults()}>
                Reset to Defaults
              </button>
              <button onClick={onClose}>Close</button>
            </div>
          </div>
        </div>
      )}
    </SettingsContext.Consumer>
  );
};

export { SettingsModal };
```

### 2. General Settings

```typescript
// GeneralSettings.tsx
import React, { useContext } from 'react';
import { SettingsContext } from '../contexts/SettingsContext';

const GeneralSettings: React.FC = () => {
  const { settings, updateSettings } = useContext(SettingsContext);

  return (
    <div className="general-settings settings-section">
      <h3>General Settings</h3>
      
      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={settings.general.startAtLogin}
            onChange={(e) => updateSettings.set('general', { startAtLogin: e.target.checked })}
          />
          Start at login
        </label>
        <div className="setting-description">
          Automatically start Cindy when you log in to your computer.
        </div>
      </div>
      
      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={settings.general.minimizeToTray}
            onChange={(e) => updateSettings.set('general', { minimizeToTray: e.target.checked })}
          />
          Minimize to system tray
        </label>
        <div className="setting-description">
          Keep Cindy running in the background when closed.
        </div>
      </div>
      
      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={settings.general.notifications}
            onChange={(e) => updateSettings.set('general', { notifications: e.target.checked })}
          />
          Show notifications
        </label>
        <div className="setting-description">
          Display notifications for important events.
        </div>
      </div>
      
      <div className="setting-group">
        <label htmlFor="language">Language</label>
        <select
          id="language"
          value={settings.general.language}
          onChange={(e) => updateSettings.set('general', { language: e.target.value })}
        >
          <option value="en-US">English (United States)</option>
          <option value="en-GB">English (United Kingdom)</option>
          <option value="es-ES">Spanish</option>
          <option value="fr-FR">French</option>
          <option value="de-DE">German</option>
        </select>
      </div>
    </div>
  );
};

export { GeneralSettings };
```

### 3. Voice Settings

```typescript
// VoiceSettings.tsx
import React, { useContext } from 'react';
import { SettingsContext } from '../contexts/SettingsContext';

const VoiceSettings: React.FC = () => {
  const { settings, updateSettings } = useContext(SettingsContext);

  return (
    <div className="voice-settings settings-section">
      <h3>Voice Settings</h3>
      
      <div className="setting-group">
        <label htmlFor="activation-phrase">Activation Phrase</label>
        <input
          id="activation-phrase"
          type="text"
          value={settings.voice.activationPhrase}
          onChange={(e) => updateSettings.set('voice', { activationPhrase: e.target.value })}
          placeholder="Say this phrase to activate Cindy"
        />
        <div className="setting-description">
          The phrase you say to activate voice mode.
        </div>
      </div>
      
      <div className="setting-group">
        <label htmlFor="wake-word-sensitivity">
          Wake Word Sensitivity: {settings.voice.wakeWordSensitivity.toFixed(2)}
        </label>
        <input
          id="wake-word-sensitivity"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={settings.voice.wakeWordSensitivity}
          onChange={(e) => updateSettings.set('voice', { 
            wakeWordSensitivity: parseFloat(e.target.value) 
          })}
        />
        <div className="setting-description">
          Lower sensitivity reduces false activations but may miss quiet commands.
        </div>
      </div>
      
      <div className="setting-group">
        <label htmlFor="voice-speed">
          Voice Speed: {settings.voice.voiceSpeed.toFixed(1)}x
        </label>
        <input
          id="voice-speed"
          type="range"
          min="0.5"
          max="2.0"
          step="0.1"
          value={settings.voice.voiceSpeed}
          onChange={(e) => updateSettings.set('voice', { 
            voiceSpeed: parseFloat(e.target.value) 
          })}
        />
      </div>
      
      <div className="setting-group">
        <label htmlFor="voice-pitch">
          Voice Pitch: {settings.voice.voicePitch.toFixed(1)}
        </label>
        <input
          id="voice-pitch"
          type="range"
          min="0.0"
          max="2.0"
          step="0.1"
          value={settings.voice.voicePitch}
          onChange={(e) => updateSettings.set('voice', { 
            voicePitch: parseFloat(e.target.value) 
          })}
        />
      </div>
      
      <div className="setting-group">
        <label htmlFor="stt-provider">Speech-to-Text Provider</label>
        <select
          id="stt-provider"
          value={settings.voice.sttProvider}
          onChange={(e) => updateSettings.set('voice', { 
            sttProvider: e.target.value as any 
          })}
        >
          <option value="auto">Auto (Online with Offline Fallback)</option>
          <option value="online">Online Only</option>
          <option value="offline">Offline Only</option>
        </select>
      </div>
      
      <div className="setting-group">
        <label htmlFor="tts-provider">Text-to-Speech Provider</label>
        <select
          id="tts-provider"
          value={settings.voice.ttsProvider}
          onChange={(e) => updateSettings.set('voice', { 
            ttsProvider: e.target.value as any 
          })}
        >
          <option value="auto">Auto (Online with Offline Fallback)</option>
          <option value="online">Online Only</option>
          <option value="offline">Offline Only</option>
        </select>
      </div>
    </div>
  );
};

export { VoiceSettings };
```

### 4. Model Settings

```typescript
// ModelSettings.tsx
import React, { useContext, useState } from 'react';
import { SettingsContext } from '../contexts/SettingsContext';

const ModelSettings: React.FC = () => {
  const { settings, updateSettings } = useContext(SettingsContext);
  const [openaiTestResult, setOpenaiTestResult] = useState<{success: boolean; message: string} | null>(null);
  const [ollamaTestResult, setOllamaTestResult] = useState<{success: boolean; message: string} | null>(null);

  const testOpenAI = async () => {
    setOpenaiTestResult({success: false, message: 'Testing...'});
    // In a real implementation, this would test the OpenAI connection
    setTimeout(() => {
      setOpenaiTestResult({
        success: !!settings.llm.openai.apiKey,
        message: settings.llm.openai.apiKey ? 'Connection successful!' : 'API key required'
      });
    }, 1000);
  };

  const testOllama = async () => {
    setOllamaTestResult({success: false, message: 'Testing...'});
    // In a real implementation, this would test the Ollama connection
    setTimeout(() => {
      setOllamaTestResult({
        success: true,
        message: 'Connection successful!'
      });
    }, 1000);
  };

  return (
    <div className="model-settings settings-section">
      <h3>Language Model Settings</h3>
      
      <div className="setting-group">
        <label htmlFor="llm-provider">Primary Provider</label>
        <select
          id="llm-provider"
          value={settings.llm.provider}
          onChange={(e) => updateSettings.set('llm', { provider: e.target.value as any })}
        >
          <option value="auto">Auto (Online with Local Fallback)</option>
          <option value="openai">OpenAI (Cloud)</option>
          <option value="ollama">Ollama (Local)</option>
        </select>
      </div>

      <div className="settings-subsection">
        <h4>OpenAI Settings</h4>
        
        <div className="setting-group">
          <label htmlFor="openai-api-key">API Key</label>
          <input
            id="openai-api-key"
            type="password"
            value={settings.llm.openai.apiKey}
            onChange={(e) => updateSettings.set('llm', { 
              openai: { ...settings.llm.openai, apiKey: e.target.value } 
            })}
            placeholder="Enter your OpenAI API key"
          />
          <button onClick={testOpenAI} disabled={!settings.llm.openai.apiKey}>
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
            value={settings.llm.openai.model}
            onChange={(e) => updateSettings.set('llm', { 
              openai: { ...settings.llm.openai, model: e.target.value } 
            })}
          >
            <option value="gpt-4">GPT-4</option>
            <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
          </select>
        </div>
        
        <div className="setting-group">
          <label htmlFor="openai-temperature">
            Temperature: {settings.llm.openai.temperature}
          </label>
          <input
            id="openai-temperature"
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={settings.llm.openai.temperature}
            onChange={(e) => updateSettings.set('llm', { 
              openai: { ...settings.llm.openai, temperature: parseFloat(e.target.value) } 
            })}
          />
        </div>
      </div>

      <div className="settings-subsection">
        <h4>Ollama Settings</h4>
        
        <div className="setting-group">
          <label htmlFor="ollama-base-url">Base URL</label>
          <input
            id="ollama-base-url"
            type="text"
            value={settings.llm.ollama.baseUrl}
            onChange={(e) => updateSettings.set('llm', { 
              ollama: { ...settings.llm.ollama, baseUrl: e.target.value } 
            })}
            placeholder="http://localhost:11434"
          />
          <button onClick={testOllama} disabled={!settings.llm.ollama.baseUrl}>
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
            value={settings.llm.ollama.model}
            onChange={(e) => updateSettings.set('llm', { 
              ollama: { ...settings.llm.ollama, model: e.target.value } 
            })}
            placeholder="Enter model name (e.g., qwen3:8b, mistral)"
          />
        </div>
        
        <div className="setting-group">
          <label htmlFor="ollama-temperature">
            Temperature: {settings.llm.ollama.temperature}
          </label>
          <input
            id="ollama-temperature"
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={settings.llm.ollama.temperature}
            onChange={(e) => updateSettings.set('llm', { 
              ollama: { ...settings.llm.ollama, temperature: parseFloat(e.target.value) } 
            })}
          />
        </div>
      </div>
    </div>
  );
};

export { ModelSettings };
```

### 5. Vault Settings

```typescript
// VaultSettings.tsx
import React, { useContext, useState } from 'react';
import { SettingsContext } from '../contexts/SettingsContext';

const VaultSettings: React.FC = () => {
  const { settings, updateSettings } = useContext(SettingsContext);
  const [pathValidation, setPathValidation] = useState<{valid: boolean; message?: string} | null>(null);

  const validateAndSetPath = async (path: string) => {
    // In a real implementation, this would validate the path
    const validation = { valid: true, message: '' };
    setPathValidation(validation);
    
    if (validation.valid) {
      updateSettings.set('vault', { path });
    }
  };

  const browseForVault = () => {
    // In a real implementation, this would open a file dialog
    console.log('Browse for vault directory');
  };

  return (
    <div className="vault-settings settings-section">
      <h3>Vault Settings</h3>
      
      <div className="setting-group">
        <label htmlFor="vault-path">Vault Path</label>
        <div className="path-input-group">
          <input
            id="vault-path"
            type="text"
            value={settings.vault.path}
            onChange={(e) => validateAndSetPath(e.target.value)}
            placeholder="Select your notes vault directory"
          />
          <button onClick={browseForVault}>Browse</button>
        </div>
        {pathValidation && !pathValidation.valid && (
          <div className="validation-error">
            {pathValidation.message}
          </div>
        )}
        <div className="setting-description">
          Select the directory where your Markdown notes are stored.
        </div>
      </div>
      
      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={settings.vault.autoIndex}
            onChange={(e) => updateSettings.set('vault', { autoIndex: e.target.checked })}
          />
          Automatically index vault content
        </label>
        <div className="setting-description">
          Keep your vault indexed for fast search. Indexing runs automatically.
        </div>
      </div>
      
      <div className="setting-group">
        <label htmlFor="index-schedule">Index Schedule</label>
        <input
          id="index-schedule"
          type="text"
          value={settings.vault.indexSchedule}
          onChange={(e) => updateSettings.set('vault', { indexSchedule: e.target.value })}
          placeholder="Cron expression (e.g., 0 * * * *)"
        />
        <div className="setting-description">
          Cron expression for automatic vault indexing (default: 0 * * * * for hourly)
        </div>
      </div>
    </div>
  );
};

export { VaultSettings };
```

### 6. Research Settings

```typescript
// ResearchSettings.tsx
import React, { useContext } from 'react';
import { SettingsContext } from '../contexts/SettingsContext';

const ResearchSettings: React.FC = () => {
  const { settings, updateSettings } = useContext(SettingsContext);

  return (
    <div className="research-settings settings-section">
      <h3>Research Settings</h3>
      
      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={settings.research.enabled}
            onChange={(e) => updateSettings.set('research', { enabled: e.target.checked })}
          />
          Enable automated research
        </label>
        <div className="setting-description">
          Allow Cindy to perform automated research tasks.
        </div>
      </div>
      
      <div className="setting-group">
        <label htmlFor="max-concurrent">
          Max Concurrent Tasks: {settings.research.maxConcurrentTasks}
        </label>
        <input
          id="max-concurrent"
          type="range"
          min="1"
          max="10"
          value={settings.research.maxConcurrentTasks}
          onChange={(e) => updateSettings.set('research', { 
            maxConcurrentTasks: parseInt(e.target.value) 
          })}
        />
      </div>
      
      <div className="setting-group">
        <label htmlFor="daily-summary-time">Daily Summary Time</label>
        <input
          id="daily-summary-time"
          type="text"
          value={settings.research.dailySummaryTime}
          onChange={(e) => updateSettings.set('research', { 
            dailySummaryTime: e.target.value 
          })}
          placeholder="Cron expression (e.g., 0 9 * * *)"
        />
        <div className="setting-description">
          Cron expression for daily summary generation (default: 0 9 * * * for 9 AM daily)
        </div>
      </div>
      
      <div className="setting-group">
        <label htmlFor="research-interval">Research Interval</label>
        <input
          id="research-interval"
          type="text"
          value={settings.research.researchInterval}
          onChange={(e) => updateSettings.set('research', { 
            researchInterval: e.target.value 
          })}
          placeholder="Cron expression (e.g., 0 0 * * 1)"
        />
        <div className="setting-description">
          Cron expression for periodic research tasks (default: 0 0 * * 1 for weekly)
        </div>
      </div>
      
      <div className="setting-group">
        <label htmlFor="max-sources">
          Max Sources Per Research: {settings.research.maxSourcesPerResearch}
        </label>
        <input
          id="max-sources"
          type="range"
          min="1"
          max="50"
          value={settings.research.maxSourcesPerResearch}
          onChange={(e) => updateSettings.set('research', { 
            maxSourcesPerResearch: parseInt(e.target.value) 
          })}
        />
      </div>
      
      <div className="setting-group">
        <label htmlFor="output-path">Research Output Path</label>
        <input
          id="output-path"
          type="text"
          value={settings.research.outputPath}
          onChange={(e) => updateSettings.set('research', { 
            outputPath: e.target.value 
          })}
          placeholder="Path for research reports"
        />
        <div className="setting-description">
          Directory where research reports will be saved.
        </div>
      </div>
    </div>
  );
};

export { ResearchSettings };
```

### 7. Privacy Settings

```typescript
// PrivacySettings.tsx
import React, { useContext } from 'react';
import { SettingsContext } from '../contexts/SettingsContext';

const PrivacySettings: React.FC = () => {
  const { settings, updateSettings } = useContext(SettingsContext);

  return (
    <div className="privacy-settings settings-section">
      <h3>Privacy Settings</h3>
      
      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={settings.privacy.offlineOnlyMode}
            onChange={(e) => updateSettings.set('privacy', { offlineOnlyMode: e.target.checked })}
          />
          Offline-only mode
        </label>
        <div className="setting-description">
          Disable all internet connectivity. All processing will be done locally.
        </div>
      </div>
      
      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={settings.privacy.autoDeleteHistory}
            onChange={(e) => updateSettings.set('privacy', { autoDeleteHistory: e.target.checked })}
          />
          Automatically delete history
        </label>
        <div className="setting-description">
          Delete conversation history after a specified period.
        </div>
      </div>
      
      {settings.privacy.autoDeleteHistory && (
        <div className="setting-group">
          <label htmlFor="delete-after">
            Delete after: {settings.privacy.autoDeleteHistoryAfterDays} days
          </label>
          <input
            id="delete-after"
            type="range"
            min="1"
            max="365"
            value={settings.privacy.autoDeleteHistoryAfterDays}
            onChange={(e) => updateSettings.set('privacy', { 
              autoDeleteHistoryAfterDays: parseInt(e.target.value) 
            })}
          />
        </div>
      )}
      
      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={settings.privacy.encryptLocalStorage}
            onChange={(e) => updateSettings.set('privacy', { encryptLocalStorage: e.target.checked })}
          />
          Encrypt local storage
        </label>
        <div className="setting-description">
          Encrypt sensitive data stored locally on your device.
        </div>
      </div>
      
      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={settings.privacy.disableAnalytics}
            onChange={(e) => updateSettings.set('privacy', { disableAnalytics: e.target.checked })}
          />
          Disable analytics
        </label>
        <div className="setting-description">
          Opt out of usage analytics and error reporting.
        </div>
      </div>
    </div>
  );
};

export { PrivacySettings };
```

## Settings Context

```typescript
// SettingsContext.tsx
import React, { createContext, useState, useEffect } from 'react';
import { SettingsService, Settings } from '../../main/services/SettingsService';

interface SettingsContextType {
  settings: Settings;
  updateSettings: {
    set: <T extends keyof Settings>(section: T, value: Partial<Settings[T]>) => Promise<void>;
    resetToDefaults: () => Promise<void>;
  };
  isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType>({
  settings: {} as Settings,
  updateSettings: {
    set: async () => {},
    resetToDefaults: async () => {}
  },
  isLoading: true
});

interface SettingsProviderProps {
  children: React.ReactNode;
}

const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>({} as Settings);
  const [isLoading, setIsLoading] = useState(true);
  const [settingsService] = useState(() => new SettingsService());

  useEffect(() => {
    const initializeSettings = async () => {
      try {
        await settingsService.initialize();
        const allSettings = await settingsService.getAll();
        setSettings(allSettings);
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to initialize settings:', error);
        setIsLoading(false);
      }
    };

    initializeSettings();

    // Listen for settings changes
    settingsService.on('settingsChanged', ({ section, value }) => {
      setSettings(prev => ({
        ...prev,
        [section]: { ...prev[section], ...value }
      }));
    });

    return () => {
      settingsService.removeAllListeners();
    };
  }, [settingsService]);

  const updateSetting = async <T extends keyof Settings>(
    section: T,
    value: Partial<Settings[T]>
  ) => {
    try {
      await settingsService.set(section, value);
    } catch (error) {
      console.error('Failed to update setting:', error);
    }
  };

  const resetToDefaults = async () => {
    try {
      await settingsService.resetToDefaults();
      const allSettings = await settingsService.getAll();
      setSettings(allSettings);
    } catch (error) {
      console.error('Failed to reset settings:', error);
    }
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings: {
          set: updateSetting,
          resetToDefaults
        },
        isLoading
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export { SettingsContext, SettingsProvider };
```

## Settings Hook

```typescript
// useSettings.ts
import { useContext } from 'react';
import { SettingsContext } from '../contexts/SettingsContext';

const useSettings = () => {
  const context = useContext(SettingsContext);
  
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  
  return context;
};

export { useSettings };
```

## Dependencies

```json
{
  "dependencies": {
    "electron": "^25.0.0"
  }
}
```

## Cross-Platform Considerations

### 1. Path Handling
- Use Electron's `app.getPath()` for platform-specific directories
- Normalize path separators
- Validate path accessibility

### 2. Configuration Storage
- Use appropriate directories for each platform:
  - macOS: `~/Library/Application Support/Cindy/`
  - Windows: `%APPDATA%\Cindy\`
  - Linux: `~/.config/Cindy/`

### 3. UI Adaptations
- Responsive design for different screen sizes
- Platform-specific UI conventions
- Keyboard shortcuts for each platform

## Testing Strategy

### 1. Unit Tests
- Settings validation logic
- Configuration persistence
- Path validation utilities
- Default settings merging

### 2. Integration Tests
- Settings UI interactions
- Configuration saving and loading
- Cross-component settings updates
- Error handling scenarios

### 3. UI Tests
- Component rendering
- User interaction flows
- Form validation
- Responsive design

## Future Enhancements

### 1. Advanced Features
- Import/export settings profiles
- Settings synchronization across devices
- Per-user settings in multi-user environments
- Settings versioning and migration

### 2. UI Improvements
- Dark/light theme support
- Keyboard navigation
- Accessibility improvements
- Customizable UI layouts

### 3. Performance Optimizations
- Settings caching
- Lazy loading of settings sections
- Batch updates
- Configuration change debouncing