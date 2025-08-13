/**
 * useDocumentDetection.ts
 * 
 * React hook for automatically detecting and resolving documents from AI responses
 */

import { useCallback } from 'react';
import { useDispatch } from 'react-redux';
import { ipcRenderer } from 'electron';
import { DocumentDetector } from '../utils/documentDetector';
import { showDocument } from '../../store/actions';

export interface ResolvedDocument {
    path: string;
    name: string;
    size: number;
    mtime: string;
    chunks: number;
    detectionContext?: string;
    confidence?: number;
}

export const useDocumentDetection = () => {
    const dispatch = useDispatch();

    const detectAndShowDocuments = useCallback(async (responseText: string): Promise<ResolvedDocument[]> => {
        try {
            console.log('🔍 [DocumentDetection] Analyzing AI response for document references...');
            
            // First, detect documents locally
            const detectedDocuments = DocumentDetector.detectDocuments(responseText);
            
            if (detectedDocuments.length === 0) {
                console.log('🔍 [DocumentDetection] No document references detected');
                return [];
            }

            console.log('🔍 [DocumentDetection] Found', detectedDocuments.length, 'potential document references');

            // Try to resolve documents via IPC
            const result = await ipcRenderer.invoke('detect-and-resolve-documents', responseText);
            
            if (!result.success) {
                console.warn('🔍 [DocumentDetection] Failed to resolve documents:', result.error);
                return [];
            }

            const resolvedDocuments = result.documents || [];
            console.log('🔍 [DocumentDetection] Successfully resolved', resolvedDocuments.length, 'documents');

            // Automatically show the first resolved document with highest confidence
            if (resolvedDocuments.length > 0) {
                const bestDocument = resolvedDocuments.reduce((best: ResolvedDocument, current: ResolvedDocument) => {
                    return (current.confidence || 0) > (best.confidence || 0) ? current : best;
                });

                console.log('🔍 [DocumentDetection] Auto-showing document:', bestDocument.name);
                dispatch(showDocument(bestDocument));
            }

            return resolvedDocuments;
        } catch (error) {
            console.error('🔍 [DocumentDetection] Error detecting documents:', error);
            return [];
        }
    }, [dispatch]);

    const resolveDocumentPath = useCallback(async (documentPath: string): Promise<ResolvedDocument | null> => {
        try {
            console.log('🔍 [DocumentDetection] Resolving document path:', documentPath);
            
            const result = await ipcRenderer.invoke('resolve-document-path', documentPath);
            
            if (!result.success) {
                console.warn('🔍 [DocumentDetection] Failed to resolve document path:', result.error);
                return null;
            }

            return result.document;
        } catch (error) {
            console.error('🔍 [DocumentDetection] Error resolving document path:', error);
            return null;
        }
    }, []);

    const showResolvedDocument = useCallback((document: ResolvedDocument) => {
        console.log('🔍 [DocumentDetection] Showing resolved document:', document.name);
        dispatch(showDocument(document));
    }, [dispatch]);

    return {
        detectAndShowDocuments,
        resolveDocumentPath,
        showResolvedDocument
    };
};

export default useDocumentDetection;