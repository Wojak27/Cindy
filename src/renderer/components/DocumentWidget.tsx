import React from 'react';
import {
    Box,
    Typography,
    Card,
    Chip,
    useTheme,
    alpha,
    Divider,
} from '@mui/material';
import {
    InsertDriveFile as FileIcon,
    Folder as FolderIcon,
    Schedule as TimeIcon,
    Storage as SizeIcon,
    ViewModule as ChunksIcon,
} from '@mui/icons-material';

interface IndexedFile {
    path: string;
    name: string;
    size: number | bigint;
    mtime: string;
    chunks: number;
}

interface DocumentWidgetProps {
    document: IndexedFile;
}

const DocumentWidget: React.FC<DocumentWidgetProps> = ({ document }) => {
    const theme = useTheme();

    const formatFileSize = (size: number | bigint): string => {
        const sizeNum = typeof size === 'bigint' ? Number(size) : size;
        
        if (sizeNum < 1024) {
            return `${sizeNum} B`;
        } else if (sizeNum < 1024 * 1024) {
            return `${(sizeNum / 1024).toFixed(1)} KB`;
        } else if (sizeNum < 1024 * 1024 * 1024) {
            return `${(sizeNum / (1024 * 1024)).toFixed(1)} MB`;
        } else {
            return `${(sizeNum / (1024 * 1024 * 1024)).toFixed(1)} GB`;
        }
    };

    const formatDate = (dateString: string): string => {
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        } catch {
            return dateString;
        }
    };

    const getFileExtension = (filename: string): string => {
        const ext = filename.split('.').pop()?.toLowerCase();
        return ext || '';
    };

    const getFileTypeIcon = (filename: string) => {
        const ext = getFileExtension(filename);
        const iconProps = { fontSize: 48, color: theme.palette.primary.main };

        switch (ext) {
            case 'pdf':
                return <FileIcon sx={{ ...iconProps, color: theme.palette.error.main }} />;
            case 'doc':
            case 'docx':
                return <FileIcon sx={{ ...iconProps, color: theme.palette.info.main }} />;
            case 'txt':
            case 'md':
                return <FileIcon sx={{ ...iconProps, color: theme.palette.success.main }} />;
            case 'json':
            case 'xml':
                return <FileIcon sx={{ ...iconProps, color: theme.palette.warning.main }} />;
            default:
                return <FileIcon sx={iconProps} />;
        }
    };

    const getFileTypeColor = (filename: string) => {
        const ext = getFileExtension(filename);
        
        switch (ext) {
            case 'pdf':
                return theme.palette.error.main;
            case 'doc':
            case 'docx':
                return theme.palette.info.main;
            case 'txt':
            case 'md':
                return theme.palette.success.main;
            case 'json':
            case 'xml':
                return theme.palette.warning.main;
            default:
                return theme.palette.primary.main;
        }
    };

    const getDirectoryPath = (fullPath: string): string => {
        const pathParts = fullPath.split('/');
        pathParts.pop(); // Remove filename
        return pathParts.join('/') || '/';
    };

    return (
        <Box sx={{ height: '100%', overflow: 'auto' }}>
            {/* File Header */}
            <Card sx={{ mb: 2, backgroundColor: alpha(theme.palette.background.default, 0.5) }}>
                <Box sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                        <Box sx={{ mr: 2 }}>
                            {getFileTypeIcon(document.name)}
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography 
                                variant="h6" 
                                sx={{ 
                                    fontWeight: 600, 
                                    mb: 0.5,
                                    wordBreak: 'break-word'
                                }}
                            >
                                {document.name}
                            </Typography>
                            <Chip
                                label={getFileExtension(document.name).toUpperCase()}
                                size="small"
                                sx={{
                                    backgroundColor: alpha(getFileTypeColor(document.name), 0.1),
                                    color: getFileTypeColor(document.name),
                                    fontWeight: 600,
                                    fontSize: '0.75rem'
                                }}
                            />
                        </Box>
                    </Box>
                </Box>
            </Card>

            {/* File Information Grid */}
            <Box sx={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(2, 1fr)', 
                gap: 1,
                mb: 2
            }}>
                {/* File Size */}
                <Card sx={{ p: 1.5, backgroundColor: alpha(theme.palette.info.main, 0.1) }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                        <SizeIcon sx={{ fontSize: 20, mr: 1, color: theme.palette.info.main }} />
                        <Typography variant="body2" color="text.secondary">
                            Size
                        </Typography>
                    </Box>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        {formatFileSize(document.size)}
                    </Typography>
                </Card>

                {/* Chunks */}
                <Card sx={{ p: 1.5, backgroundColor: alpha(theme.palette.success.main, 0.1) }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                        <ChunksIcon sx={{ fontSize: 20, mr: 1, color: theme.palette.success.main }} />
                        <Typography variant="body2" color="text.secondary">
                            Chunks
                        </Typography>
                    </Box>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        {document.chunks}
                    </Typography>
                </Card>
            </Box>

            {/* Modified Time - Full Width */}
            <Card sx={{ p: 1.5, mb: 2, backgroundColor: alpha(theme.palette.warning.main, 0.1) }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                    <TimeIcon sx={{ fontSize: 20, mr: 1, color: theme.palette.warning.main }} />
                    <Typography variant="body2" color="text.secondary">
                        Last Modified
                    </Typography>
                </Box>
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                    {formatDate(document.mtime)}
                </Typography>
            </Card>

            <Divider sx={{ my: 2 }} />

            {/* File Path */}
            <Card sx={{ p: 1.5, backgroundColor: alpha(theme.palette.secondary.main, 0.1) }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <FolderIcon sx={{ fontSize: 20, mr: 1, color: theme.palette.secondary.main }} />
                    <Typography variant="body2" color="text.secondary">
                        Location
                    </Typography>
                </Box>
                <Typography 
                    variant="body2" 
                    sx={{ 
                        fontFamily: 'monospace',
                        backgroundColor: alpha(theme.palette.background.paper, 0.5),
                        padding: 1,
                        borderRadius: 0.5,
                        wordBreak: 'break-all',
                        fontSize: '0.75rem'
                    }}
                >
                    {getDirectoryPath(document.path)}
                </Typography>
                <Typography 
                    variant="body2" 
                    sx={{ 
                        fontFamily: 'monospace',
                        backgroundColor: alpha(theme.palette.background.paper, 0.8),
                        padding: 1,
                        borderRadius: 0.5,
                        wordBreak: 'break-all',
                        fontSize: '0.75rem',
                        mt: 0.5,
                        fontWeight: 600
                    }}
                >
                    {document.name}
                </Typography>
            </Card>

            {/* Footer */}
            <Box sx={{ textAlign: 'center', mt: 2 }}>
                <Typography variant="caption" color="text.secondary">
                    Indexed document ready for semantic search
                </Typography>
            </Box>
        </Box>
    );
};

export default DocumentWidget;