import React, { useState, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { updateSettings, toggleSettings } from '../../store/actions';
import LLMProviderCard from './LLMProviderCard';
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
    Save as SaveIcon,
    ExpandMore as ExpandMoreIcon,
    ExpandLess as ExpandLessIcon,
    Cancel as CancelIcon,
    Settings as SettingsIcon,
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
        // TTS Settings
        ttsProvider: settings?.voice?.ttsProvider || 'kokoro',
        enableStreaming: settings?.voice?.enableStreaming || false,
        sentenceBufferSize: settings?.voice?.sentenceBufferSize || 2,
        // ElevenLabs settings
        elevenlabsApiKey: settings?.voice?.elevenlabsApiKey || '',
        elevenlabsVoiceId: settings?.voice?.elevenlabsVoiceId || 'pNInz6obpgDQGcFmaJgB',
        elevenlabsStability: settings?.voice?.elevenlabsStability || 0.5,
        elevenlabsSimilarityBoost: settings?.voice?.elevenlabsSimilarityBoost || 0.5,
        // Kokoro settings
        kokoroVoice: settings?.voice?.kokoroVoice || 'af_sky',
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

    // Provider definitions with enhanced design
    const llmProviders = [
        {
            id: 'openai' as const,
            name: 'OpenAI',
            description: 'GPT-4 and GPT-3.5 models with excellent reasoning and coding capabilities',
            color: '#10A37F',
            isLocal: false,
            requiresApiKey: true,
            models: [],
        },
        {
            id: 'anthropic' as const,
            name: 'Anthropic',
            description: 'Claude 3 models known for safety, helpfulness, and long context windows',
            color: '#CC785C',
            isLocal: false,
            requiresApiKey: true,
            models: [],
        },
        {
            id: 'openrouter' as const,
            name: 'OpenRouter',
            description: 'Access 100+ models through a unified API with competitive pricing',
            color: '#8B5CF6',
            isLocal: false,
            requiresApiKey: true,
            models: [],
        },
        {
            id: 'groq' as const,
            name: 'Groq',
            description: 'Ultra-fast inference with LLaMA and Mixtral models on custom hardware',
            color: '#F97316',
            isLocal: false,
            requiresApiKey: true,
            models: [],
        },
        {
            id: 'google' as const,
            name: 'Google',
            description: 'Gemini models with multimodal capabilities and strong reasoning',
            color: '#4285F4',
            isLocal: false,
            requiresApiKey: true,
            models: [],
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
            models: [],
        },
        {
            id: 'huggingface' as const,
            name: 'Hugging Face',
            description: 'Open-source models via Hugging Face Inference API',
            color: '#FF9A00',
            isLocal: false,
            requiresApiKey: true,
            models: [],
        },
        {
            id: 'ollama' as const,
            name: 'Ollama',
            description: 'Run powerful models locally on your machine with complete privacy',
            color: '#000000',
            isLocal: true,
            requiresApiKey: false,
            models: [],
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
    const saveSettings = useCallback(async () => {
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
                openai: providerConfigs.openai,
                anthropic: providerConfigs.anthropic,
                openrouter: providerConfigs.openrouter,
                groq: providerConfigs.groq,
                google: providerConfigs.google,
                cohere: providerConfigs.cohere,
                azure: providerConfigs.azure,
                huggingface: providerConfigs.huggingface,
                ollama: providerConfigs.ollama,
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

        try {
            // First: Use direct LLM provider switching for immediate effect
            console.log(`🚀 Direct LLM provider switch: ${selectedProvider}`);
            const switchResult = await ipcRenderer.invoke('update-llm-provider', updatedSettings.llm);
            console.log('✅ Direct LLM provider switch result:', switchResult);

            // Second: Update TTS service with new voice settings
            console.log(`🎵 Direct TTS provider update: ${voiceSettings.ttsProvider}`);
            const ttsOptions = {
                provider: voiceSettings.ttsProvider,
                enableStreaming: voiceSettings.enableStreaming,
                sentenceBufferSize: voiceSettings.sentenceBufferSize,
                // ElevenLabs options
                apiKey: voiceSettings.elevenlabsApiKey,
                voiceId: voiceSettings.elevenlabsVoiceId,
                stability: voiceSettings.elevenlabsStability,
                similarityBoost: voiceSettings.elevenlabsSimilarityBoost,
                // Kokoro options
                kokoroVoice: voiceSettings.kokoroVoice,
            };
            const ttsResult = await ipcRenderer.invoke('tts-update-options', ttsOptions);
            console.log('✅ Direct TTS provider update result:', ttsResult);

            // Third: Update Redux store and persist all settings in background
            dispatch(updateSettings(updatedSettings));
            updateOriginalSettingsBaseline();

            console.log('🎯 Settings save completed successfully');
        } catch (error) {
            console.error('❌ Failed to save settings:', error);
            // Fallback to old method if direct switch fails
            dispatch(updateSettings(updatedSettings));
            updateOriginalSettingsBaseline();
            ipcRenderer.invoke('initialize-llm');
        }
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
    const handleProviderSelect = async (providerId: string) => {
        trackOriginalSettings();
        setSelectedProvider(providerId);
        setHasUnsavedChanges(true);

        // Immediately switch provider for instant feedback
        try {
            console.log(`⚡ Immediate provider switch: ${providerId}`);
            // Only send the provider change - backend will preserve existing configurations
            const providerChangeConfig = {
                provider: providerId,
                // Only include the current provider's config to avoid overwriting others
                ...(providerConfigs[providerId as keyof typeof providerConfigs] && {
                    [providerId]: providerConfigs[providerId as keyof typeof providerConfigs]
                })
            };
            await ipcRenderer.invoke('update-llm-provider', providerChangeConfig);
            console.log('✅ Immediate provider switch completed');
        } catch (error) {
            console.error('❌ Immediate provider switch failed:', error);
            // Continue with UI update even if immediate switch fails
        }
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
    const handleSearchSettingChange = (key: string, valueOrEvent: any) => {
        // Handle both event objects and direct values
        let value: any;
        if (valueOrEvent && typeof valueOrEvent === 'object' && 'target' in valueOrEvent) {
            // It's an event object
            console.log(`🔧 Handling search setting change for ${key}:`, valueOrEvent);
            if (valueOrEvent.preventDefault) {
                valueOrEvent.preventDefault();
            }
            value = valueOrEvent.target.value;
        } else {
            // It's a direct value
            value = valueOrEvent;
        }

        trackOriginalSettings();
        const newSettings = { ...searchSettings, [key]: value };

        // If removing an API key, check if the current provider depends on it
        if ((key === 'braveApiKey' && (!value || value === '') && searchSettings.preferredProvider === 'brave') ||
            (key === 'tavilyApiKey' && (!value || value === '') && searchSettings.preferredProvider === 'tavily') ||
            (key === 'serpApiKey' && (!value || value === '') && searchSettings.preferredProvider === 'serp')) {
            // Reset to auto when the selected provider's API key is removed
            newSettings.preferredProvider = 'auto';
        }

        setSearchSettings(newSettings);
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


    // Handle explicit close (close button only)
    const handleClose = () => {
        console.log('🔒 Close button clicked - hiding settings panel');
        dispatch(toggleSettings());
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
        dispatch(toggleSettings());
    }, [dispatch]);

    // Handle escape key
    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            console.log('🔒 Escape key pressed - hiding settings panel');
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
                // TTS Settings
                ttsProvider: settings?.voice?.ttsProvider || 'auto',
                enableStreaming: settings?.voice?.enableStreaming || false,
                sentenceBufferSize: settings?.voice?.sentenceBufferSize || 2,
                // ElevenLabs settings
                elevenlabsApiKey: settings?.voice?.elevenlabsApiKey || '',
                elevenlabsVoiceId: settings?.voice?.elevenlabsVoiceId || 'pNInz6obpgDQGcFmaJgB',
                elevenlabsStability: settings?.voice?.elevenlabsStability || 0.5,
                elevenlabsSimilarityBoost: settings?.voice?.elevenlabsSimilarityBoost || 0.5,
                // Kokoro settings
                kokoroVoice: settings?.voice?.kokoroVoice || 'default',
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
                        <Tab icon={<SettingsIcon />} label="Integrations" />
                        <Tab icon={<MicIcon />} label="Voice" />
                        <Tab icon={<PersonIcon />} label="Profile" />
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
                                            gap: 1,
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
                                            </Box>
                                        </Box>
                                        <Button
                                            variant={selectedProvider === provider.id ? "contained" : "outlined"}
                                            size="small"
                                            style={{ backgroundColor: selectedProvider === provider.id ? provider.color : 'transparent', color: selectedProvider === provider.id ? '#fff' : provider.color }}
                                            sx={{ ml: 'auto' }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleProviderSelect(provider.id);
                                            }}
                                        >
                                            {selectedProvider === provider.id ? 'Selected' : 'Select'}
                                        </Button>
                                        <Button
                                            variant={selectedProvider === provider.id ? "contained" : "outlined"}
                                            size="small"
                                            endIcon={expandedProviders.has(provider.id) ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleProviderExpansion(provider.id);
                                            }}
                                        >
                                            {expandedProviders.has(provider.id) ? 'Collapse' : 'Expand'}
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


                    {/* Integrations Tab */}
                    <TabPanel value={tabValue} index={1}>
                        <Box sx={{ px: 3 }}>
                            <Typography variant="h6" gutterBottom fontWeight={600}>
                                Web Search & Browsers
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                Configure search providers and API keys for enhanced web search capabilities. Only configured providers will appear in the dropdown.
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
                                            onChange={(e) => handleSearchSettingChange('preferredProvider', e)}
                                        >
                                            <MenuItem value="auto">Auto (Try all available)</MenuItem>
                                            <MenuItem value="duckduckgo">DuckDuckGo (Free)</MenuItem>
                                            {/* Only show API-based providers if they have keys configured */}
                                            {searchSettings.braveApiKey && searchSettings.braveApiKey !== '' && (
                                                <MenuItem value="brave">Brave Search</MenuItem>
                                            )}
                                            {searchSettings.tavilyApiKey && searchSettings.tavilyApiKey !== '' && (
                                                <MenuItem value="tavily">Tavily AI</MenuItem>
                                            )}
                                            {searchSettings.serpApiKey && searchSettings.serpApiKey !== '' && (
                                                <MenuItem value="serp">SerpAPI</MenuItem>
                                            )}
                                        </Select>
                                    </FormControl>

                                    <Typography variant="subtitle2" gutterBottom fontWeight={600} sx={{ mt: 3 }}>
                                        API Keys
                                    </Typography>

                                    <TextField
                                        fullWidth
                                        label={`Brave Search API Key ${searchSettings.braveApiKey && searchSettings.braveApiKey !== '' ? '✓' : '✗'}`}
                                        type="password"
                                        value={searchSettings.braveApiKey}
                                        onChange={(e) => handleSearchSettingChange('braveApiKey', e)}
                                        sx={{ mb: 2 }}
                                        helperText="Get your free API key at search.brave.com"
                                        color={searchSettings.braveApiKey && searchSettings.braveApiKey !== '' ? 'success' : 'primary'}
                                    />

                                    <TextField
                                        fullWidth
                                        label={`Tavily AI API Key ${searchSettings.tavilyApiKey && searchSettings.tavilyApiKey !== '' ? '✓' : '✗'}`}
                                        type="password"
                                        value={searchSettings.tavilyApiKey}
                                        onChange={(e) => handleSearchSettingChange('tavilyApiKey', e)}
                                        sx={{ mb: 2 }}
                                        helperText="Get your API key at tavily.com"
                                        color={searchSettings.tavilyApiKey && searchSettings.tavilyApiKey !== '' ? 'success' : 'primary'}
                                    />

                                    <TextField
                                        fullWidth
                                        label={`SerpAPI Key ${searchSettings.serpApiKey && searchSettings.serpApiKey !== '' ? '✓' : '✗'}`}
                                        type="password"
                                        value={searchSettings.serpApiKey}
                                        onChange={(e) => handleSearchSettingChange('serpApiKey', e)}
                                        sx={{ mb: 2 }}
                                        helperText="Get your API key at serpapi.com"
                                        color={searchSettings.serpApiKey && searchSettings.serpApiKey !== '' ? 'success' : 'primary'}
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
                    <TabPanel value={tabValue} index={2}>
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

                            {/* Text-to-Speech Settings */}
                            <Card sx={{ mb: 3 }}>
                                <CardContent>
                                    <Typography variant="subtitle1" gutterBottom fontWeight={600}>
                                        Text-to-Speech
                                    </Typography>

                                    <FormControl fullWidth sx={{ mb: 2 }}>
                                        <InputLabel>TTS Provider</InputLabel>
                                        <Select
                                            value={'kokoro'}
                                            disabled={true}
                                            onChange={(e) => {
                                                trackOriginalSettings();
                                                setVoiceSettings(prev => ({ ...prev, ttsProvider: e.target.value }));
                                                setHasUnsavedChanges(true);
                                            }}
                                        >
                                            <MenuItem value="kokoro">🚀 Kokoro-82M (Local AI)</MenuItem>
                                        </Select>
                                    </FormControl>

                                    {/* Streaming Settings - show for compatible providers */}
                                    {['kokoro'].includes(voiceSettings.ttsProvider) && (
                                        <Card sx={{ mb: 2, backgroundColor: alpha(theme.palette.primary.main, 0.05) }}>
                                            <CardContent>
                                                <Typography variant="subtitle2" gutterBottom fontWeight={600}>
                                                    🎯 Streaming Settings (Faster TTS)
                                                </Typography>

                                                <FormControl component="fieldset" sx={{ mb: 2 }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                                        <Typography>Enable Streaming:</Typography>
                                                        <Select
                                                            size="small"
                                                            value={voiceSettings.enableStreaming ? 'enabled' : 'disabled'}
                                                            onChange={(e) => {
                                                                trackOriginalSettings();
                                                                setVoiceSettings(prev => ({
                                                                    ...prev,
                                                                    enableStreaming: e.target.value === 'enabled'
                                                                }));
                                                                setHasUnsavedChanges(true);
                                                            }}
                                                            sx={{ minWidth: 120 }}
                                                        >
                                                            <MenuItem value="enabled">✅ Enabled</MenuItem>
                                                            <MenuItem value="disabled">❌ Disabled</MenuItem>
                                                        </Select>
                                                    </Box>
                                                </FormControl>

                                                {voiceSettings.enableStreaming && (
                                                    <Box sx={{ mb: 2 }}>
                                                        <Typography gutterBottom>
                                                            Sentence Buffer Size: {voiceSettings.sentenceBufferSize} sentences
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                                                            Number of sentences to generate ahead for smooth playback
                                                        </Typography>
                                                        <Slider
                                                            value={voiceSettings.sentenceBufferSize}
                                                            onChange={(_, value) => {
                                                                trackOriginalSettings();
                                                                setVoiceSettings(prev => ({ ...prev, sentenceBufferSize: value as number }));
                                                                setHasUnsavedChanges(true);
                                                            }}
                                                            min={1}
                                                            max={5}
                                                            step={1}
                                                            marks={[
                                                                { value: 1, label: '1' },
                                                                { value: 2, label: '2' },
                                                                { value: 3, label: '3' },
                                                                { value: 4, label: '4' },
                                                                { value: 5, label: '5' }
                                                            ]}
                                                            valueLabelDisplay="auto"
                                                        />
                                                    </Box>
                                                )}

                                                <Alert severity="info" sx={{ fontSize: '0.875rem' }}>
                                                    <strong>💡 Streaming Benefits:</strong><br />
                                                    • Start hearing audio immediately after first sentence<br />
                                                    • Reduces perceived latency by up to 70%<br />
                                                    • Parallel processing for better performance
                                                </Alert>
                                            </CardContent>
                                        </Card>
                                    )}

                                    {/* ElevenLabs specific settings */}
                                    {voiceSettings.ttsProvider === 'elevenlabs' && (
                                        <>
                                            <TextField
                                                fullWidth
                                                label={`ElevenLabs API Key ${voiceSettings.elevenlabsApiKey && voiceSettings.elevenlabsApiKey !== '' ? '✓' : '✗'}`}
                                                type="password"
                                                value={voiceSettings.elevenlabsApiKey || ''}
                                                onChange={(e) => {
                                                    trackOriginalSettings();
                                                    setVoiceSettings(prev => ({ ...prev, elevenlabsApiKey: e.target.value }));
                                                    setHasUnsavedChanges(true);
                                                }}
                                                sx={{ mb: 2 }}
                                                helperText="Get your API key at elevenlabs.io"
                                                color={voiceSettings.elevenlabsApiKey && voiceSettings.elevenlabsApiKey !== '' ? 'success' : 'primary'}
                                            />

                                            <FormControl fullWidth sx={{ mb: 2 }}>
                                                <InputLabel>Voice</InputLabel>
                                                <Select
                                                    value={voiceSettings.elevenlabsVoiceId || 'pNInz6obpgDQGcFmaJgB'}
                                                    onChange={(e) => {
                                                        trackOriginalSettings();
                                                        setVoiceSettings(prev => ({ ...prev, elevenlabsVoiceId: e.target.value }));
                                                        setHasUnsavedChanges(true);
                                                    }}
                                                >
                                                    <MenuItem value="pNInz6obpgDQGcFmaJgB">Adam</MenuItem>
                                                    <MenuItem value="EXAVITQu4vr4xnSDxMaL">Bella</MenuItem>
                                                    <MenuItem value="VR6AewLTigWG4xSOukaG">Arnold</MenuItem>
                                                    <MenuItem value="MF3mGyEYCl7XYWbV9V6O">Elli</MenuItem>
                                                    <MenuItem value="TxGEqnHWrfWFTfGW9XjX">Josh</MenuItem>
                                                    <MenuItem value="rNiSJNq4A8BZP6YJZgCp">Nicole</MenuItem>
                                                    <MenuItem value="onwK4e9ZLuTAKqWW03F9">Daniel</MenuItem>
                                                </Select>
                                            </FormControl>

                                            <Box sx={{ mb: 2 }}>
                                                <Typography gutterBottom>
                                                    Voice Stability: {voiceSettings.elevenlabsStability || 0.5}
                                                </Typography>
                                                <Slider
                                                    value={voiceSettings.elevenlabsStability || 0.5}
                                                    onChange={(_, value) => {
                                                        trackOriginalSettings();
                                                        setVoiceSettings(prev => ({ ...prev, elevenlabsStability: value as number }));
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
                                                    Similarity Boost: {voiceSettings.elevenlabsSimilarityBoost || 0.5}
                                                </Typography>
                                                <Slider
                                                    value={voiceSettings.elevenlabsSimilarityBoost || 0.5}
                                                    onChange={(_, value) => {
                                                        trackOriginalSettings();
                                                        setVoiceSettings(prev => ({ ...prev, elevenlabsSimilarityBoost: value as number }));
                                                        setHasUnsavedChanges(true);
                                                    }}
                                                    min={0}
                                                    max={1}
                                                    step={0.1}
                                                    marks
                                                    valueLabelDisplay="auto"
                                                />
                                            </Box>
                                        </>
                                    )}

                                    {/* Kokoro specific settings */}
                                    {voiceSettings.ttsProvider === 'kokoro' && (
                                        <Card sx={{ mb: 2, backgroundColor: alpha(theme.palette.success.main, 0.05) }}>
                                            <CardContent>
                                                <Typography variant="subtitle2" gutterBottom fontWeight={600}>
                                                    🚀 Kokoro-82M Settings
                                                </Typography>

                                                <FormControl fullWidth sx={{ mb: 2 }}>
                                                    <InputLabel>Voice</InputLabel>
                                                    <Select
                                                        value={voiceSettings.kokoroVoice || 'af_sky'}
                                                        onChange={(e) => {
                                                            trackOriginalSettings();
                                                            setVoiceSettings(prev => ({ ...prev, kokoroVoice: e.target.value }));
                                                            setHasUnsavedChanges(true);
                                                        }}
                                                    >
                                                        {/* American English - Female */}
                                                        <MenuItem value="af_bella">🇺🇸 Bella (Female, A- grade)</MenuItem>
                                                        <MenuItem value="af_nicole">🇺🇸 Nicole (Female, B- grade)</MenuItem>
                                                        <MenuItem value="af_sky">🇺🇸 Sky (Female, default)</MenuItem>
                                                        <MenuItem value="af_sarah">🇺🇸 Sarah (Female)</MenuItem>
                                                        {/* American English - Male */}
                                                        <MenuItem value="am_michael">🇺🇸 Michael (Male)</MenuItem>
                                                        <MenuItem value="am_adam">🇺🇸 Adam (Male)</MenuItem>
                                                        {/* British English - Female */}
                                                        <MenuItem value="bf_emma">🇬🇧 Emma (Female, B- grade)</MenuItem>
                                                        <MenuItem value="bf_isabella">🇬🇧 Isabella (Female)</MenuItem>
                                                        {/* British English - Male */}
                                                        <MenuItem value="bm_george">🇬🇧 George (Male)</MenuItem>
                                                        <MenuItem value="bm_lewis">🇬🇧 Lewis (Male)</MenuItem>
                                                    </Select>
                                                </FormControl>

                                                <Alert severity="success" sx={{ fontSize: '0.875rem' }}>
                                                    <strong>🎯 Kokoro-82M Benefits:</strong><br />
                                                    • 40x smaller than Orpheus (82M vs 3B parameters)<br />
                                                    • Much faster inference and lower memory usage<br />
                                                    • High-quality speech synthesis from HexGrad<br />
                                                    • Perfect for real-time applications
                                                </Alert>
                                            </CardContent>
                                        </Card>
                                    )}
                                </CardContent>
                            </Card>
                        </Box>
                    </TabPanel>

                    {/* Profile Tab */}
                    <TabPanel value={tabValue} index={3}>
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