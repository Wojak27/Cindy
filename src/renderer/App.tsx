import React, { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import SettingsPanel from './components/SettingsPanel';
import { getSettings } from '../store/actions';
import './styles/main.css';
import { ipcRenderer } from 'electron';

const App: React.FC = () => {
    const [showSettings, setShowSettings] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const soundEnabled = true;
    const dispatch = useDispatch();
    const messages = useSelector((state: any) => state.messages || []);
    const audioContext = useRef<AudioContext | null>(null);
    const sounds = useRef<Record<string, AudioBuffer>>({});

    useEffect(() => {
        dispatch(getSettings());
    }, [dispatch]);


    // Initialize audio context and load sounds
    useEffect(() => {
        const initAudio = async () => {
            try {
                audioContext.current = new AudioContext();

                // Preload sound effects
                const soundFiles = [
                    { name: 'activation', path: '/assets/sounds/activation.wav' },
                    { name: 'processing', path: '/assets/sounds/processing.wav' },
                    { name: 'complete', path: '/assets/sounds/complete.wav' },
                    { name: 'error', path: '/assets/sounds/error.wav' }
                ];

                for (const file of soundFiles) {
                    try {
                        const response = await fetch(file.path);
                        const arrayBuffer = await response.arrayBuffer();
                        const audioBuffer = await audioContext.current.decodeAudioData(arrayBuffer);
                        sounds.current[file.name] = audioBuffer;
                    } catch (error) {
                        console.warn(`Failed to load sound: ${file.path}`, error);
                    }
                }
            } catch (error) {
                console.warn('Failed to initialize audio context', error);
            }
        };

        initAudio();

        // Cleanup
        return () => {
            if (audioContext.current) {
                audioContext.current.close();
            }
        };
    }, []);

    // Play sound effect
    const playSound = (soundName: string) => {
        if (!soundEnabled || !audioContext.current || !sounds.current[soundName]) return;

        try {
            const source = audioContext.current.createBufferSource();
            source.buffer = sounds.current[soundName];
            source.connect(audioContext.current.destination);
            source.start();
        } catch (error) {
            console.warn(`Failed to play sound: ${soundName}`, error);
        }
    };

    useEffect(() => {
        // Detect when Cindy is speaking
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant') {
            setIsSpeaking(true);
            playSound('complete');
            const timer = setTimeout(() => setIsSpeaking(false), 2000);
            return () => clearTimeout(timer);
        }
        return undefined; // Explicitly return undefined when condition is not met
    }, [messages, playSound]);

    // Handle microphone button click for recording
    const handleMicClick = async () => {
        playSound('activation');

        if (isRecording) {
            // Stop recording
            try {
                const audioData = await ipcRenderer.invoke('stop-recording');
                if (audioData) {
                    // Send audio data to Whisper for transcription
                    const transcript = await ipcRenderer.invoke('transcribe-audio', audioData);
                    if (transcript) {
                        // Handle the transcribed text (e.g., send as message)
                        console.log('Transcription:', transcript);
                        // TODO: Dispatch action to send message
                        // For now, we'll just log it
                    }
                }
            } catch (error) {
                console.error('Error during recording/transcription:', error);
                playSound('error');
            } finally {
                setIsRecording(false);
            }
        } else {
            // Start recording
            try {
                await ipcRenderer.invoke('start-recording');
                setIsRecording(true);
            } catch (error) {
                console.error('Error starting recording:', error);
                playSound('error');
            }
        }
    };

    // Handle send button click
    const handleSendClick = async () => {
        if (inputValue.trim()) {
            playSound('processing');
            // Add user message to store
            dispatch({ type: 'ADD_MESSAGE', payload: { role: 'user', content: inputValue, timestamp: new Date().toISOString() } });

            try {
                // Process message through agent
                const response = await ipcRenderer.invoke('process-message', inputValue);

                // Add assistant response to store
                dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: response, timestamp: new Date().toISOString() } });
            } catch (error) {
                console.error('Error processing message:', error);
                // Add error message
                dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: 'Sorry, I encountered an error processing your request.', timestamp: new Date().toISOString() } });
            } finally {
                setInputValue('');
            }
        }
    };

    // Handle input change
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
    };

    // Handle key press (Enter to send)
    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSendClick();
        }
    };

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
                    <button
                        className="mic-button"
                        onClick={handleMicClick}
                        aria-label="Activate voice assistant"
                    >
                        🎤
                    </button>
                    <input
                        type="text"
                        placeholder="Type your message..."
                        className="message-input"
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyPress={handleKeyPress}
                    />
                    <button
                        className="send-button"
                        onClick={handleSendClick}
                        aria-label="Send message"
                    >
                        ➤
                    </button>
                </div>
            </div>
        </div>
    );
};

// Add accessibility attributes to the component
App.displayName = 'CindyVoiceAssistant';

export default App;