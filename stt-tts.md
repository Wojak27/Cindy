# Cindy - STT/TTS Pipeline Architecture

## Requirements

1. Online (cloud) and offline (local) support
2. Low latency (< 1s round-trip for online mode)
3. Cross-platform compatibility
4. Fallback mechanisms between online and offline
5. High accuracy for voice conversations
6. Support for multiple languages

## Speech-to-Text (STT) Pipeline

### Online STT - Azure Cognitive Services

**Reasons for selection:**
- High accuracy
- Low latency
- Good TypeScript support
- Reliable uptime
- Speaker diarization capabilities

### Offline STT - Whisper.cpp

**Reasons for selection:**
- Runs locally without internet
- Good accuracy with small models
- Cross-platform support
- Can be optimized for performance
- Pre-trained models available

### Implementation Architecture

```
src/
├── main/
│   ├── services/
│   │   ├── SpeechToTextService.ts
│   │   ├── OnlineSTTEngine.ts
│   │   └── OfflineSTTEngine.ts
│   └── utils/
│       └── AudioBufferManager.ts
└── renderer/
    └── components/
        └── SpeechSettings.tsx
```

### Core Components

#### 1. SpeechToTextService (Main Interface)

```typescript
// SpeechToTextService.ts
import { EventEmitter } from 'events';
import OnlineSTTEngine from './OnlineSTTEngine';
import OfflineSTTEngine from './OfflineSTTEngine';
import { AudioBufferManager } from '../utils/AudioBufferManager';

interface STTConfig {
  provider: 'online' | 'offline' | 'auto';
  language: string;
  autoPunctuation: boolean;
  profanityFilter: boolean;
  offlineModel: 'tiny' | 'base' | 'small' | 'medium';
}

class SpeechToTextService extends EventEmitter {
  private onlineEngine: OnlineSTTEngine;
  private offlineEngine: OfflineSTTEngine;
  private audioBuffer: AudioBufferManager;
  private config: STTConfig;
  private isRecording: boolean = false;

  constructor(config: STTConfig) {
    super();
    this.config = config;
    this.onlineEngine = new OnlineSTTEngine(config);
    this.offlineEngine = new OfflineSTTEngine(config);
    this.audioBuffer = new AudioBufferManager();
  }

  async startRecording(): Promise<void> {
    if (this.isRecording) return;
    
    try {
      await this.setupAudioCapture();
      this.isRecording = true;
      this.emit('recordingStarted');
    } catch (error) {
      console.error('Failed to start recording:', error);
      throw error;
    }
  }

  async stopRecording(): Promise<void> {
    if (!this.isRecording) return;
    
    try {
      await this.teardownAudioCapture();
      this.isRecording = false;
      this.emit('recordingStopped');
    } catch (error) {
      console.error('Failed to stop recording:', error);
      throw error;
    }
  }

  async transcribe(audioData: ArrayBuffer): Promise<string> {
    try {
      // Try online engine first if configured
      if (this.config.provider === 'online' || this.config.provider === 'auto') {
        try {
          const result = await this.onlineEngine.transcribe(audioData);
          this.emit('transcriptionSuccess', { source: 'online', text: result });
          return result;
        } catch (onlineError) {
          console.warn('Online STT failed, falling back to offline:', onlineError);
          
          // Fallback to offline if auto mode or specifically offline
          if (this.config.provider === 'auto' || this.config.provider === 'offline') {
            const result = await this.offlineEngine.transcribe(audioData);
            this.emit('transcriptionSuccess', { source: 'offline', text: result });
            return result;
          }
          
          throw onlineError;
        }
      } else {
        // Use offline engine directly
        const result = await this.offlineEngine.transcribe(audioData);
        this.emit('transcriptionSuccess', { source: 'offline', text: result });
        return result;
      }
    } catch (error) {
      this.emit('transcriptionError', error);
      throw error;
    }
  }

  async updateConfig(newConfig: Partial<STTConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.provider || newConfig.offlineModel) {
      await this.onlineEngine.updateConfig(this.config);
      await this.offlineEngine.updateConfig(this.config);
    }
    
    this.emit('configUpdated', this.config);
  }

  getConfig(): STTConfig {
    return { ...this.config };
  }
}
```

#### 2. Online STT Engine (Azure)

