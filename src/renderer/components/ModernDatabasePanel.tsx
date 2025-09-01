import React, { useState, useEffect, useCallback } from 'react';
import DocumentViewer from './DocumentViewer';
import { useSelector, useDispatch } from 'react-redux';
import { getSettings, toggleDatabaseSidebar, updateSettings } from '../../store/actions';
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
import { IPC_CHANNELS } from '../../shared/ipcChannels';

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
    const [indexingResult, setIndexingResult] = useState<{ success: number; errors: number; show: boolean } | null>(null);
    const [directoryStatus, setDirectoryStatus] = useState<{
        totalFiles: number;
        indexedFiles: number;
        newFiles: string[];
        deletedFiles: string[];
        modifiedFiles: string[];
        upToDate: boolean;
    } | null>(null);
    const [statusLoading, setStatusLoading] = useState(false);

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
        dispatch(toggleDatabaseSidebar());
    };

    // Path browsing
    const handleBrowse = async () => {
        try {
            const result = await ipcRenderer.invoke(IPC_CHANNELS.SHOW_DIRECTORY_DIALOG, databasePath);
            if (result) {
                setDatabasePath(result);
                validatePath(result);
                setHasUnsavedChanges(true);
            }
        } catch (error) {
            console.error('Error showing directory dialog:', error);
        }
    };

    // Handle outside click
    const handleOutsideClick = useCallback((event: MouseEvent) => {
        const target = event.target as Element;
        const settingsPanel = document.querySelector('[data-settings-panel="true"]');

        // Check if target is inside the settings panel
        if (settingsPanel && settingsPanel.contains(target)) {
            return; // Click is inside the panel, don't close
        }

        // Check if target is inside a MUI portal (dropdown, menu, etc.)
        // MUI creates portals with classes like MuiPaper-root, MuiList-root, MuiMenu-root, etc.
        const muiPortalSelectors = [
            '.MuiPaper-root',
            '.MuiList-root',
            '.MuiMenu-root',
            '.MuiMenuItem-root',
            '.MuiSelect-root',
            '.MuiPopper-root',
            '.MuiModal-root',
            '.MuiDialog-root',
            '.MuiAutocomplete-popper',
            '[role="presentation"]',
            '[role="tooltip"]',
            '[role="menu"]',
            '[role="listbox"]'
        ];

        // Check if the click target or any of its parents match MUI portal selectors
        for (const selector of muiPortalSelectors) {
            if (target.closest(selector)) {
                return; // Click is inside a MUI portal, don't close
            }
        }

        // Check if target is inside any element with a MUI class
        if (target.closest('[class*="Mui"]')) {
            return; // Click is inside a MUI component, don't close
        }

        // Additional check for React portals and other dynamic content
        // Check if the click target has any data attributes that suggest it's part of a component
        if (target.hasAttribute && (
            target.hasAttribute('data-testid') ||
            target.hasAttribute('data-value') ||
            target.hasAttribute('aria-labelledby') ||
            target.hasAttribute('aria-describedby')
        )) {
            return; // Likely part of a component, don't close
        }

        // Final check: if target is inside any element with role attributes
        if (target.closest('[role]')) {
            const roleElement = target.closest('[role]');
            const role = roleElement?.getAttribute('role');
            if (role && ['menu', 'listbox', 'option', 'menuitem', 'combobox'].includes(role)) {
                return; // Click is inside a form control, don't close
            }
        }

        // If we get here, it's a genuine outside click
        console.log('🔒 Outside click detected - hiding settings panel');
        dispatch(toggleDatabaseSidebar());
    }, [dispatch]);

    // Handle escape key
    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            console.log('🔒 Escape key pressed - hiding settings panel');
            dispatch(toggleDatabaseSidebar());
        }
    }, [dispatch]);

    // Add/remove outside click and keyboard listeners
    useEffect(() => {
        if (showDatabase) {
            document.addEventListener('mousedown', handleOutsideClick);
            document.addEventListener('keydown', handleKeyDown);
            return () => {
                document.removeEventListener('mousedown', handleOutsideClick);
                document.removeEventListener('keydown', handleKeyDown);
            };
        }
        return undefined;
    }, [showDatabase, handleOutsideClick, handleKeyDown]);

    const handleNotesBrowse = async () => {
        try {
            const result = await ipcRenderer.invoke(IPC_CHANNELS.SHOW_DIRECTORY_DIALOG, notesPath);
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
            const validation = await ipcRenderer.invoke(IPC_CHANNELS.VALIDATE_PATH, path);
            setPathValidation(validation);
            return validation.valid;
        } catch (error) {
            console.error('Error validating path:', error);
            setPathValidation({ valid: false, message: 'Error validating path' });
            return false;
        }
    };

    // Check directory status function
    const checkDirectoryStatus = useCallback(async () => {
        if (!databasePath) {
            setDirectoryStatus(null);
            return;
        }

        setStatusLoading(true);
        try {
            const response = await ipcRenderer.invoke(IPC_CHANNELS.VECTOR_STORE_CHECK_STATUS, databasePath);
            if (response.success) {
                setDirectoryStatus(response.status);
            } else {
                console.error('Error checking directory status:', response.message);
                setDirectoryStatus(null);
            }
        } catch (error) {
            console.error('Error checking directory status:', error);
            setDirectoryStatus(null);
        } finally {
            setStatusLoading(false);
        }
    }, [databasePath]);

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
            await ipcRenderer.invoke(IPC_CHANNELS.START_FULL_INDEXING, databasePath, notesPath);
            // Refresh status after indexing
            setTimeout(() => {
                checkDirectoryStatus();
            }, 1000);
        } catch (error) {
            console.error('Error starting indexing:', error);
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

    // Check directory status when database path changes
    useEffect(() => {
        if (databasePath) {
            checkDirectoryStatus();
        }
    }, [databasePath, checkDirectoryStatus]);

    useEffect(() => {
        dispatch(getSettings());

        // Listen for indexing progress events
        const handleIndexingProgress = (_: any, data: any) => {
            console.log('[DatabasePanel] Progress event received:', data);
            const progressValue = data.percentage || data.progress || 0;
            setIndexingProgress(progressValue);
            if (data.item) {
                setIndexedItems(prev => [...prev, data.item]);
            }
            if (data.file) {
                console.log(`[DatabasePanel] Processing file: ${data.file} (${data.current}/${data.total})`);
            }
        };

        const handleIndexingComplete = (_: any, data: any) => {
            setIsIndexing(false);
            setIndexingProgress(100);
            console.log(`[DatabasePanel] Indexing complete. Success: ${data?.success || 0}, Errors: ${data?.errors || 0}`);

            // Show indexing result
            setIndexingResult({
                success: data?.success || 0,
                errors: data?.errors || 0,
                show: true
            });

            // Auto-hide after 5 seconds
            setTimeout(() => {
                setIndexingResult(prev => prev ? { ...prev, show: false } : null);
            }, 5000);

            // Refresh directory status after indexing completes
            setTimeout(() => {
                checkDirectoryStatus();
            }, 1000);
        };

        const handleIndexingError = (_: any, error: string) => {
            console.error('Indexing error:', error);
            setIsIndexing(false);
        };

        // Listen for vector store events
        ipcRenderer.on('vector-store:indexing-progress', handleIndexingProgress);
        ipcRenderer.on('vector-store:indexing-completed', handleIndexingComplete);
        ipcRenderer.on('vector-store:file-indexed', (_: any, data: any) => {
            console.log('[DatabasePanel] File indexed:', data);
        });
        ipcRenderer.on('indexing-error', handleIndexingError);

        return () => {
            ipcRenderer.off('vector-store:indexing-progress', handleIndexingProgress);
            ipcRenderer.off('vector-store:indexing-completed', handleIndexingComplete);
            ipcRenderer.off('vector-store:file-indexed', () => { });
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

                            {/* Indexing Result Alert */}
                            {indexingResult?.show && (
                                <Alert
                                    severity={indexingResult.errors > 0 ? "warning" : "success"}
                                    sx={{ mb: 3 }}
                                    onClose={() => setIndexingResult(prev => prev ? { ...prev, show: false } : null)}
                                >
                                    Indexing complete: {indexingResult.success} files indexed successfully
                                    {indexingResult.errors > 0 && `, ${indexingResult.errors} errors occurred`}
                                </Alert>
                            )}

                            <Card sx={{ mb: 3 }}>
                                <CardContent>
                                    {/* Status Display */}
                                    {statusLoading ? (
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                                            <CircularProgress size={20} />
                                            <Typography variant="body2" color="text.secondary">
                                                Checking directory status...
                                            </Typography>
                                        </Box>
                                    ) : directoryStatus ? (
                                        <Box sx={{ mb: 3 }}>
                                            {directoryStatus.upToDate ? (
                                                <Alert severity="success" sx={{ mb: 2 }}>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <Typography variant="body2">
                                                            ✅ All files are indexed ({directoryStatus.indexedFiles} of {directoryStatus.totalFiles} files)
                                                        </Typography>
                                                        <Button
                                                            size="small"
                                                            onClick={checkDirectoryStatus}
                                                            disabled={statusLoading}
                                                        >
                                                            Refresh
                                                        </Button>
                                                    </Box>
                                                </Alert>
                                            ) : (
                                                <Alert severity="info" sx={{ mb: 2 }}>
                                                    <Typography variant="body2">
                                                        📂 {directoryStatus.indexedFiles} of {directoryStatus.totalFiles} files indexed
                                                        {directoryStatus.newFiles.length > 0 && ` • ${directoryStatus.newFiles.length} new files`}
                                                        {directoryStatus.modifiedFiles.length > 0 && ` • ${directoryStatus.modifiedFiles.length} modified files`}
                                                        {directoryStatus.deletedFiles.length > 0 && ` • ${directoryStatus.deletedFiles.length} deleted files`}
                                                    </Typography>
                                                </Alert>
                                            )}
                                        </Box>
                                    ) : null}

                                    {/* Conditional Indexing Button */}
                                    {(!directoryStatus?.upToDate || !directoryStatus) && (
                                        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                                            <Button
                                                variant="contained"
                                                onClick={startIndexing}
                                                disabled={isIndexing || !databasePath}
                                                startIcon={isIndexing ? <CircularProgress size={20} /> : <RefreshIcon />}
                                                fullWidth
                                            >
                                                {isIndexing ? 'Indexing...' :
                                                    directoryStatus?.indexedFiles === 0 ? 'Start Indexing' :
                                                        'Update Index'}
                                            </Button>
                                        </Box>
                                    )}

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
                        <Box sx={{ px: 0 }}>
                            <Typography variant="h6" gutterBottom fontWeight={600} sx={{ px: 3, mb: 2 }}>
                                Database Contents
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ px: 3, mb: 3 }}>
                                Browse and manage indexed documents in your vector database.
                            </Typography>

                            <DocumentViewer databasePath={databasePath} />
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