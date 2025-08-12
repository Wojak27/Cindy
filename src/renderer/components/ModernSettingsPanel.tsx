import React, { useState, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { getSettings, updateSettings, toggleSettings } from '../../store/actions';
import LLMProviderCard from './LLMProviderCard';
import ThemeToggle from './ThemeToggle';
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
    useTheme,
    alpha,
    Slide,
} from '@mui/material';
import {
    Close as CloseIcon,
    Psychology as PsychologyIcon,
    Mic as MicIcon,
    Person as PersonIcon,
    Palette as PaletteIcon,
    Save as SaveIcon,
    CloudDownload as DownloadIcon,
    Delete as DeleteIcon,
    Computer as LocalIcon,
    Search as SearchIcon,
    ExpandMore as ExpandMoreIcon,
    ExpandLess as ExpandLessIcon,
    Cancel as CancelIcon,
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
            id={`settings-tabpanel-${index}`}
            aria-labelledby={`settings-tab-${index}`}
            {...other}
        >
            {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
        </div>
    );
}

const ModernSettingsPanel: React.FC = () => {
    const theme = useTheme();
    const dispatch = useDispatch();
    const settings = useSelector((state: any) => state.settings);
    const showSettings = useSelector((state: any) => state.ui.showSettings);

    const [tabValue, setTabValue] = useState(0);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // LLM Settings State
    const [selectedProvider, setSelectedProvider] = useState(settings?.llm?.provider || 'ollama');
    const [providerConfigs, setProviderConfigs] = useState({
        openai: settings?.llm?.openai || { model: 'gpt-4o-mini', apiKey: '', temperature: 0.7, maxTokens: 4096 },
        anthropic: settings?.llm?.anthropic || { model: 'claude-3-haiku-20240307', apiKey: '', temperature: 0.7, maxTokens: 4000 },
        openrouter: settings?.llm?.openrouter || { model: 'openai/gpt-4-turbo', apiKey: '', temperature: 0.7, maxTokens: 4096, siteUrl: 'https://localhost:3000', appName: 'Cindy Voice Assistant' },
        groq: settings?.llm?.groq || { model: 'llama3-8b-8192', apiKey: '', temperature: 0.7, maxTokens: 4096 },
        google: settings?.llm?.google || { model: 'gemini-pro', apiKey: '', temperature: 0.7, maxOutputTokens: 2048 },
        cohere: settings?.llm?.cohere || { model: 'command', apiKey: '', temperature: 0.7 },
        azure: settings?.llm?.azure || { deploymentName: '', apiKey: '', apiVersion: '2024-02-01', instanceName: '', temperature: 0.7, maxTokens: 4096 },
        huggingface: settings?.llm?.huggingface || { model: 'meta-llama/Llama-2-70b-chat-hf', apiKey: '', temperature: 0.7, maxTokens: 2048 },
        ollama: settings?.llm?.ollama || { model: 'llama3:8b', baseUrl: 'http://127.0.0.1:11434', temperature: 0.7 },
    });

    const [connectionStatus, setConnectionStatus] = useState<Record<string, boolean>>({});
    const [testingProvider, setTestingProvider] = useState<string | null>(null);

    // Voice Settings State
    const [voiceSettings, setVoiceSettings] = useState({
        activationPhrase: settings?.voice?.activationPhrase || 'Hi Cindy!',
        sttProvider: settings?.voice?.sttProvider || 'auto',
        wakeWordSensitivity: settings?.voice?.wakeWordSensitivity || 0.5,
        audioThreshold: settings?.voice?.audioThreshold || 0.01,
    });

    // Profile Settings State
    const [profileSettings, setProfileSettings] = useState({
        name: settings?.profile?.name || '',
        surname: settings?.profile?.surname || '',
    });

    // Search Settings State
    const [searchSettings, setSearchSettings] = useState({
        preferredProvider: settings?.search?.preferredProvider || 'auto',
        braveApiKey: settings?.search?.braveApiKey || '',
        tavilyApiKey: settings?.search?.tavilyApiKey || '',
        serpApiKey: settings?.search?.serpApiKey || '',
        fallbackProviders: settings?.search?.fallbackProviders || ['duckduckgo', 'brave', 'tavily', 'serp'],
        rateLimit: settings?.search?.rateLimit || {
            enabled: true,
            requestsPerMinute: 10,
            cooldownSeconds: 5
        }
    });

    // UI State for expand/collapse
    const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());

    // Original settings for cancel functionality
    const [originalSettings, setOriginalSettings] = useState<any>(null);

    // Model Management State
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [installedModels, setInstalledModels] = useState<string[]>([]);
    const [downloadingModels, setDownloadingModels] = useState<Set<string>>(new Set());
    const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});

    // Provider definitions with enhanced design
    const llmProviders = [
        {
            id: 'openai' as const,
            name: 'OpenAI',
            description: 'GPT-4 and GPT-3.5 models with excellent reasoning and coding capabilities',
            color: '#10A37F',
            isLocal: false,
            requiresApiKey: true,
            models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
        },
        {
            id: 'anthropic' as const,
            name: 'Anthropic',
            description: 'Claude 3 models known for safety, helpfulness, and long context windows',
            color: '#CC785C',
            isLocal: false,
            requiresApiKey: true,
            models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
        },
        {
            id: 'openrouter' as const,
            name: 'OpenRouter',
            description: 'Access 100+ models through a unified API with competitive pricing',
            color: '#8B5CF6',
            isLocal: false,
            requiresApiKey: true,
            models: ['openai/gpt-4-turbo', 'openai/gpt-4', 'anthropic/claude-3-opus', 'anthropic/claude-3-sonnet', 'meta-llama/llama-2-70b-chat', 'mistralai/mixtral-8x7b-instruct'],
        },
        {
            id: 'groq' as const,
            name: 'Groq',
            description: 'Ultra-fast inference with LLaMA and Mixtral models on custom hardware',
            color: '#F97316',
            isLocal: false,
            requiresApiKey: true,
            models: ['llama3-8b-8192', 'llama3-70b-8192', 'mixtral-8x7b-32768', 'gemma-7b-it', 'llama2-70b-4096'],
        },
        {
            id: 'google' as const,
            name: 'Google',
            description: 'Gemini models with multimodal capabilities and strong reasoning',
            color: '#4285F4',
            isLocal: false,
            requiresApiKey: true,
            models: ['gemini-pro', 'gemini-pro-vision', 'gemini-1.5-pro-latest', 'gemini-1.5-flash-latest'],
        },
        {
            id: 'cohere' as const,
            name: 'Cohere',
            description: 'Command models optimized for business and enterprise applications',
            color: '#39594C',
            isLocal: false,
            requiresApiKey: true,
            models: ['command', 'command-light', 'command-nightly'],
        },
        {
            id: 'azure' as const,
            name: 'Azure OpenAI',
            description: 'Enterprise-grade OpenAI models hosted on Microsoft Azure',
            color: '#0078D4',
            isLocal: false,
            requiresApiKey: true,
            models: ['gpt-4', 'gpt-35-turbo'],
        },
        {
            id: 'huggingface' as const,
            name: 'Hugging Face',
            description: 'Open-source models via Hugging Face Inference API',
            color: '#FF9A00',
            isLocal: false,
            requiresApiKey: true,
            models: ['meta-llama/Llama-2-70b-chat-hf', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
        },
        {
            id: 'ollama' as const,
            name: 'Ollama',
            description: 'Run powerful models locally on your machine with complete privacy',
            color: '#000000',
            isLocal: true,
            requiresApiKey: false,
            models: ['llama3:8b', 'llama3:70b', 'mistral:7b', 'qwen3:4b', 'gemma:7b'],
        },
    ];

    // Update original settings baseline after successful save
    const updateOriginalSettingsBaseline = useCallback(() => {
        // This ensures that after saving, if user makes new changes, 
        // cancel will revert to the newly saved state, not the initial component state
        setOriginalSettings(null);
        setHasUnsavedChanges(false);
    }, []);

    // Save all settings
    const saveSettings = useCallback(() => {
        const updatedSettings = {
            // Preserve existing general settings that aren't managed by this panel
            theme: settings?.theme || 'light',
            autoStart: settings?.autoStart || false,
            notifications: settings?.notifications || true,
            blobSensitivity: settings?.blobSensitivity || 0.5,
            blobStyle: settings?.blobStyle || 'moderate',
            // Settings managed by this panel
            llm: {
                provider: selectedProvider,
                ...providerConfigs,
            },
            voice: voiceSettings,
            profile: {
                ...profileSettings,
                hasCompletedSetup: true,
            },
            search: searchSettings,
            // Preserve other existing settings
            database: settings?.database || {
                path: '',
                embeddingModel: 'qwen3:4b',
                chunkSize: 1000,
                chunkOverlap: 200,
                autoIndex: true
            },
        };

        dispatch(updateSettings(updatedSettings));
        updateOriginalSettingsBaseline();

        // Initialize LLM service with new settings
        ipcRenderer.invoke('initialize-llm');
    }, [dispatch, selectedProvider, providerConfigs, voiceSettings, profileSettings, searchSettings, settings, updateOriginalSettingsBaseline]);

    // Cancel changes
    const cancelChanges = useCallback(() => {
        console.log('🔄 Cancel button clicked - originalSettings:', originalSettings);
        if (originalSettings) {
            console.log('✅ Restoring settings from original state');
            setSelectedProvider(originalSettings.selectedProvider);
            setProviderConfigs(originalSettings.providerConfigs);
            setVoiceSettings(originalSettings.voiceSettings);
            setProfileSettings(originalSettings.profileSettings);
            setSearchSettings(originalSettings.searchSettings);
            setHasUnsavedChanges(false);
            setOriginalSettings(null);
            console.log('✅ Settings restored and state reset');
        } else {
            console.warn('❌ Cancel clicked but no originalSettings available');
        }
    }, [originalSettings]);

    // Track original settings when changes start
    const trackOriginalSettings = useCallback(() => {
        if (!originalSettings) {
            console.log('📸 Tracking original settings as baseline for cancel functionality');
            setOriginalSettings({
                selectedProvider,
                providerConfigs: JSON.parse(JSON.stringify(providerConfigs)), // Deep copy for nested objects
                voiceSettings: { ...voiceSettings },
                profileSettings: { ...profileSettings },
                searchSettings: JSON.parse(JSON.stringify(searchSettings)) // Deep copy for nested rateLimit object
            });
            console.log('📸 Original settings captured:', { selectedProvider, providerConfigs });
        } else {
            console.log('📸 Original settings already exist, not overriding');
        }
    }, [originalSettings, selectedProvider, providerConfigs, voiceSettings, profileSettings, searchSettings]);

    // Toggle provider expansion
    const toggleProviderExpansion = (providerId: string) => {
        setExpandedProviders(prev => {
            const newSet = new Set(prev);
            if (newSet.has(providerId)) {
                newSet.delete(providerId);
            } else {
                newSet.add(providerId);
            }
            return newSet;
        });
    };

    // Handle provider selection
    const handleProviderSelect = (providerId: string) => {
        trackOriginalSettings();
        setSelectedProvider(providerId);
        setHasUnsavedChanges(true);
    };

    // Handle provider config changes
    const handleProviderConfigChange = (providerId: string, config: any) => {
        trackOriginalSettings();
        setProviderConfigs(prev => ({
            ...prev,
            [providerId]: { ...prev[providerId as keyof typeof prev], ...config }
        }));
        setHasUnsavedChanges(true);
    };

    // Handle search settings changes
    const handleSearchSettingChange = (key: string, value: any) => {
        trackOriginalSettings();
        setSearchSettings(prev => ({ ...prev, [key]: value }));
        setHasUnsavedChanges(true);
    };

    // Test connection for a specific provider
    const testProviderConnection = async (providerId: string) => {
        setTestingProvider(providerId);
        try {
            // Test connection logic would go here
            // For now, simulate the test
            await new Promise(resolve => setTimeout(resolve, 2000));
            setConnectionStatus(prev => ({ ...prev, [providerId]: true }));
        } catch (error) {
            setConnectionStatus(prev => ({ ...prev, [providerId]: false }));
        } finally {
            setTestingProvider(null);
        }
    };

    // Model Management Functions
    const loadAvailableModels = useCallback(async () => {
        try {
            const models = await ipcRenderer.invoke('ollama-list-available-models');
            setAvailableModels(models);
        } catch (error) {
            console.error('Failed to load available models:', error);
            // Fallback to common models
            setAvailableModels([
                'llama3:8b',
                'llama3:70b',
                'llama2:7b',
                'llama2:13b',
                'mistral:7b',
                'mixtral:8x7b',
                'qwen3:4b',
                'gemma:7b',
                'phi:3.8b'
            ]);
        }
    }, []);

    const loadInstalledModels = useCallback(async () => {
        try {
            const models = await ipcRenderer.invoke('ollama-list-models');
            setInstalledModels(models);
        } catch (error) {
            console.error('Failed to load installed models:', error);
            setInstalledModels([]);
        }
    }, []);

    const pullModel = async (modelName: string) => {
        if (downloadingModels.has(modelName)) return;

        setDownloadingModels(prev => new Set(prev).add(modelName));
        setDownloadProgress(prev => ({ ...prev, [modelName]: 0 }));

        try {
            // Start the model pulling process
            await ipcRenderer.invoke('ollama-pull-model', modelName);

            // Refresh installed models list
            await loadInstalledModels();

            setHasUnsavedChanges(true);
        } catch (error) {
            console.error(`Failed to pull model ${modelName}:`, error);
        } finally {
            setDownloadingModels(prev => {
                const newSet = new Set(prev);
                newSet.delete(modelName);
                return newSet;
            });
            setDownloadProgress(prev => {
                const newProgress = { ...prev };
                delete newProgress[modelName];
                return newProgress;
            });
        }
    };

    const removeModel = async (modelName: string) => {
        try {
            await ipcRenderer.invoke('ollama-remove-model', modelName);
            await loadInstalledModels();
            setHasUnsavedChanges(true);
        } catch (error) {
            console.error(`Failed to remove model ${modelName}:`, error);
        }
    };

    // Handle explicit close (close button only)
    const handleClose = () => {
        dispatch(toggleSettings());
    };

    // Handle outside click
    const handleOutsideClick = useCallback((event: MouseEvent) => {
        const target = event.target as Element;
        const settingsPanel = document.querySelector('[data-settings-panel="true"]');

        if (settingsPanel && !settingsPanel.contains(target)) {
            dispatch(toggleSettings());
        }
    }, [dispatch]);

    // Handle escape key
    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            dispatch(toggleSettings());
        }
    }, [dispatch]);

    // Add/remove outside click and keyboard listeners
    useEffect(() => {
        if (showSettings) {
            document.addEventListener('mousedown', handleOutsideClick);
            document.addEventListener('keydown', handleKeyDown);
            return () => {
                document.removeEventListener('mousedown', handleOutsideClick);
                document.removeEventListener('keydown', handleKeyDown);
            };
        }
        return undefined;
    }, [showSettings, handleOutsideClick, handleKeyDown]);

    // Update state when settings change
    useEffect(() => {
        if (settings) {
            setSelectedProvider(settings?.llm?.provider || 'ollama');
            setProviderConfigs({
                openai: settings?.llm?.openai || { model: 'gpt-4o-mini', apiKey: '', temperature: 0.7, maxTokens: 4096 },
                anthropic: settings?.llm?.anthropic || { model: 'claude-3-haiku-20240307', apiKey: '', temperature: 0.7, maxTokens: 4000 },
                openrouter: settings?.llm?.openrouter || { model: 'openai/gpt-4-turbo', apiKey: '', temperature: 0.7, maxTokens: 4096, siteUrl: 'https://localhost:3000', appName: 'Cindy Voice Assistant' },
                groq: settings?.llm?.groq || { model: 'llama3-8b-8192', apiKey: '', temperature: 0.7, maxTokens: 4096 },
                google: settings?.llm?.google || { model: 'gemini-pro', apiKey: '', temperature: 0.7, maxOutputTokens: 2048 },
                cohere: settings?.llm?.cohere || { model: 'command', apiKey: '', temperature: 0.7 },
                azure: settings?.llm?.azure || { deploymentName: '', apiKey: '', apiVersion: '2024-02-01', instanceName: '', temperature: 0.7, maxTokens: 4096 },
                huggingface: settings?.llm?.huggingface || { model: 'meta-llama/Llama-2-70b-chat-hf', apiKey: '', temperature: 0.7, maxTokens: 2048 },
                ollama: settings?.llm?.ollama || { model: 'llama3:8b', baseUrl: 'http://127.0.0.1:11434', temperature: 0.7 },
            });
            setVoiceSettings({
                activationPhrase: settings?.voice?.activationPhrase || 'Hi Cindy!',
                sttProvider: settings?.voice?.sttProvider || 'auto',
                wakeWordSensitivity: settings?.voice?.wakeWordSensitivity || 0.5,
                audioThreshold: settings?.voice?.audioThreshold || 0.01,
            });
            setProfileSettings({
                name: settings?.profile?.name || '',
                surname: settings?.profile?.surname || '',
            });
            setSearchSettings({
                preferredProvider: settings?.search?.preferredProvider || 'auto',
                braveApiKey: settings?.search?.braveApiKey || '',
                tavilyApiKey: settings?.search?.tavilyApiKey || '',
                serpApiKey: settings?.search?.serpApiKey || '',
                fallbackProviders: settings?.search?.fallbackProviders || ['duckduckgo', 'brave', 'tavily', 'serp'],
                rateLimit: settings?.search?.rateLimit || {
                    enabled: true,
                    requestsPerMinute: 10,
                    cooldownSeconds: 5
                }
            });
        }
    }, [settings]);

    useEffect(() => {
        dispatch(getSettings());

        // Load model information when panel opens
        if (showSettings) {
            loadAvailableModels();
            loadInstalledModels();
        }
    }, [dispatch, showSettings, loadAvailableModels, loadInstalledModels]);

    return (
        <Slide direction="left" in={showSettings} timeout={300} mountOnEnter unmountOnExit>
            <Box
                data-settings-panel="true"
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
                        Settings
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {hasUnsavedChanges && (
                            <>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={<CancelIcon />}
                                    onClick={cancelChanges}
                                    sx={{ mr: 1 }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="contained"
                                    size="small"
                                    startIcon={<SaveIcon />}
                                    onClick={saveSettings}
                                    sx={{ mr: 1 }}
                                >
                                    Save
                                </Button>
                            </>
                        )}
                        <IconButton onClick={handleClose}>
                            <CloseIcon />
                        </IconButton>
                    </Box>
                </Box>

                {/* Tabs */}
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
                        <Tab icon={<PsychologyIcon />} label="AI PROVIDERS" />
                        <Tab icon={<DownloadIcon />} label="Models" />
                        <Tab icon={<MicIcon />} label="Voice" />
                        <Tab icon={<SearchIcon />} label="Search" />
                        <Tab icon={<PersonIcon />} label="Profile" />
                        <Tab icon={<PaletteIcon />} label="Theme" />
                    </Tabs>
                </Box>

                {/* Content */}
                <Box sx={{ flex: 1, overflow: 'auto' }}>
                    {/* AI Models Tab */}
                    <TabPanel value={tabValue} index={0}>
                        <Box sx={{ px: 3 }}>
                            <Typography variant="h6" gutterBottom fontWeight={600}>
                                Choose Your AI Provider
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                Select from leading AI providers. Each offers unique capabilities and pricing models.
                            </Typography>

                            {llmProviders.map((provider) => (
                                <Box key={provider.id} sx={{ mb: 2 }}>
                                    <Box
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            p: 2,
                                            border: `2px solid ${selectedProvider === provider.id ? provider.color : theme.palette.divider}`,
                                            borderRadius: 2,
                                            cursor: 'pointer',
                                            '&:hover': {
                                                borderColor: provider.color
                                            }
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                            <Box
                                                sx={{
                                                    width: 12,
                                                    height: 12,
                                                    borderRadius: '50%',
                                                    backgroundColor: provider.color
                                                }}
                                            />
                                            <Box>
                                                <Typography variant="h6" fontWeight={600}>
                                                    {provider.name}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    {provider.description}
                                                </Typography>
                                            </Box>
                                        </Box>
                                        <Button
                                            variant={selectedProvider === provider.id ? "contained" : "outlined"}
                                            size="small"
                                            endIcon={expandedProviders.has(provider.id) ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleProviderExpansion(provider.id);
                                            }}
                                        >
                                            Select
                                        </Button>
                                    </Box>
                                    {expandedProviders.has(provider.id) && (
                                        <Box sx={{ mt: 1 }}>
                                            <LLMProviderCard
                                                provider={provider}
                                                isSelected={selectedProvider === provider.id}
                                                isConnected={connectionStatus[provider.id] || false}
                                                isTesting={testingProvider === provider.id}
                                                config={providerConfigs[provider.id]}
                                                onSelect={() => handleProviderSelect(provider.id)}
                                                onConfigChange={(config) => handleProviderConfigChange(provider.id, config)}
                                                onTestConnection={() => testProviderConnection(provider.id)}
                                            />
                                        </Box>
                                    )}
                                </Box>
                            ))}
                        </Box>
                    </TabPanel>

                    {/* Models Tab */}
                    <TabPanel value={tabValue} index={1}>
                        <Box sx={{ px: 3 }}>
                            <Typography variant="h6" gutterBottom fontWeight={600}>
                                Model Management
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                Download and manage LLaMA models for local inference with Ollama.
                            </Typography>

                            {/* Available Models */}
                            <Card sx={{ mb: 3 }}>
                                <CardContent>
                                    <Typography variant="subtitle1" gutterBottom fontWeight={600}>
                                        Available Models
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                        Popular models you can download and use locally.
                                    </Typography>

                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        {availableModels.map((modelName) => {
                                            const isInstalled = installedModels.includes(modelName);
                                            const isDownloading = downloadingModels.has(modelName);
                                            const progress = downloadProgress[modelName] || 0;

                                            return (
                                                <Box
                                                    key={modelName}
                                                    sx={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        p: 2,
                                                        border: `1px solid ${theme.palette.divider}`,
                                                        borderRadius: 1,
                                                        backgroundColor: isInstalled
                                                            ? alpha(theme.palette.success.main, 0.05)
                                                            : 'transparent'
                                                    }}
                                                >
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                        {isInstalled ? (
                                                            <LocalIcon color="success" />
                                                        ) : (
                                                            <DownloadIcon color="action" />
                                                        )}
                                                        <Box>
                                                            <Typography variant="body1" fontWeight={500}>
                                                                {modelName}
                                                            </Typography>
                                                            {isDownloading && (
                                                                <Typography variant="caption" color="primary">
                                                                    Downloading... {Math.round(progress)}%
                                                                </Typography>
                                                            )}
                                                        </Box>
                                                    </Box>

                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        {isInstalled ? (
                                                            <Button
                                                                variant="outlined"
                                                                size="small"
                                                                color="error"
                                                                startIcon={<DeleteIcon />}
                                                                onClick={() => removeModel(modelName)}
                                                            >
                                                                Remove
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                variant="contained"
                                                                size="small"
                                                                startIcon={isDownloading ? null : <DownloadIcon />}
                                                                onClick={() => pullModel(modelName)}
                                                                disabled={isDownloading}
                                                            >
                                                                {isDownloading ? 'Downloading...' : 'Download'}
                                                            </Button>
                                                        )}
                                                    </Box>
                                                </Box>
                                            );
                                        })}
                                    </Box>
                                </CardContent>
                            </Card>

                            {/* Installed Models */}
                            {installedModels.length > 0 && (
                                <Card>
                                    <CardContent>
                                        <Typography variant="subtitle1" gutterBottom fontWeight={600}>
                                            Installed Models ({installedModels.length})
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                            Models currently available on your system.
                                        </Typography>

                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                            {installedModels.map((modelName) => (
                                                <Box
                                                    key={modelName}
                                                    sx={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        p: 2,
                                                        border: `1px solid ${alpha(theme.palette.success.main, 0.3)}`,
                                                        borderRadius: 1,
                                                        backgroundColor: alpha(theme.palette.success.main, 0.05)
                                                    }}
                                                >
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                        <LocalIcon color="success" />
                                                        <Typography variant="body1" fontWeight={500}>
                                                            {modelName}
                                                        </Typography>
                                                    </Box>

                                                    <Button
                                                        variant="outlined"
                                                        size="small"
                                                        color="error"
                                                        startIcon={<DeleteIcon />}
                                                        onClick={() => removeModel(modelName)}
                                                    >
                                                        Remove
                                                    </Button>
                                                </Box>
                                            ))}
                                        </Box>
                                    </CardContent>
                                </Card>
                            )}
                        </Box>
                    </TabPanel>

                    {/* Search Tab */}
                    <TabPanel value={tabValue} index={2}>
                        <Box sx={{ px: 3 }}>
                            <Typography variant="h6" gutterBottom fontWeight={600}>
                                Web Search & Browsers
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                Configure search providers and API keys for enhanced web search capabilities.
                            </Typography>

                            <Card sx={{ mb: 3 }}>
                                <CardContent>
                                    <Typography variant="subtitle1" gutterBottom fontWeight={600}>
                                        Search Provider
                                    </Typography>

                                    <FormControl fullWidth sx={{ mb: 2 }}>
                                        <InputLabel>Preferred Provider</InputLabel>
                                        <Select
                                            value={searchSettings.preferredProvider}
                                            onChange={(e) => handleSearchSettingChange('preferredProvider', e.target.value)}
                                        >
                                            <MenuItem value="auto">Auto (Try all available)</MenuItem>
                                            <MenuItem value="duckduckgo">DuckDuckGo (Free)</MenuItem>
                                            <MenuItem value="brave">Brave Search</MenuItem>
                                            <MenuItem value="tavily">Tavily AI</MenuItem>
                                            <MenuItem value="serp">SerpAPI</MenuItem>
                                        </Select>
                                    </FormControl>

                                    <Typography variant="subtitle2" gutterBottom fontWeight={600} sx={{ mt: 3 }}>
                                        API Keys
                                    </Typography>

                                    <TextField
                                        fullWidth
                                        label="Brave Search API Key"
                                        type="password"
                                        value={searchSettings.braveApiKey}
                                        onChange={(e) => handleSearchSettingChange('braveApiKey', e.target.value)}
                                        sx={{ mb: 2 }}
                                        helperText="Get your free API key at search.brave.com"
                                    />

                                    <TextField
                                        fullWidth
                                        label="Tavily AI API Key"
                                        type="password"
                                        value={searchSettings.tavilyApiKey}
                                        onChange={(e) => handleSearchSettingChange('tavilyApiKey', e.target.value)}
                                        sx={{ mb: 2 }}
                                        helperText="Get your API key at tavily.com"
                                    />

                                    <TextField
                                        fullWidth
                                        label="SerpAPI Key"
                                        type="password"
                                        value={searchSettings.serpApiKey}
                                        onChange={(e) => handleSearchSettingChange('serpApiKey', e.target.value)}
                                        sx={{ mb: 2 }}
                                        helperText="Get your API key at serpapi.com"
                                    />

                                    <Typography variant="subtitle2" gutterBottom fontWeight={600} sx={{ mt: 3 }}>
                                        Rate Limiting
                                    </Typography>

                                    <Box sx={{ mb: 2 }}>
                                        <Typography gutterBottom>
                                            Requests per minute: {searchSettings.rateLimit.requestsPerMinute}
                                        </Typography>
                                        <Slider
                                            value={searchSettings.rateLimit.requestsPerMinute}
                                            onChange={(_, value) => {
                                                handleSearchSettingChange('rateLimit', {
                                                    ...searchSettings.rateLimit,
                                                    requestsPerMinute: value as number
                                                });
                                            }}
                                            min={1}
                                            max={60}
                                            step={1}
                                            marks
                                            valueLabelDisplay="auto"
                                        />
                                    </Box>
                                </CardContent>
                            </Card>
                        </Box>
                    </TabPanel>

                    {/* Voice Tab */}
                    <TabPanel value={tabValue} index={3}>
                        <Box sx={{ px: 3 }}>
                            <Typography variant="h6" gutterBottom fontWeight={600}>
                                Voice Settings
                            </Typography>

                            <Card sx={{ mb: 3 }}>
                                <CardContent>
                                    <TextField
                                        fullWidth
                                        label="Activation Phrase"
                                        value={voiceSettings.activationPhrase}
                                        onChange={(e) => {
                                            trackOriginalSettings();
                                            setVoiceSettings(prev => ({ ...prev, activationPhrase: e.target.value }));
                                            setHasUnsavedChanges(true);
                                        }}
                                        sx={{ mb: 2 }}
                                    />

                                    <FormControl fullWidth sx={{ mb: 2 }}>
                                        <InputLabel>Speech-to-Text Provider</InputLabel>
                                        <Select
                                            value={voiceSettings.sttProvider}
                                            onChange={(e) => {
                                                trackOriginalSettings();
                                                setVoiceSettings(prev => ({ ...prev, sttProvider: e.target.value }));
                                                setHasUnsavedChanges(true);
                                            }}
                                        >
                                            <MenuItem value="auto">Auto</MenuItem>
                                            <MenuItem value="whisper">Whisper</MenuItem>
                                            <MenuItem value="azure">Azure Speech</MenuItem>
                                        </Select>
                                    </FormControl>

                                    <Box sx={{ mb: 2 }}>
                                        <Typography gutterBottom>
                                            Wake Word Sensitivity: {voiceSettings.wakeWordSensitivity}
                                        </Typography>
                                        <Slider
                                            value={voiceSettings.wakeWordSensitivity}
                                            onChange={(_, value) => {
                                                trackOriginalSettings();
                                                setVoiceSettings(prev => ({ ...prev, wakeWordSensitivity: value as number }));
                                                setHasUnsavedChanges(true);
                                            }}
                                            min={0}
                                            max={1}
                                            step={0.1}
                                            marks
                                            valueLabelDisplay="auto"
                                        />
                                    </Box>

                                    <Box sx={{ mb: 2 }}>
                                        <Typography gutterBottom>
                                            Audio Threshold: {voiceSettings.audioThreshold}
                                        </Typography>
                                        <Slider
                                            value={voiceSettings.audioThreshold}
                                            onChange={(_, value) => {
                                                trackOriginalSettings();
                                                setVoiceSettings(prev => ({ ...prev, audioThreshold: value as number }));
                                                setHasUnsavedChanges(true);
                                            }}
                                            min={0}
                                            max={0.1}
                                            step={0.001}
                                            marks
                                            valueLabelDisplay="auto"
                                        />
                                    </Box>
                                </CardContent>
                            </Card>
                        </Box>
                    </TabPanel>

                    {/* Profile Tab */}
                    <TabPanel value={tabValue} index={4}>
                        <Box sx={{ px: 3 }}>
                            <Typography variant="h6" gutterBottom fontWeight={600}>
                                Profile Settings
                            </Typography>

                            <Card>
                                <CardContent>
                                    <Box sx={{ display: 'flex', gap: 2 }}>
                                        <TextField
                                            fullWidth
                                            label="First Name"
                                            value={profileSettings.name}
                                            onChange={(e) => {
                                                trackOriginalSettings();
                                                setProfileSettings(prev => ({ ...prev, name: e.target.value }));
                                                setHasUnsavedChanges(true);
                                            }}
                                        />
                                        <TextField
                                            fullWidth
                                            label="Last Name"
                                            value={profileSettings.surname}
                                            onChange={(e) => {
                                                trackOriginalSettings();
                                                setProfileSettings(prev => ({ ...prev, surname: e.target.value }));
                                                setHasUnsavedChanges(true);
                                            }}
                                        />
                                    </Box>
                                </CardContent>
                            </Card>
                        </Box>
                    </TabPanel>

                    {/* Theme Tab */}
                    <TabPanel value={tabValue} index={5}>
                        <Box sx={{ px: 3 }}>
                            <Typography variant="h6" gutterBottom fontWeight={600}>
                                Appearance
                            </Typography>

                            <Card>
                                <CardContent>
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <Typography>Theme</Typography>
                                        <ThemeToggle />
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
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <Button
                                fullWidth
                                variant="outlined"
                                startIcon={<CancelIcon />}
                                onClick={cancelChanges}
                            >
                                Cancel Changes
                            </Button>
                            <Button
                                fullWidth
                                variant="contained"
                                startIcon={<SaveIcon />}
                                onClick={saveSettings}
                            >
                                Save All Changes
                            </Button>
                        </Box>
                    </Box>
                )}
            </Box>
        </Slide>
    );
};

export default ModernSettingsPanel;