```typescript
// OnlineSTTEngine.ts
import {
  SpeechConfig,
  AudioConfig,
  SpeechRecognizer,
  SpeechRecognitionResult
} from 'microsoft-cognitiveservices-speech-sdk';

class OnlineSTTEngine {
  private speechConfig: SpeechConfig | null = null;
  private recognizer: SpeechRecognizer | null = null;
  private apiKey: string;
  private region: string;

  constructor(private config: STTConfig) {
    this.apiKey = ''; // Will be loaded from secure storage
    this.region = 'westus'; // Default region
  }

  async initialize(): Promise<void> {
    try {
      this.speechConfig = SpeechConfig.fromSubscription(this.apiKey, this.region);
      this.speechConfig.speechRecognitionLanguage = this.config.language;
      
      // Configure recognition parameters
      this.speechConfig.enableDictation();
      
      if (this.config.autoPunctuation) {
        this.speechConfig.enableAudioLogging();
      }
    } catch (error) {
      console.error('Failed to initialize online STT engine:', error);
      throw error;
    }
  }

  async transcribe(audioData: ArrayBuffer): Promise<string> {
    if (!this.speechConfig) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      try {
        const audioConfig = AudioConfig.fromWavFileInput(audioData);
        const recognizer = new SpeechRecognizer(this.speechConfig!, audioConfig);

        recognizer.recognizeOnceAsync(
          (result: SpeechRecognitionResult) => {
            recognizer.close();
            if (result.reason === 3) { // RecognizedSpeech
              resolve(result.text);
            } else {
              reject(new Error(`Speech recognition failed: ${result.reason}`));
            }
          },
          (error: any) => {
            recognizer.close();
            reject(new Error(`Speech recognition error: ${error}`));
          }
        );
      } catch (error) {
        reject(new Error(`Failed to transcribe audio: ${error}`));
      }
    });
  }

  async updateConfig(config: STTConfig): Promise<void> {
    this.config = config;
    if (this.speechConfig) {
      this.speechConfig.speechRecognitionLanguage = config.language;
    }
  }
}
```

#### 3. Offline STT Engine (Whisper)

```typescript
// OfflineSTTEngine.ts
import { createWorker, createScheduler } from 'tesseract.js'; // Using for example, actual implementation would use whisper
import { spawn } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

class OfflineSTTEngine {
  private worker: any = null;
  private modelPath: string = '';
  private isInitialized: boolean = false;

  constructor(private config: STTConfig) {
    // In a real implementation, this would point to whisper model files
    this.modelPath = join(__dirname, '../models/whisper');
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // This is a simplified example - actual implementation would initialize whisper.cpp
      // For now, we'll simulate initialization
      console.log('Initializing offline STT engine with model:', this.config.offlineModel);
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize offline STT engine:', error);
      throw error;
    }
  }

  async transcribe(audioData: ArrayBuffer): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Convert ArrayBuffer to temporary file
    const tempFilePath = join(tmpdir(), `cindy_audio_${Date.now()}.wav`);
    await writeFile(tempFilePath, Buffer.from(audioData));

    return new Promise((resolve, reject) => {
      // In a real implementation, this would call whisper.cpp
      // For now, we'll simulate the process
      
      // Example command for whisper.cpp:
      // const cmd = `./whisper.cpp/main -m ./whisper.cpp/models/ggml-${this.config.offlineModel}.bin -f ${tempFilePath} -otxt`;
      
      // Simulate transcription result
      setTimeout(() => {
        // Clean up temporary file
        unlink(tempFilePath).catch(console.warn);
        
        // Return simulated result
        resolve("This is a simulated transcription result from the offline STT engine.");
      }, 1000);
    });
  }

  async updateConfig(config: STTConfig): Promise<void> {
    this.config = config;
    // Re-initialize if model changed
    if (this.isInitialized) {
      this.isInitialized = false;
      await this.initialize();
    }
  }
}
```

## Text-to-Speech (TTS) Pipeline

### Online TTS - Azure Cognitive Services

**Reasons for selection:**
- Natural sounding voices
- Multiple language support
- Good TypeScript integration
- SSML support for advanced control

### Offline TTS - System TTS APIs

**Reasons for selection:**
- Available on all platforms
- No internet required
- Lower latency for simple responses

### Implementation Architecture

```
src/
├── main/
│   ├── services/
│   │   ├── TextToSpeechService.ts
│   │   ├── OnlineTTSEngine.ts
│   │   └── OfflineTTSEngine.ts
│   └── utils/
│       └── AudioPlayer.ts
└── renderer/
    └── components/
        └── VoiceSettings.tsx
```

### Core Components

#### 1. TextToSpeechService (Main Interface)

