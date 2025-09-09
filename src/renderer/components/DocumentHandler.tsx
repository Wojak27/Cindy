import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    CircularProgress,
    Alert,
    Button,
    useTheme,
} from '@mui/material';
import {
    PictureAsPdf as PdfIcon,
    Code as CodeIcon,
    Image as ImageIcon,
    InsertDriveFile as FileIcon,
} from '@mui/icons-material';
import { ipcRenderer } from 'electron';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import '../polyfills';

// Configure pdfjs worker for Electron
const isProduction = process.env.NODE_ENV === 'production';
const workerPath = isProduction
    ? './workers/pdf.worker.min.mjs'  // Production: use bundled worker
    : `http://localhost:3004/workers/pdf.worker.min.mjs`;  // Development: use dev server

pdfjs.GlobalWorkerOptions.workerSrc = workerPath;

interface DocumentHandlerProps {
    filePath: string;
    fileName: string;
}

interface PDFViewerProps {
    fileUri: string;
    fileName: string;
}

const PDFViewer: React.FC<PDFViewerProps> = ({ fileUri, fileName }) => {
    const [numPages, setNumPages] = useState<number>(0);
    const [pageNumber, setPageNumber] = useState<number>(1);
    const [scale, setScale] = useState<number>(1.0);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const theme = useTheme();

    const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
        setNumPages(numPages);
        setLoading(false);
        setError(null);
    };

    const onDocumentLoadError = (error: Error) => {
        setLoading(false);
        let errorMessage = error.message;

        // Provide helpful error messages for common PDF.js worker issues
        if (error.message.includes('Setting up fake worker failed')) {
            errorMessage = 'PDF worker failed to initialize. This may be due to security restrictions or network issues.';
        } else if (error.message.includes('worker')) {
            errorMessage = 'PDF worker error. Please check your internet connection or try refreshing the page.';
        }

        setError(errorMessage);
        console.error('[PDF.js] Document load error:', error);
        console.error('[PDF.js] Worker source:', pdfjs.GlobalWorkerOptions.workerSrc);
    };

    const goToPrevPage = () => {
        setPageNumber(page => Math.max(1, page - 1));
    };

    const goToNextPage = () => {
        setPageNumber(page => Math.min(numPages, page + 1));
    };

    const zoomIn = () => {
        setScale(scale => Math.min(3.0, scale + 0.2));
    };

    const zoomOut = () => {
        setScale(scale => Math.max(0.5, scale - 0.2));
    };

    const resetZoom = () => {
        setScale(1.0);
    };

    if (error) {
        return (
            <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100%',
                gap: 2
            }}>
                <PdfIcon sx={{ fontSize: 64, color: 'error.main' }} />
                <Typography variant="h6" color="error">
                    Failed to load PDF
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    {error}
                </Typography>
                <Button
                    variant="outlined"
                    onClick={() => {
                        const link = document.createElement('a');
                        link.href = fileUri;
                        link.download = fileName;
                        link.click();
                    }}
                >
                    Download PDF
                </Button>
            </Box>
        );
    }

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* PDF Controls */}
            <Box sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 1,
                borderBottom: `1px solid ${theme.palette.divider}`,
                backgroundColor: theme.palette.background.paper,
                flexShrink: 0
            }}>
                <Button onClick={goToPrevPage} disabled={pageNumber <= 1} size="small" variant="outlined">
                    Previous
                </Button>
                <Button onClick={goToNextPage} disabled={pageNumber >= numPages} size="small" variant="outlined">
                    Next
                </Button>

                <Typography variant="body2" sx={{ mx: 2 }}>
                    Page {pageNumber} of {numPages}
                </Typography>

                <Button onClick={zoomOut} disabled={scale <= 0.5} size="small" variant="outlined">
                    Zoom Out
                </Button>
                <Button onClick={resetZoom} size="small" variant="outlined">
                    {Math.round(scale * 100)}%
                </Button>
                <Button onClick={zoomIn} disabled={scale >= 3.0} size="small" variant="outlined">
                    Zoom In
                </Button>

                <Box sx={{ flexGrow: 1 }} />

                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                    {fileName}
                </Typography>
            </Box>

            {/* PDF Content */}
            <Box sx={{
                flex: 1,
                overflow: 'auto',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start',
                p: 2,
                backgroundColor: theme.palette.grey[100]
            }}>
                {loading && (
                    <Box sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 2,
                        mt: 4
                    }}>
                        <CircularProgress />
                        <Typography variant="body2" color="text.secondary">
                            Loading PDF...
                        </Typography>
                    </Box>
                )}

                <Document
                    file={fileUri}
                    onLoadSuccess={onDocumentLoadSuccess}
                    onLoadError={onDocumentLoadError}
                    loading=""
                >
                    <Page
                        pageNumber={pageNumber}
                        scale={scale}
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                    />
                </Document>
            </Box>
        </Box>
    );
};

