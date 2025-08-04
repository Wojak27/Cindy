import { app, BrowserWindow, Menu, nativeImage, NativeImage } from 'electron';
import * as path from 'path';
import { CindyMenu } from './menu';
import { SettingsService } from './services/SettingsService';
import { TrayService } from './services/TrayService';
import OllamaProvider from './services/OllamaProvider';
import axios from 'axios';

async function waitForDevServer(maxRetries = 10, delay = 1000): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            await axios.get('http://localhost:3004');
            return true;
        } catch (error) {
            console.log(`Dev server not ready yet. Retrying in ${delay}ms... (${i + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return false;
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (process.platform === 'win32') {
    if (require('electron-squirrel-startup')) {
        app.quit();
    }
}

let mainWindow: BrowserWindow | null = null;
let trayService: TrayService | null = null;
let settingsService: SettingsService | null = null;

const createWindow = async (): Promise<void> => {
    // Initialize settings service
    settingsService = new SettingsService();
    await settingsService.initialize();

    // Create the browser window.
    mainWindow = new BrowserWindow({
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        width: 800,
        show: false, // Start hidden, show only when needed
    });

    // and load the index.html of the app.
    if (process.env.NODE_ENV === 'development') {
        const serverReady = await waitForDevServer();
        if (serverReady) {
            mainWindow.loadURL('http://localhost:3004');
        } else {
            console.error('Dev server failed to start. Falling back to production build.');
            mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
        }
    } else {
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    // Open the DevTools in development mode
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }

    // Hide window instead of closing it
    mainWindow.on('close', (event: Electron.Event) => {
        if (!(app as any).quitting) {
            event.preventDefault();
            mainWindow?.hide();
        }
    });
};

const createTray = async (): Promise<void> => {
    // Determine platform-appropriate icon format
    const getTrayIcon = (): string | NativeImage => {
        const basePath = path.join(__dirname, '../../assets/icons/');
        if (process.platform === 'win32') {
            return path.join(basePath, 'tray-icon.ico');
        }

        const pngPath = path.join(basePath, 'tray-icon.png');
        try {
            const buffer = require('fs').readFileSync(pngPath);
            // Verify PNG signature (89 50 4E 47)
            if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
                return pngPath;
            }
        } catch (error) {
            console.error('Tray icon validation failed:', error);
        }

        // Fallback to 1x1 transparent PNG as NativeImage
        const validIcon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==');
        if (validIcon.isEmpty()) {
            console.error('Fallback icon is empty, using default');
            return path.join(basePath, 'tray-icon.png'); // Last resort
        }
        return validIcon;
    };

    const icon = getTrayIcon();

    trayService = new TrayService({
        icon,
        tooltip: 'Cindy - Voice Research Assistant',
        onOpenCindy: () => {
            if (mainWindow) {
                mainWindow.show();
            } else {
                createWindow();
            }
        },
        onSettings: () => {
            if (mainWindow) {
                mainWindow.show();
                mainWindow.webContents.send('open-settings');
            } else {
                createWindow().then(() => {
                    mainWindow?.webContents.send('open-settings');
                });
            }
        },
        onQuit: () => {
            (app as any).quitting = true;
            app.quit();
        }
    });

    await trayService.initialize();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
    await createWindow();
    await createTray();

    // Initialize OllamaProvider for connection monitoring
    const config = await settingsService?.getAll();
    const ollamaConfig = {
        model: config?.llm?.ollama?.model || 'llama2',
        baseUrl: config?.llm?.ollama?.baseUrl || 'http://127.0.0.1:11434',
        temperature: config?.llm?.ollama?.temperature || 0.7
    };
    const ollamaProvider = new OllamaProvider(ollamaConfig);

    // Start connection monitoring
    const startConnectionMonitor = () => {
        setInterval(async () => {
            try {
                const isConnected = await ollamaProvider.testConnection();
                trayService?.updateTrayIcon(isConnected);
                if (!isConnected) {
                    console.warn('Ollama connection lost. Trying to reconnect...');
                }
            } catch (error) {
                console.error('Connection monitor error:', error);
                trayService?.updateTrayIcon(false);
            }
        }, 30000);
    };
    startConnectionMonitor();

    // Set application menu
    const menu = CindyMenu.createMenu({
        showSettings: () => {
            console.log('Show settings');
        },
        showAbout: () => {
            console.log('Show about');
        },
        quit: () => {
            (app as any).quitting = true;
            app.quit();
        }
    });

    Menu.setApplicationMenu(menu);
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Handle app quit
app.on('before-quit', () => {
    (app as any).quitting = true;
});