```typescript
// TextToSpeechService.ts
import { EventEmitter } from 'events';
import OnlineTTSEngine from './OnlineTTSEngine';
import OfflineTTSEngine from './OfflineTTSEngine';

interface TTSConfig {
  provider: 'online' | 'offline' | 'auto';
  voice: string;
  speed: number; // 0.5 to 2.0
  pitch: number; // 0.0 to 2.0
  volume: number; // 0.0 to 1.0
}

class TextToSpeechService extends EventEmitter {
  private onlineEngine: OnlineTTSEngine;
  private offlineEngine: OfflineTTSEngine;
  private config: TTSConfig;
  private isSpeaking: boolean = false;

  constructor(config: TTSConfig) {
    super();
    this.config = config;
    this.onlineEngine = new OnlineTTSEngine(config);
    this.offlineEngine = new OfflineTTSEngine(config);
  }

  async speak(text: string): Promise<void> {
    if (this.isSpeaking) {
      await this.stop();
    }

    try {
      this.isSpeaking = true;
      this.emit('speakingStarted', text);

      // Try online engine first if configured
      if (this.config.provider === 'online' || this.config.provider === 'auto') {
        try {
          const audioData = await this.onlineEngine.synthesize(text);
          await this.playAudio(audioData);
          this.emit('speakingCompleted', text);
        } catch (onlineError) {
          console.warn('Online TTS failed, falling back to offline:', onlineError);
          
          // Fallback to offline if auto mode or specifically offline
          if (this.config.provider === 'auto' || this.config.provider === 'offline') {
            const audioData = await this.offlineEngine.synthesize(text);
            await this.playAudio(audioData);
            this.emit('speakingCompleted', text);
          } else {
            throw onlineError;
          }
        }
      } else {
        // Use offline engine directly
        const audioData = await this.offlineEngine.synthesize(text);
        await this.playAudio(audioData);
        this.emit('speakingCompleted', text);
      }
    } catch (error) {
      this.emit('speakingError', error);
      throw error;
    } finally {
      this.isSpeaking = false;
    }
  }

  async stop(): Promise<void> {
    try {
      await this.onlineEngine.stop();
      await this.offlineEngine.stop();
      this.isSpeaking = false;
      this.emit('speakingStopped');
    } catch (error) {
      console.error('Failed to stop speaking:', error);
      throw error;
    }
  }

  async updateConfig(newConfig: Partial<TTSConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    await this.onlineEngine.updateConfig(this.config);
    await this.offlineEngine.updateConfig(this.config);
    this.emit('configUpdated', this.config);
  }

  getConfig(): TTSConfig {
    return { ...this.config };
  }

  private async playAudio(audioData: ArrayBuffer): Promise<void> {
    // Implementation would use system audio APIs to play the audio
    // This is platform-specific and would be implemented in the AudioPlayer utility
    return new Promise((resolve) => {
      // Simulate audio playback
      setTimeout(resolve, audioData.byteLength / 1000); // Rough estimate based on audio length
    });
  }
}
```

## Performance Optimization

### 1. Audio Buffer Management

```typescript
// AudioBufferManager.ts
class AudioBufferManager {
  private buffer: ArrayBuffer[] = [];
  private maxSize: number = 10; // Max 10 audio chunks in buffer

  addChunk(audioChunk: ArrayBuffer): void {
    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift(); // Remove oldest chunk
    }
    this.buffer.push(audioChunk);
  }

  getBuffer(): ArrayBuffer {
    // Concatenate all chunks into single buffer
    const totalLength = this.buffer.reduce((acc, chunk) => acc + chunk.byteLength, 0);
    const result = new ArrayBuffer(totalLength);
    const view = new Uint8Array(result);
    
    let offset = 0;
    for (const chunk of this.buffer) {
      view.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }
    
    return result;
  }

  clear(): void {
    this.buffer = [];
  }
}
```

### 2. Latency Reduction Techniques

1. **Streaming Recognition:**
   - Process audio in real-time chunks
   - Provide partial results during speech
   - Reduce perceived latency

2. **Pre-loading Models:**
   - Load STT/TTS models at startup
   - Keep models in memory for fast access
   - Use model caching strategies

3. **Connection Pooling:**
   - Maintain persistent connections to cloud services
   - Reduce connection establishment overhead
   - Implement connection health checks

## Cross-Platform Considerations

### 1. Audio Format Standardization

