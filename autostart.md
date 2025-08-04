# Cindy - Cross-Platform Autostart Mechanism

## Requirements

1. Cross-platform autostart support
2. Start at login functionality
3. System tray integration
4. Minimal resource usage at startup
5. User-configurable autostart setting
6. Platform-specific implementation

## Selected Technologies

### Electron's Built-in Autostart
- `app.setLoginItemSettings()` API
- Cross-platform support
- Simple configuration
- Integration with OS autostart mechanisms

### node-auto-launch (Fallback)
- Third-party library for robust autostart
- Better handling of edge cases
- Additional platform support
- Fallback for Electron's built-in API

## Implementation Architecture

```
src/
├── main/
│   ├── services/
│   │   ├── AutostartService.ts
│   │   └── TrayService.ts
│   └── utils/
│       └── PlatformDetector.ts
├── renderer/
│   └── components/
│       └── AutostartSettings.tsx
└── shared/
    └── types/
        └── autostart.types.ts
```

## Core Components

### 1. Autostart Service (Main Interface)

```typescript
// AutostartService.ts
import { app } from 'electron';
import AutoLaunch from 'auto-launch';
import { PlatformDetector } from '../utils/PlatformDetector';

interface AutostartConfig {
  enabled: boolean;
  minimized: boolean; // Start minimized to tray
  platform: string;
}

class AutostartService {
  private config: AutostartConfig;
  private autoLauncher: AutoLaunch | null = null;
  private isInitialized: boolean = false;

  constructor() {
    this.config = {
      enabled: false,
      minimized: true,
      platform: PlatformDetector.getPlatform()
    };
    
    // Initialize auto-launcher for non-Electron autostart
    this.initializeAutoLauncher();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load current autostart settings
      await this.loadCurrentSettings();
      
      this.isInitialized = true;
      console.log('Autostart service initialized');
    } catch (error) {
      console.error('Failed to initialize autostart service:', error);
      throw error;
    }
  }

  async enable(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Try Electron's built-in method first
      if (this.isElectronAutostartSupported()) {
        app.setLoginItemSettings({
          openAtLogin: true,
          openAsHidden: this.config.minimized,
          path: process.execPath,
          args: this.config.minimized ? ['--start-minimized'] : []
        });
      } else if (this.autoLauncher) {
        // Fallback to node-auto-launch
        await this.autoLauncher.enable();
      }
      
      this.config.enabled = true;
      console.log('Autostart enabled');
    } catch (error) {
      console.error('Failed to enable autostart:', error);
      throw error;
    }
  }

  async disable(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Try Electron's built-in method first
      if (this.isElectronAutostartSupported()) {
        app.setLoginItemSettings({
          openAtLogin: false
        });
      } else if (this.autoLauncher) {
        // Fallback to node-auto-launch
        await this.autoLauncher.disable();
      }
      
      this.config.enabled = false;
      console.log('Autostart disabled');
    } catch (error) {
      console.error('Failed to disable autostart:', error);
      throw error;
    }
  }

  async isEnabled(): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Check Electron's built-in method first
      if (this.isElectronAutostartSupported()) {
        const settings = app.getLoginItemSettings();
        return settings.openAtLogin;
      } else if (this.autoLauncher) {
        // Fallback to node-auto-launch
        return await this.autoLauncher.isEnabled();
      }
      
      return false;
    } catch (error) {
      console.error('Failed to check autostart status:', error);
      return false;
    }
  }

  async updateConfig(newConfig: Partial<AutostartConfig>): Promise<void> {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    // If enabled status changed, update accordingly
    if (newConfig.enabled !== undefined && newConfig.enabled !== oldConfig.enabled) {
      if (newConfig.enabled) {
        await this.enable();
      } else {
        await this.disable();
      }
    }
    
    // If minimized setting changed, update the autostart configuration
    if (newConfig.minimized !== undefined && newConfig.minimized !== oldConfig.minimized) {
      if (this.config.enabled) {
        // Re-enable to apply new settings
        await this.disable();
        await this.enable();
      }
    }
    
    console.log('Autostart config updated');
  }

  getConfig(): AutostartConfig {
    return { ...this.config };
  }

  async close(): Promise<void> {
    // Cleanup if needed
    console.log('Autostart service closed');
  }

  // Private methods
  private initializeAutoLauncher(): void {
    try {
      this.autoLauncher = new AutoLaunch({
        name: 'Cindy',
        path: process.execPath,
        isHidden: this.config.minimized
      });
      console.log('Auto-launcher initialized');
    } catch (error) {
      console.error('Failed to initialize auto-launcher:', error);
      this.autoLauncher = null;
    }
  }

  private async loadCurrentSettings(): Promise<void> {
    try {
      // Load current autostart status
      this.config.enabled = await this.isEnabled();
      
      // Load other settings from config
      console.log('Current autostart settings loaded');
    } catch (error) {
      console.error('Failed to load current autostart settings:', error);
    }
  }

  private isElectronAutostartSupported(): boolean {
    // Electron's setLoginItemSettings is supported on macOS and Windows
    // On Linux, it might not work depending on the desktop environment
    const platform = this.config.platform;
    return platform === 'darwin' || platform === 'win32';
  }
}

export { AutostartService, AutostartConfig };
```

