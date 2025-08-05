import { Menu, MenuItemConstructorOptions, shell } from 'electron';

interface CindyMenuOptions {
    showSettings: () => void;
    showAbout: () => void;
    quit: () => void;
}

class CindyMenu {
    static createMenu(options: CindyMenuOptions): Menu {
        const template: MenuItemConstructorOptions[] = [
            // Application menu (macOS)
            ...(process.platform === 'darwin'
                ? [
                    {
                        label: 'Cindy',
                        submenu: [
                            { label: 'About Cindy', click: options.showAbout },
                            { type: 'separator' as const },
                            { label: 'Settings', click: options.showSettings, accelerator: 'CmdOrCtrl+,' },
                            { type: 'separator' as const },
                            { role: 'services' as const, submenu: [] },
                            { type: 'separator' as const },
                            { role: 'hide' as const },
                            { role: 'hideOthers' as const },
                            { role: 'unhide' as const },
                            { type: 'separator' as const },
                            { role: 'quit' as const, accelerator: 'CmdOrCtrl+Q' }
                        ]
                    } as MenuItemConstructorOptions
                ]
                : []),

            // File menu (Windows/Linux)
            ...(process.platform !== 'darwin'
                ? [
                    {
                        label: 'File',
                        submenu: [
                            { label: 'Settings', click: options.showSettings, accelerator: 'CmdOrCtrl+,', id: 'settings' },
                            { type: 'separator' as const },
                            { role: 'quit' as const, accelerator: 'CmdOrCtrl+Q' }
                        ]
                    } as MenuItemConstructorOptions
                ]
                : []),

            // Edit menu (all platforms)
            {
                label: 'Edit',
                submenu: [
                    { role: 'undo' as const },
                    { role: 'redo' as const },
                    { type: 'separator' as const },
                    { role: 'cut' as const },
                    { role: 'copy' as const },
                    { role: 'paste' as const },
                    { role: 'pasteAndMatchStyle' as const },
                    { role: 'delete' as const },
                    { role: 'selectAll' as const }
                ]
            },

            // AI menu (all platforms) - new addition
            {
                label: 'AI',
                submenu: [
                    {
                        label: 'Voice Commands',
                        submenu: [
                            { label: 'Start Listening', id: 'start-listening', accelerator: 'CmdOrCtrl+Space' },
                            { label: 'Stop Listening', id: 'stop-listening', accelerator: 'CmdOrCtrl+.' },
                            { type: 'separator' as const },
                            { label: 'Wake Word Settings', id: 'wake-word-settings' }
                        ]
                    },
                    { type: 'separator' as const },
                    {
                        label: 'Agent Settings',
                        id: 'agent-settings',
                        click: options.showSettings
                    },
                    {
                        label: 'AI Model',
                        submenu: [
                            { label: 'Select Model...', id: 'select-model' },
                            { type: 'separator' as const },
                            { label: 'Ollama', id: 'model-ollama', type: 'radio' as const },
                            { label: 'OpenAI', id: 'model-openai', type: 'radio' as const }
                        ]
                    },
                    { type: 'separator' as const },
                    { label: 'Clear Chat History', id: 'clear-chat' },
                    { label: 'Export Chat', id: 'export-chat' }
                ]
            },

            // View menu (all platforms)
            {
                label: 'View',
                submenu: [
                    { role: 'reload' as const },
                    { role: 'forceReload' as const },
                    { role: 'toggleDevTools' as const, accelerator: process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I' },
                    { type: 'separator' as const },
                    { role: 'resetZoom' as const },
                    { role: 'zoomIn' as const, accelerator: 'CmdOrCtrl+=' },
                    { role: 'zoomOut' as const, accelerator: 'CmdOrCtrl+-' },
                    { type: 'separator' as const },
                    { role: 'togglefullscreen' as const }
                ]
            },

            // Window menu (all platforms)
            {
                label: 'Window',
                submenu: [
                    { role: 'minimize' as const },
                    { role: 'zoom' as const },
                    ...(process.platform === 'darwin'
                        ? [
                            { type: 'separator' as const },
                            { role: 'front' as const },
                            { type: 'separator' as const },
                            { role: 'window' as const }
                        ]
                        : [
                            { role: 'close' as const }
                        ])
                ]
            },

            // Help menu (all platforms)
            {
                label: 'Help',
                submenu: [
                    {
                        label: 'Learn More',
                        click: async () => {
                            await shell.openExternal('https://github.com');
                        }
                    },
                    {
                        label: 'Documentation',
                        click: async () => {
                            await shell.openExternal('https://github.com/docs');
                        }
                    },
                    { type: 'separator' as const },
                    {
                        label: 'Report Issue',
                        click: async () => {
                            await shell.openExternal('https://github.com/issues');
                        }
                    }
                ]
            }
        ];

        return Menu.buildFromTemplate(template);
    }
}

export { CindyMenu, CindyMenuOptions };