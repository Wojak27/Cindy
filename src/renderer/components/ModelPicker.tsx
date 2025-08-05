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
                const availableModels = await ipcRenderer.invoke('llm:get-available-models');
                setModels(availableModels[provider]);
            } catch (err) {
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

    return (
        <Autocomplete
            options={models}
            freeSolo
            value={selectedModel}
            inputValue={inputValue}
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
                <li {...props} key={option}>
                    {option}
                </li>
            )}
            sx={{ width: '100%' }}
        />
    );
};

export default ModelPicker;