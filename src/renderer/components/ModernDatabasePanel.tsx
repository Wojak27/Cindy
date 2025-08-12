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
    Slider,
    Button,
    IconButton,
    Alert,
    Tab,
    Tabs,
    Card,
    CardContent,
    Switch,
    FormControlLabel,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    CircularProgress,
    Chip,
    LinearProgress,
    useTheme,
    alpha,
    Slide,
} from '@mui/material';
import {
    Close as CloseIcon,
    Storage as StorageIcon,
    Folder as FolderIcon,
    InsertDriveFile as FileIcon,
    Settings as SettingsIcon,
    Build as BuildIcon,
    CheckCircle as CheckCircleIcon,
    Refresh as RefreshIcon,
} from '@mui/icons-material';
import { ipcRenderer } from 'electron';

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

function TabPanel(props: TabPanelProps) {
    const { children, value, index, ...other } = props;

    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`database-tabpanel-${index}`}
            aria-labelledby={`database-tab-${index}`}
            {...other}
        >
            {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
        </div>
    );
}

const ModernDatabasePanel: React.FC = () => {
    const theme = useTheme();
    const dispatch = useDispatch();
    const settings = useSelector((state: any) => state.settings);
    const showDatabase = useSelector((state: any) => state.ui.showDatabase);

    const [tabValue, setTabValue] = useState(0);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Database Settings State
    const [databasePath, setDatabasePath] = useState(settings?.database?.path || '');
    const [notesPath, setNotesPath] = useState(settings?.database?.notesPath || '');
    const [embeddingModel, setEmbeddingModel] = useState(settings?.database?.embeddingModel || 'qwen3:1.7b');
    const [chunkSize, setChunkSize] = useState(settings?.database?.chunkSize || 1000);
    const [chunkOverlap, setChunkOverlap] = useState(settings?.database?.chunkOverlap || 200);
    const [autoIndex, setAutoIndex] = useState(settings?.database?.autoIndex || true);

    // Indexing State
    const [isIndexing, setIsIndexing] = useState(false);
    const [indexingProgress, setIndexingProgress] = useState(0);
    const [indexedItems, setIndexedItems] = useState<any[]>([]);
    const [pathValidation, setPathValidation] = useState<{ valid: boolean; message?: string } | null>(null);

    // Save all settings
    const saveSettings = useCallback(() => {
        const updatedSettings = {
            database: {
                path: databasePath,
                notesPath,
                embeddingModel,
                chunkSize,
                chunkOverlap,
                autoIndex
            }
        };

        dispatch(updateSettings(updatedSettings));
        setHasUnsavedChanges(false);
    }, [dispatch, databasePath, notesPath, embeddingModel, chunkSize, chunkOverlap, autoIndex]);

    // Handle close
    const handleClose = () => {
        if (hasUnsavedChanges) {
            saveSettings();
        }
        dispatch({ type: 'TOGGLE_DATABASE_SIDEBAR' });
    };

    // Path browsing
    const handleBrowse = async () => {
        try {
            const result = await ipcRenderer.invoke('show-directory-dialog', databasePath);
            if (result) {
                setDatabasePath(result);
                validatePath(result);
                setHasUnsavedChanges(true);
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
                setHasUnsavedChanges(true);
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

    // Indexing functions
    const startIndexing = async () => {
        if (!databasePath) {
            setPathValidation({ valid: false, message: 'Please set a valid database path first' });
            return;
        }

        setIsIndexing(true);
        setIndexingProgress(0);
        setIndexedItems([]);

        try {
            await ipcRenderer.invoke('start-full-indexing', databasePath, notesPath);
        } catch (error) {
            console.error('Error starting indexing:', error);
            setIsIndexing(false);
        }
    };

    const startDirectoryOnlyIndexing = async () => {
        if (!databasePath) {
            setPathValidation({ valid: false, message: 'Please set a valid database path first' });
            return;
        }

        setIsIndexing(true);
        setIndexingProgress(0);
        setIndexedItems([]);

        try {
            await ipcRenderer.invoke('vector-store:index-directory', databasePath);
        } catch (error) {
            console.error('Error starting directory indexing:', error);
            setIsIndexing(false);
        }
    };

    // Update state when settings change
    useEffect(() => {
        if (settings?.database) {
            setDatabasePath(settings.database.path || '');
            setNotesPath(settings.database.notesPath || '');
            setEmbeddingModel(settings.database.embeddingModel || 'qwen3:1.7b');
            setChunkSize(settings.database.chunkSize || 1000);
            setChunkOverlap(settings.database.chunkOverlap || 200);
            setAutoIndex(settings.database.autoIndex ?? true);
        }
    }, [settings]);

    useEffect(() => {
        dispatch(getSettings());

        // Listen for indexing progress events
        const handleIndexingProgress = (_: any, data: any) => {
            setIndexingProgress(data.progress);
            if (data.item) {
                setIndexedItems(prev => [...prev, data.item]);
            }
        };

        const handleIndexingComplete = () => {
            setIsIndexing(false);
            setIndexingProgress(100);
        };

        const handleIndexingError = (_: any, error: string) => {
            console.error('Indexing error:', error);
            setIsIndexing(false);
        };

        ipcRenderer.on('indexing-progress', handleIndexingProgress);
        ipcRenderer.on('indexing-complete', handleIndexingComplete);
        ipcRenderer.on('indexing-error', handleIndexingError);

        return () => {
            ipcRenderer.off('indexing-progress', handleIndexingProgress);
            ipcRenderer.off('indexing-complete', handleIndexingComplete);
            ipcRenderer.off('indexing-error', handleIndexingError);
        };
    }, [dispatch]);

    return (
        <Slide direction="left" in={showDatabase} timeout={300} mountOnEnter unmountOnExit>
            <Box
                sx={{
                    position: 'fixed',
                    top: 0,
                    right: 0,
                    width: 600,
                    height: '100vh',
                    backgroundColor: theme.palette.mode === 'dark'
                        ? alpha(theme.palette.background.paper, 0.95)
                        : alpha(theme.palette.background.paper, 0.98),
                    backdropFilter: 'blur(10px)',
                    borderLeft: `1px solid ${theme.palette.divider}`,
                    boxShadow: theme.shadows[12],
                    display: 'flex',
                    flexDirection: 'column',
                    zIndex: 1300,
                }}
            >
                {/* Header */}
                <Box
                    sx={{
                        p: 3,
                        borderBottom: `1px solid ${theme.palette.divider}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)}, ${alpha(theme.palette.secondary.main, 0.05)})`,
                    }}
                >
                    <Typography variant="h5" fontWeight={600}>
                        Vector Database
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {hasUnsavedChanges && (
                            <Button
                                variant="contained"
                                size="small"
                                startIcon={<RefreshIcon />}
                                onClick={saveSettings}
                                sx={{ mr: 1 }}
                            >
                                Save
                            </Button>
                        )}
                        <IconButton onClick={handleClose}>
                            <CloseIcon />
                        </IconButton>
                    </Box>
                </Box>

                {/* Tabs */}
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
                        <Tab icon={<SettingsIcon />} label="Configuration" />
                        <Tab icon={<BuildIcon />} label="Indexing" />
                        <Tab icon={<StorageIcon />} label="Contents" />
                    </Tabs>
                </Box>

                {/* Content */}
                <Box sx={{ flex: 1, overflow: 'auto' }}>
                    {/* Configuration Tab */}
                    <TabPanel value={tabValue} index={0}>
                        <Box sx={{ px: 3 }}>
                            <Typography variant="h6" gutterBottom fontWeight={600}>
                                Database Configuration
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                Configure paths and settings for your vector database and document indexing.
                            </Typography>

                            <Card sx={{ mb: 3 }}>
                                <CardContent>
                                    <Typography variant="subtitle1" gutterBottom fontWeight={600}>
                                        Database Path
                                    </Typography>
                                    <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                                        <TextField
                                            fullWidth
                                            value={databasePath}
                                            onChange={(e) => {
                                                setDatabasePath(e.target.value);
                                                setHasUnsavedChanges(true);
                                            }}
                                            placeholder="Select database directory..."
                                            variant="outlined"
                                            size="small"
                                        />
                                        <Button
                                            variant="outlined"
                                            onClick={handleBrowse}
                                            startIcon={<FolderIcon />}
                                        >
                                            Browse
                                        </Button>
                                    </Box>
                                    {pathValidation && (
                                        <Alert
                                            severity={pathValidation.valid ? 'success' : 'error'}
                                            sx={{ mb: 2 }}
                                        >
                                            {pathValidation.message || (pathValidation.valid ? 'Path is valid' : 'Invalid path')}
                                        </Alert>
                                    )}

                                    <Typography variant="subtitle1" gutterBottom fontWeight={600} sx={{ mt: 3 }}>
                                        Notes Path (Optional)
                                    </Typography>
                                    <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                                        <TextField
                                            fullWidth
                                            value={notesPath}
                                            onChange={(e) => {
                                                setNotesPath(e.target.value);
                                                setHasUnsavedChanges(true);
                                            }}
                                            placeholder="Select notes directory..."
                                            variant="outlined"
                                            size="small"
                                        />
                                        <Button
                                            variant="outlined"
                                            onClick={handleNotesBrowse}
                                            startIcon={<FolderIcon />}
                                        >
                                            Browse
                                        </Button>
                                    </Box>

                                    <FormControl fullWidth sx={{ mt: 3, mb: 2 }}>
                                        <InputLabel>Embedding Model</InputLabel>
                                        <Select
                                            value={embeddingModel}
                                            label="Embedding Model"
                                            onChange={(e) => {
                                                setEmbeddingModel(e.target.value);
                                                setHasUnsavedChanges(true);
                                            }}
                                        >
                                            <MenuItem value="dengcao/Qwen3-Embedding-0.6B:Q8_0">Qwen 3 0.6B</MenuItem>
                                            <MenuItem value="llama3:1.7b">Qwen 3 1.7b</MenuItem>
                                        </Select>
                                    </FormControl>

                                    <Box sx={{ mt: 3, mb: 2 }}>
                                        <Typography gutterBottom fontWeight={600}>
                                            Chunk Size: {chunkSize}
                                        </Typography>
                                        <Slider
                                            value={chunkSize}
                                            onChange={(_, value) => {
                                                setChunkSize(value as number);
                                                setHasUnsavedChanges(true);
                                            }}
                                            min={500}
                                            max={2000}
                                            step={100}
                                            marks
                                            valueLabelDisplay="auto"
                                        />
                                    </Box>

                                    <Box sx={{ mb: 2 }}>
                                        <Typography gutterBottom fontWeight={600}>
                                            Chunk Overlap: {chunkOverlap}
                                        </Typography>
                                        <Slider
                                            value={chunkOverlap}
                                            onChange={(_, value) => {
                                                setChunkOverlap(value as number);
                                                setHasUnsavedChanges(true);
                                            }}
                                            min={50}
                                            max={500}
                                            step={50}
                                            marks
                                            valueLabelDisplay="auto"
                                        />
                                    </Box>

                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={autoIndex}
                                                onChange={(e) => {
                                                    setAutoIndex(e.target.checked);
                                                    setHasUnsavedChanges(true);
                                                }}
                                            />
                                        }
                                        label="Auto-index new documents"
                                    />
                                </CardContent>
                            </Card>
                        </Box>
                    </TabPanel>

                    {/* Indexing Tab */}
                    <TabPanel value={tabValue} index={1}>
                        <Box sx={{ px: 3 }}>
                            <Typography variant="h6" gutterBottom fontWeight={600}>
                                Document Indexing
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                Index documents for semantic search and retrieval.
                            </Typography>

                            <Card sx={{ mb: 3 }}>
                                <CardContent>
                                    <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                                        <Button
                                            variant="contained"
                                            onClick={startIndexing}
                                            disabled={isIndexing || !databasePath}
                                            startIcon={isIndexing ? <CircularProgress size={20} /> : <RefreshIcon />}
                                            fullWidth
                                        >
                                            {isIndexing ? 'Indexing...' : 'Start Full Indexing'}
                                        </Button>
                                        {/* Removed "Index Directory Only" button as per requirement */}
                                    </Box>

                                    {isIndexing && (
                                        <Box sx={{ mb: 2 }}>
                                            <Typography variant="body2" color="text.secondary" gutterBottom>
                                                Progress: {Math.round(indexingProgress)}%
                                            </Typography>
                                            <LinearProgress variant="determinate" value={indexingProgress} />
                                        </Box>
                                    )}

                                    {indexedItems.length > 0 && (
                                        <Box>
                                            <Typography variant="subtitle1" gutterBottom fontWeight={600}>
                                                Recently Indexed ({indexedItems.length} items)
                                            </Typography>
                                            <List sx={{ maxHeight: 200, overflow: 'auto' }}>
                                                {indexedItems.slice(-10).map((item, index) => (
                                                    <ListItem key={index} dense>
                                                        <ListItemIcon>
                                                            {item.type === 'file' ? <FileIcon /> : <FolderIcon />}
                                                        </ListItemIcon>
                                                        <ListItemText
                                                            primary={item.name}
                                                            secondary={item.path}
                                                        />
                                                        <Chip
                                                            icon={<CheckCircleIcon />}
                                                            label="Indexed"
                                                            size="small"
                                                            color="success"
                                                            variant="outlined"
                                                        />
                                                    </ListItem>
                                                ))}
                                            </List>
                                        </Box>
                                    )}
                                </CardContent>
                            </Card>
                        </Box>
                    </TabPanel>

                    {/* Contents Tab */}
                    <TabPanel value={tabValue} index={2}>
                        <Box sx={{ px: 3 }}>
                            <Typography variant="h6" gutterBottom fontWeight={600}>
                                Database Contents
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                Browse and manage indexed documents in your vector database.
                            </Typography>

                            <Card>
                                <CardContent>
                                    <Box sx={{ textAlign: 'center', py: 4 }}>
                                        <StorageIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                                        <Typography variant="h6" color="text.secondary">
                                            Database Contents
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Document browser and management tools will be available here.
                                        </Typography>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Box>
                    </TabPanel>
                </Box>

                {/* Footer */}
                {hasUnsavedChanges && (
                    <Box
                        sx={{
                            p: 2,
                            borderTop: `1px solid ${theme.palette.divider}`,
                            backgroundColor: alpha(theme.palette.warning.main, 0.1),
                        }}
                    >
                        <Alert severity="info" sx={{ mb: 2 }}>
                            You have unsaved changes. Click Save to apply them.
                        </Alert>
                        <Button
                            fullWidth
                            variant="contained"
                            startIcon={<RefreshIcon />}
                            onClick={saveSettings}
                        >
                            Save All Changes
                        </Button>
                    </Box>
                )}
            </Box>
        </Slide>
    );
};

export default ModernDatabasePanel;