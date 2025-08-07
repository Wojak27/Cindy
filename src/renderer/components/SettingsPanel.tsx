import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { getSettings, updateSettings, toggleSettings } from '../../store/actions';
import ModelPicker from './ModelPicker';
import { isValidBlobStyle } from '../hooks/useSettings';
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
    Alert
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { ipcRenderer } from 'electron';
import ThemeToggle from './ThemeToggle';

const SettingsPanel: React.FC = () => {
    const dispatch = useDispatch();
    const settings = useSelector((state: any) => state.settings);
    // Initialize state with defaults to prevent uncontrolled to controlled input warning
    const [activationPhrase, setActivationPhrase] = useState(settings?.voice?.activationPhrase || 'Hi Cindy!');
    const [sttProvider, setSttProvider] = useState(settings?.voice?.sttProvider || 'auto');
    const [wakeWordSensitivity, setWakeWordSensitivity] = useState(settings?.voice?.wakeWordSensitivity || 0.5);
    const [audioThreshold, setAudioThreshold] = useState(settings?.voice?.audioThreshold || 0.01);
    const [wakeWordEnabled, setWakeWordEnabled] = useState(true);
    const [wakeWordStatus, setWakeWordStatus] = useState('Checking...');

    // LLM settings state
    const [llmProvider, setLlmProvider] = useState(settings?.llm?.provider || 'ollama');
    const [openaiModel, setOpenaiModel] = useState(settings?.llm?.openai?.model || 'gpt-3.5-turbo');
    const [ollamaModel, setOllamaModel] = useState(settings?.llm?.ollama?.model || 'qwen3:4b');
    const [openaiApiKey, setOpenaiApiKey] = useState(settings?.llm?.openai?.apiKey || '');
    const [ollamaBaseUrl, setOllamaBaseUrl] = useState(settings?.llm?.ollama?.baseUrl || 'http://127.0.0.1:11434');
    const [temperature, setTemperature] = useState(settings?.llm?.openai?.temperature || 0.7);
    const [maxTokens, setMaxTokens] = useState(settings?.llm?.openai?.maxTokens || 4096);

    // Connection test state
    const [testingConnection, setTestingConnection] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState({
        openai: false,
        ollama: false
    });

    // Profile settings state
    const [name, setName] = useState(settings?.profile?.name || '');
    const [surname, setSurname] = useState(settings?.profile?.surname || '');

    // Theme settings state
    const [, setTheme] = useState(settings?.theme || 'system');

    // Auto-save functionality (similar to DatabasePanel)
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isUpdatingFromRedux = useRef(false);

    // Auto-save function
    const autoSaveSettings = useCallback(() => {
        if (isUpdatingFromRedux.current) {
            return; // Don't save if updating from Redux
        }

        dispatch(updateSettings({
            voice: {
                activationPhrase,
                sttProvider,
                wakeWordSensitivity,
                audioThreshold
            },
            llm: {
                provider: llmProvider,
                openai: {
                    model: openaiModel,
                    apiKey: openaiApiKey,
                    temperature,
                    maxTokens
                },
                ollama: {
                    model: ollamaModel,
                    baseUrl: ollamaBaseUrl,
                    temperature: 0.7
                }
            },
            profile: {
                name,
                surname,
                hasCompletedSetup: true
            }
        }));
    }, [dispatch, activationPhrase, sttProvider, wakeWordSensitivity, audioThreshold, llmProvider, openaiModel, openaiApiKey, temperature, maxTokens, ollamaModel, ollamaBaseUrl, name, surname]);

    // Debounced auto-save effect
    useEffect(() => {
        if (isUpdatingFromRedux.current) {
            return () => {}; // Don't trigger auto-save if updating from Redux
        }

        // Clear existing timeout
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        // Set new timeout
        saveTimeoutRef.current = setTimeout(() => {
            autoSaveSettings();
        }, 1000); // 1 second debounce

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [activationPhrase, sttProvider, wakeWordSensitivity, audioThreshold, llmProvider, openaiModel, openaiApiKey, temperature, maxTokens, ollamaModel, ollamaBaseUrl, name, surname, autoSaveSettings]);

    // Update local state when settings change in the store
    useEffect(() => {

        if (settings) {
            isUpdatingFromRedux.current = true;
            
            setActivationPhrase(settings?.voice?.activationPhrase || 'Hi Cindy!');
            setSttProvider(settings?.voice?.sttProvider || 'auto');
            setWakeWordSensitivity(settings?.voice?.wakeWordSensitivity || 0.5);
            setAudioThreshold(settings?.voice?.audioThreshold || 0.01);
            setLlmProvider(settings?.llm?.provider || 'ollama');
            setOpenaiModel(settings?.llm?.openai?.model || 'gpt-3.5-turbo');
            setOllamaModel(settings?.llm?.ollama?.model || 'qwen3:4b');
            setOpenaiApiKey(settings?.llm?.openai?.apiKey || '');
            setOllamaBaseUrl(settings?.llm?.ollama?.baseUrl || 'http://127.0.0.1:11434');
            setTemperature(settings?.llm?.openai?.temperature || 0.7);
            setMaxTokens(settings?.llm?.openai?.maxTokens || 4096);
            setName(settings?.profile?.name || '');
            setSurname(settings?.profile?.surname || '');
            setTheme(settings?.theme || 'system');

            console.log('🔧 DEBUG: Set name to:', settings?.profile?.name || '');
            
            // Reset the flag after a brief delay to allow state updates to complete
            setTimeout(() => {
                isUpdatingFromRedux.current = false;
            }, 100);
        }
    }, [settings]);

    useEffect(() => {
        dispatch(getSettings());
    }, [dispatch]);

    // Test LLM connections
    const testConnection = async () => {
        setTestingConnection(true);
        try {
            const result = await ipcRenderer.invoke('llm:test-connection');
            if (result.success) {
                setConnectionStatus(result.connections);
            }
        } catch (error) {
            console.error('Failed to test connection:', error);
        } finally {
            setTestingConnection(false);
        }
    };

    // State for storage permission
    const [hasStoragePermission, setHasStoragePermission] = useState<boolean>(false);
    const [checkingPermission, setCheckingPermission] = useState<boolean>(true);

    // Check storage permission on component mount
    useEffect(() => {
        const checkPermission = async () => {
            try {
                const result = await ipcRenderer.invoke('has-storage-permission');
                setHasStoragePermission(result.hasPermission);
            } catch (error) {
                console.error('Failed to check storage permission:', error);
            } finally {
                setCheckingPermission(false);
            }
        };

        checkPermission();
    }, []);

    // Request storage permission
    const requestStoragePermission = async () => {
        setCheckingPermission(true);
        try {
            const result = await ipcRenderer.invoke('grant-storage-permission');
            if (result.success) {
                setHasStoragePermission(true);
            } else {
                console.error('Failed to grant storage permission:', result.error);
            }
        } catch (error) {
            console.error('Failed to grant storage permission:', error);
        } finally {
            setCheckingPermission(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        dispatch(updateSettings({
            voice: {
                activationPhrase,
                sttProvider,
                wakeWordSensitivity,
                audioThreshold,
                voiceSpeed: settings.voice.voiceSpeed,
                voicePitch: settings.voice.voicePitch
            },
            llm: {
                provider: llmProvider,
                openai: {
                    model: openaiModel,
                    apiKey: openaiApiKey || settings.llm.openai.apiKey,
                    organizationId: settings.llm.openai.organizationId,
                    temperature,
                    maxTokens
                },
                ollama: {
                    model: ollamaModel,
                    baseUrl: ollamaBaseUrl,
                    temperature
                }
            },
            profile: {
                name,
                surname,
                hasCompletedSetup: true
            }
        }));
    };

    // Handle blob style change
    const handleBlobStyleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const newStyle = event.target.value;
        if (isValidBlobStyle(newStyle)) {
            dispatch(updateSettings({
                blobStyle: newStyle
            }));
        }
    };

    // Handle blob sensitivity change
    const handleBlobSensitivityChange = (_: Event | null, newValue: number | number[]) => {
        dispatch(updateSettings({
            blobSensitivity: newValue as number
        }));
    };

    // Wake word management functions
    const checkWakeWordStatus = async () => {
        try {
            const result = await ipcRenderer.invoke('wake-word:status');
            if (result.success) {
                setWakeWordStatus(result.isListening ? 'Active' : 'Inactive');
                setWakeWordEnabled(result.isListening);
            } else {
                setWakeWordStatus('Error');
            }
        } catch (error) {
            console.error('Failed to check wake word status:', error);
            setWakeWordStatus('Error');
        }
    };

    const toggleWakeWord = async () => {
        try {
            const action = wakeWordEnabled ? 'wake-word:stop' : 'wake-word:start';
            const result = await ipcRenderer.invoke(action);
            if (result && result.success) {
                setWakeWordEnabled(!wakeWordEnabled);
                setWakeWordStatus(!wakeWordEnabled ? 'Active' : 'Inactive');
            } else {
                console.error('Failed to toggle wake word:', result?.error || 'Service not available');
                setWakeWordStatus('Service not available');
                // Show user-friendly error
                alert('Wake word service is not available. Please restart the application.');
            }
        } catch (error) {
            console.error('Failed to toggle wake word:', error);
            setWakeWordStatus('Error');
        }
    };

    const testWakeWord = () => {
        // Simulate wake word detection for testing
        console.log('Testing wake word detection...');
        // Dispatch a test wake word event
        document.dispatchEvent(new CustomEvent('test-wake-word'));
        // Also trigger via IPC for full test
        ipcRenderer.send('wake-word-detected');
    };

    const updateWakeWordKeyword = async () => {
        try {
            const result = await ipcRenderer.invoke('wake-word:update-keyword', activationPhrase, wakeWordSensitivity);
            if (result.success) {
                console.log('Wake word keyword updated successfully');
            } else {
                console.error('Failed to update wake word keyword:', result.error);
            }
        } catch (error) {
            console.error('Failed to update wake word keyword:', error);
        }
    };

    // Check wake word status on component mount
    useEffect(() => {
        checkWakeWordStatus();
    }, []);

    return (
        <div className="settings-sidebar">
            <div className="settings-header">
                <Typography variant="h6">Settings</Typography>
                <IconButton
                    onClick={() => dispatch(toggleSettings())}
                    size="small"
                >
                    <CloseIcon />
                </IconButton>
            </div>
            <div className="settings-content">
                {/* Storage Permission Section */}
                {checkingPermission ? (
                    <Alert severity="info">Checking storage permission...</Alert>
                ) : !hasStoragePermission ? (
                    <Alert
                        severity="warning"
                        action={
                            <Button
                                color="inherit"
                                size="small"
                                onClick={requestStoragePermission}
                                disabled={checkingPermission}
                            >
                                Give Permission
                            </Button>
                        }
                    >
                        Storage access required. Click "Give Permission" to allow access to your files.
                    </Alert>
                ) : (
                    <>
                        <Typography variant="subtitle1" gutterBottom>Profile</Typography>
                        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
                            <FormControl fullWidth margin="normal">
                                <TextField
                                    id="name"
                                    label="First Name"
                                    value={name}
                                    onChange={(e) => {
                                        setName(e.target.value);
                                    }}
                                    variant="outlined"
                                    size="small"
                                />
                            </FormControl>

                            <FormControl fullWidth margin="normal">
                                <TextField
                                    id="surname"
                                    label="Last Name"
                                    value={surname}
                                    onChange={(e) => {
                                        setSurname(e.target.value);
                                    }}
                                    variant="outlined"
                                    size="small"
                                />
                            </FormControl>

                            <Divider sx={{ my: 3 }} />
                            <Typography variant="subtitle1" gutterBottom>Voice Settings</Typography>

                            <FormControl fullWidth margin="normal">
                                <InputLabel id="sttProvider-label">Speech Recognition</InputLabel>
                                <Select
                                    labelId="sttProvider-label"
                                    id="sttProvider"
                                    value={sttProvider}
                                    onChange={(e) => setSttProvider(e.target.value as 'online' | 'offline' | 'auto' | 'whisper')}
                                    label="Speech Recognition"
                                    size="small"
                                >
                                    <MenuItem value="online">Online (Cloud)</MenuItem>
                                    <MenuItem value="offline">Offline (Whisper.cpp)</MenuItem>
                                    <MenuItem value="whisper">Whisper Local API</MenuItem>
                                    <MenuItem value="auto">Auto (Preferred)</MenuItem>
                                </Select>
                            </FormControl>

                            {/* Wake Word Settings */}
                            <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>Wake Word Settings</Typography>
                            
                            {/* Info about Whisper wake word */}
                            <Alert severity="success" sx={{ mb: 2 }}>
                                <Typography variant="body2">
                                    Wake word detection is powered by Whisper AI for accurate, offline speech recognition.
                                    <br />
                                    You can use any custom phrase - just type it below and adjust the sensitivity for your environment.
                                </Typography>
                            </Alert>
                            <FormControl fullWidth margin="normal">
                                <TextField
                                    id="activationPhrase"
                                    label="Wake Word Phrase"
                                    value={activationPhrase}
                                    onChange={(e) => setActivationPhrase(e.target.value)}
                                    variant="outlined"
                                    size="small"
                                    helperText="Say this phrase to activate voice recording"
                                />
                            </FormControl>

                            <Box sx={{ mt: 2, mb: 2 }}>
                                <Typography variant="body2" gutterBottom>
                                    Wake Word Sensitivity: {wakeWordSensitivity.toFixed(2)}
                                </Typography>
                                <Slider
                                    value={wakeWordSensitivity}
                                    onChange={(_, newValue) => setWakeWordSensitivity(newValue as number)}
                                    onChangeCommitted={updateWakeWordKeyword}
                                    min={0.1}
                                    max={1.0}
                                    step={0.05}
                                    marks
                                    size="small"
                                />
                                <FormHelperText>Lower = more sensitive, Higher = less sensitive</FormHelperText>
                            </Box>

                            <Box sx={{ mt: 2, mb: 2 }}>
                                <Typography variant="body2" gutterBottom>
                                    Audio Level Threshold: {audioThreshold.toFixed(3)}
                                </Typography>
                                <Slider
                                    value={audioThreshold}
                                    onChange={(_, newValue) => setAudioThreshold(newValue as number)}
                                    min={0.001}
                                    max={0.1}
                                    step={0.001}
                                    size="small"
                                />
                                <FormHelperText>Minimum audio level to trigger wake word detection (prevents activation from background noise)</FormHelperText>
                            </Box>

                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
                                <Button
                                    variant={wakeWordEnabled ? "contained" : "outlined"}
                                    color={wakeWordEnabled ? "success" : "primary"}
                                    onClick={toggleWakeWord}
                                    size="small"
                                >
                                    {wakeWordEnabled ? "Stop Wake Word" : "Start Wake Word"}
                                </Button>
                                <Button
                                    variant="outlined"
                                    color="secondary"
                                    onClick={testWakeWord}
                                    size="small"
                                    sx={{ ml: 1 }}
                                >
                                    Test Wake Word
                                </Button>
                                <Typography variant="body2" color={wakeWordStatus === 'Active' ? 'success.main' : 'text.secondary'}>
                                    Status: {wakeWordStatus}
                                </Typography>
                            </Box>

                            <Divider sx={{ my: 3 }} />
                            <Typography variant="subtitle1" gutterBottom>Language Model</Typography>

                            <FormControl fullWidth margin="normal">
                                <InputLabel id="llmProvider-label">Provider</InputLabel>
                                <Select
                                    labelId="llmProvider-label"
                                    id="llmProvider"
                                    value={llmProvider}
                                    onChange={(e) => setLlmProvider(e.target.value as 'openai' | 'ollama' | 'auto')}
                                    label="Provider"
                                    size="small"
                                >
                                    <MenuItem value="auto">Auto (Recommended)</MenuItem>
                                    <MenuItem value="openai">OpenAI</MenuItem>
                                    <MenuItem value="ollama">Ollama</MenuItem>
                                </Select>
                                <FormHelperText>Auto mode uses OpenAI when available, falling back to Ollama</FormHelperText>
                            </FormControl>

                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={testConnection}
                                    disabled={testingConnection}
                                >
                                    {testingConnection ? 'Testing...' : 'Test Connection'}
                                </Button>
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                    <Box
                                        sx={{
                                            width: 12,
                                            height: 12,
                                            borderRadius: '50%',
                                            backgroundColor: connectionStatus.openai ? 'success.main' : 'error.main',
                                            opacity: connectionStatus.openai || connectionStatus.ollama ? 1 : 0.3
                                        }}
                                    />
                                    <Typography variant="caption" color="text.secondary">
                                        OpenAI
                                    </Typography>
                                    <Box
                                        sx={{
                                            width: 12,
                                            height: 12,
                                            borderRadius: '50%',
                                            backgroundColor: connectionStatus.ollama ? 'success.main' : 'error.main',
                                            opacity: connectionStatus.openai || connectionStatus.ollama ? 1 : 0.3
                                        }}
                                    />
                                    <Typography variant="caption" color="text.secondary">
                                        Ollama
                                    </Typography>
                                </Box>
                            </Box>

                            {llmProvider === 'openai' && (
                                <div className="provider-settings openai">
                                    <FormControl fullWidth margin="normal">
                                        <TextField
                                            id="openaiApiKey"
                                            label="OpenAI API Key"
                                            type="password"
                                            value={openaiApiKey}
                                            onChange={(e) => setOpenaiApiKey(e.target.value)}
                                            variant="outlined"
                                            size="small"
                                            placeholder="sk-..."
                                        />
                                    </FormControl>

                                    <FormControl fullWidth margin="normal">
                                        <ModelPicker
                                            provider="openai"
                                            selectedModel={openaiModel}
                                            onModelChange={setOpenaiModel}
                                        />
                                    </FormControl>
                                </div>
                            )}

                            {llmProvider === 'ollama' && (
                                <div className="provider-settings ollama">
                                    <FormControl fullWidth margin="normal">
                                        <TextField
                                            id="ollamaBaseUrl"
                                            label="Ollama Base URL"
                                            value={ollamaBaseUrl}
                                            onChange={(e) => setOllamaBaseUrl(e.target.value)}
                                            variant="outlined"
                                            size="small"
                                            placeholder="http://127.0.0.1:11434"
                                        />
                                    </FormControl>

                                    <FormControl fullWidth margin="normal">
                                        <ModelPicker
                                            provider="ollama"
                                            selectedModel={ollamaModel}
                                            onModelChange={setOllamaModel}
                                        />
                                    </FormControl>
                                </div>
                            )}

                            <Divider sx={{ my: 3 }} />
                            <Typography variant="subtitle1" gutterBottom>Common Settings</Typography>
                            <FormControl fullWidth margin="normal">
                                <Typography id="temperature-slider" gutterBottom>
                                    Temperature: {temperature}
                                </Typography>
                                <Slider
                                    aria-labelledby="temperature-slider"
                                    value={temperature}
                                    onChange={(_, newValue) => setTemperature(newValue as number)}
                                    step={0.1}
                                    min={0}
                                    max={1}
                                    valueLabelDisplay="auto"
                                />
                                <FormHelperText>The creativity of the model's responses. Higher values = more creative.</FormHelperText>
                            </FormControl>

                            <FormControl fullWidth margin="normal">
                                <TextField
                                    id="maxTokens"
                                    label="Max Tokens"
                                    type="number"
                                    value={maxTokens}
                                    onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                                    variant="outlined"
                                    size="small"
                                    slotProps={{ input: { inputProps: { min: 1, max: 4096 } } }}
                                />
                                <FormHelperText>The maximum number of tokens in the response.</FormHelperText>
                            </FormControl>
                        </Box>
                    </>
                )}

                <Divider sx={{ my: 3 }} />
                <Typography variant="subtitle1" gutterBottom>Appearance</Typography>
                
                <FormControl fullWidth margin="normal">
                    <Typography gutterBottom>Theme</Typography>
                    <ThemeToggle variant="inline" showLabel />
                </FormControl>

                <Divider sx={{ my: 3 }} />
                <Typography variant="subtitle1" gutterBottom>Visual Feedback</Typography>

                <FormControl fullWidth margin="normal">
                    <Typography id="blob-sensitivity-slider" gutterBottom>
                        Blob Sensitivity: {settings.blobSensitivity?.toFixed(1) || 0.5}
                    </Typography>
                    <Slider
                        aria-labelledby="blob-sensitivity-slider"
                        value={settings.blobSensitivity || 0.5}
                        onChange={(_, newValue) => handleBlobSensitivityChange(_, newValue)}
                        step={0.1}
                        min={0}
                        max={1}
                        valueLabelDisplay="auto"
                    />
                    <FormHelperText>How strongly the blob reacts to sound input.</FormHelperText>
                </FormControl>

                <FormControl fullWidth margin="normal">
                    <Typography id="blob-style-radio" gutterBottom>
                        Animation Style
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, ml: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <input
                                type="radio"
                                id="blob-style-subtle"
                                name="blobStyle"
                                value="subtle"
                                checked={settings.blobStyle === 'subtle'}
                                onChange={handleBlobStyleChange}
                                style={{ marginRight: 8 }}
                            />
                            <label htmlFor="blob-style-subtle">Subtle</label>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <input
                                type="radio"
                                id="blob-style-moderate"
                                name="blobStyle"
                                value="moderate"
                                checked={settings.blobStyle === 'moderate'}
                                onChange={handleBlobStyleChange}
                                style={{ marginRight: 8 }}
                            />
                            <label htmlFor="blob-style-moderate">Moderate</label>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <input
                                type="radio"
                                id="blob-style-intense"
                                name="blobStyle"
                                value="intense"
                                checked={settings.blobStyle === 'intense'}
                                onChange={handleBlobStyleChange}
                                style={{ marginRight: 8 }}
                            />
                            <label htmlFor="blob-style-intense">Intense</label>
                        </Box>
                    </Box>
                    <FormHelperText>Choose the animation style for the visual feedback blob.</FormHelperText>
                </FormControl>
            </div>
            <div className="settings-footer">
                <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    onClick={(e) => {
                        handleSubmit(e);
                        dispatch(toggleSettings());
                    }}
                >
                    Save Settings
                </Button>
            </div>
        </div>
    );
};

export default SettingsPanel;