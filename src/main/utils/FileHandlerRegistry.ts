import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { JSONLoader } from 'langchain/document_loaders/fs/json';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import { BaseDocumentLoader } from 'langchain/document_loaders/base';

// Define a type for loader factory functions
export type LoaderFactory = (filePath: string) => BaseDocumentLoader;

/**
 * Registry mapping file extensions to their respective loader factory functions.
 * This allows dynamic lookup of document loaders based on file type.
 */
export const FileHandlerRegistry: Record<string, LoaderFactory> = {
    '.pdf': (filePath) => new PDFLoader(filePath),
    '.txt': (filePath) => new TextLoader(filePath),
    '.md': (filePath) => new TextLoader(filePath),
    '.json': (filePath) => new JSONLoader(filePath),
    '.docx': (filePath) => new DocxLoader(filePath),
    '.doc': (filePath) => new DocxLoader(filePath)
};

/**
 * Retrieves the appropriate loader for a given file extension.
 * @param ext - The file extension (e.g., '.txt', '.pdf')
 * @param filePath - The full path to the file
 * @returns A loader instance or null if no handler is registered for the extension
 */
export function getLoaderForExtension(ext: string, filePath: string): BaseDocumentLoader | null {
    const factory = FileHandlerRegistry[ext.toLowerCase()];
    if (!factory) {
        return null;
    }
    return factory(filePath);
}