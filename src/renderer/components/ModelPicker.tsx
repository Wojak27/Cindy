import React, { useState, useEffect } from 'react';
import { ipcRenderer } from 'electron';

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
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadModels = async () => {
            setLoading(true);
            try {
                const availableModels = await ipcRenderer.invoke('llm:get-available-models');
                setModels(availableModels[provider]);
                setError(null);
            } catch (err) {
                setError('Failed to load models. Using defaults.');
                setModels(provider === 'openai'
                    ? ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo']
                    : ['llama2', 'mistral', 'codellama']);
            } finally {
                setLoading(false);
            }
        };

        loadModels();
    }, [provider]);

    return (
        <div className="model-picker">
            <select
                value={selectedModel}
                onChange={(e) => onModelChange(e.target.value)}
                disabled={disabled || loading}
                className="form-control"
            >
                {loading ? (
                    <option>Loading models...</option>
                ) : (
                    models.map(model => (
                        <option key={model} value={model}>
                            {model}
                        </option>
                    ))
                )}
            </select>
            {error && <small className="text-danger">{error}</small>}
        </div>
    );
};

export default ModelPicker;