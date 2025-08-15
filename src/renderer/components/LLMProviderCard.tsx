import React, { useState, useEffect, useCallback } from 'react';
import {
    Card,
    CardContent,
    CardActions,
    Typography,
    TextField,
    Button,
    Box,
    Chip,
    Collapse,
    Alert,
    CircularProgress,
    Slider,
    Divider,
    useTheme,
    Autocomplete,
} from '@mui/material';
import {
    CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';

interface LLMProviderCardProps {
    provider: {
        id: 'openai' | 'anthropic' | 'openrouter' | 'groq' | 'google' | 'cohere' | 'azure' | 'huggingface' | 'ollama';
        name: string;
        description: string;
        color: string;
        isLocal: boolean;
        requiresApiKey: boolean;
        models: string[];
    };
    isSelected: boolean;
    isConnected: boolean;
    isTesting: boolean;
    config: any;
    onSelect: () => void;
    onConfigChange: (config: any) => void;
    onTestConnection: () => void;
}

const LLMProviderCard: React.FC<LLMProviderCardProps> = ({
    provider,
    isSelected,
    isConnected,
    isTesting,
    config,
    onSelect,
    onConfigChange,
    onTestConnection,
}) => {
    const theme = useTheme();
    const [showApiKey, setShowApiKey] = useState(false);
    const [availableModels, setAvailableModels] = useState<string[]>(provider.models);
    const [loadingModels, setLoadingModels] = useState(false);
    const [modelInputValue, setModelInputValue] = useState(config?.model || provider.models[0] || '');

    // Update model input when config changes or when provider becomes selected
    useEffect(() => {
        const expectedModel = config?.model || provider.models[0] || '';
        if (expectedModel !== modelInputValue) {
            console.log(`🔄 Updating model for ${provider.name}: ${modelInputValue} → ${expectedModel}`);
            setModelInputValue(expectedModel);
        }
    }, [config?.model, provider.models, provider.name, modelInputValue, isSelected]);


    // Ensure model is set when provider becomes selected
    React.useEffect(() => {
        if (isSelected && (!config?.model || config.model === '')) {
            const defaultModel = provider.models[0] || '';
            if (defaultModel) {
                console.log(`🎯 Setting default model for selected provider ${provider.name}: ${defaultModel}`);
                onConfigChange({ ...config, model: defaultModel });
            }
        }
    }, [isSelected, config, provider.models, provider.name, onConfigChange]);

    // Fetch models from provider API
    const fetchModels = useCallback(async () => {
        if (!config?.apiKey && provider.requiresApiKey) {
            return;
        }

        setLoadingModels(true);
        try {
            const { ipcRenderer } = window.require('electron');
            const models = await ipcRenderer.invoke('fetch-provider-models', {
                provider: provider.id,
                config: config
            });

            if (models && models.length > 0) {
                setAvailableModels([...new Set([...provider.models, ...models])]);
            }
        } catch (error) {
            console.error(`Failed to fetch models for ${provider.name}:`, error);
            // Keep using default models on error
        } finally {
            setLoadingModels(false);
        }
    }, [provider.id, provider.name, provider.models, provider.requiresApiKey, config]);




    const renderConfigFields = () => {
        const updateConfig = (field: string, value: any) => {
            console.log(`🔧 ${provider.name} config update: ${field} = ${value}`);
            onConfigChange({ ...config, [field]: value });
        };

        const modelField = (
            <Box sx={{ mb: 2 }}>
                <Autocomplete
                    freeSolo
                    options={availableModels}
                    value={modelInputValue}
                    inputValue={modelInputValue}
                    onInputChange={(_, newInputValue) => {
                        setModelInputValue(newInputValue);
                        updateConfig('model', newInputValue);
                    }}
                    onChange={(_, newValue) => {
                        const selectedModel = newValue || '';
                        setModelInputValue(selectedModel);
                        updateConfig('model', selectedModel);
                    }}
                    onFocus={fetchModels}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            fullWidth
                            label="Model"
                            placeholder="Enter model name or select from dropdown"
                            InputProps={{
                                ...params.InputProps,
                                endAdornment: (
                                    <>
                                        {loadingModels ? (
                                            <CircularProgress size={20} />
                                        ) : (
                                            <></>
                                        )}
                                        {params.InputProps.endAdornment}
                                    </>
                                ),
                            }}
                        />
                    )}
                />
            </Box>
        );

        const temperatureField = (
            <Box sx={{ mb: 2 }}>
                <Typography gutterBottom>Temperature: {config?.temperature || 0.7}</Typography>
                <Slider
                    value={config?.temperature || 0.7}
                    onChange={(_, value) => updateConfig('temperature', value)}
                    min={0}
                    max={2}
                    step={0.1}
                    marks
                    valueLabelDisplay="auto"
                />
            </Box>
        );

        const apiKeyField = (label: string) => (
            <TextField
                fullWidth
                label={label}
                type={showApiKey ? 'text' : 'password'}
                value={config?.apiKey || ''}
                onChange={(e) => updateConfig('apiKey', e.target.value)}
                sx={{ mb: 2 }}
                InputProps={{
                    endAdornment: (
                        <Button onClick={() => setShowApiKey(!showApiKey)}>
                            {showApiKey ? 'Hide' : 'Show'}
                        </Button>
                    )
                }}
            />
        );

        switch (provider.id) {
            case 'openai':
                return (
                    <>
                        {apiKeyField('OpenAI API Key')}
                        <TextField
                            fullWidth
                            label="Organization ID (Optional)"
                            value={config?.organizationId || ''}
                            onChange={(e) => updateConfig('organizationId', e.target.value)}
                            sx={{ mb: 2 }}
                        />
                        {modelField}
                        {temperatureField}
                        <Box sx={{ mb: 2 }}>
                            <Typography gutterBottom>Max Tokens: {config?.maxTokens || 4096}</Typography>
                            <Slider
                                value={config?.maxTokens || 4096}
                                onChange={(_, value) => updateConfig('maxTokens', value)}
                                min={100}
                                max={16000}
                                step={100}
                                marks
                                valueLabelDisplay="auto"
                            />
                        </Box>
                    </>
                );

            case 'anthropic':
                return (
                    <>
                        {apiKeyField('Anthropic API Key')}
                        {modelField}
                        {temperatureField}
                        <Box sx={{ mb: 2 }}>
                            <Typography gutterBottom>Max Tokens: {config?.maxTokens || 4000}</Typography>
                            <Slider
                                value={config?.maxTokens || 4000}
                                onChange={(_, value) => updateConfig('maxTokens', value)}
                                min={100}
                                max={8000}
                                step={100}
                                marks
                                valueLabelDisplay="auto"
                            />
                        </Box>
                    </>
                );

            case 'openrouter':
                return (
                    <>
                        {apiKeyField('OpenRouter API Key')}
                        <TextField
                            fullWidth
                            label="Site URL (Optional)"
                            value={config?.siteUrl || 'https://localhost:3000'}
                            onChange={(e) => updateConfig('siteUrl', e.target.value)}
                            sx={{ mb: 2 }}
                        />
                        <TextField
                            fullWidth
                            label="App Name (Optional)"
                            value={config?.appName || 'Cindy Voice Assistant'}
                            onChange={(e) => updateConfig('appName', e.target.value)}
                            sx={{ mb: 2 }}
                        />
                        {modelField}
                        {temperatureField}
                        <Box sx={{ mb: 2 }}>
                            <Typography gutterBottom>Max Tokens: {config?.maxTokens || 4096}</Typography>
                            <Slider
                                value={config?.maxTokens || 4096}
                                onChange={(_, value) => updateConfig('maxTokens', value)}
                                min={100}
                                max={16000}
                                step={100}
                                marks
                                valueLabelDisplay="auto"
                            />
                        </Box>
                    </>
                );

            case 'groq':
                return (
                    <>
                        {apiKeyField('Groq API Key')}
                        {modelField}
                        {temperatureField}
                        <Box sx={{ mb: 2 }}>
                            <Typography gutterBottom>Max Tokens: {config?.maxTokens || 4096}</Typography>
                            <Slider
                                value={config?.maxTokens || 4096}
                                onChange={(_, value) => updateConfig('maxTokens', value)}
                                min={100}
                                max={8000}
                                step={100}
                                marks
                                valueLabelDisplay="auto"
                            />
                        </Box>
                    </>
                );

            case 'google':
                return (
                    <>
                        {apiKeyField('Google API Key')}
                        {modelField}
                        {temperatureField}
                        <Box sx={{ mb: 2 }}>
                            <Typography gutterBottom>Max Output Tokens: {config?.maxOutputTokens || 2048}</Typography>
                            <Slider
                                value={config?.maxOutputTokens || 2048}
                                onChange={(_, value) => updateConfig('maxOutputTokens', value)}
                                min={100}
                                max={8000}
                                step={100}
                                marks
                                valueLabelDisplay="auto"
                            />
                        </Box>
                    </>
                );

            case 'cohere':
                return (
                    <>
                        {apiKeyField('Cohere API Key')}
                        {modelField}
                        {temperatureField}
                    </>
                );

            case 'azure':
                return (
                    <>
                        {apiKeyField('Azure API Key')}
                        <TextField
                            fullWidth
                            label="Instance Name"
                            value={config?.instanceName || ''}
                            onChange={(e) => updateConfig('instanceName', e.target.value)}
                            sx={{ mb: 2 }}
                            placeholder="your-resource-name"
                        />
                        <TextField
                            fullWidth
                            label="Deployment Name"
                            value={config?.deploymentName || ''}
                            onChange={(e) => updateConfig('deploymentName', e.target.value)}
                            sx={{ mb: 2 }}
                            placeholder="gpt-4"
                        />
                        <TextField
                            fullWidth
                            label="API Version"
                            value={config?.apiVersion || '2024-02-01'}
                            onChange={(e) => updateConfig('apiVersion', e.target.value)}
                            sx={{ mb: 2 }}
                        />
                        {modelField}
                        {temperatureField}
                        <Box sx={{ mb: 2 }}>
                            <Typography gutterBottom>Max Tokens: {config?.maxTokens || 4096}</Typography>
                            <Slider
                                value={config?.maxTokens || 4096}
                                onChange={(_, value) => updateConfig('maxTokens', value)}
                                min={100}
                                max={16000}
                                step={100}
                                marks
                                valueLabelDisplay="auto"
                            />
                        </Box>
                    </>
                );

            case 'huggingface':
                return (
                    <>
                        {apiKeyField('HuggingFace API Key')}
                        <TextField
                            fullWidth
                            label="Custom Endpoint (Optional)"
                            value={config?.endpoint || ''}
                            onChange={(e) => updateConfig('endpoint', e.target.value)}
                            sx={{ mb: 2 }}
                            placeholder="https://your-endpoint.com"
                        />
                        {modelField}
                        {temperatureField}
                        <Box sx={{ mb: 2 }}>
                            <Typography gutterBottom>Max Tokens: {config?.maxTokens || 2048}</Typography>
                            <Slider
                                value={config?.maxTokens || 2048}
                                onChange={(_, value) => updateConfig('maxTokens', value)}
                                min={100}
                                max={8000}
                                step={100}
                                marks
                                valueLabelDisplay="auto"
                            />
                        </Box>
                    </>
                );

            case 'ollama':
                return (
                    <>
                        <TextField
                            fullWidth
                            label="Base URL"
                            value={config?.baseUrl || 'http://127.0.0.1:11434'}
                            onChange={(e) => updateConfig('baseUrl', e.target.value)}
                            sx={{ mb: 2 }}
                        />
                        {modelField}
                        {temperatureField}
                        <Alert severity="info" sx={{ mb: 2 }}>
                            Make sure Ollama is running locally and the model is pulled.
                        </Alert>
                    </>
                );

            default:
                return (
                    <>
                        {provider.requiresApiKey && apiKeyField(`${provider.name} API Key`)}
                        {modelField}
                        {temperatureField}
                    </>
                );
        }
    };

    return (
        <Card
            sx={{
                mb: 2,
                border: isSelected ? `2px solid ${provider.color}` : `1px solid ${theme.palette.divider}`,
                boxShadow: isSelected ? `0 0 0 1px ${provider.color}25` : theme.shadows[1],
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                    boxShadow: theme.shadows[4],
                    transform: 'translateY(-1px)',
                },
            }}
        >
            <CardContent sx={{ pb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                            <Chip
                                label={provider.isLocal ? 'Local' : 'Cloud'}
                                size="small"
                                color={provider.isLocal ? 'success' : 'primary'}
                                variant="outlined"
                                sx={{ mr: 1 }}
                            />
                            {isConnected && (
                                <Chip
                                    icon={<CheckCircleIcon />}
                                    label="Connected"
                                    size="small"
                                    color="success"
                                    variant="filled"
                                />
                            )}
                        </Box>
                    </Box>
                </Box>
            </CardContent>

            <Collapse in={true} timeout="auto" unmountOnExit>
                <Divider />
                <CardContent>
                    {renderConfigFields()}
                </CardContent>
                <CardActions sx={{ px: 2, pb: 2 }}>
                    <Button
                        variant={isSelected ? "contained" : "outlined"}
                        onClick={onSelect}
                        sx={{ mr: 1 }}
                    >
                        {isSelected ? 'Selected' : 'Select'}
                    </Button>
                    <Button
                        variant="outlined"
                        onClick={onTestConnection}
                        disabled={isTesting || (provider.requiresApiKey && !config?.apiKey)}
                        startIcon={isTesting ? <CircularProgress size={16} /> : null}
                    >
                        Test Connection
                    </Button>
                </CardActions>
            </Collapse>
        </Card>
    );
};

export default LLMProviderCard;