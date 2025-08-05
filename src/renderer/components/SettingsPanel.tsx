import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { getSettings, updateSettings } from '../../store/actions';
import ModelPicker from './ModelPicker';

const SettingsPanel: React.FC = () => {
    const dispatch = useDispatch();
    const settings = useSelector((state: any) => state.settings);
    const [activationPhrase, setActivationPhrase] = useState(settings.voice.activationPhrase);
    const [sttProvider, setSttProvider] = useState(settings.voice.sttProvider);

    // LLM settings state
    const [llmProvider, setLlmProvider] = useState(settings.llm.provider);
    const [openaiModel, setOpenaiModel] = useState(settings.llm.openai.model);
    const [ollamaModel, setOllamaModel] = useState(settings.llm.ollama.model);
    const [openaiApiKey, setOpenaiApiKey] = useState('');
    const [ollamaBaseUrl, setOllamaBaseUrl] = useState(settings.llm.ollama.baseUrl);
    const [temperature, setTemperature] = useState(settings.llm.openai.temperature);
    const [maxTokens, setMaxTokens] = useState(settings.llm.openai.maxTokens);

    useEffect(() => {
        dispatch(getSettings());
    }, [dispatch]);

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
            }
        }));
    };

    return (
        <div className="settings-panel">
            <h2>Voice Settings</h2>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="activationPhrase">Activation Phrase</label>
                    <input
                        type="text"
                        id="activationPhrase"
                        value={activationPhrase}
                        onChange={(e) => setActivationPhrase(e.target.value)}
                        className="form-control"
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="sttProvider">Speech Recognition</label>
                    <select
                        id="sttProvider"
                        value={sttProvider}
                        onChange={(e) => setSttProvider(e.target.value as 'online' | 'offline' | 'auto' | 'whisper')}
                        className="form-control"
                    >
                        <option value="online">Online (Cloud)</option>
                        <option value="offline">Offline (Whisper.cpp)</option>
                        <option value="whisper">Whisper Local API</option>
                        <option value="auto">Auto (Preferred)</option>
                    </select>
                </div>

                <div className="llm-settings">
                    <h2>Language Model</h2>

                    <div className="form-group">
                        <label htmlFor="llmProvider">Provider</label>
                        <select
                            id="llmProvider"
                            value={llmProvider}
                            onChange={(e) => setLlmProvider(e.target.value as 'openai' | 'ollama' | 'auto')}
                            className="form-control"
                        >
                            <option value="auto">Auto (Recommended)</option>
                            <option value="openai">OpenAI</option>
                            <option value="ollama">Ollama</option>
                        </select>
                        <small className="form-text text-muted">
                            Auto mode uses OpenAI when available, falling back to Ollama
                        </small>
                    </div>

                    {llmProvider === 'openai' && (
                        <div className="provider-settings openai">
                            <div className="form-group">
                                <label htmlFor="openaiApiKey">OpenAI API Key</label>
                                <input
                                    type="password"
                                    id="openaiApiKey"
                                    value={openaiApiKey}
                                    onChange={(e) => setOpenaiApiKey(e.target.value)}
                                    className="form-control"
                                    placeholder="sk-..."
                                />
                            </div>

                            <div className="form-group">
                                <label>Model</label>
                                <ModelPicker
                                    provider="openai"
                                    selectedModel={openaiModel}
                                    onModelChange={setOpenaiModel}
                                />
                            </div>
                        </div>
                    )}

                    {llmProvider === 'ollama' && (
                        <div className="provider-settings ollama">
                            <div className="form-group">
                                <label htmlFor="ollamaBaseUrl">Ollama Base URL</label>
                                <input
                                    type="text"
                                    id="ollamaBaseUrl"
                                    value={ollamaBaseUrl}
                                    onChange={(e) => setOllamaBaseUrl(e.target.value)}
                                    className="form-control"
                                    placeholder="http://127.0.0.1:11434"
                                />
                            </div>

                            <div className="form-group">
                                <label>Model</label>
                                <ModelPicker
                                    provider="ollama"
                                    selectedModel={ollamaModel}
                                    onModelChange={setOllamaModel}
                                />
                            </div>
                        </div>
                    )}

                    <div className="common-settings">
                        <div className="form-group">
                            <label>Temperature</label>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.1"
                                value={temperature}
                                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                                className="form-control-range"
                            />
                            <span className="range-value">{temperature}</span>
                        </div>

                        <div className="form-group">
                            <label>Max Tokens</label>
                            <input
                                type="number"
                                value={maxTokens}
                                onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                                className="form-control"
                                min="1"
                                max="4096"
                            />
                        </div>
                    </div>
                </div>

                <button type="submit" className="btn btn-primary">
                    Save Settings
                </button>
            </form>
        </div>
    );
};

export default SettingsPanel;