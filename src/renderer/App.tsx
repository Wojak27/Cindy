import React, { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import SettingsPanel from './components/SettingsPanel';
import { getSettings } from '../store/actions';
import { toggleSettings } from '../store/actions';
import './styles/main.css';
import { ipcRenderer } from 'electron';
import ChatList from './components/ChatList';
import {
    AppBar,
    Toolbar,
    Typography,
    IconButton
} from '@mui/material';
import {
    Settings as SettingsIcon,
    Mic as MicIcon,
    Send as SendIcon,
    Person as PersonIcon,
    SmartToy as SmartToyIcon
} from '@mui/icons-material';

const App: React.FC = () => {
    const dispatch = useDispatch();
    const showSettings = useSelector((state: any) => state.ui.showSettings);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const messages = useSelector((state: any) => state.messages || []);
    const [currentConversationId, setCurrentConversationId] = useState<string>(Date.now().toString());
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
        if (!audioContext.current || !sounds.current[soundName]) return;

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
                // Stop recording - this will trigger audio data to be sent
                await ipcRenderer.invoke('stop-recording');
                // Wait for audio data from the AudioCaptureService
                const audioData = await new Promise<Int16Array[]>((resolve) => {
                    const handler = (event: any, data: Int16Array[]) => {
                        resolve(data);
                    };
                    ipcRenderer.once('audio-data', handler);
                });

                if (audioData) {
                    // Convert Int16Array[] to ArrayBuffer for transcription
                    const audioBuffer = new ArrayBuffer(audioData.length * audioData[0].length * 2);
                    const view = new DataView(audioBuffer);
                    let offset = 0;
                    for (const chunk of audioData) {
                        for (const sample of chunk) {
                            view.setInt16(offset, sample, true);
                            offset += 2;
                        }
                    }

                    // Send audio data to Whisper for transcription
                    const transcript = await ipcRenderer.invoke('transcribe-audio', audioBuffer);
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
            <div className="sidebar">
                <ChatList
                    onSelectConversation={setCurrentConversationId}
                    onCreateNewChat={() => {
                        const newId = Date.now().toString();
                        setCurrentConversationId(newId);
                    }}
                    currentConversationId={currentConversationId}
                />
            </div>
            <div className="main-content">
                <AppBar position="static" color="primary" elevation={0} sx={{ mb: 2, borderRadius: 1 }}>
                    <Toolbar>
                        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                            Cindy - Voice Research Assistant
                        </Typography>
                        <IconButton
                            edge="end"
                            color="inherit"
                            onClick={() => dispatch(toggleSettings())}
                            aria-label="Open settings"
                            size="large"
                        >
                            <SettingsIcon />
                        </IconButton>
                    </Toolbar>
                </AppBar>

                {showSettings && (
                    <div className="settings-floating-window">
                        <SettingsPanel />
                        <button
                            className="close-settings"
                            onClick={() => dispatch(toggleSettings())}
                            aria-label="Close settings"
                        >
                            ×
                        </button>
                    </div>
                )}

                <div className="chat-container">
                    <div className="chat-messages">
                        {messages.map((msg: any, index: number) => {
                            const messageClass = `message ${msg.role} ${isSpeaking && msg.role === 'assistant' ? 'speaking' : ''}`;
                            return (
                                <div
                                    key={index}
                                    className={messageClass}
                                >
                                    <div className="avatar">
                                        {msg.role === 'user' ? <PersonIcon /> : <SmartToyIcon />}
                                    </div>
                                    <div className="message-content">
                                        {msg.content}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="input-area">
                        <IconButton
                            className={`mic-button ${isRecording ? 'is-listening' : ''}`}
                            onClick={handleMicClick}
                            aria-label="Activate voice assistant"
                            color={isRecording ? "error" : "primary"}
                            size="large"
                        >
                            <MicIcon />
                        </IconButton>
                        <input
                            type="text"
                            placeholder="Type your message..."
                            className="message-input"
                            value={inputValue}
                            style={{
                                width: '100%',
                                padding: '1rem',
                                borderRadius: '1rem',
                                border: '1px solid #ccc',
                                fontSize: '16px'
                            }}
                            onChange={handleInputChange}
                            onKeyPress={handleKeyPress}
                        />
                        <IconButton
                            className="send-button"
                            onClick={handleSendClick}
                            aria-label="Send message"
                            color="primary"
                            size="large"
                        >
                            <SendIcon />
                        </IconButton>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Add accessibility attributes to the component
App.displayName = 'CindyVoiceAssistant';

export default App;