### 2. Platform Detector Utility

```typescript
// PlatformDetector.ts
class PlatformDetector {
  static getPlatform(): string {
    return process.platform;
  }

  static isWindows(): boolean {
    return process.platform === 'win32';
  }

  static isMacOS(): boolean {
    return process.platform === 'darwin';
  }

  static isLinux(): boolean {
    return process.platform === 'linux';
  }

  static getPlatformName(): string {
    switch (process.platform) {
      case 'win32':
        return 'Windows';
      case 'darwin':
        return 'macOS';
      case 'linux':
        return 'Linux';
      default:
        return 'Unknown';
    }
  }

  static getAutostartDirectory(): string {
    // Return platform-specific autostart directory
    if (this.isWindows()) {
      return process.env.APPDATA + '\\Microsoft\\Windows\\Start Menu\\Programs\\Startup';
    } else if (this.isMacOS()) {
      return process.env.HOME + '/Library/LaunchAgents';
    } else if (this.isLinux()) {
      return process.env.HOME + '/.config/autostart';
    }
    return '';
  }
}

export { PlatformDetector };
```

### 3. Tray Service

```typescript
// TrayService.ts
import { Tray, Menu, app, ipcMain } from 'electron';
import { join } from 'path';

interface TrayConfig {
  iconPath: string;
  tooltip: string;
}

class TrayService {
  private tray: Tray | null = null;
  private config: TrayConfig;
  private isInitialized: boolean = false;

  constructor(config: TrayConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Create tray icon
      this.tray = new Tray(this.config.iconPath);
      this.tray.setToolTip(this.config.tooltip);
      
      // Set context menu
      this.setContextMenu();
      
      // Handle tray icon events
      this.setupEventHandlers();
      
      this.isInitialized = true;
      console.log('Tray service initialized');
    } catch (error) {
      console.error('Failed to initialize tray service:', error);
      throw error;
    }
  }

  setContextMenu(): void {
    if (!this.tray) return;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open Cindy',
        click: () => {
          // Send IPC message to main window to show
          // Implementation depends on your window management
        }
      },
      {
        label: 'Settings',
        click: () => {
          // Send IPC message to open settings
          // Implementation depends on your IPC setup
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        }
      }
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  setTooltip(tooltip: string): void {
    if (this.tray) {
      this.tray.setToolTip(tooltip);
    }
  }

  async close(): Promise<void> {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
    
    this.isInitialized = false;
    console.log('Tray service closed');
  }

  // Private methods
  private setupEventHandlers(): void {
    if (!this.tray) return;

    // Handle click events
    this.tray.on('click', () => {
      // Send IPC message to show main window
      // Implementation depends on your window management
    });

    // Handle right-click for context menu
    this.tray.on('right-click', () => {
      this.tray?.popUpContextMenu();
    });
  }
}

export { TrayService };
```

## Autostart Settings UI

