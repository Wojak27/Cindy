# Assets Directory

This directory contains static assets used throughout the Cindy application, including icons, sounds, and other media resources.

## Directory Structure

### 📁 `icons/` - Application Icons
Vector and raster icons for the application:

- **`tray-icon.png`** - Default system tray icon
- **`tray-icon-connected.png`** - Tray icon when connected to services
- **`tray-icon-disconnected.png`** - Tray icon when disconnected
- **Platform Icons**:
  - `apple-173-svgrepo-com.svg` - macOS platform icon
  - `linux-svgrepo-com.svg` - Linux platform icon
  - `microsoft-windows-22-logo-svgrepo-com.svg` - Windows platform icon

### 📁 `sounds/` - Audio Assets
Audio files for user feedback and notifications:

#### System Sounds
- **`activation.wav`** - Wake word activation sound
- **`processing.wav`** - AI processing indicator sound
- **`complete.wav`** - Task completion sound
- **`error.wav`** - Error notification sound

#### Audio Specifications
- **Format**: WAV (uncompressed)
- **Sample Rate**: 44.1 kHz
- **Channels**: Mono/Stereo
- **Duration**: Short (< 2 seconds) for responsiveness

## Usage in Application

### Icon Usage
Icons are used in various parts of the application:

```typescript
// Tray service
const trayIcon = nativeImage.createFromPath(
    path.join(__dirname, '../assets/icons/tray-icon.png')
);
tray.setImage(trayIcon);

// Platform detection
const platformIcon = getPlatformIcon(); // Returns appropriate SVG
```

### Sound Integration
Audio assets are played for user feedback:

```typescript
// Audio playback service
const playNotificationSound = (soundName: string) => {
    const soundPath = path.join(__dirname, '../assets/sounds', `${soundName}.wav`);
    // Play audio file
};

// Usage examples
playNotificationSound('activation'); // Wake word detected
playNotificationSound('complete');   // Task finished
```

### Asset Loading
Assets are loaded using Electron's asset handling:

```typescript
// Main process
const assetPath = app.isPackaged 
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../assets');

// Renderer process (via IPC)
const iconUrl = await ipcRenderer.invoke('get-asset-path', 'icons/tray-icon.png');
```

## Asset Guidelines

### Icons
- **Format**: PNG for raster, SVG for vector graphics
- **Sizes**: Multiple sizes for different DPI (16x16, 32x32, 64x64, 128x128)
- **Style**: Consistent with application design language
- **Color**: Support for light/dark themes where applicable

### Sounds
- **Duration**: Keep under 2 seconds for good UX
- **Volume**: Normalized levels across all sounds
- **Format**: WAV for quality, MP3 for size optimization
- **Fallback**: Graceful degradation if audio unavailable

### Optimization
- **Size**: Optimize file sizes for faster loading
- **Compression**: Use appropriate compression for each asset type
- **Caching**: Assets are cached by Electron automatically
- **Loading**: Lazy load non-critical assets

## Platform Considerations

### macOS
- **App Icon**: Provided in various sizes for Retina displays
- **Tray Icon**: Template images that adapt to system theme
- **Notifications**: Native sound integration

### Windows
- **ICO Format**: Windows-specific icon format support
- **System Integration**: Windows notification sounds
- **High DPI**: Support for high-DPI displays

### Linux
- **Desktop Files**: Icon paths for desktop integration
- **Theme Integration**: Adapt to various Linux themes
- **Sound System**: ALSA/PulseAudio compatibility

## Development

### Adding New Assets

1. **Place in appropriate subdirectory**:
   ```
   assets/
   ├── icons/new-icon.png
   └── sounds/new-sound.wav
   ```

2. **Update asset references**:
   ```typescript
   const newIcon = path.join(assetsPath, 'icons/new-icon.png');
   ```

3. **Test across platforms**:
   - Verify loading on all supported platforms
   - Check different screen densities
   - Test audio playback

### Asset Management
- **Version Control**: All assets are tracked in git
- **Build Process**: Assets are copied to distribution bundle
- **Updates**: Asset updates require application rebuild
- **Validation**: Automated tests verify asset availability

### Performance
- **Loading Time**: Monitor asset loading performance
- **Memory Usage**: Track memory usage of loaded assets
- **Disk Space**: Optimize total asset size
- **Network**: Consider CDN for large assets (if applicable)