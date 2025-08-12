import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    IconButton,
    Card,
    CardContent,
    Paper,
    useTheme,
    alpha,
} from '@mui/material';
import {
    Close as CloseIcon,
    InsertDriveFile as FileIcon,
    PictureAsPdf as PdfIcon,
    Description as DocIcon,
    Code as CodeIcon,
    Image as ImageIcon,
} from '@mui/icons-material';
import { ipcRenderer } from 'electron';

interface IndexedFile {
    path: string;
    name: string;
    size: number | bigint;
    mtime: string;
    chunks: number;
}

interface ChatDocumentPanelProps {
    document: IndexedFile;
    onClose: () => void;
}

// Simple document viewer for chat panel
const ChatDocumentViewer: React.FC<{
    fileUri?: string;
    fileName: string;
    mimeType: string;
    textContent?: string;
}> = ({ fileUri, fileName, mimeType, textContent }) => {
    const theme = useTheme();
    
    if (mimeType.startsWith('image/')) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 2 }}>
                <img 
                    src={fileUri} 
                    alt={fileName}
                    style={{ 
                        maxWidth: '100%', 
                        maxHeight: '60vh', 
                        objectFit: 'contain',
                        borderRadius: theme.shape.borderRadius,
                    }}
                />
            </Box>
        );
    }
    
    if (mimeType === 'application/pdf') {
        return (
            <Box sx={{ height: '60vh', width: '100%' }}>
                <iframe
                    src={fileUri}
                    style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        borderRadius: theme.shape.borderRadius,
                    }}
                    title={fileName}
                />
            </Box>
        );
    }
    
    if (mimeType.startsWith('text/') || mimeType === 'application/json') {
        return (
            <Paper 
                variant="outlined" 
                sx={{ 
                    height: '60vh', 
                    overflow: 'auto',
                    backgroundColor: theme.palette.background.default,
                }}
            >
                <Typography variant="body2" component="pre" sx={{ 
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    lineHeight: 1.4,
                    p: 2,
                }}>
                    {textContent || 'No content available'}
                </Typography>
            </Paper>
        );
    }
    
    // Fallback for unsupported file types
    return (
        <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column',
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '200px',
            gap: 1
        }}>
            <FileIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
            <Typography variant="body2" color="text.secondary">
                Preview not available
            </Typography>
            <Typography variant="caption" color="text.secondary">
                {mimeType}
            </Typography>
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

// Get file icon based on extension
const getFileIcon = (fileName: string, theme: any) => {
    const ext = fileName.toLowerCase().split('.').pop();
    switch (ext) {
        case 'pdf':
            return <PdfIcon sx={{ color: '#d32f2f' }} />;
        case 'doc':
        case 'docx':
            return <DocIcon sx={{ color: '#1976d2' }} />;
        case 'txt':
        case 'md':
            return <CodeIcon sx={{ color: '#388e3c' }} />;
        case 'json':
            return <CodeIcon sx={{ color: '#ff9800' }} />;
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'gif':
            return <ImageIcon sx={{ color: '#9c27b0' }} />;
        default:
            return <FileIcon sx={{ color: theme.palette.text.secondary }} />;
    }
};

const ChatDocumentPanel: React.FC<ChatDocumentPanelProps> = ({ document, onClose }) => {
    const theme = useTheme();
    const [documentUri, setDocumentUri] = useState<string | null>(null);
    const [textContent, setTextContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fileType = getFileType(document.name);

    useEffect(() => {
        const loadDocument = async () => {
            setLoading(true);
            setError(null);
            
            try {
                // Handle text files differently to avoid blob URL fetch issues
                if (fileType.startsWith('text/') || fileType === 'application/json') {
                    const result = await ipcRenderer.invoke('read-file-buffer', document.path);
                    
                    if (result.success) {
                        // Decode base64 text content directly
                        const textContent = atob(result.data);
                        setTextContent(textContent);
                    } else {
                        throw new Error(result.error || 'Failed to read text file');
                    }
                } else {
                    // For non-text files (PDFs, images), create blob URL
                    const result = await ipcRenderer.invoke('read-file-buffer', document.path);
                    
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
                        setDocumentUri(blobUrl);
                    } else {
                        throw new Error(result.error || 'Failed to read file');
                    }
                }
            } catch (err: any) {
                console.error('Error loading document:', err);
                setError(err.message || 'Failed to load document');
            } finally {
                setLoading(false);
            }
        };

        loadDocument();

        // Cleanup blob URL on unmount
        return () => {
            if (documentUri) {
                URL.revokeObjectURL(documentUri);
            }
        };
    }, [document.path, fileType]);

    return (
        <Card sx={{ 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column',
            backgroundColor: alpha(theme.palette.background.paper, 0.95),
            backdropFilter: 'blur(10px)',
        }}>
            {/* Header */}
            <CardContent sx={{ pb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                        {getFileIcon(document.name, theme)}
                        <Box sx={{ minWidth: 0 }}>
                            <Typography 
                                variant="subtitle2" 
                                sx={{ 
                                    fontWeight: 600,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                                title={document.name}
                            >
                                {document.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {typeof document.size === 'bigint' ? Number(document.size) : document.size} bytes
                            </Typography>
                        </Box>
                    </Box>
                    <IconButton onClick={onClose} size="small">
                        <CloseIcon />
                    </IconButton>
                </Box>
            </CardContent>

            {/* Content */}
            <Box sx={{ flex: 1, overflow: 'hidden', px: 2, pb: 2 }}>
                {loading ? (
                    <Box sx={{ 
                        display: 'flex', 
                        justifyContent: 'center', 
                        alignItems: 'center', 
                        height: '200px' 
                    }}>
                        <Typography variant="body2" color="text.secondary">
                            Loading document...
                        </Typography>
                    </Box>
                ) : error ? (
                    <Box sx={{ 
                        display: 'flex', 
                        justifyContent: 'center', 
                        alignItems: 'center', 
                        height: '200px' 
                    }}>
                        <Typography variant="body2" color="error">
                            {error}
                        </Typography>
                    </Box>
                ) : (
                    <ChatDocumentViewer 
                        fileUri={documentUri}
                        fileName={document.name}
                        mimeType={fileType}
                        textContent={textContent}
                    />
                )}
            </Box>
        </Card>
    );
};

export default ChatDocumentPanel;