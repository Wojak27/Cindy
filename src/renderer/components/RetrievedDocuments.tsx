/**
 * RetrievedDocuments.tsx
 * 
 * Component for displaying multiple retrieved documents in the side panel.
 * Shows document metadata, provides file access, and handles user settings.
 */

import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import {
    Box,
    Typography,
    Card,
    CardContent,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    IconButton,
    Chip,
    Tooltip,
    Collapse,
    useTheme,
    alpha,
} from '@mui/material';
import {
    InsertDriveFile as FileIcon,
    ExpandMore as ExpandMoreIcon,
    ExpandLess as ExpandLessIcon,
    Info as InfoIcon,
    OpenInNew as OpenIcon,
    Folder as FolderIcon,
} from '@mui/icons-material';
import DocumentHandler from './DocumentHandler';

export interface RetrievedDocument {
    path: string;
    name: string;
    size: number | bigint;
    mtime: string;
    chunks: number;
    relevanceScore?: number;
    matchedContent?: string;
}

interface RetrievedDocumentsProps {
    documents: RetrievedDocument[];
    query?: string;
    onDocumentOpen?: (document: RetrievedDocument) => void;
}

const RetrievedDocuments: React.FC<RetrievedDocumentsProps> = ({
    documents,
    query,
    onDocumentOpen
}) => {
    const theme = useTheme();
    const settings = useSelector((state: any) => state.settings);
    const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
    
    // Get settings or use defaults
    const maxDocuments = settings?.ui?.retrievedDocuments?.maxDocuments || 5;
    const autoExpand = settings?.ui?.retrievedDocuments?.autoExpand || false;
    
    // Limit documents based on settings
    const displayedDocs = documents.slice(0, maxDocuments);
    const hiddenCount = Math.max(0, documents.length - maxDocuments);
    
    // Initialize auto-expand
    React.useEffect(() => {
        if (autoExpand && displayedDocs.length > 0) {
            setExpandedDocs(new Set(displayedDocs.map(doc => doc.path)));
        }
    }, [autoExpand, displayedDocs]);
    
    const toggleExpanded = (docPath: string) => {
        setExpandedDocs(prev => {
            const newSet = new Set(prev);
            if (newSet.has(docPath)) {
                newSet.delete(docPath);
            } else {
                newSet.add(docPath);
            }
            return newSet;
        });
    };
    
    const handleOpenDocument = (doc: RetrievedDocument) => {
        if (onDocumentOpen) {
            onDocumentOpen(doc);
        }
    };
    
    const formatFileSize = (size: number | bigint) => {
        const numSize = typeof size === 'bigint' ? Number(size) : size;
        if (numSize < 1024) return `${numSize}B`;
        if (numSize < 1024 * 1024) return `${(numSize / 1024).toFixed(1)}KB`;
        return `${(numSize / (1024 * 1024)).toFixed(1)}MB`;
    };
    
    const formatDate = (dateStr: string) => {
        try {
            return new Date(dateStr).toLocaleDateString();
        } catch {
            return dateStr;
        }
    };
    
    const getFileExtension = (filename: string) => {
        const ext = filename.split('.').pop()?.toLowerCase();
        return ext || 'file';
    };
    
    const getFileIcon = (filename: string) => {
        const ext = getFileExtension(filename);
        switch (ext) {
            case 'pdf':
                return '📄';
            case 'doc':
            case 'docx':
                return '📝';
            case 'txt':
                return '📃';
            case 'md':
                return '📋';
            case 'json':
                return '🗂️';
            default:
                return '📄';
        }
    };

    if (displayedDocs.length === 0) {
        return (
            <Box sx={{
                p: 3,
                textAlign: 'center',
                color: theme.palette.text.secondary
            }}>
                <FileIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
                <Typography variant="body2">
                    No documents retrieved
                </Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <Box sx={{
                p: 2,
                borderBottom: `1px solid ${theme.palette.divider}`,
                backgroundColor: alpha(theme.palette.primary.main, 0.05)
            }}>
                <Typography variant="h6" sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 1,
                    fontSize: '1rem',
                    fontWeight: 600
                }}>
                    📚 Retrieved Documents
                    <Chip 
                        label={displayedDocs.length} 
                        size="small" 
                        color="primary"
                        sx={{ ml: 0.5 }}
                    />
                </Typography>
                {query && (
                    <Typography variant="caption" sx={{
                        color: theme.palette.text.secondary,
                        fontStyle: 'italic',
                        mt: 0.5,
                        display: 'block'
                    }}>
                        Query: "{query}"
                    </Typography>
                )}
                {hiddenCount > 0 && (
                    <Typography variant="caption" sx={{
                        color: theme.palette.warning.main,
                        mt: 0.5,
                        display: 'block'
                    }}>
                        {hiddenCount} more document{hiddenCount === 1 ? '' : 's'} hidden (limit: {maxDocuments})
                    </Typography>
                )}
            </Box>

            {/* Document List */}
            <Box sx={{ flex: 1, overflow: 'auto' }}>
                <List dense sx={{ p: 0 }}>
                    {displayedDocs.map((doc, index) => {
                        const isExpanded = expandedDocs.has(doc.path);
                        
                        return (
                            <React.Fragment key={doc.path}>
                                <ListItem 
                                    sx={{
                                        flexDirection: 'column',
                                        alignItems: 'stretch',
                                        p: 0,
                                        borderBottom: index < displayedDocs.length - 1 ? 
                                            `1px solid ${alpha(theme.palette.divider, 0.5)}` : 'none'
                                    }}
                                >
                                    {/* Document Header */}
                                    <Box sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        p: 1.5,
                                        cursor: 'pointer',
                                        '&:hover': {
                                            backgroundColor: alpha(theme.palette.action.hover, 0.5)
                                        }
                                    }}
                                    onClick={() => toggleExpanded(doc.path)}
                                    >
                                        <ListItemIcon sx={{ minWidth: 36 }}>
                                            <span style={{ fontSize: '20px' }}>
                                                {getFileIcon(doc.name)}
                                            </span>
                                        </ListItemIcon>
                                        
                                        <ListItemText
                                            primary={
                                                <Typography variant="body2" sx={{
                                                    fontWeight: 500,
                                                    fontSize: '0.875rem',
                                                    lineHeight: 1.2
                                                }}>
                                                    {doc.name}
                                                </Typography>
                                            }
                                            secondary={
                                                <Box sx={{ mt: 0.5 }}>
                                                    <Typography variant="caption" sx={{
                                                        color: theme.palette.text.secondary,
                                                        fontSize: '0.75rem'
                                                    }}>
                                                        {formatFileSize(doc.size)} • {doc.chunks} chunk{doc.chunks === 1 ? '' : 's'}
                                                        {doc.relevanceScore && (
                                                            <> • {Math.round(doc.relevanceScore * 100)}% match</>
                                                        )}
                                                    </Typography>
                                                </Box>
                                            }
                                        />
                                        
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <Tooltip title="Open document">
                                                <IconButton
                                                    size="small"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenDocument(doc);
                                                    }}
                                                >
                                                    <OpenIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            
                                            <IconButton size="small">
                                                {isExpanded ? 
                                                    <ExpandLessIcon fontSize="small" /> : 
                                                    <ExpandMoreIcon fontSize="small" />
                                                }
                                            </IconButton>
                                        </Box>
                                    </Box>
                                    
                                    {/* Document Details */}
                                    <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                        <Box sx={{
                                            px: 2,
                                            pb: 2,
                                            backgroundColor: alpha(theme.palette.background.paper, 0.5)
                                        }}>
                                            {/* Document Preview/Content */}
                                            {doc.matchedContent && (
                                                <Card sx={{ 
                                                    mb: 2, 
                                                    backgroundColor: alpha(theme.palette.info.main, 0.05),
                                                    border: `1px solid ${alpha(theme.palette.info.main, 0.2)}`
                                                }}>
                                                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                                                        <Typography variant="caption" sx={{
                                                            color: theme.palette.info.main,
                                                            fontWeight: 500,
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '0.5px',
                                                            mb: 1,
                                                            display: 'block'
                                                        }}>
                                                            Relevant Excerpt
                                                        </Typography>
                                                        <Typography variant="body2" sx={{
                                                            fontSize: '0.8rem',
                                                            lineHeight: 1.4,
                                                            fontStyle: 'italic'
                                                        }}>
                                                            "{doc.matchedContent}"
                                                        </Typography>
                                                    </CardContent>
                                                </Card>
                                            )}
                                            
                                            {/* Document Metadata */}
                                            <Box sx={{
                                                display: 'grid',
                                                gridTemplateColumns: 'auto 1fr',
                                                gap: 1,
                                                fontSize: '0.75rem'
                                            }}>
                                                <Typography variant="caption" sx={{ fontWeight: 500 }}>
                                                    Path:
                                                </Typography>
                                                <Typography variant="caption" sx={{
                                                    wordBreak: 'break-all',
                                                    color: theme.palette.text.secondary
                                                }}>
                                                    {doc.path}
                                                </Typography>
                                                
                                                <Typography variant="caption" sx={{ fontWeight: 500 }}>
                                                    Modified:
                                                </Typography>
                                                <Typography variant="caption" sx={{
                                                    color: theme.palette.text.secondary
                                                }}>
                                                    {formatDate(doc.mtime)}
                                                </Typography>
                                                
                                                <Typography variant="caption" sx={{ fontWeight: 500 }}>
                                                    Type:
                                                </Typography>
                                                <Typography variant="caption" sx={{
                                                    color: theme.palette.text.secondary
                                                }}>
                                                    {getFileExtension(doc.name).toUpperCase()} file
                                                </Typography>
                                            </Box>
                                        </Box>
                                    </Collapse>
                                </ListItem>
                            </React.Fragment>
                        );
                    })}
                </List>
            </Box>
        </Box>
    );
};

export default RetrievedDocuments;