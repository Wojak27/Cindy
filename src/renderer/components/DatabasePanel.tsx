import React, { useState, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { getSettings, updateSettings } from '../../store/actions';
import {
    Box,
    Typography,
    TextField,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    FormHelperText,
    Slider,
    Button,
    Divider,
    IconButton,
    Switch,
    FormControlLabel,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    CircularProgress,
    Chip,
    Alert,
    Snackbar
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { ipcRenderer } from 'electron';

const DatabasePanel: React.FC = () => {
    const dispatch = useDispatch();
    const settings = useSelector((state: any) => state.settings);

    // Database settings state
    const [databasePath, setDatabasePath] = useState(settings?.database?.path || '');
    const [notesPath, setNotesPath] = useState(settings?.database?.notesPath || '');
    const [embeddingModel, setEmbeddingModel] = useState(settings?.database?.embeddingModel || 'qwen3:8b');
    const [chunkSize, setChunkSize] = useState(settings?.database?.chunkSize || 1000);
    const [chunkOverlap, setChunkOverlap] = useState(settings?.database?.chunkOverlap || 200);
    const [autoIndex, setAutoIndex] = useState(settings?.database?.autoIndex || true);
    const [pathValidation, setPathValidation] = useState<{ valid: boolean; message?: string } | null>(null);
    const [notesPathValidation, setNotesPathValidation] = useState<{ valid: boolean; message?: string } | null>(null);
    
    // Indexing state
    const [isIndexing, setIsIndexing] = useState(false);
    const [indexingProgress, setIndexingProgress] = useState(0);
    const [indexedItems, setIndexedItems] = useState<any[]>([]);
    const [expandedAccordion, setExpandedAccordion] = useState<string | false>(false);
    const [showNotification, setShowNotification] = useState(false);
    const [notificationMessage, setNotificationMessage] = useState('');
    const [notificationSeverity, setNotificationSeverity] = useState<'success' | 'error' | 'info'>('success');

    useEffect(() => {
        dispatch(getSettings());
    }, [dispatch]);

    // Sync local state when Redux store changes (like SettingsPanel)
    useEffect(() => {
        if (settings?.database) {
            setDatabasePath(settings.database.path || '');
            setNotesPath(settings.database.notesPath || '');
            setEmbeddingModel(settings.database.embeddingModel || 'qwen3:8b');
            setChunkSize(settings.database.chunkSize || 1000);
            setChunkOverlap(settings.database.chunkOverlap || 200);
            setAutoIndex(settings.database.autoIndex ?? true);
        }
    }, [settings]);

    // Manual save function
    const saveSettings = useCallback(() => {
        dispatch(updateSettings({
            database: {
                path: databasePath,
                notesPath,
                embeddingModel,
                chunkSize,
                chunkOverlap,
                autoIndex
            }
        }));
    }, [dispatch, databasePath, notesPath, embeddingModel, chunkSize, chunkOverlap, autoIndex]);

    const handleBrowse = async () => {
        try {
            const result = await ipcRenderer.invoke('show-directory-dialog', databasePath);
            if (result) {
                setDatabasePath(result);
                validatePath(result);
                // Auto-save when path is changed via browse
                dispatch(updateSettings({
                    database: {
                        path: result,
                        notesPath,
                        embeddingModel,
                        chunkSize,
                        chunkOverlap,
                        autoIndex
                    }
                }));
            }
        } catch (error) {
            console.error('Error showing directory dialog:', error);
        }
    };

    const handleNotesBrowse = async () => {
        try {
            const result = await ipcRenderer.invoke('show-directory-dialog', notesPath);
            if (result) {
                setNotesPath(result);
                validateNotesPath(result);
                // Auto-save when notes path is changed via browse
                dispatch(updateSettings({
                    database: {
                        path: databasePath,
                        notesPath: result,
                        embeddingModel,
                        chunkSize,
                        chunkOverlap,
                        autoIndex
                    }
                }));
            }
        } catch (error) {
            console.error('Error showing directory dialog:', error);
        }
    };

    const validatePath = async (path: string) => {
        try {
            const validation = await ipcRenderer.invoke('validate-path', path);
            setPathValidation(validation);
            return validation.valid;
        } catch (error) {
            console.error('Error validating path:', error);
            setPathValidation({ valid: false, message: 'Error validating path' });
            return false;
        }
    };

    const validateNotesPath = async (path: string) => {
        try {
            const validation = await ipcRenderer.invoke('validate-path', path);
            setNotesPathValidation(validation);
            return validation.valid;
        } catch (error) {
            console.error('Error validating notes path:', error);
            setNotesPathValidation({ valid: false, message: 'Error validating notes path' });
            return false;
        }
    };

    const createVectorStore = async () => {
        try {
            setIsIndexing(true);
            setIndexingProgress(0);
            setIndexedItems([]);
            
            const options = {
                databasePath,
                embeddingModel,
                chunkSize,
                chunkOverlap,
                autoIndex
            };

            // Listen for indexing progress updates
            const progressHandler = (_event: any, data: any) => {
                if (data.type === 'progress') {
                    setIndexingProgress(data.progress);
                } else if (data.type === 'file') {
                    setIndexedItems(prev => [...prev, data.file]);
                }
            };
            
            ipcRenderer.on('vector-store:indexing-progress', progressHandler);

            const result = await ipcRenderer.invoke('create-vector-store', options);
            
            // Clean up listener
            ipcRenderer.removeListener('vector-store:indexing-progress', progressHandler);
            
            if (result.success) {
                console.log('Vector store created successfully');
                
                // Get indexed items
                if (result.indexedFiles) {
                    setIndexedItems(result.indexedFiles);
                }
                
                // Show success notification
                setNotificationMessage(`Successfully indexed ${result.indexedFiles?.length || 0} files`);
                setNotificationSeverity('success');
                setShowNotification(true);
                
                // Update settings
                dispatch(updateSettings({
                    database: {
                        path: databasePath,
                        embeddingModel,
                        chunkSize,
                        chunkOverlap,
                        autoIndex
                    }
                }));
                
                // Don't close panel immediately - let user see results
                setTimeout(() => {
                    dispatch({ type: 'TOGGLE_DATABASE_SIDEBAR' });
                }, 3000);
            } else {
                console.error('Failed to create vector store:', result.message);
                setNotificationMessage(`Failed to create vector store: ${result.message}`);
                setNotificationSeverity('error');
                setShowNotification(true);
            }
        } catch (error) {
            console.error('Error creating vector store:', error);
            setNotificationMessage(`Error: ${error}`);
            setNotificationSeverity('error');
            setShowNotification(true);
        } finally {
            setIsIndexing(false);
            setIndexingProgress(100);
        }
    };
    
    // Load existing indexed items when component mounts or path changes
    useEffect(() => {
        const loadIndexedItems = async () => {
            if (databasePath) {
                try {
                    const result = await ipcRenderer.invoke('vector-store:get-indexed-items', databasePath);
                    if (result.success && result.items) {
                        setIndexedItems(result.items);
                    }
                } catch (error) {
                    console.error('Failed to load indexed items:', error);
                }
            }
        };
        
        loadIndexedItems();
    }, [databasePath]);
    
    const handleAccordionChange = (panel: string) => (_event: React.SyntheticEvent, isExpanded: boolean) => {
        setExpandedAccordion(isExpanded ? panel : false);
    };
    
    const getFileIcon = (fileName: string) => {
        const ext = fileName.split('.').pop()?.toLowerCase();
        if (['pdf'].includes(ext || '')) return '📄';
        if (['doc', 'docx'].includes(ext || '')) return '📃';
        if (['txt', 'md', 'mdx'].includes(ext || '')) return '📝';
        if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs'].includes(ext || '')) return '💻';
        if (['html', 'css', 'json', 'xml', 'yml', 'yaml'].includes(ext || '')) return '🌐';
        if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext || '')) return '🖼️';
        return '📁';
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Save settings immediately (separate from vector store creation)
        dispatch(updateSettings({
            database: {
                path: databasePath,
                embeddingModel,
                chunkSize,
                chunkOverlap,
                autoIndex
            }
        }));

        // Validate path before creating vector store
        const isValid = await validatePath(databasePath);
        if (!isValid) {
            console.log('Database settings saved, but vector store creation skipped due to invalid path');
            return;
        }

        // Create vector store (optional step)
        await createVectorStore();
    };

    const handleCancel = () => {
        dispatch({ type: 'TOGGLE_DATABASE_SIDEBAR' });
    };

    return (
        <div className="database-sidebar">
            <div className="database-header">
                <Typography variant="h6">Database Settings</Typography>
                <IconButton
                    onClick={() => dispatch({ type: 'TOGGLE_DATABASE_SIDEBAR' })}
                    size="small"
                >
                    <CloseIcon />
                </IconButton>
            </div>
            <div className="database-content">
                <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
                    <Typography variant="subtitle1" gutterBottom>Database Configuration</Typography>

                    <FormControl fullWidth margin="normal">
                        <TextField
                            id="database-path"
                            label="Database Path"
                            value={databasePath}
                            onChange={(e) => setDatabasePath(e.target.value)}
                            variant="outlined"
                            size="small"
                            placeholder="Select database directory"
                            InputProps={{
                                endAdornment: (
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        onClick={handleBrowse}
                                        sx={{ ml: 1 }}
                                    >
                                        Browse
                                    </Button>
                                )
                            }}
                        />
                        {pathValidation && !pathValidation.valid && (
                            <FormHelperText error>{pathValidation.message}</FormHelperText>
                        )}
                        <FormHelperText>Select the directory for your vector database.</FormHelperText>
                    </FormControl>

                    <FormControl fullWidth margin="normal">
                        <TextField
                            id="notes-path"
                            label="Notes Path"
                            value={notesPath}
                            onChange={(e) => setNotesPath(e.target.value)}
                            variant="outlined"
                            size="small"
                            placeholder="Select notes directory for search_nodes tool"
                            InputProps={{
                                endAdornment: (
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        onClick={handleNotesBrowse}
                                        sx={{ ml: 1 }}
                                    >
                                        Browse
                                    </Button>
                                )
                            }}
                        />
                        {notesPathValidation && !notesPathValidation.valid && (
                            <FormHelperText error>{notesPathValidation.message}</FormHelperText>
                        )}
                        <FormHelperText>Select the directory where Cindy's notes are stored for the search_nodes tool.</FormHelperText>
                    </FormControl>

                    <FormControl fullWidth margin="normal">
                        <InputLabel id="embedding-model-label">Embedding Model</InputLabel>
                        <Select
                            labelId="embedding-model-label"
                            id="embedding-model"
                            value={embeddingModel}
                            onChange={(e) => setEmbeddingModel(e.target.value as string)}
                            label="Embedding Model"
                            size="small"
                        >
                            <MenuItem value="qwen3:8b">Qwen3 8B</MenuItem>
                            <MenuItem value="text-embedding-ada-002">Text Embedding Ada 002</MenuItem>
                            <MenuItem value="all-MiniLM-L6-v2">All MiniLM L6 v2</MenuItem>
                        </Select>
                        <FormHelperText>The model used for generating embeddings.</FormHelperText>
                    </FormControl>

                    <FormControl fullWidth margin="normal">
                        <Typography id="chunk-size-slider" gutterBottom>
                            Chunk Size: {chunkSize}
                        </Typography>
                        <Slider
                            aria-labelledby="chunk-size-slider"
                            value={chunkSize}
                            onChange={(e, newValue) => setChunkSize(newValue as number)}
                            step={100}
                            min={500}
                            max={2000}
                            valueLabelDisplay="auto"
                        />
                        <FormHelperText>The size of text chunks for vectorization.</FormHelperText>
                    </FormControl>

                    <FormControl fullWidth margin="normal">
                        <Typography id="chunk-overlap-slider" gutterBottom>
                            Chunk Overlap: {chunkOverlap}
                        </Typography>
                        <Slider
                            aria-labelledby="chunk-overlap-slider"
                            value={chunkOverlap}
                            onChange={(e, newValue) => setChunkOverlap(newValue as number)}
                            step={50}
                            min={0}
                            max={500}
                            valueLabelDisplay="auto"
                        />
                        <FormHelperText>The overlap between adjacent text chunks.</FormHelperText>
                    </FormControl>

                    <FormControlLabel
                        control={
                            <Switch
                                checked={autoIndex}
                                onChange={(e) => setAutoIndex(e.target.checked)}
                                name="autoIndex"
                            />
                        }
                        label="Auto-index database"
                        sx={{ mt: 2 }}
                    />
                    <FormHelperText>Automatically index new content added to the database.</FormHelperText>

                    <Divider sx={{ my: 3 }} />

                    {databasePath && (
                        <Box sx={{ mb: 2 }}>
                            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                                <Button
                                    variant="outlined"
                                    color="primary"
                                    onClick={saveSettings}
                                    sx={{ minWidth: '120px' }}
                                >
                                    Save Settings
                                </Button>
                                <Button
                                    variant="outlined"
                                    color="secondary"
                                    onClick={createVectorStore}
                                    fullWidth
                                    disabled={isIndexing}
                                    startIcon={isIndexing ? <CircularProgress size={20} /> : null}
                                >
                                    {isIndexing ? 'Indexing...' : 'Create Vector Store from Directory'}
                                </Button>
                            </Box>
                            <FormHelperText>
                                This will index PDF, Word documents (.doc/.docx), text, markdown, and code files in the selected directory for RAG queries.
                            </FormHelperText>
                            
                            {/* Progress bar during indexing */}
                            {isIndexing && (
                                <Box sx={{ width: '100%', mt: 2 }}>
                                    <Typography variant="body2" color="text.secondary">
                                        Indexing progress: {indexingProgress}%
                                    </Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        <Box sx={{ width: '100%', mr: 1 }}>
                                            <CircularProgress variant="determinate" value={indexingProgress} />
                                        </Box>
                                    </Box>
                                </Box>
                            )}
                            
                            {/* Expandable view of indexed items */}
                            {indexedItems.length > 0 && (
                                <Accordion 
                                    expanded={expandedAccordion === 'indexed'} 
                                    onChange={handleAccordionChange('indexed')}
                                    sx={{ mt: 2 }}
                                >
                                    <AccordionSummary
                                        expandIcon={<ExpandMoreIcon />}
                                        aria-controls="indexed-content"
                                        id="indexed-header"
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                                            <CheckCircleIcon color="success" sx={{ mr: 1 }} />
                                            <Typography>Indexed Items ({indexedItems.length})</Typography>
                                        </Box>
                                    </AccordionSummary>
                                    <AccordionDetails>
                                        <List dense>
                                            {indexedItems.map((item, index) => (
                                                <ListItem key={index}>
                                                    <ListItemIcon>
                                                        {item.type === 'folder' ? (
                                                            <FolderIcon fontSize="small" />
                                                        ) : (
                                                            <InsertDriveFileIcon fontSize="small" />
                                                        )}
                                                    </ListItemIcon>
                                                    <ListItemText 
                                                        primary={
                                                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span>{getFileIcon(item.name)} {item.name}</span>
                                                                {item.chunks && (
                                                                    <Chip 
                                                                        label={`${item.chunks} chunks`} 
                                                                        size="small" 
                                                                        variant="outlined" 
                                                                    />
                                                                )}
                                                            </span>
                                                        }
                                                        secondary={
                                                            <span>
                                                                {item.path && <Typography variant="caption" color="text.secondary" component="span">{item.path}</Typography>}
                                                                {item.size && <Typography variant="caption" color="text.secondary" component="span"> • {formatFileSize(item.size)}</Typography>}
                                                                {item.error && (
                                                                    <span style={{ display: 'flex', alignItems: 'center', marginTop: '4px' }}>
                                                                        <ErrorIcon color="error" fontSize="small" style={{ marginRight: '4px' }} />
                                                                        <Typography variant="caption" color="error" component="span">{item.error}</Typography>
                                                                    </span>
                                                                )}
                                                            </span>
                                                        }
                                                    />
                                                </ListItem>
                                            ))}
                                        </List>
                                    </AccordionDetails>
                                </Accordion>
                            )}
                        </Box>
                    )}

                    <div className="database-footer">
                        <Button
                            type="submit"
                            variant="contained"
                            color="primary"
                            sx={{ mr: 1 }}
                        >
                            Save Settings
                        </Button>
                        <Button
                            variant="outlined"
                            color="secondary"
                            onClick={handleCancel}
                        >
                            Cancel
                        </Button>
                    </div>
                </Box>
            </div>
            
            {/* Notification Snackbar */}
            <Snackbar
                open={showNotification}
                autoHideDuration={6000}
                onClose={() => setShowNotification(false)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert 
                    onClose={() => setShowNotification(false)} 
                    severity={notificationSeverity}
                    sx={{ width: '100%' }}
                >
                    {notificationMessage}
                </Alert>
            </Snackbar>
        </div>
    );
};

// Helper function to format file sizes
const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

export default DatabasePanel;