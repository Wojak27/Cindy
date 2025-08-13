/**
 * DocumentDetector.ts
 * 
 * Utility for detecting document references in AI chat responses
 * and automatically populating the document viewer
 */

export interface DetectedDocument {
    path: string;
    name: string;
    type: 'file_path' | 'file_name' | 'document_reference';
    confidence: number;
    context: string; // The surrounding text context
}

export class DocumentDetector {
    // Common file extensions for documents
    private static readonly DOCUMENT_EXTENSIONS = [
        'pdf', 'doc', 'docx', 'txt', 'md', 'json', 'csv', 'xlsx', 'xls',
        'py', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'xml', 'yaml', 'yml',
        'java', 'cpp', 'c', 'h', 'rb', 'go', 'rs', 'php', 'swift', 'kt'
    ];

    // Patterns to detect document references
    private static readonly DOCUMENT_PATTERNS = [
        // File paths with extensions
        /(?:file|document|path)?\s*["`']([^"`']+\.(?:pdf|doc|docx|txt|md|json|csv|xlsx|xls|py|js|ts|jsx|tsx|html|css|xml|yaml|yml|java|cpp|c|h|rb|go|rs|php|swift|kt))["`']/gi,
        
        // Markdown-style file references
        /\[([^\]]+\.(?:pdf|doc|docx|txt|md|json|csv|xlsx|xls|py|js|ts|jsx|tsx|html|css|xml|yaml|yml|java|cpp|c|h|rb|go|rs|php|swift|kt))\]/gi,
        
        // File names mentioned in text
        /(?:In|From|File|Document|Found in|Based on|According to)\s+["`']?([^"`'\s]+\.(?:pdf|doc|docx|txt|md|json|csv|xlsx|xls|py|js|ts|jsx|tsx|html|css|xml|yaml|yml|java|cpp|c|h|rb|go|rs|php|swift|kt))["`']?/gi,
        
        // Simple file mentions
        /\b([a-zA-Z0-9_\-./]+\.(?:pdf|doc|docx|txt|md|json|csv|xlsx|xls|py|js|ts|jsx|tsx|html|css|xml|yaml|yml|java|cpp|c|h|rb|go|rs|php|swift|kt))\b/gi
    ];

    /**
     * Detect document references in AI response text
     */
    static detectDocuments(responseText: string): DetectedDocument[] {
        const documents: DetectedDocument[] = [];
        const seenPaths = new Set<string>();

        // Apply each pattern
        for (const pattern of this.DOCUMENT_PATTERNS) {
            let match;
            pattern.lastIndex = 0; // Reset regex state

            while ((match = pattern.exec(responseText)) !== null) {
                const fullMatch = match[0];
                const filePath = match[1];
                
                // Skip if we've already found this path
                if (seenPaths.has(filePath)) {
                    continue;
                }
                seenPaths.add(filePath);

                // Extract context around the match
                const contextStart = Math.max(0, match.index - 50);
                const contextEnd = Math.min(responseText.length, match.index + fullMatch.length + 50);
                const context = responseText.substring(contextStart, contextEnd);

                // Calculate confidence based on context and pattern
                let confidence = 0.5;
                
                // Higher confidence for quoted paths
                if (fullMatch.includes('"') || fullMatch.includes("'") || fullMatch.includes('`')) {
                    confidence += 0.3;
                }
                
                // Higher confidence for markdown references
                if (fullMatch.includes('[') && fullMatch.includes(']')) {
                    confidence += 0.2;
                }
                
                // Higher confidence for contextual indicators
                if (/(?:file|document|found|based on|according to|in|from)/i.test(context)) {
                    confidence += 0.2;
                }

                // Determine document type
                let type: DetectedDocument['type'] = 'file_name';
                if (filePath.includes('/') || filePath.includes('\\')) {
                    type = 'file_path';
                }
                if (/(?:document|reference)/i.test(context)) {
                    type = 'document_reference';
                }

                documents.push({
                    path: filePath,
                    name: this.extractFileName(filePath),
                    type,
                    confidence: Math.min(1.0, confidence),
                    context: context.trim()
                });
            }
        }

        // Sort by confidence (highest first)
        return documents.sort((a, b) => b.confidence - a.confidence);
    }

    /**
     * Extract file name from path
     */
    private static extractFileName(path: string): string {
        const parts = path.replace(/\\/g, '/').split('/');
        return parts[parts.length - 1];
    }

    /**
     * Check if a file extension is a document type
     */
    static isDocumentFile(filePath: string): boolean {
        const extension = filePath.split('.').pop()?.toLowerCase();
        return extension ? this.DOCUMENT_EXTENSIONS.includes(extension) : false;
    }

    /**
     * Resolve document path to absolute path if needed
     */
    static async resolveDocumentPath(documentPath: string): Promise<string | null> {
        try {
            // If it's already an absolute path, return as-is
            if (documentPath.startsWith('/') || documentPath.match(/^[A-Za-z]:/)) {
                return documentPath;
            }

            // For relative paths, we need to check with the vector store or file system
            // This will be implemented in the IPC handler
            return documentPath;
        } catch (error) {
            console.error('[DocumentDetector] Error resolving path:', error);
            return null;
        }
    }

    /**
     * Format document for display in the document viewer
     */
    static formatDocumentForViewer(document: DetectedDocument): {
        path: string;
        name: string;
        size: number;
        mtime: string;
        chunks: number;
    } {
        return {
            path: document.path,
            name: document.name,
            size: 0, // Will be filled by IPC handler
            mtime: new Date().toISOString(),
            chunks: 1 // Default value
        };
    }
}