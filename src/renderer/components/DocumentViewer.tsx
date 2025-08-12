import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Typography,
    Button,
    IconButton,
    Card,
    CardContent,
    CardActions,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    ListItemSecondaryAction,
    Chip,
    CircularProgress,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    useTheme,
    alpha,
    Tooltip,
    ButtonGroup,
} from '@mui/material';
import {
    InsertDriveFile as FileIcon,
    PictureAsPdf as PdfIcon,
    Description as DocIcon,
    Code as CodeIcon,
    Image as ImageIcon,
    ViewList as ListViewIcon,
    ViewModule as GridViewIcon,
    Visibility as ViewIcon,
    Folder as FolderIcon,
    AccessTime as TimeIcon,
    Storage as SizeIcon,
    Close as CloseIcon,
} from '@mui/icons-material';
// import DocViewer, { DocViewerRenderers } from '@cyntler/react-doc-viewer'; // Disabled due to Electron compatibility issues
import { ipcRenderer } from 'electron';

interface IndexedFile {
    path: string;
    name: string;
    size: number | bigint;
    mtime: string;
    chunks: number;
}

interface DocumentViewerProps {
    databasePath: string;
}

type ViewMode = 'grid' | 'list';

// Simple document viewer component for Electron compatibility
const SimpleDocumentViewer: React.FC<{
    fileUri?: string;
    fileName: string;
    mimeType: string;
    textContent?: string;
}> = ({ fileUri, fileName, mimeType, textContent }) => {
    const theme = useTheme();
    
    if (mimeType.startsWith('image/')) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <img 
                    src={fileUri} 
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
        return (
            <Box sx={{ height: '100%', width: '100%' }}>
                <iframe
                    src={fileUri}
                    style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                    }}
                    title={fileName}
                />
            </Box>
        );
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
                    link.href = fileUri;
                    link.download = fileName;
                    link.click();
                }}
            >
                Download File
            </Button>
        </Box>
    );
};

// TextFileContent component removed - now handling text content directly

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