```typescript
// AutostartSettings.tsx
import React, { useContext, useEffect, useState } from 'react';
import { SettingsContext } from '../contexts/SettingsContext';

const AutostartSettings: React.FC = () => {
  const { settings, updateSettings } = useContext(SettingsContext);
  const [autostartStatus, setAutostartStatus] = useState<boolean>(false);
  const [checkingStatus, setCheckingStatus] = useState<boolean>(true);

  useEffect(() => {
    // Check current autostart status
    const checkStatus = async () => {
      try {
        // In a real implementation, this would check the actual autostart status
        // For now, we'll simulate
        setCheckingStatus(false);
        setAutostartStatus(settings.general.startAtLogin);
      } catch (error) {
        console.error('Failed to check autostart status:', error);
        setCheckingStatus(false);
      }
    };

    checkStatus();
  }, []);

  const toggleAutostart = async (enabled: boolean) => {
    try {
      await updateSettings.set('general', { startAtLogin: enabled });
      setAutostartStatus(enabled);
    } catch (error) {
      console.error('Failed to toggle autostart:', error);
    }
  };

  return (
    <div className="autostart-settings settings-section">
      <h3>Autostart Settings</h3>
      
      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={settings.general.startAtLogin}
            onChange={(e) => toggleAutostart(e.target.checked)}
            disabled={checkingStatus}
          />
          Start at login
        </label>
        <div className="setting-description">
          Automatically start Cindy when you log in to your computer.
        </div>
        {checkingStatus && (
          <div className="status-message">
            Checking autostart status...
          </div>
        )}
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
          Start minimized to the system tray instead of showing the main window.
        </div>
      </div>
      
      <div className="setting-group">
        <label htmlFor="startup-delay">
          Startup delay: {settings.autostart?.delay || 0} seconds
        </label>
        <input
          id="startup-delay"
          type="range"
          min="0"
          max="60"
          value={settings.autostart?.delay || 0}
          onChange={(e) => updateSettings.set('autostart', { 
            delay: parseInt(e.target.value) 
          })}
        />
        <div className="setting-description">
          Delay startup to reduce system load during boot.
        </div>
      </div>
      
      <div className="setting-group">
        <button onClick={() => {
          // In a real implementation, this would repair autostart settings
          console.log('Repair autostart settings');
        }}>
          Repair Autostart
        </button>
        <div className="setting-description">
          Fix autostart if it's not working correctly.
        </div>
      </div>
    </div>
  );
};

export { AutostartSettings };
```

## Cross-Platform Implementation Details

### 1. Windows Implementation

```typescript
// WindowsAutostart.ts
import { app } from 'electron';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';

class WindowsAutostart {
  static async enable(appPath: string, args: string[] = []): Promise<void> {
    // Use Electron's built-in method
    app.setLoginItemSettings({
      openAtLogin: true,
      path: appPath,
      args: args
    });
  }

  static async disable(): Promise<void> {
    // Use Electron's built-in method
    app.setLoginItemSettings({
      openAtLogin: false
    });
  }

  static async createShortcut(): Promise<void> {
    // Alternative method using shortcut creation
    const shortcutPath = join(
      process.env.APPDATA!,
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      'Startup',
      'Cindy.lnk'
    );
    
    // In a real implementation, this would create a shortcut
    // using a library like 'shortcut' or 'electron-windows-shortcuts'
    console.log(`Creating shortcut at: ${shortcutPath}`);
  }

  static async removeShortcut(): Promise<void> {
    const shortcutPath = join(
      process.env.APPDATA!,
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      'Startup',
      'Cindy.lnk'
    );
    
    try {
      await unlink(shortcutPath);
      console.log(`Removed shortcut at: ${shortcutPath}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`Failed to remove shortcut: ${error}`);
        throw error;
      }
    }
  }
}

export { WindowsAutostart };
```

### 2. macOS Implementation

```typescript
// MacOSAutostart.ts
import { app } from 'electron';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';

class MacOSAutostart {
  static async enable(appPath: string, args: string[] = []): Promise<void> {
    // Use Electron's built-in method
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: args.includes('--start-minimized'),
      path: appPath,
      args: args
    });
  }

  static async disable(): Promise<void> {
    // Use Electron's built-in method
    app.setLoginItemSettings({
      openAtLogin: false
    });
  }

  static async createLaunchAgent(): Promise<void> {
    // Alternative method using LaunchAgent plist
    const plistPath = join(
      process.env.HOME!,
      'Library',
      'LaunchAgents',
      'com.cindy.app.plist'
    );
    
    const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cindy.app</string>
    <key>ProgramArguments</key>
    <array>
        <string>${process.execPath}</string>
        <string>--start-minimized</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>`;
    
    await writeFile(plistPath, plistContent, 'utf8');
    console.log(`Created LaunchAgent at: ${plistPath}`);
  }

  static async removeLaunchAgent(): Promise<void> {
    const plistPath = join(
      process.env.HOME!,
      'Library',
      'LaunchAgents',
      'com.cindy.app.plist'
    );
    
    try {
      await unlink(plistPath);
      console.log(`Removed LaunchAgent at: ${plistPath}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`Failed to remove LaunchAgent: ${error}`);
        throw error;
      }
    }
  }
}

