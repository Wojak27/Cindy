import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { getSettings, updateSettings, toggleSettings } from '../../store/actions';
import ModelPicker from './ModelPicker';
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

const SettingsPanel: React.FC = () => {
    const dispatch = useDispatch();
    const settings = useSelector((state: any) => state.settings);
    // Initialize state with defaults to prevent uncontrolled to controlled input warning
    const [activationPhrase, setActivationPhrase] = useState(settings?.voice?.activationPhrase || 'cindy');
    const [sttProvider, setSttProvider] = useState(settings?.voice?.sttProvider || 'auto');

    // LLM settings state
    const [llmProvider, setLlmProvider] = useState(settings?.llm?.provider || 'ollama');
    const [openaiModel, setOpenaiModel] = useState(settings?.llm?.openai?.model || 'gpt-3.5-turbo');
    const [ollamaModel, setOllamaModel] = useState(settings?.llm?.ollama?.model || 'qwen3:8b');
    const [openaiApiKey, setOpenaiApiKey] = useState(settings?.llm?.openai?.apiKey || '');
    const [ollamaBaseUrl, setOllamaBaseUrl] = useState(settings?.llm?.ollama?.baseUrl || 'http://127.0.0.1:11434');
    const [temperature, setTemperature] = useState(settings?.llm?.openai?.temperature || 0.7);
    const [maxTokens, setMaxTokens] = useState(settings?.llm?.openai?.maxTokens || 4096);

    // Profile settings state
    const [name, setName] = useState(settings?.profile?.name || '');
    const [surname, setSurname] = useState(settings?.profile?.surname || '');

    useEffect(() => {
        dispatch(getSettings());
    }, [dispatch]);

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
                wakeWordSensitivity: settings.voice.wakeWordSensitivity,
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
                                    onChange={(e) => setName(e.target.value)}
                                    variant="outlined"
                                    size="small"
                                />
                            </FormControl>

                            <FormControl fullWidth margin="normal">
                                <TextField
                                    id="surname"
                                    label="Last Name"
                                    value={surname}
                                    onChange={(e) => setSurname(e.target.value)}
                                    variant="outlined"
                                    size="small"
                                />
                            </FormControl>

                            <Divider sx={{ my: 3 }} />
                            <Typography variant="subtitle1" gutterBottom>Voice Settings</Typography>

                            <FormControl fullWidth margin="normal">
                                <TextField
                                    id="activationPhrase"
                                    label="Activation Phrase"
                                    value={activationPhrase}
                                    onChange={(e) => setActivationPhrase(e.target.value)}
                                    variant="outlined"
                                    size="small"
                                />
                            </FormControl>

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
                                    onChange={(e, newValue) => setTemperature(newValue as number)}
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
                                    InputProps={{ inputProps: { min: 1, max: 4096 } }}
                                />
                                <FormHelperText>The maximum number of tokens in the response.</FormHelperText>
                            </FormControl>
                        </Box>
                    </>
                )}
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