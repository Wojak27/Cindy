import { BrowserWindow, shell } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';

interface BrowserResult {
    success: boolean;
    url?: string;
    title?: string;
    content?: string;
    screenshot?: string;
    error?: string;
}

interface BrowserOptions {
    headless?: boolean;
    width?: number;
    height?: number;
    timeout?: number;
    waitForSelector?: string;
    screenshot?: boolean;
}

export class BrowserTool {
    private browserWindow: BrowserWindow | null = null;
    private screenshots: Map<string, string> = new Map();

    constructor() { }

    async openUrl(url: string, options: BrowserOptions = {}): Promise<BrowserResult> {
        try {
            // Validate URL
            if (!this.isValidUrl(url)) {
                throw new Error('Invalid URL provided');
            }

            // If not headless, open in system browser
            if (!options.headless) {
                await shell.openExternal(url);
                return {
                    success: true,
                    url,
                    title: 'Opened in system browser'
                };
            }

            // Create headless browser window for content extraction
            const result = await this.createBrowserWindow(url, options);
            return result;

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to open URL'
            };
        }
    }

    async extractContent(url: string, options: BrowserOptions = {}): Promise<BrowserResult> {
        try {
            if (!this.isValidUrl(url)) {
                throw new Error('Invalid URL provided');
            }

            const result = await this.createBrowserWindow(url, {
                ...options,
                headless: true
            });

            if (result.success && this.browserWindow) {
                // Extract page content
                const content = await this.browserWindow.webContents.executeJavaScript(`
                    // Remove script and style tags
                    const scripts = document.querySelectorAll('script, style');
                    scripts.forEach(el => el.remove());
                    
                    // Get main content areas
                    const main = document.querySelector('main') || 
                                 document.querySelector('[role="main"]') ||
                                 document.querySelector('.content') ||
                                 document.querySelector('#content') ||
                                 document.body;
                    
                    return {
                        title: document.title,
                        content: main ? main.innerText.trim() : document.body.innerText.trim(),
                        url: window.location.href
                    };
                `);

                // Take screenshot if requested
                let screenshotPath = '';
                if (options.screenshot) {
                    screenshotPath = await this.takeScreenshot();
                }

                // Clean up
                this.closeBrowser();

                return {
                    success: true,
                    url: content.url,
                    title: content.title,
                    content: content.content,
                    screenshot: screenshotPath
                };
            }

            return result;

        } catch (error) {
            this.closeBrowser();
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to extract content'
            };
        }
    }

    async searchPage(url: string, searchTerm: string, options: BrowserOptions = {}): Promise<BrowserResult> {
        try {
            const result = await this.extractContent(url, options);

            if (result.success && result.content) {
                // Search for the term in the content
                const content = result.content.toLowerCase();
                const term = searchTerm.toLowerCase();

                if (content.includes(term)) {
                    // Extract context around the search term
                    const contexts = this.extractSearchContexts(result.content, searchTerm);

                    return {
                        ...result,
                        content: contexts.join('\n\n---\n\n')
                    };
                } else {
                    return {
                        ...result,
                        content: `Search term "${searchTerm}" not found on page.`
                    };
                }
            }

            return result;

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to search page'
            };
        }
    }

    async takeScreenshot(filename?: string): Promise<string> {
        if (!this.browserWindow) {
            throw new Error('No browser window available for screenshot');
        }

        try {
            const image = await this.browserWindow.webContents.capturePage();
            const screenshotDir = path.join(app.getPath('userData'), 'screenshots');

            // Ensure directory exists
            await fs.mkdir(screenshotDir, { recursive: true });

            const screenshotFilename = filename || `screenshot_${Date.now()}.png`;
            const screenshotPath = path.join(screenshotDir, screenshotFilename);

            await fs.writeFile(screenshotPath, image.toPNG());

            // Store in memory for reference
            this.screenshots.set(screenshotFilename, screenshotPath);

            return screenshotPath;

        } catch (error) {
            throw new Error(`Failed to take screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async getCurrentUrl(): Promise<string | null> {
        if (!this.browserWindow) {
            return null;
        }

        try {
            return await this.browserWindow.webContents.executeJavaScript('window.location.href');
        } catch (error) {
            return null;
        }
    }

    async goBack(): Promise<BrowserResult> {
        if (!this.browserWindow) {
            return {
                success: false,
                error: 'No browser window available'
            };
        }

        try {
            if (this.browserWindow.webContents.canGoBack()) {
                this.browserWindow.webContents.goBack();

                // Wait for navigation to complete
                await new Promise(resolve => {
                    this.browserWindow!.webContents.once('did-finish-load', resolve);
                });

                const url = await this.getCurrentUrl();
                return {
                    success: true,
                    url: url || undefined
                };
            } else {
                return {
                    success: false,
                    error: 'Cannot go back - no previous page'
                };
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to go back'
            };
        }
    }

    closeBrowser(): void {
        if (this.browserWindow && !this.browserWindow.isDestroyed()) {
            this.browserWindow.close();
            this.browserWindow = null;
        }
    }

    private async createBrowserWindow(url: string, options: BrowserOptions): Promise<BrowserResult> {
        const { width = 1280, height = 720, timeout = 30000 } = options;

        this.browserWindow = new BrowserWindow({
            width,
            height,
            show: false, // Always hidden for automation
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                webSecurity: true
            }
        });

        return new Promise((resolve) => {
            const timeoutId = setTimeout(() => {
                this.closeBrowser();
                resolve({
                    success: false,
                    error: 'Page load timeout'
                });
            }, timeout);

            this.browserWindow!.webContents.once('did-finish-load', async () => {
                clearTimeout(timeoutId);

                try {
                    // Wait for additional selector if specified
                    if (options.waitForSelector) {
                        await this.waitForSelector(options.waitForSelector, 5000);
                    }

                    const title = await this.browserWindow!.webContents.executeJavaScript('document.title');
                    const currentUrl = await this.getCurrentUrl();

                    resolve({
                        success: true,
                        url: currentUrl || url,
                        title
                    });
                } catch (error) {
                    this.closeBrowser();
                    resolve({
                        success: false,
                        error: error instanceof Error ? error.message : 'Failed to load page'
                    });
                }
            });

            this.browserWindow!.webContents.once('did-fail-load', () => {
                clearTimeout(timeoutId);
                this.closeBrowser();
                resolve({
                    success: false,
                    error: 'Failed to load page'
                });
            });

            this.browserWindow!.loadURL(url);
        });
    }

    private async waitForSelector(selector: string, timeout: number = 5000): Promise<void> {
        if (!this.browserWindow) {
            throw new Error('No browser window available');
        }

        const script = `
            new Promise((resolve, reject) => {
                const element = document.querySelector('${selector}');
                if (element) {
                    resolve(true);
                    return;
                }
                
                const observer = new MutationObserver(() => {
                    const element = document.querySelector('${selector}');
                    if (element) {
                        observer.disconnect();
                        resolve(true);
                    }
                });
                
                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
                
                setTimeout(() => {
                    observer.disconnect();
                    reject(new Error('Selector timeout'));
                }, ${timeout});
            });
        `;

        await this.browserWindow.webContents.executeJavaScript(script);
    }

    private isValidUrl(url: string): boolean {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    private extractSearchContexts(content: string, searchTerm: string, contextSize: number = 200): string[] {
        const term = searchTerm.toLowerCase();
        const text = content.toLowerCase();
        const contexts: string[] = [];

        let index = text.indexOf(term);
        while (index !== -1) {
            const start = Math.max(0, index - contextSize);
            const end = Math.min(content.length, index + term.length + contextSize);

            let context = content.substring(start, end);

            // Add ellipsis if we're not at the beginning/end
            if (start > 0) context = '...' + context;
            if (end < content.length) context = context + '...';

            contexts.push(context);

            // Find next occurrence
            index = text.indexOf(term, index + 1);

            // Limit to 5 contexts to avoid overwhelming output
            if (contexts.length >= 5) break;
        }

        return contexts;
    }

    // Cleanup method
    destroy(): void {
        this.closeBrowser();
        this.screenshots.clear();
    }
}