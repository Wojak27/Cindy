class PlatformDetector {
    static getPlatform(): 'macos' | 'windows' | 'linux' {
        switch (process.platform) {
            case 'darwin':
                return 'macos';
            case 'win32':
                return 'windows';
            default:
                return 'linux';
        }
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

    static getAutostartDirectory(): string {
        const platform = this.getPlatform();

        switch (platform) {
            case 'macos':
                return `${process.env.HOME}/Library/LaunchAgents`;
            case 'windows':
                return `${process.env.APPDATA}\\Microsoft\\Windows\\Start Menu\\Programs\\Startup`;
            case 'linux':
                return `${process.env.HOME}/.config/autostart`;
            default:
                return '';
        }
    }

    static supportsAutostart(): boolean {
        return this.isWindows() || this.isMacOS() || this.isLinux();
    }
}

export { PlatformDetector };