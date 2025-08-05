import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import SettingsPanel from './components/SettingsPanel';
import { getSettings } from '../store/actions';
import './styles/main.css';

const App: React.FC = () => {
    const [showSettings, setShowSettings] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const dispatch = useDispatch();
    const messages = useSelector((state: any) => state.messages || []);

    useEffect(() => {
        dispatch(getSettings());
    }, [dispatch]);

    useEffect(() => {
        // Detect when Cindy is speaking
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
            setIsSpeaking(true);
            const timer = setTimeout(() => setIsSpeaking(false), 2000);
            return () => clearTimeout(timer);
        }
        return undefined; // Explicitly return undefined when condition is not met
    }, [messages]);

    return (
        <div className="app-container">
            <header className="app-header">
                <h1>Cindy - Voice Research Assistant</h1>
                <button
                    className="settings-toggle"
                    onClick={() => setShowSettings(!showSettings)}
                >
                    ⚙️ Settings
                </button>
            </header>

            {showSettings && <SettingsPanel />}

            <div className="chat-container">
                <div className="chat-messages">
                    {messages.map((msg: any, index: number) => (
                        <div
                            key={index}
                            className={`message ${msg.role} ${isSpeaking && msg.role === 'assistant' ? 'speaking' : ''}`}
                        >
                            <div className="avatar">
                                {msg.role === 'user' ? '👤' : '🤖'}
                            </div>
                            <div className="message-content">
                                {msg.content}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="input-area">
                    <button className="mic-button">
                        🎤
                    </button>
                    <input
                        type="text"
                        placeholder="Type your message..."
                        className="message-input"
                    />
                    <button className="send-button">
                        ➤
                    </button>
                </div>
            </div>
        </div>
    );
};

export default App;