- Use WAV format for compatibility
- Standardize on 16kHz sample rate
- Mono channel audio for processing
- Convert platform-specific formats

### 2. Platform-Specific Implementations

#### macOS:
- Use Core Audio APIs
- Handle macOS audio permissions
- Support for macOS accessibility features

#### Windows:
- Use Windows Audio Session API (WASAPI)
- Handle Windows audio drivers
- Support for Windows notification system

#### Linux:
- Handle various audio backends (PulseAudio, ALSA)
- Support for Linux desktop environments
- Proper handling of Linux permissions

## Settings Integration

```typescript
// SpeechSettings.tsx
interface SpeechSettingsProps {
  sttConfig: STTConfig;
  ttsConfig: TTSConfig;
  onSTTConfigChange: (config: Partial<STTConfig>) => void;
  onTTSConfigChange: (config: Partial<TTSConfig>) => void;
}

const SpeechSettings: React.FC<SpeechSettingsProps> = ({
  sttConfig,
  ttsConfig,
  onSTTConfigChange,
  onTTSConfigChange
}) => {
  return (
    <div className="speech-settings">
      <h3>Speech Settings</h3>
      
      <div className="settings-section">
        <h4>Speech-to-Text</h4>
        
        <div className="setting-group">
          <label htmlFor="stt-provider">Provider</label>
          <select
            id="stt-provider"
            value={sttConfig.provider}
            onChange={(e) => onSTTConfigChange({ provider: e.target.value as any })}
          >
            <option value="auto">Auto (Online with Offline Fallback)</option>
            <option value="online">Online Only</option>
            <option value="offline">Offline Only</option>
          </select>
        </div>
        
        <div className="setting-group">
          <label htmlFor="stt-language">Language</label>
          <select
            id="stt-language"
            value={sttConfig.language}
            onChange={(e) => onSTTConfigChange({ language: e.target.value })}
          >
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="es-ES">Spanish</option>
            <option value="fr-FR">French</option>
            <option value="de-DE">German</option>
          </select>
        </div>
        
        <div className="setting-group">
          <label>
            <input
              type="checkbox"
              checked={sttConfig.autoPunctuation}
              onChange={(e) => onSTTConfigChange({ autoPunctuation: e.target.checked })}
            />
            Automatic Punctuation
          </label>
        </div>
      </div>
      
      <div className="settings-section">
        <h4>Text-to-Speech</h4>
        
        <div className="setting-group">
          <label htmlFor="tts-provider">Provider</label>
          <select
            id="tts-provider"
            value={ttsConfig.provider}
            onChange={(e) => onTTSConfigChange({ provider: e.target.value as any })}
          >
            <option value="auto">Auto (Online with Offline Fallback)</option>
            <option value="online">Online Only</option>
            <option value="offline">Offline Only</option>
          </select>
        </div>
        
        <div className="setting-group">
          <label htmlFor="tts-speed">Speed: {ttsConfig.speed}x</label>
          <input
            id="tts-speed"
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={ttsConfig.speed}
            onChange={(e) => onTTSConfigChange({ speed: parseFloat(e.target.value) })}
          />
        </div>
        
        <div className="setting-group">
          <label htmlFor="tts-pitch">Pitch: {ttsConfig.pitch}</label>
          <input
            id="tts-pitch"
            type="range"
            min="0.0"
            max="2.0"
            step="0.1"
            value={ttsConfig.pitch}
            onChange={(e) => onTTSConfigChange({ pitch: parseFloat(e.target.value) })}
          />
        </div>
      </div>
    </div>
  );
};
```

## Dependencies

```json
{
  "dependencies": {
    "microsoft-cognitiveservices-speech-sdk": "^1.32.0",
    "tesseract.js": "^4.1.0"
  }
}
```

## Testing Strategy

### 1. Unit Tests
- Audio buffer management
- STT/TTS engine initialization
- Fallback mechanism functionality
- Configuration updates

### 2. Integration Tests
- End-to-end transcription workflows
- Voice synthesis and playback
- Online/offline switching
- Performance under various network conditions

### 3. Performance Tests
- Latency measurements
- CPU and memory usage
- Battery consumption
- Cross-platform consistency

## Future Enhancements

1. **Real-time Streaming:**
   - Continuous audio processing
   - Partial result delivery
   - Interruption handling

2. **Advanced Audio Processing:**
   - Noise reduction algorithms
   - Speaker diarization
   - Audio enhancement

3. **Multi-language Support:**
   - Automatic language detection
   - Mixed language handling
   - Translation capabilities