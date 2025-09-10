import { spawn } from 'child_process';
import { promisify } from 'util';

interface ProcessInfo {
    pid: number;
    command: string;
    args: string;
}

/**
 * Process cleanup utility for managing stale Electron processes
 * Helps prevent DuckDB database locking issues from orphaned processes
 */
export class ProcessCleanup {
    /**
     * Get all running Electron processes related to this application
     */
    public static async getElectronProcesses(): Promise<ProcessInfo[]> {
        return new Promise((resolve, reject) => {
            const processes: ProcessInfo[] = [];
            const ps = spawn('ps', ['aux']);
            let psOutput = '';

            ps.stdout.on('data', (data) => {
                psOutput += data.toString();
            });

            ps.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`ps command failed with code ${code}`));
                    return;
                }

                const lines = psOutput.split('\n');
                for (const line of lines) {
                    // Look for Electron processes in our app directory
                    if (line.includes('Electron') && line.includes('voice-assistant')) {
                        const parts = line.trim().split(/\s+/);
                        if (parts.length >= 11) {
                            const pid = parseInt(parts[1]);
                            const command = parts.slice(10).join(' ');
                            
                            if (!isNaN(pid)) {
                                processes.push({
                                    pid,
                                    command: parts[10] || 'electron',
                                    args: command
                                });
                            }
                        }
                    }
                }

                resolve(processes);
            });

            ps.on('error', (error) => {
                reject(error);
            });
        });
    }

    /**
     * Kill processes by PID
     */
    public static async killProcess(pid: number, signal: string = 'TERM'): Promise<boolean> {
        return new Promise((resolve) => {
            const kill = spawn('kill', [`-${signal}`, pid.toString()]);
            
            kill.on('close', (code) => {
                resolve(code === 0);
            });

            kill.on('error', () => {
                resolve(false);
            });
        });
    }

    /**
     * Kill stale Electron processes (excluding current process)
     */
    public static async killStaleElectronProcesses(excludePid?: number): Promise<{
        killed: number[],
        failed: number[],
        total: number
    }> {
        const currentPid = excludePid || process.pid;
        const results = {
            killed: [] as number[],
            failed: [] as number[],
            total: 0
        };

        try {
            const processes = await this.getElectronProcesses();
            results.total = processes.length;

            console.log(`[ProcessCleanup] Found ${processes.length} Electron processes`);

            for (const proc of processes) {
                // Skip current process
                if (proc.pid === currentPid) {
                    console.log(`[ProcessCleanup] Skipping current process: ${proc.pid}`);
                    continue;
                }

                console.log(`[ProcessCleanup] Attempting to kill process: ${proc.pid} - ${proc.command}`);
                
                // Try graceful termination first
                const terminated = await this.killProcess(proc.pid, 'TERM');
                
                if (terminated) {
                    results.killed.push(proc.pid);
                    console.log(`[ProcessCleanup] Successfully killed process: ${proc.pid}`);
                } else {
                    // Try force kill
                    const forceKilled = await this.killProcess(proc.pid, 'KILL');
                    if (forceKilled) {
                        results.killed.push(proc.pid);
                        console.log(`[ProcessCleanup] Force killed process: ${proc.pid}`);
                    } else {
                        results.failed.push(proc.pid);
                        console.warn(`[ProcessCleanup] Failed to kill process: ${proc.pid}`);
                    }
                }
            }

        } catch (error) {
            console.error('[ProcessCleanup] Error during cleanup:', error);
        }

        return results;
    }

    /**
     * Check if DuckDB settings file is locked
     */
    public static async isDuckDBLocked(dbPath: string): Promise<{
        locked: boolean,
        lockingPid?: number,
        lockingProcess?: string
    }> {
        return new Promise((resolve) => {
            const lsof = spawn('lsof', [dbPath]);
            let lsofOutput = '';

            lsof.stdout.on('data', (data) => {
                lsofOutput += data.toString();
            });

            lsof.on('close', (code) => {
                if (code === 0 && lsofOutput.trim()) {
                    // File is locked, parse output to find locking process
                    const lines = lsofOutput.split('\n');
                    for (const line of lines) {
                        if (line.includes('Electron')) {
                            const parts = line.trim().split(/\s+/);
                            if (parts.length >= 2) {
                                const pid = parseInt(parts[1]);
                                if (!isNaN(pid)) {
                                    resolve({
                                        locked: true,
                                        lockingPid: pid,
                                        lockingProcess: parts[0] || 'Unknown'
                                    });
                                    return;
                                }
                            }
                        }
                    }
                    resolve({ locked: true });
                } else {
                    resolve({ locked: false });
                }
            });

            lsof.on('error', () => {
                resolve({ locked: false });
            });
        });
    }

    /**
     * Clean up processes holding locks on DuckDB file
     */
    public static async cleanupDuckDBLocks(dbPath: string): Promise<{
        wasLocked: boolean,
        cleanupSuccessful: boolean,
        killedProcesses: number[]
    }> {
        const lockInfo = await this.isDuckDBLocked(dbPath);
        
        if (!lockInfo.locked) {
            return {
                wasLocked: false,
                cleanupSuccessful: true,
                killedProcesses: []
            };
        }

        console.log(`[ProcessCleanup] DuckDB file is locked by PID: ${lockInfo.lockingPid}`);

        if (lockInfo.lockingPid && lockInfo.lockingPid !== process.pid) {
            const killed = await this.killProcess(lockInfo.lockingPid);
            return {
                wasLocked: true,
                cleanupSuccessful: killed,
                killedProcesses: killed ? [lockInfo.lockingPid] : []
            };
        }

        return {
            wasLocked: true,
            cleanupSuccessful: false,
            killedProcesses: []
        };
    }

    /**
     * Comprehensive cleanup - kill stale processes and clean database locks
     */
    public static async performFullCleanup(dbPath?: string): Promise<{
        processCleanup: Awaited<ReturnType<typeof this.killStaleElectronProcesses>>,
        databaseCleanup?: Awaited<ReturnType<typeof this.cleanupDuckDBLocks>>
    }> {
        console.log('[ProcessCleanup] Starting comprehensive cleanup...');

        // Kill stale Electron processes
        const processCleanup = await this.killStaleElectronProcesses();
        console.log(`[ProcessCleanup] Process cleanup: ${processCleanup.killed.length} killed, ${processCleanup.failed.length} failed`);

        let databaseCleanup;
        if (dbPath) {
            // Wait a moment for processes to fully terminate
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Clean up database locks
            databaseCleanup = await this.cleanupDuckDBLocks(dbPath);
            console.log(`[ProcessCleanup] Database cleanup: ${databaseCleanup.cleanupSuccessful ? 'successful' : 'failed'}`);
        }

        return {
            processCleanup,
            databaseCleanup
        };
    }
}