// Get file type from filename
const getFileType = (fileName: string): string => {
    const ext = fileName.toLowerCase().split('.').pop();
    const mimeTypes: Record<string, string> = {
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'txt': 'text/plain',
        'md': 'text/markdown',
        'json': 'application/json',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'html': 'text/html',
        'htm': 'text/html',
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
};

// Simple document viewer component for Electron compatibility
const SimpleDocumentViewer: React.FC<{
    fileUri?: string | null;
    fileName: string;
    mimeType: string;
    textContent?: string | null;
}> = ({ fileUri, fileName, mimeType, textContent }) => {
    const theme = useTheme();

    if (mimeType.startsWith('image/')) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <img
                    src={fileUri || ''}
                    alt={fileName}
                    style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain'
                    }}
                />
            </Box>
        );
    }

    if (mimeType === 'application/pdf') {
        return <PDFViewer fileUri={fileUri!} fileName={fileName} />;
    }

    if (mimeType.startsWith('text/') || mimeType === 'application/json') {
        return (
            <Box sx={{ height: '100%', width: '100%', overflow: 'auto' }}>
                <Typography variant="body2" component="pre" sx={{
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                    lineHeight: 1.6,
                    p: 2,
                    backgroundColor: theme.palette.background.default,
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 1,
                }}>
                    {textContent || 'No content available'}
                </Typography>
            </Box>
        );
    }

    // Fallback for unsupported file types
    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100%',
            gap: 2
        }}>
            <FileIcon sx={{ fontSize: 64, color: 'text.secondary' }} />
            <Typography variant="h6" color="text.secondary">
                Preview not available
            </Typography>
            <Typography variant="body2" color="text.secondary">
                File type: {mimeType}
            </Typography>
            <Button
                variant="outlined"
                onClick={() => {
                    const link = document.createElement('a');
                    if (fileUri) {
                        link.href = fileUri;
                        link.download = fileName;
                        link.click();
                    }
                }}
            >
                Download File
            </Button>
        </Box>
    );
};

const DocumentHandler: React.FC<DocumentHandlerProps> = ({ filePath, fileName }) => {
    const [documentUri, setDocumentUri] = useState<string | null>(null);
    const [textContent, setTextContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const mimeType = getFileType(fileName);

    useEffect(() => {
        const loadDocument = async () => {
            setLoading(true);
            setError(null);
            setDocumentUri(null);
            setTextContent(null);

            try {
                // Handle text files differently to avoid blob URL fetch issues
                if (mimeType.startsWith('text/') || mimeType === 'application/json') {
                    const result = await ipcRenderer.invoke('read-file-buffer', filePath);
                    console.log('[DocumentHandler] Text file IPC result:', { success: result.success, error: result.error, hasData: !!result.data });

                    if (result.success) {
                        // Decode base64 text content directly
                        const textContent = atob(result.data);
                        console.log('[DocumentHandler] Decoded text content length:', textContent.length);
                        setTextContent(textContent);
                    } else {
                        throw new Error(result.error || 'Failed to read text file');
                    }
                } else {
                    // For non-text files (PDFs, images), create blob URL
                    const result = await ipcRenderer.invoke('read-file-buffer', filePath);
                    console.log('[DocumentHandler] IPC result:', { success: result.success, error: result.error, hasData: !!result.data });

                    if (result.success) {
                        // Create blob URL from base64 data
                        const byteCharacters = atob(result.data);
                        const byteNumbers = new Array(byteCharacters.length);
                        for (let i = 0; i < byteCharacters.length; i++) {
                            byteNumbers[i] = byteCharacters.charCodeAt(i);
                        }
                        const byteArray = new Uint8Array(byteNumbers);
                        const blob = new Blob([byteArray], { type: result.mimeType || 'application/octet-stream' });
                        const blobUrl = URL.createObjectURL(blob);
                        console.log('[DocumentHandler] Created blob URL:', blobUrl, 'MIME type:', result.mimeType);
                        setDocumentUri(blobUrl);
                    } else {
                        throw new Error(result.error || 'Failed to read file');
                    }
                }
            } catch (err: any) {
                console.error('[DocumentHandler] Error loading document:', err);
                setError(err.message || 'Failed to load document');
            } finally {
                setLoading(false);
            }
        };

        loadDocument();

        // Clean up blob URL on unmount
        return () => {
            if (documentUri) {
                URL.revokeObjectURL(documentUri);
            }
        };
    }, [filePath, mimeType]);

    if (loading) {
        return (
            <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100%',
                gap: 2
            }}>
                <CircularProgress />
                <Typography variant="body2" color="text.secondary">
                    Loading document...
                </Typography>
            </Box>
        );
    }

    if (error) {
        return (
            <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100%',
                gap: 2,
                p: 3
            }}>
                <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                </Alert>
                <Button
                    onClick={() => window.location.reload()}
                    variant="outlined"
                >
                    Retry
                </Button>
            </Box>
        );
    }

    return (
        <Box sx={{ height: '100%', width: '100%' }}>
            <SimpleDocumentViewer
                fileUri={documentUri}
                fileName={fileName}
                mimeType={mimeType}
                textContent={textContent}
            />
        </Box>
    );
};

export default DocumentHandler;