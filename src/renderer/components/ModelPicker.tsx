import React, { useState, useEffect } from 'react';
import { ipcRenderer } from 'electron';
import {
    TextField,
    Autocomplete,
    CircularProgress,
} from '@mui/material';

interface ModelPickerProps {
    provider: 'openai' | 'ollama';
    selectedModel: string;
    onModelChange: (model: string) => void;
    disabled?: boolean;
}

const ModelPicker: React.FC<ModelPickerProps> = ({
    provider,
    selectedModel,
    onModelChange,
    disabled = false
}) => {
    const [models, setModels] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [inputValue, setInputValue] = useState(selectedModel);

    useEffect(() => {
        const loadModels = async () => {
            setLoading(true);
            try {
                const response = await ipcRenderer.invoke('llm:get-available-models');
                // Handle the response structure properly - it returns { success: boolean, models?: { openai: string[], ollama: string[] } }
                if (response?.success && response.models) {
                    const providerModels = response.models[provider] || [];
                    setModels(providerModels);
                } else {
                    // Fallback to default models if response is invalid
                    setModels(provider === 'openai'
                        ? ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo']
                        : ['qwen3:8b', 'mistral', 'codellama']);
                }
            } catch (err) {
                console.error('Failed to load models:', err);
                // Fallback to default models on error
                setModels(provider === 'openai'
                    ? ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo']
                    : ['qwen3:8b', 'mistral', 'codellama']);
            } finally {
                setLoading(false);
            }
        };

        loadModels();
    }, [provider]);

    // Update input value when selectedModel changes
    useEffect(() => {
        setInputValue(selectedModel);
    }, [selectedModel]);

    // Ensure models is always an array
    const safeModels = Array.isArray(models) ? models : [];

    return (
        <Autocomplete
            options={safeModels}
            freeSolo
            value={selectedModel || ''}
            inputValue={inputValue || ''}
            onInputChange={(event, newInputValue) => {
                setInputValue(newInputValue);
            }}
            onChange={(event, newValue) => {
                if (newValue) {
                    onModelChange(newValue);
                }
            }}
            disabled={disabled || loading}
            loading={loading}
            renderInput={(params) => (
                <TextField
                    {...params}
                    label="Model"
                    variant="outlined"
                    size="small"
                    InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                            <>
                                {loading ? <CircularProgress color="inherit" size={20} /> : null}
                                {params.InputProps.endAdornment}
                            </>
                        ),
                    }}
                />
            )}
            renderOption={(props, option) => (
                <li {...props} key={option || 'empty'}>
                    {option || 'No models available'}
                </li>
            )}
            sx={{ width: '100%' }}
            // Add additional props to handle edge cases
            noOptionsText="No models available"
            clearOnBlur={false}
        />
    );
};

export default ModelPicker;