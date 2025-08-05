import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { getSettings, updateSettings } from '../../store/actions';

const SettingsPanel: React.FC = () => {
    const dispatch = useDispatch();
    const settings = useSelector((state: any) => state.settings.voice);
    const [activationPhrase, setActivationPhrase] = useState(settings.activationPhrase);
    const [sttProvider, setSttProvider] = useState(settings.sttProvider);

    useEffect(() => {
        dispatch(getSettings());
    }, [dispatch]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        dispatch(updateSettings({
            voice: {
                activationPhrase,
                sttProvider,
                wakeWordSensitivity: settings.wakeWordSensitivity,
                voiceSpeed: settings.voiceSpeed,
                voicePitch: settings.voicePitch
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

                <button type="submit" className="btn btn-primary">
                    Save Settings
                </button>
            </form>
        </div>
    );
};

export default SettingsPanel;