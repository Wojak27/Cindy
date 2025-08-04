import { stat, access, constants } from 'fs/promises';

class PathValidator {
    static async validate(path: string): Promise<{ valid: boolean; message?: string }> {
        if (!path) {
            return { valid: false, message: 'Path is required' };
        }

        try {
            // Check if path exists
            await stat(path);

            // Check if we have read permissions
            await access(path, constants.R_OK);

            return { valid: true };
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return { valid: false, message: 'Path does not exist' };
            } else if (error.code === 'EACCES') {
                return { valid: false, message: 'Insufficient permissions to access path' };
            } else {
                return { valid: false, message: `Invalid path: ${error.message}` };
            }
        }
    }

    static async isDirectory(path: string): Promise<boolean> {
        try {
            const stats = await stat(path);
            return stats.isDirectory();
        } catch (error) {
            return false;
        }
    }

    static async isWritable(path: string): Promise<boolean> {
        try {
            await access(path, constants.W_OK);
            return true;
        } catch (error) {
            return false;
        }
    }
}

export { PathValidator };