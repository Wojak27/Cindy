# Cindy - Wake-word Detection Implementation

## Requirements

1. Always-on listening with minimal CPU usage (< 5%)
2. Adjustable activation phrase
3. Hot-swapping capability without full restart
4. Cross-platform compatibility
5. Online and offline support

## Selected Technology

### Porcupine by Picovoice

**Reasons for selection:**
- Low CPU usage (1-3% on modern hardware)
- Pre-trained models for common wake words
- Custom wake word training capability
- Cross-platform support (macOS, Windows, Linux)
- JavaScript/WebAssembly support
- No internet required (fully local processing)
- Good TypeScript support

### Alternative Options Considered

1. **Snowboy** - Discontinued, limited support
2. **Web Speech API** - Requires internet, higher latency
3. **Custom ML model** - Higher development time, uncertain performance
4. **PocketSphinx** - Higher CPU usage, more complex setup

## Implementation Plan

### 1. Core Architecture

```
src/
├── main/
│   ├── services/
│   │   ├── WakeWordService.ts
│   │   └── AudioCaptureService.ts
│   └── utils/
│       └── PorcupineWrapper.ts
└── renderer/
    └── components/
        └── WakeWordSettings.tsx
```

### 2. Porcupine Integration

```typescript
// PorcupineWrapper.ts
import Porcupine from '@picovoice/porcupine-node';

class PorcupineWrapper {
  private porcupine: Porcupine | null = null;
  private isInitialized: boolean = false;

  async initialize(keyword: string, sensitivity: number = 0.5): Promise<void> {
    try {
      // Load custom keyword file or use built-in
      this.porcupine = new Porcupine(
        [keyword], // keyword paths
        [sensitivity] // sensitivities
      );
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize Porcupine:', error);
      throw error;
    }
  }

  async process(audioData: Int16Array): Promise<boolean> {
    if (!this.porcupine || !this.isInitialized) {
      return false;
    }

    try {
      const result = await this.porcupine.process(audioData);
      return result !== -1; // -1 means no detection
    } catch (error) {
      console.error('Error processing audio:', error);
      return false;
    }
  }

  async updateKeyword(newKeyword: string, sensitivity: number): Promise<void> {
    // Clean up existing instance
    if (this.porcupine) {
      this.porcupine.release();
    }
    
    // Initialize with new keyword
    await this.initialize(newKeyword, sensitivity);
  }

  async cleanup(): Promise<void> {
    if (this.porcupine) {
      this.porcupine.release();
      this.porcupine = null;
      this.isInitialized = false;
    }
  }
}
```

### 3. Audio Capture Service

```typescript
// AudioCaptureService.ts
import { AudioInputStream } from 'microsoft-cognitiveservices-speech-sdk';

class AudioCaptureService {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private isCapturing: boolean = false;

  async startCapture(): Promise<void> {
    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000, // Porcupine requirement
        }
      });

      // Set up audio context for processing
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      this.analyser = this.audioContext.createAnalyser();
      source.connect(this.analyser);
      
      this.isCapturing = true;
    } catch (error) {
      console.error('Failed to start audio capture:', error);
      throw error;
    }
  }

  async stopCapture(): Promise<void> {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
    
    this.isCapturing = false;
  }

  getAudioData(): Int16Array {
    if (!this.analyser) {
      throw new Error('Audio not initialized');
    }
    
    const bufferLength = this.analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteTimeDomainData(dataArray);
    
    // Convert to Int16Array for Porcupine
    const int16Array = new Int16Array(dataArray.length);
    for (let i = 0; i < dataArray.length; i++) {
      int16Array[i] = (dataArray[i] - 128) << 8;
    }
    
    return int16Array;
  }
}
```

### 4. Wake Word Service

```typescript
// WakeWordService.ts
import { EventEmitter } from 'events';
import { PorcupineWrapper } from '../utils/PorcupineWrapper';
import { AudioCaptureService } from './AudioCaptureService';

class WakeWordService extends EventEmitter {
  private porcupine: PorcupineWrapper;
  private audioCapture: AudioCaptureService;
  private isListening: boolean = false;
  private detectionInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.porcupine = new PorcupineWrapper();
    this.audioCapture = new AudioCaptureService();
  }

  async startListening(keyword: string, sensitivity: number = 0.5): Promise<void> {
    if (this.isListening) {
      return;
    }

    try {
      // Initialize Porcupine with keyword
      await this.porcupine.initialize(keyword, sensitivity);
      
      // Start audio capture
      await this.audioCapture.startCapture();
      
      // Start detection loop
      this.detectionInterval = setInterval(() => {
        this.detectWakeWord();
      }, 100); // Check every 100ms
      
      this.isListening = true;
      this.emit('listeningStarted');
    } catch (error) {
      console.error('Failed to start listening:', error);
      throw error;
    }
  }

  async stopListening(): Promise<void> {
    if (!this.isListening) {
      return;
    }

    // Stop detection loop
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }

    // Stop audio capture
    await this.audioCapture.stopCapture();
    
    // Cleanup Porcupine
    await this.porcupine.cleanup();
    
    this.isListening = false;
    this.emit('listeningStopped');
  }

  async updateKeyword(newKeyword: string, sensitivity: number = 0.5): Promise<void> {
    await this.porcupine.updateKeyword(newKeyword, sensitivity);
    this.emit('keywordUpdated', newKeyword);
  }

  private async detectWakeWord(): Promise<void> {
    try {
      const audioData = this.audioCapture.getAudioData();
      const detected = await this.porcupine.process(audioData);
      
      if (detected) {
        this.emit('wakeWordDetected');
      }
    } catch (error) {
      console.error('Error in wake word detection:', error);
    }
  }

  isCurrentlyListening(): boolean {
    return this.isListening;
  }
}

export default WakeWordService;
```

