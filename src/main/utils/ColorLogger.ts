/**
 * Colorful Console Logger Utility
 * Provides consistent colorful logging across all agent execution files
 */

import chalk from 'chalk';

/**
 * Log level types for different message categories
 */
export type LogLevel = 'stage' | 'info' | 'success' | 'warning' | 'error' | 'debug' | 'tool' | 'data';

/**
 * Centralized colorful logger for agent execution
 */
export class ColorLogger {
    private static readonly colors = {
        stage: chalk.green.bold,
        info: chalk.blue,
        success: chalk.green,
        warning: chalk.yellow,
        error: chalk.red.bold,
        debug: chalk.magenta,
        tool: chalk.hex('#FFA500'), // Orange
        data: chalk.gray,
        gray: chalk.gray
    };

    private static readonly backgrounds = {
        stage: chalk.bgGreen.black.bold,
        success: chalk.bgGreen.black,
        error: chalk.bgRed.white.bold,
        warning: chalk.bgYellow.black
    };

    private static readonly emojis = {
        stage: '🚀',
        info: 'ℹ️',
        success: '✅',
        warning: '⚠️',
        error: '❌',
        debug: '🔍',
        tool: '⚙️',
        data: '📊',
        arrow: '→',
        bullet: '•',
        check: '✓',
        cross: '✗'
    };

    /**
     * Log a message with color coding based on level
     */
    static log(level: LogLevel, component: string, message: string, data?: any): void {
        const color = this.colors[level];
        const emoji = this.emojis[level];

        const formattedMessage = `${emoji} ${color(`[${component}]`)} ${message}`;

        console.log(formattedMessage);

        if (data !== undefined) {
            console.log(this.colors.data(`   ${JSON.stringify(data, null, 2).split('\n').join('\n   ')}`));
        }
    }

    /**
     * Log a stage header with visual separation
     */
    static stage(component: string, title: string, details?: string): void {
        const separator = '═'.repeat(80);
        const emoji = this.emojis.stage;

        console.log();
        console.log(this.colors.stage(separator));
        console.log(this.colors.stage(`${emoji} [${component}] ${title.toUpperCase()}`));
        if (details) {
            console.log(this.colors.info(`📋 ${details}`));
        }
        console.log(this.colors.stage(separator));
    }

    /**
     * Log success with checkmark
     */
    static success(component: string, message: string, data?: any): void {
        this.log('success', component, message, data);
    }

    /**
     * Log info with information icon
     */
    static info(component: string, message: string, data?: any): void {
        this.log('info', component, message, data);
    }

    /**
     * Log warning with warning icon
     */
    static warn(component: string, message: string, data?: any): void {
        this.log('warning', component, message, data);
    }

    /**
     * Log error with error styling and background
     */
    static error(component: string, message: string, error?: any): void {
        const emoji = this.emojis.error;
        const errorMsg = `${emoji} ${this.backgrounds.error(`[${component}]`)} ${message}`;

        console.error(errorMsg);

        if (error) {
            if (error.stack) {
                console.error(this.colors.error(`   Stack: ${error.stack}`));
            } else if (error.message) {
                console.error(this.colors.error(`   Error: ${error.message}`));
            } else {
                console.error(this.colors.error(`   Details: ${JSON.stringify(error, null, 2)}`));
            }
        }
    }

    /**
     * Log debug information with debug icon
     */
    static debug(component: string, message: string, data?: any): void {
        this.log('debug', component, message, data);
    }

    /**
     * Log tool execution with tool icon
     */
    static tool(component: string, message: string, data?: any): void {
        this.log('tool', component, message, data);
    }

    /**
     * Log tool call with detailed input/output visualization
     */
    static toolCall(component: string, toolName: string, input: any, output?: any, duration?: number): void {
        const toolIcon = '🛠️';
        const inputIcon = '📥';
        const outputIcon = '📤';

        // Tool header
        console.log();
        console.log(`${toolIcon} ${this.colors.tool(`[${component}] TOOL CALL: ${toolName}`)}`);
        console.log(this.colors.data('─'.repeat(60)));

        // Input parameters
        console.log(`${inputIcon} ${this.colors.info('Input:')}`);
        if (typeof input === 'object') {
            const inputStr = JSON.stringify(input, null, 2);
            console.log(this.colors.data(`   ${inputStr.split('\n').join('\n   ')}`));
        } else {
            console.log(this.colors.data(`   ${input}`));
        }

        // Output results (if provided)
        if (output !== undefined) {
            console.log(`${outputIcon} ${this.colors.success('Output:')}`);
            if (typeof output === 'object') {
                const outputStr = JSON.stringify(output, null, 2);
                console.log(this.colors.data(`   ${outputStr.split('\n').join('\n   ')}`));
            } else {
                // For long text outputs, truncate and show preview
                const outputText = String(output);
                if (outputText.length > 500) {
                    console.log(this.colors.data(`   ${outputText.substring(0, 500)}...`));
                    console.log(this.colors.gray(`   [Output truncated - ${outputText.length} chars total]`));
                } else {
                    console.log(this.colors.data(`   ${outputText}`));
                }
            }
        }

        // Duration (if provided)
        if (duration !== undefined) {
            const durationColor = duration > 5000 ? this.colors.warning : this.colors.success;
            console.log(`⏱️ ${this.colors.info('Duration:')} ${durationColor(`${duration}ms`)}`);
        }

        console.log(this.colors.data('─'.repeat(60)));
        console.log();
    }

