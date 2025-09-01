import React, { useState, useRef, useEffect } from 'react';
import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipcChannels';
import {
    Box,
    Card,
    CardContent,
    Typography,
    CardMedia,
    Skeleton,
    Fade,
    Portal
} from '@mui/material';
import LinkIcon from '@mui/icons-material/Link';

interface LinkPreview {
    title: string;
    description: string;
    image?: string;
    url: string;
    siteName?: string;
}

interface LinkPreviewComponentProps {
    url: string;
    children: React.ReactNode;
}

const LinkPreviewComponent: React.FC<LinkPreviewComponentProps> = ({ url, children }) => {
    const [preview, setPreview] = useState<LinkPreview | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const linkRef = useRef<HTMLAnchorElement | null>(null);

    const fetchPreview = async () => {
        if (preview) return; // Already loaded

        setIsLoading(true);
        try {
            const result = await ipcRenderer.invoke(IPC_CHANNELS.GET_LINK_PREVIEW, url);
            if (result) {
                setPreview(result);
            }
        } catch (error) {
            console.error('Failed to fetch link preview:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const showPreview = (event: React.MouseEvent) => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
        }

        // Calculate position for preview
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const previewWidth = 350; // Approximate width of preview card
        
        let left = rect.left;
        let top = rect.bottom + 8;

        // Adjust horizontal position if it would go off screen
        if (left + previewWidth > viewportWidth) {
            left = viewportWidth - previewWidth - 16;
        }
        
        // Adjust if too close to left edge
        if (left < 16) {
            left = 16;
        }

        // Adjust vertical position if it would go off screen
        if (top + 200 > window.innerHeight) {
            top = rect.top - 208; // Show above the link
        }

        setPosition({ top, left });

        // Delay showing the preview to avoid flickering on quick hover
        hoverTimeoutRef.current = setTimeout(() => {
            setIsVisible(true);
            fetchPreview();
        }, 300);
    };

    const hidePreview = () => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
        }
        
        hoverTimeoutRef.current = setTimeout(() => {
            setIsVisible(false);
        }, 100);
    };

    const keepPreviewVisible = () => {
        if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
        }
    };

    useEffect(() => {
        return () => {
            if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
            }
        };
    }, []);

    const handleLinkClick = (e: React.MouseEvent) => {
        // Allow default link behavior
        e.stopPropagation();
    };

    return (
        <>
            <a
                ref={linkRef}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onMouseEnter={showPreview}
                onMouseLeave={hidePreview}
                onClick={handleLinkClick}
                style={{
                    color: '#1976d2',
                    textDecoration: 'underline',
                    cursor: 'pointer'
                }}
            >
                {children}
            </a>
            
            {/* Portal for preview to avoid z-index issues */}
            <Portal>
                <Fade in={isVisible} timeout={200}>
                    <Box
                        sx={{
                            position: 'fixed',
                            top: position.top,
                            left: position.left,
                            zIndex: 9999,
                            maxWidth: 350,
                            display: isVisible ? 'block' : 'none'
                        }}
                        onMouseEnter={keepPreviewVisible}
                        onMouseLeave={hidePreview}
                    >
                        <Card 
                            elevation={8}
                            sx={{ 
                                backgroundColor: 'background.paper',
                                border: '1px solid',
                                borderColor: 'divider'
                            }}
                        >
                            {isLoading ? (
                                <CardContent>
                                    <Box display="flex" alignItems="center" gap={1} mb={1}>
                                        <LinkIcon fontSize="small" color="action" />
                                        <Skeleton variant="text" width="60%" />
                                    </Box>
                                    <Skeleton variant="text" width="100%" />
                                    <Skeleton variant="text" width="80%" />
                                    <Skeleton variant="rectangular" width="100%" height={120} sx={{ mt: 1 }} />
                                </CardContent>
                            ) : preview ? (
                                <>
                                    {preview.image && (
                                        <CardMedia
                                            component="img"
                                            height="120"
                                            image={preview.image}
                                            alt={preview.title}
                                            sx={{ objectFit: 'cover' }}
                                            onError={(e) => {
                                                // Hide image if it fails to load
                                                (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                        />
                                    )}
                                    <CardContent sx={{ pb: '16px !important' }}>
                                        <Box display="flex" alignItems="center" gap={1} mb={1}>
                                            <LinkIcon fontSize="small" color="action" />
                                            {preview.siteName && (
                                                <Typography variant="caption" color="text.secondary">
                                                    {preview.siteName}
                                                </Typography>
                                            )}
                                        </Box>
                                        
                                        <Typography
                                            variant="subtitle2"
                                            fontWeight="bold"
                                            gutterBottom
                                            sx={{
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                display: '-webkit-box',
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical',
                                                lineHeight: 1.2,
                                                maxHeight: '2.4em'
                                            }}
                                        >
                                            {preview.title}
                                        </Typography>
                                        
                                        {preview.description && (
                                            <Typography
                                                variant="body2"
                                                color="text.secondary"
                                                sx={{
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: 3,
                                                    WebkitBoxOrient: 'vertical',
                                                    lineHeight: 1.4,
                                                    maxHeight: '4.2em'
                                                }}
                                            >
                                                {preview.description}
                                            </Typography>
                                        )}
                                        
                                        <Typography
                                            variant="caption"
                                            color="text.secondary"
                                            sx={{
                                                display: 'block',
                                                mt: 1,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            {url}
                                        </Typography>
                                    </CardContent>
                                </>
                            ) : (
                                <CardContent>
                                    <Box display="flex" alignItems="center" gap={1} mb={1}>
                                        <LinkIcon fontSize="small" color="action" />
                                        <Typography variant="body2" color="text.secondary">
                                            Preview not available
                                        </Typography>
                                    </Box>
                                    <Typography variant="caption" color="text.secondary">
                                        {url}
                                    </Typography>
                                </CardContent>
                            )}
                        </Card>
                    </Box>
                </Fade>
            </Portal>
        </>
    );
};

export default LinkPreviewComponent;