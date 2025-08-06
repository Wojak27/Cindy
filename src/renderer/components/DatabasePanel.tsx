import React, { useState, useEffect } from 'react';
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
    FormControlLabel
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { ipcRenderer } from 'electron';

const DatabasePanel: React.FC = () => {
    const dispatch = useDispatch();
    const settings = useSelector((state: any) => state.settings);

    // Database settings state
    const [databasePath, setDatabasePath] = useState(settings?.database?.path || '');
    const [embeddingModel, setEmbeddingModel] = useState(settings?.database?.embeddingModel || 'qwen3:8b');
    const [chunkSize, setChunkSize] = useState(settings?.database?.chunkSize || 1000);
    const [chunkOverlap, setChunkOverlap] = useState(settings?.database?.chunkOverlap || 200);
    const [autoIndex, setAutoIndex] = useState(settings?.database?.autoIndex || true);
    const [pathValidation, setPathValidation] = useState<{ valid: boolean; message?: string } | null>(null);

    useEffect(() => {
        dispatch(getSettings());
    }, [dispatch]);

    // Sync local state when Redux store changes (like SettingsPanel)
    useEffect(() => {
        if (settings?.database) {
            setDatabasePath(settings.database.path || '');
            setEmbeddingModel(settings.database.embeddingModel || 'qwen3:8b');
            setChunkSize(settings.database.chunkSize || 1000);
            setChunkOverlap(settings.database.chunkOverlap || 200);
            setAutoIndex(settings.database.autoIndex ?? true);
        }
    }, [settings]);

    // Auto-save function (like SettingsPanel)
    const autoSaveSettings = () => {
        dispatch(updateSettings({
            database: {
                path: databasePath,
                embeddingModel,
                chunkSize,
                chunkOverlap,
                autoIndex
            }
        }));
    };

    // Auto-save when settings change
    useEffect(() => {
        if (databasePath || embeddingModel !== 'qwen3:8b' || chunkSize !== 1000 || chunkOverlap !== 200 || !autoIndex) {
            autoSaveSettings();
        }
    }, [databasePath, embeddingModel, chunkSize, chunkOverlap, autoIndex]);

    const handleBrowse = async () => {
        try {
            const result = await ipcRenderer.invoke('show-directory-dialog', databasePath);
            if (result) {
                setDatabasePath(result);
                validatePath(result);
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

    const createVectorStore = async () => {
        try {
            const options = {
                databasePath,
                embeddingModel,
                chunkSize,
                chunkOverlap,
                autoIndex
            };

            const result = await ipcRenderer.invoke('create-vector-store', options);
            if (result.success) {
                console.log('Vector store created successfully');
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
                // Close the panel
                dispatch({ type: 'TOGGLE_DATABASE_SIDEBAR' });
            } else {
                console.error('Failed to create vector store:', result.message);
            }
        } catch (error) {
            console.error('Error creating vector store:', error);
        }
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
        </div>
    );
};

export default DatabasePanel;