## Performance Considerations

1. **CPU Usage Optimization:**
   - Use 16kHz sample rate (Porcupine requirement)
   - Process audio in small chunks
   - Use Web Workers for heavy processing
   - Implement adaptive sensitivity

2. **Memory Management:**
   - Properly release audio resources
   - Clean up Porcupine instances
   - Use streaming rather than buffering

3. **Battery Life:**
   - Pause detection when app is minimized
   - Reduce detection frequency when on battery
   - Use efficient audio codecs

## Custom Wake Word Training

1. **Porcupine Console:**
   - Use Picovoice's online console for custom wake word training
   - Download generated .ppn file
   - Integrate into application

2. **Alternative Approach:**
   - Use multiple built-in wake words
   - Allow user to select from predefined options
   - Provide option to request custom wake word

## Cross-Platform Considerations

1. **macOS:**
   - Request microphone permissions via Electron
   - Handle macOS-specific audio APIs
   - Support for macOS accessibility features

2. **Windows:**
   - Handle Windows audio drivers
   - Support for Windows-specific audio enhancements
   - Integration with Windows notification system

3. **Linux:**
   - Handle various audio backends (PulseAudio, ALSA)
   - Support for Linux desktop environments
   - Proper handling of Linux permissions

## Settings Integration

```typescript
// WakeWordSettings.tsx
interface WakeWordSettingsProps {
  currentKeyword: string;
  sensitivity: number;
  onKeywordChange: (keyword: string) => void;
  onSensitivityChange: (sensitivity: number) => void;
}

const WakeWordSettings: React.FC<WakeWordSettingsProps> = ({
  currentKeyword,
  sensitivity,
  onKeywordChange,
  onSensitivityChange
}) => {
  // Predefined wake words
  const predefinedKeywords = [
    'Hey Cindy',
    'Okay Cindy',
    'Cindy Assistant',
    'Computer'
  ];

  return (
    <div className="wake-word-settings">
      <h3>Wake Word Settings</h3>
      
      <div className="setting-group">
        <label htmlFor="keyword-select">Activation Phrase</label>
        <select 
          id="keyword-select"
          value={currentKeyword}
          onChange={(e) => onKeywordChange(e.target.value)}
        >
          {predefinedKeywords.map(keyword => (
            <option key={keyword} value={keyword}>{keyword}</option>
          ))}
        </select>
        
        <input
          type="text"
          placeholder="Or enter custom phrase"
          value={currentKeyword}
          onChange={(e) => onKeywordChange(e.target.value)}
        />
      </div>
      
      <div className="setting-group">
        <label htmlFor="sensitivity-slider">
          Sensitivity: {sensitivity}
        </label>
        <input
          id="sensitivity-slider"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={sensitivity}
          onChange={(e) => onSensitivityChange(parseFloat(e.target.value))}
        />
        <div className="sensitivity-description">
          Lower sensitivity reduces false activations but may miss quiet commands.
        </div>
      </div>
    </div>
  );
};
```

## Testing Strategy

1. **Unit Tests:**
   - Porcupine wrapper functionality
   - Audio capture service
   - Wake word detection accuracy

2. **Integration Tests:**
   - End-to-end wake word detection
   - Keyword switching without restart
   - Performance under load

3. **Cross-Platform Tests:**
   - Audio capture on each platform
   - Resource usage monitoring
   - Permission handling

## Dependencies

```json
{
  "dependencies": {
    "@picovoice/porcupine-node": "^3.0.0",
    "microsoft-cognitiveservices-speech-sdk": "^1.32.0"
  }
}
```

## Future Enhancements

1. **Multiple Wake Words:**
   - Support for multiple activation phrases
   - Context-aware wake word selection

2. **Voice Recognition:**
   - Speaker identification
   - Personalized responses based on user

3. **Advanced Audio Processing:**
   - Noise cancellation improvements
   - Directional audio detection