const DocumentViewer: React.FC<DocumentViewerProps> = ({ databasePath }) => {
    const theme = useTheme();
    const [files, setFiles] = useState<IndexedFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [selectedFile, setSelectedFile] = useState<IndexedFile | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [documentUri, setDocumentUri] = useState<string | null>(null);
    const [textContent, setTextContent] = useState<string | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);

    // Load indexed files
    const loadFiles = useCallback(async () => {
        if (!databasePath) {
            setFiles([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const result = await ipcRenderer.invoke('vector-store:get-indexed-items', databasePath);
            if (result.success) {
                setFiles(result.items || []);
            } else {
                setError(result.message || 'Failed to load indexed files');
            }
        } catch (err: any) {
            console.error('Error loading indexed files:', err);
            setError(err.message || 'Failed to load indexed files');
        } finally {
            setLoading(false);
        }
    }, [databasePath]);

    useEffect(() => {
        loadFiles();
    }, [loadFiles]);

    // Get file icon based on extension
    const getFileIcon = (fileName: string) => {
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

    // Format file size
    const formatFileSize = (bytes: number | bigint): string => {
        // Convert BigInt to number for calculations
        const numBytes = typeof bytes === 'bigint' ? Number(bytes) : bytes;
        if (numBytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(numBytes) / Math.log(k));
        return parseFloat((numBytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    // Format date
    const formatDate = (dateString: string): string => {
        try {
            return new Date(dateString).toLocaleDateString();
        } catch {
            return 'Unknown';
        }
    };

    // Handle file preview
    const handlePreview = async (file: IndexedFile) => {
        setSelectedFile(file);
        setPreviewOpen(true);
        setLoadingPreview(true);
        setPreviewError(null);
        setDocumentUri(null);
        setTextContent(null);

        try {
            const fileType = getFileType(file.name);
            
            // Handle text files differently to avoid blob URL fetch issues
            if (fileType.startsWith('text/') || fileType === 'application/json') {
                const result = await ipcRenderer.invoke('read-file-buffer', file.path);
                console.log('[DocumentViewer] Text file IPC result:', { success: result.success, error: result.error, hasData: !!result.data });
                
                if (result.success) {
                    // Decode base64 text content directly
                    const textContent = atob(result.data);
                    console.log('[DocumentViewer] Decoded text content length:', textContent.length);
                    setTextContent(textContent);
                } else {
                    throw new Error(result.error || 'Failed to read text file');
                }
            } else {
                // For non-text files (PDFs, images), create blob URL
                const uri = await getDocumentUri(file);
                setDocumentUri(uri);
            }
        } catch (error: any) {
            console.error('[DocumentViewer] Preview error:', error);
            setPreviewError(error.message || 'Failed to load document');
        } finally {
            setLoadingPreview(false);
        }
    };

    // Close preview
    const handleClosePreview = () => {
        setPreviewOpen(false);
        setSelectedFile(null);
        
        // Clean up blob URL to prevent memory leaks
        if (documentUri) {
            URL.revokeObjectURL(documentUri);
            setDocumentUri(null);
        }
        
        setTextContent(null);
        setPreviewError(null);
        setLoadingPreview(false);
    };

    // Get document URI for DocViewer using buffer
    const getDocumentUri = async (file: IndexedFile) => {
        try {
            console.log('[DocumentViewer] Requesting file buffer for:', file.path);
            const result = await ipcRenderer.invoke('read-file-buffer', file.path);
            console.log('[DocumentViewer] IPC result:', { success: result.success, error: result.error, hasData: !!result.data });
            
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
                console.log('[DocumentViewer] Created blob URL:', blobUrl, 'MIME type:', result.mimeType);
                return blobUrl;
            }
            throw new Error(result.error || 'Failed to read file');
        } catch (error) {
            console.error('[DocumentViewer] Error creating document URI:', error);
            throw error;
        }
    };

    // Render file card (grid view)
    const renderFileCard = (file: IndexedFile) => (
        <Card
            key={file.path}
                sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'transform 0.2s ease-in-out',
                    '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: theme.shadows[4],
                    },
                }}
            >
                <CardContent sx={{ flexGrow: 1, pb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        {getFileIcon(file.name)}
                        <Typography
                            variant="subtitle2"
                            sx={{
                                ml: 1,
                                fontWeight: 600,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                flex: 1,
                            }}
                            title={file.name}
                        >
                            {file.name}
                        </Typography>
                    </Box>
                    
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <SizeIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                        <Typography variant="caption" color="text.secondary">
                            {formatFileSize(file.size)}
                        </Typography>
                    </Box>
                    
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <TimeIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                        <Typography variant="caption" color="text.secondary">
                            {formatDate(file.mtime)}
                        </Typography>
                    </Box>
                    
                    <Chip
                        label={`${file.chunks} chunks`}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: '0.7rem' }}
                    />
                </CardContent>
                
                <CardActions sx={{ pt: 0 }}>
                    <Button
                        size="small"
                        startIcon={<ViewIcon />}
                        onClick={() => handlePreview(file)}
                        variant="contained"
                        fullWidth
                    >
                        View
                    </Button>
                </CardActions>
            </Card>
    );

    // Render file list item (list view)
    const renderFileListItem = (file: IndexedFile) => (
        <ListItem
            key={file.path}
            sx={{
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 1,
                mb: 1,
                '&:hover': {
                    backgroundColor: alpha(theme.palette.primary.main, 0.04),
                },
            }}
        >
            <ListItemIcon>
                {getFileIcon(file.name)}
            </ListItemIcon>
            <ListItemText
                primary={file.name}
                secondary={
                    <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                            {formatFileSize(file.size)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {formatDate(file.mtime)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {file.chunks} chunks
                        </Typography>
                    </Box>
                }
            />
            <ListItemSecondaryAction>
                <Button
                    size="small"
                    startIcon={<ViewIcon />}
                    onClick={() => handlePreview(file)}
                    variant="outlined"
                >
                    View
                </Button>
            </ListItemSecondaryAction>
        </ListItem>
    );

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
                <CircularProgress />
                <Typography variant="body2" sx={{ ml: 2 }}>
                    Loading documents...
                </Typography>
            </Box>
        );
    }

    if (error) {
        return (
            <Alert severity="error" sx={{ m: 2 }}>
                {error}
                <Button onClick={loadFiles} sx={{ ml: 2 }}>
                    Retry
                </Button>
            </Alert>
        );
    }

    return (
        <Box sx={{ p: 2 }}>
            {/* Header with view toggle */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box>
                    <Typography variant="h6" gutterBottom>
                        Indexed Documents
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {files.length} document{files.length !== 1 ? 's' : ''} indexed
                    </Typography>
                </Box>
                
                <ButtonGroup variant="outlined" size="small">
                    <Tooltip title="Grid View">
                        <Button
                            onClick={() => setViewMode('grid')}
                            variant={viewMode === 'grid' ? 'contained' : 'outlined'}
                        >
                            <GridViewIcon />
                        </Button>
                    </Tooltip>
                    <Tooltip title="List View">
                        <Button
                            onClick={() => setViewMode('list')}
                            variant={viewMode === 'list' ? 'contained' : 'outlined'}
                        >
                            <ListViewIcon />
                        </Button>
                    </Tooltip>
                </ButtonGroup>
            </Box>

            {/* File listing */}
            {files.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                    <FolderIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                    <Typography variant="h6" color="text.secondary">
                        No Documents Indexed
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Index some documents to see them here.
                    </Typography>
                </Box>
            ) : (
                <>
                    {viewMode === 'grid' ? (
                        <Box
                            sx={{
                                display: 'grid',
                                gridTemplateColumns: {
                                    xs: '1fr',
                                    sm: 'repeat(2, 1fr)',
                                    md: 'repeat(3, 1fr)',
                                    lg: 'repeat(4, 1fr)',
                                },
                                gap: 2,
                            }}
                        >
                            {files.map(renderFileCard)}
                        </Box>
                    ) : (
                        <List sx={{ p: 0 }}>
                            {files.map(renderFileListItem)}
                        </List>
                    )}
                </>
            )}

            {/* Document Preview Dialog */}
            <Dialog
                open={previewOpen}
                onClose={handleClosePreview}
                maxWidth="lg"
                fullWidth
                PaperProps={{
                    sx: {
                        height: '90vh',
                        maxHeight: '90vh',
                    },
                }}
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                        <Typography variant="h6">
                            {selectedFile?.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {selectedFile && formatFileSize(selectedFile.size)} • {selectedFile && formatDate(selectedFile.mtime)}
                        </Typography>
                    </Box>
                    <IconButton onClick={handleClosePreview} size="small">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                
                <DialogContent sx={{ p: 0, overflow: 'hidden' }}>
                    {loadingPreview ? (
                        <Box sx={{ 
                            display: 'flex', 
                            flexDirection: 'column',
                            justifyContent: 'center', 
                            alignItems: 'center', 
                            height: 400,
                            gap: 2
                        }}>
                            <CircularProgress />
                            <Typography variant="body2" color="text.secondary">
                                Loading document...
                            </Typography>
                        </Box>
                    ) : previewError ? (
                        <Box sx={{ 
                            display: 'flex', 
                            flexDirection: 'column',
                            justifyContent: 'center', 
                            alignItems: 'center', 
                            height: 400,
                            gap: 2,
                            p: 3
                        }}>
                            <Alert severity="error" sx={{ mb: 2 }}>
                                {previewError}
                            </Alert>
                            <Button 
                                onClick={() => selectedFile && handlePreview(selectedFile)}
                                variant="outlined"
                            >
                                Retry
                            </Button>
                        </Box>
                    ) : selectedFile && (documentUri || textContent) ? (
                        <Box sx={{ height: '100%', width: '100%', p: 2 }}>
                            <SimpleDocumentViewer 
                                fileUri={documentUri}
                                fileName={selectedFile.name}
                                mimeType={getFileType(selectedFile.name)}
                                textContent={textContent}
                            />
                        </Box>
                    ) : (
                        <Box sx={{ 
                            display: 'flex', 
                            justifyContent: 'center', 
                            alignItems: 'center', 
                            height: 400
                        }}>
                            <Typography variant="body2" color="text.secondary">
                                No document to display
                            </Typography>
                        </Box>
                    )}
                </DialogContent>
                
                <DialogActions>
                    <Button onClick={handleClosePreview}>
                        Close
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default DocumentViewer;