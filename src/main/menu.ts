import { Menu, MenuItemConstructorOptions, shell } from 'electron';
// Fixed TS6133 by ensuring no unused imports

interface CindyMenuOptions {
    showSettings: () => void;
    showAbout: () => void;
    quit: () => void;
}

class CindyMenu {
    static createMenu(options: CindyMenuOptions): Menu {
        const template: MenuItemConstructorOptions[] = [
            {
                label: 'Cindy',
                submenu: [
                    {
                        label: 'About Cindy',
                        click: options.showAbout
                    },
                    { type: 'separator' },
                    {
                        label: 'Settings',
                        click: options.showSettings
                    },
                    { type: 'separator' },
                    {
                        label: 'Quit',
                        click: options.quit,
                        accelerator: 'CmdOrCtrl+Q'
                    }
                ]
            },
            {
                label: 'Edit',
                submenu: [
                    { role: 'undo' },
                    { role: 'redo' },
                    { type: 'separator' },
                    { role: 'cut' },
                    { role: 'copy' },
                    { role: 'paste' },
                    { role: 'pasteAndMatchStyle' },
                    { role: 'delete' },
                    { role: 'selectAll' }
                ]
            },
            {
                label: 'View',
                submenu: [
                    { role: 'reload' },
                    { role: 'forceReload' },
                    { role: 'toggleDevTools' },
                    { type: 'separator' },
                    { role: 'resetZoom' },
                    { role: 'zoomIn' },
                    { role: 'zoomOut' },
                    { type: 'separator' },
                    { role: 'togglefullscreen' }
                ]
            },
            {
                label: 'Window',
                submenu: [
                    { role: 'minimize' },
                    { role: 'zoom' },
                    { type: 'separator' },
                    { role: 'front' },
                    { type: 'separator' },
                    { role: 'window' }
                ]
            },
            {
                label: 'Help',
                submenu: [
                    {
                        label: 'Learn More',
                        click: async () => {
                            await shell.openExternal('https://github.com');
                        }
                    }
                ]
            }
        ];

        return Menu.buildFromTemplate(template);
    }
}

export { CindyMenu, CindyMenuOptions };