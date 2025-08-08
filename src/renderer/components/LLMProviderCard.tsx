import React, { useState } from 'react';
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
    IconButton,
    Alert,
    CircularProgress,
    MenuItem,
    Slider,
    Divider,
    useTheme,
} from '@mui/material';
import {
    ExpandMore as ExpandMoreIcon,
    CheckCircle as CheckCircleIcon,
    Cloud as CloudIcon,
    Computer as ComputerIcon,
    Psychology as PsychologyIcon,
    Google as GoogleIcon,
    Microsoft as MicrosoftIcon,
    Hub as HubIcon,
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
    const [expanded, setExpanded] = useState(isSelected);
    const [showApiKey, setShowApiKey] = useState(false);

    React.useEffect(() => {
        if (isSelected && !expanded) {
            setExpanded(true);
        }
    }, [isSelected, expanded]);

    const handleExpandClick = () => {
        setExpanded(!expanded);
        if (!expanded && !isSelected) {
            onSelect();
        }
    };

    const renderProviderIcon = () => {
        const iconProps = { 
            sx: { 
                fontSize: 40, 
                color: isSelected ? provider.color : theme.palette.text.secondary 
            } 
        };

        switch (provider.id) {
            case 'openai':
                return <PsychologyIcon {...iconProps} />;
            case 'anthropic':
                return <PsychologyIcon {...iconProps} sx={{ ...iconProps.sx, transform: 'rotate(15deg)' }} />;
            case 'openrouter':
                return <HubIcon {...iconProps} sx={{ ...iconProps.sx, color: '#8B5CF6' }} />;
            case 'groq':
                return <PsychologyIcon {...iconProps} sx={{ ...iconProps.sx, color: '#F97316', transform: 'rotate(-15deg)' }} />;
            case 'google':
                return <GoogleIcon {...iconProps} />;
            case 'cohere':
                return <HubIcon {...iconProps} />;
            case 'azure':
                return <MicrosoftIcon {...iconProps} />;
            case 'huggingface':
                return <HubIcon {...iconProps} sx={{ ...iconProps.sx, color: '#FF9A00' }} />;
            case 'ollama':
                return <ComputerIcon {...iconProps} />;
            default:
                return <CloudIcon {...iconProps} />;
        }
    };

    const renderConfigFields = () => {
        const updateConfig = (field: string, value: any) => {
            onConfigChange({ ...config, [field]: value });
        };

        const commonFields = (
            <>
                <TextField
                    fullWidth
                    label="Model"
                    select
                    value={config?.model || provider.models[0]}
                    onChange={(e) => updateConfig('model', e.target.value)}
                    sx={{ mb: 2 }}
                >
                    {provider.models.map((model) => (
                        <MenuItem key={model} value={model}>
                            {model}
                        </MenuItem>
                    ))}
                </TextField>

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
            </>
        );

        switch (provider.id) {
            case 'openai':
                return (
                    <>
                        <TextField
                            fullWidth
                            label="OpenAI API Key"
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
                        <TextField
                            fullWidth
                            label="Organization ID (Optional)"
                            value={config?.organizationId || ''}
                            onChange={(e) => updateConfig('organizationId', e.target.value)}
                            sx={{ mb: 2 }}
                        />
                        {commonFields}
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
                        <TextField
                            fullWidth
                            label="Anthropic API Key"
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
                        {commonFields}
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

            case 'google':
                return (
                    <>
                        <TextField
                            fullWidth
                            label="Google API Key"
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
                        {commonFields}
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
                        <TextField
                            fullWidth
                            label="Cohere API Key"
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
                        {commonFields}
                    </>
                );

            case 'azure':
                return (
                    <>
                        <TextField
                            fullWidth
                            label="Azure API Key"
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
                        {commonFields}
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
                        <TextField
                            fullWidth
                            label="HuggingFace API Key"
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
                        <TextField
                            fullWidth
                            label="Custom Endpoint (Optional)"
                            value={config?.endpoint || ''}
                            onChange={(e) => updateConfig('endpoint', e.target.value)}
                            sx={{ mb: 2 }}
                            placeholder="https://your-endpoint.com"
                        />
                        {commonFields}
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
                        {commonFields}
                        <Alert severity="info" sx={{ mb: 2 }}>
                            Make sure Ollama is running locally and the model is pulled.
                        </Alert>
                    </>
                );

            default:
                return commonFields;
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
                    <Box sx={{ mr: 2 }}>
                        {renderProviderIcon()}
                    </Box>
                    <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                            <Typography variant="h6" sx={{ fontWeight: 600, mr: 1 }}>
                                {provider.name}
                            </Typography>
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
                        <Typography variant="body2" color="text.secondary">
                            {provider.description}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {isTesting && <CircularProgress size={20} sx={{ mr: 1 }} />}
                        <IconButton
                            onClick={handleExpandClick}
                            sx={{
                                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: theme.transitions.create('transform', {
                                    duration: theme.transitions.duration.shortest,
                                }),
                            }}
                        >
                            <ExpandMoreIcon />
                        </IconButton>
                    </Box>
                </Box>
            </CardContent>

            <Collapse in={expanded} timeout="auto" unmountOnExit>
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