import fs from 'fs/promises';
import path from 'path';
import { PathValidator } from '../utils/PathValidator';
// import { LangChainVectorStoreService as VectorStoreService } from '@main/services/LangChainVectorStoreService'; // Removed - using DuckDBVectorStore instead

interface Note {
    id: string;
    title: string;
    content: string;
    path: string;
    createdAt: Date;
    updatedAt: Date;
    tags: string[];
}

class FileSystemTool {
    private vaultPath: string;
    private vectorStore: any | null = null; // DuckDBVectorStore instance

    constructor(vaultPath?: string, vectorStore?: any) {
        this.vaultPath = vaultPath || this.getDefaultVaultPath();
        this.vectorStore = vectorStore;
    }

    private getDefaultVaultPath(): string {
        return path.join(process.env.HOME || process.env.USERPROFILE || '', 'Documents', 'CindyVault');
    }

    async initializeVectorStore(): Promise<void> {
        // Vector store should be passed in constructor now
        // If not provided, skip vector store functionality
        if (!this.vectorStore) {
            console.warn('[FileSystemTool] No vector store provided, document indexing disabled');
        }
    }

    async createNote(title: string, content: string, tags: string[] = []): Promise<Note> {
        // Validate path
        const validation = await PathValidator.validate(this.vaultPath);
        if (!validation.valid) {
            throw new Error(`Invalid vault path: ${validation.message}`);
        }

        // Ensure vault directory exists
        await fs.mkdir(this.vaultPath, { recursive: true });

        // Generate filename
        const safeTitle = title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
        const filename = `${safeTitle}-${Date.now()}.md`;
        const filePath = path.join(this.vaultPath, filename);

        // Create note content with YAML frontmatter
        const noteContent = `---
title: ${title}
tags: [${tags.join(', ')}]
createdAt: ${new Date().toISOString()}
---

${content}`;

        // Write file
        await fs.writeFile(filePath, noteContent, 'utf-8');

        // Create note object
        const note: Note = {
            id: filename,
            title,
            content,
            path: filePath,
            createdAt: new Date(),
            updatedAt: new Date(),
            tags
        };

        // Add to vector store
        try {
            await this.initializeVectorStore();
            await this.vectorStore?.addDocument({
                id: note.id,
                title: note.title,
                content: note.content,
                path: note.path,
                createdAt: note.createdAt,
                updatedAt: note.updatedAt,
            });
        } catch (error) {
            console.warn('Failed to index note in vector store:', error);
        }

        return note;
    }

    async editNote(id: string, content: string, title?: string, tags?: string[]): Promise<Note> {
        const filePath = path.join(this.vaultPath, id);

        // Check if file exists
        try {
            await fs.access(filePath);
        } catch {
            throw new Error(`Note not found: ${id}`);
        }

        // Read existing file
        const fileContent = await fs.readFile(filePath, 'utf-8');

        // Parse frontmatter
        let currentTitle = title || 'Untitled';
        let currentTags = tags || [];
        let bodyContent = content;

        const frontmatterMatch = fileContent.match(/^---\n([\s\S]*?)\n---/);
        if (frontmatterMatch) {
            const frontmatter = frontmatterMatch[1];
            const titleMatch = frontmatter.match(/title:\s*(.+)/);
            if (titleMatch) currentTitle = title || titleMatch[1];

            const tagsMatch = frontmatter.match(/tags:\s*\[([^\]]+)\]/);
            if (tagsMatch) currentTags = tags || tagsMatch[1].split(',').map(t => t.trim());

            // Extract body content
            bodyContent = fileContent.substring(frontmatterMatch[0].length).trim();
        }

        // Update content
        const updatedContent = `---
title: ${currentTitle}
tags: [${currentTags.join(', ')}]
createdAt: ${new Date().toISOString()}
---

${bodyContent}`;

        // Write updated file
        await fs.writeFile(filePath, updatedContent, 'utf-8');

        // Update vector store
        try {
            await this.initializeVectorStore();
            await this.vectorStore?.updateDocument({
                id: id,
                content: bodyContent,
                title: currentTitle,
                updatedAt: new Date(),
                path: filePath,
                createdAt: undefined
            });
        } catch (error) {
            console.warn('Failed to update note in vector store:', error);
        }

        return {
            id,
            title: currentTitle,
            content: bodyContent,
            path: filePath,
            createdAt: new Date(),
            updatedAt: new Date(),
            tags: currentTags
        };
    }

    async searchNotes(query: string, options?: { limit?: number; tags?: string[] }): Promise<Note[]> {
        try {
            await this.initializeVectorStore();
            const results = await this.vectorStore?.search(query, {
                k: options?.limit || 10,
                filter: options?.tags ? { tags: options.tags } : undefined
            });

            return results?.map((r) => {
                return {
                    id: r.source,
                    title: r.metadata.title || 'Untitled',
                    content: r.content,
                    path: r.metadata.path,
                    createdAt: new Date(r.metadata.createdAt),
                    updatedAt: new Date(r.metadata.updatedAt),
                    tags: r.metadata.tags || []
                }
            }) || [];
        } catch (error) {
            console.error('Search failed:', error);
            return [];
        }
    }

    async getVaultPath(): Promise<string> {
        return this.vaultPath;
    }

    async setVaultPath(newPath: string): Promise<void> {
        const validation = await PathValidator.validate(newPath);
        if (!validation.valid) {
            throw new Error(`Invalid vault path: ${validation.message}`);
        }

        this.vaultPath = newPath;

        // Reinitialize vector store with new path
        if (this.vectorStore) {
            this.vectorStore = null;
            await this.initializeVectorStore();
        }
    }
}

export { FileSystemTool, Note };