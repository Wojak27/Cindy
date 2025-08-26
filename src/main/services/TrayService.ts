import { Tray, Menu, nativeImage, NativeImage } from 'electron';
import path from 'path';


interface TrayConfig {
    icon: string | NativeImage;
    tooltip: string;
    onOpenCindy: () => void;
    onSettings: () => void;
    onQuit: () => void;
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
            this.tray = new Tray(this.config.icon);
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
                click: () => this.config.onOpenCindy()
            },
            {
                label: 'Settings',
                click: () => this.config.onSettings()
            },
            {
                type: 'separator'
            },
            {
                label: 'Quit',
                click: () => this.config.onQuit()
            }
        ]);

        this.tray.setContextMenu(contextMenu);
    }

    setTooltip(tooltip: string): void {
        if (this.tray) {
            this.tray.setToolTip(tooltip);
        }
    }

    updateTrayIcon(connected: boolean): void {
        const iconPath = connected
            ? path.join(__dirname, '../../../src/renderer/assets/icons/tray-icon-connected.png')
            : path.join(__dirname, '../../../src/renderer/assets/icons/tray-icon-disconnected.png');

        // Create image with proper template settings for macOS
        const image = nativeImage.createFromPath(iconPath);

        // Set template image for macOS to ensure proper appearance in menu bar
        if (process.platform === 'darwin') {
            image.setTemplateImage(true);
            // Resize to 16x16 for proper macOS menu bar display
            const resizedImage = image.resize({ width: 16, height: 16 });
            this.tray?.setImage(resizedImage);
        } else {
            this.tray?.setImage(image);
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
            this.config.onOpenCindy();
        });

        // Handle right-click for context menu
        this.tray.on('right-click', () => {
            this.tray?.popUpContextMenu();
        });
    }
}

export { TrayService };