    /**
     * Log tool execution status with progress indicator
     */
    static toolStatus(component: string, toolName: string, status: 'starting' | 'running' | 'success' | 'error', message?: string): void {
        const statusEmojis = {
            starting: '🔄',
            running: '⏳',
            success: '✅',
            error: '❌'
        };

        const statusColors = {
            starting: chalk.blue,
            running: chalk.yellow,
            success: chalk.green,
            error: chalk.red
        };

        const emoji = statusEmojis[status];
        const color = statusColors[status];
        const statusMsg = message || status.toUpperCase();

        console.log(`${emoji} ${this.colors.tool(`[${component}]`)} ${color(toolName)}: ${color(statusMsg)}`);
    }

    /**
     * Log multiple tool results in a summary format
     */
    static toolSummary(component: string, toolResults: Array<{ tool: string; success: boolean; duration?: number; error?: string }>): void {
        console.log();
        console.log(`📋 ${this.colors.stage(`[${component}] TOOL EXECUTION SUMMARY`)}`);
        console.log(this.colors.data('═'.repeat(80)));

        let totalDuration = 0;
        let successCount = 0;
        let failureCount = 0;

        toolResults.forEach((result, index) => {
            const status = result.success ? '✅' : '❌';
            const statusColor = result.success ? this.colors.success : this.colors.error;
            const duration = result.duration ? ` (${result.duration}ms)` : '';

            console.log(`   ${index + 1}. ${status} ${statusColor(result.tool)}${this.colors.data(duration)}`);

            if (!result.success && result.error) {
                console.log(`      ${this.colors.error(`Error: ${result.error}`)}`);
            }

            if (result.duration) totalDuration += result.duration;
            result.success ? successCount++ : failureCount++;
        });

        console.log(this.colors.data('─'.repeat(80)));
        console.log(`📊 ${this.colors.info('Results:')} ${this.colors.success(`${successCount} successful`)} | ${this.colors.error(`${failureCount} failed`)} | ${this.colors.data(`${totalDuration}ms total`)}`);
        console.log();
    }

    /**
     * Log data dumps with data icon
     */
    static data(component: string, message: string, data?: any): void {
        this.log('data', component, message, data);
    }

    /**
     * Log a progress step with indentation
     */
    static step(component: string, step: string, status: 'pending' | 'running' | 'complete' | 'failed' = 'running'): void {
        const statusEmojis = {
            pending: '⏳',
            running: '🔄',
            complete: '✅',
            failed: '❌'
        };

        const statusColors = {
            pending: chalk.yellow,
            running: chalk.blue,
            complete: chalk.green,
            failed: chalk.red
        };

        const emoji = statusEmojis[status];
        const color = statusColors[status];

        console.log(`   ${emoji} ${color(step)}`);
    }

    /**
     * Log a bulleted list item
     */
    static bullet(component: string, item: string, indent: number = 0): void {
        const indentation = '  '.repeat(indent);
        const bullet = this.emojis.bullet;
        console.log(`${indentation}${bullet} ${this.colors.info(item)}`);
    }

    /**
     * Log a key-value pair with formatting
     */
    static keyValue(component: string, key: string, value: any, indent: number = 0): void {
        const indentation = '  '.repeat(indent);
        const arrow = this.emojis.arrow;
        const formattedKey = this.colors.info(key);
        const formattedValue = typeof value === 'string' ?
            this.colors.data(value) :
            this.colors.data(JSON.stringify(value));

        console.log(`${indentation}${arrow} ${formattedKey}: ${formattedValue}`);
    }

    /**
     * Log a completion message with timing
     */
    static complete(component: string, message: string, duration?: number): void {
        const timing = duration ? ` (${duration}ms)` : '';
        const completionMsg = `${message}${this.colors.data(timing)}`;
        this.success(component, completionMsg);
    }

    /**
     * Log workflow transition with visual arrow
     */
    static transition(component: string, from: string, to: string): void {
        const arrow = this.colors.stage(' → ');
        const transition = `${this.colors.info(from)}${arrow}${this.colors.stage(to)}`;
        console.log(`🔄 ${this.colors.info(`[${component}]`)} ${transition}`);
    }

    /**
     * Create a visual separator line
     */
    static separator(color: 'stage' | 'info' | 'success' | 'warning' | 'error' = 'info'): void {
        const line = '─'.repeat(80);
        console.log(this.colors[color](line));
    }

    /**
     * Log a section with visual grouping
     */
    static section(component: string, title: string, content: () => void): void {
        console.log();
        console.log(`📂 ${this.colors.stage(`[${component}]`)} ${this.colors.info(title)}`);
        this.separator('info');
        content();
        this.separator('info');
        console.log();
    }
}

/**
 * Convenience export for default logger
 */
export const logger = ColorLogger;

/**
 * Legacy compatibility - maintains existing console methods with colors
 */
export const colorConsole = {
    log: (component: string, message: string, data?: any) => ColorLogger.info(component, message, data),
    error: (component: string, message: string, error?: any) => ColorLogger.error(component, message, error),
    warn: (component: string, message: string, data?: any) => ColorLogger.warn(component, message, data),
    debug: (component: string, message: string, data?: any) => ColorLogger.debug(component, message, data)
};