export { MacOSAutostart };
```

### 3. Linux Implementation

```typescript
// LinuxAutostart.ts
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';

class LinuxAutostart {
  static async enable(appPath: string, args: string[] = []): Promise<void> {
    // Create .desktop file in autostart directory
    const desktopPath = join(
      process.env.HOME!,
      '.config',
      'autostart',
      'cindy.desktop'
    );
    
    const desktopContent = `[Desktop Entry]
Type=Application
Name=Cindy
Exec=${appPath} ${args.join(' ')}
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Comment=Cindy Voice Assistant`;

    await writeFile(desktopPath, desktopContent, 'utf8');
    console.log(`Created autostart entry at: ${desktopPath}`);
  }

  static async disable(): Promise<void> {
    const desktopPath = join(
      process.env.HOME!,
      '.config',
      'autostart',
      'cindy.desktop'
    );
    
    try {
      await unlink(desktopPath);
      console.log(`Removed autostart entry at: ${desktopPath}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`Failed to remove autostart entry: ${error}`);
        throw error;
      }
    }
  }

  static async isSupported(): Promise<boolean> {
    // Check if XDG autostart is supported
    return !!process.env.XDG_CONFIG_HOME || !!process.env.HOME;
  }
}

export { LinuxAutostart };
```

## Startup Optimization

### 1. Delayed Initialization

```typescript
// StartupOptimizer.ts
class StartupOptimizer {
  static async initializeDelayedServices(delay: number = 5000): Promise<void> {
    // Delay initialization of non-critical services
    setTimeout(async () => {
      try {
        // Initialize vector store
        // Initialize scheduler
        // Initialize other background services
        console.log('Delayed services initialized');
      } catch (error) {
        console.error('Failed to initialize delayed services:', error);
      }
    }, delay);
  }

  static async initializeCriticalServices(): Promise<void> {
    // Initialize only critical services for immediate use
    try {
      // Initialize voice service
      // Initialize settings service
      // Initialize tray service
      console.log('Critical services initialized');
    } catch (error) {
      console.error('Failed to initialize critical services:', error);
      throw error;
    }
  }
}

export { StartupOptimizer };
```

### 2. Resource Management

```typescript
// ResourceManager.ts
import { app } from 'electron';

class ResourceManager {
  static setStartupPriority(): void {
    // Set process priority for startup
    if (process.platform === 'win32') {
      // Windows-specific priority setting
      // Implementation would use Windows API
    } else if (process.platform === 'darwin') {
      // macOS-specific priority setting
      // Implementation would use macOS API
    }
  }

  static async monitorStartupPerformance(): Promise<void> {
    // Monitor startup time and resource usage
    const startTime = Date.now();
    
    app.on('ready', () => {
      const readyTime = Date.now();
      console.log(`App ready in ${readyTime - startTime}ms`);
    });
  }
}

export { ResourceManager };
```

## Dependencies

```json
{
  "dependencies": {
    "auto-launch": "^5.0.5",
    "electron": "^25.0.0"
  }
}
```

## Testing Strategy

### 1. Unit Tests
- Autostart configuration management
- Platform detection accuracy
- Tray service functionality
- Startup optimization

### 2. Integration Tests
- Cross-platform autostart functionality
- System integration testing
- Resource usage during startup
- Error handling scenarios

### 3. Manual Testing
- Autostart behavior on each platform
- System tray integration
- Startup performance
- Recovery from system failures

## Future Enhancements

### 1. Advanced Features
- Conditional autostart based on system state
- Scheduled startup times
- Power management integration
- Network availability detection

### 2. Platform-Specific Optimizations
- Windows Task Scheduler integration
- macOS LaunchDaemon support
- Linux systemd service creation
- Cloud-based configuration synchronization

### 3. Performance Improvements
- Asynchronous initialization
- Lazy loading of services
- Memory-mapped file access
- Hardware acceleration detection