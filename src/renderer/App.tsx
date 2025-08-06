import React, { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import SoundReactiveCircle from './components/SoundReactiveCircle';
import SettingsPanel from './components/SettingsPanel';
import DatabasePanel from './components/DatabasePanel';
import { getSettings } from '../store/actions';
import { toggleSettings } from '../store/actions';
import './styles/main.css';
import './styles/database-sidebar.css';
import { ipcRenderer } from 'electron';
import ChatList from './components/ChatList';
import {
    IconButton
} from '@mui/material';
import {
    Mic as MicIcon,
    ArrowUpward as SendIcon,
    ViewSidebar as ViewSidebarIcon,
    EditSquare as EditSquareIcon,
    Settings as SettingsIcon,
    Storage as DatabaseIcon
} from '@mui/icons-material';

const App: React.FC = () => {
    const dispatch = useDispatch();
    const showSettings = useSelector((state: any) => state.ui.showSettings);
    const showDatabase = useSelector((state: any) => state.ui.showDatabase);
    const thinkingStartTime = useSelector((state: any) => state.ui.thinkingStartTime);
    // settings is used in the welcome message, but we're replacing that with SoundReactiveCircle
    // const settings = useSelector((state: any) => state.settings);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const messages = useSelector((state: any) => state.messages || []);
    const [currentConversationId, setCurrentConversationId] = useState<string>(Date.now().toString());
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const audioContext = useRef<AudioContext | null>(null);
    const sounds = useRef<Record<string, AudioBuffer>>({});

    // Load conversation history when conversation changes
    useEffect(() => {
        const loadConversationHistory = async () => {
            if (!currentConversationId) return;

            try {
                console.log('Loading conversation history for:', currentConversationId);
                const messages = await ipcRenderer.invoke('load-conversation', currentConversationId);
                console.log('Loaded messages:', messages);

                // Clear current messages and add loaded ones
                dispatch({ type: 'CLEAR_MESSAGES' });
                messages.forEach((message: any) => {
                    dispatch({ type: 'ADD_MESSAGE', payload: message });
                });
            } catch (error) {
                console.error('Failed to load conversation history:', error);
            }
        };

        loadConversationHistory();
    }, [currentConversationId, dispatch]);

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
            // Only play sound if this is a new assistant message
            const lastMessageId = lastMessage.timestamp;
            if (!lastMessageId || lastMessageId !== localStorage.getItem('lastAssistantMessage')) {
                playSound('complete');
                localStorage.setItem('lastAssistantMessage', lastMessageId);
            }
            setIsSpeaking(true);
            const timer = setTimeout(() => setIsSpeaking(false), 2000);
            return () => clearTimeout(timer);
        }
        return undefined; // Explicitly return undefined when condition is not met
    }, [messages, playSound]);


    // Handle microphone button click for recording
    const handleMicClick = async () => {
        playSound('activation');
        // Show visual feedback that recording is starting
        setIsRecording(true);

        // Send start-recording IPC to renderer service
        ipcRenderer.send('start-recording');

        if (isRecording) {
            // Stop recording
            try {
                // Stop recording - this will trigger audio data to be sent
                const audioData = await ipcRenderer.invoke('stop-recording');

                if (audioData && audioData.length > 0) {
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
                        // First, set the transcribed text in the input field
                        setInputValue(transcript);

                        // Handle the transcribed text by sending it as a message
                        if (transcript.trim()) {
                            // Add user message to store
                            dispatch({ type: 'ADD_MESSAGE', payload: { role: 'user', content: transcript, timestamp: new Date().toISOString() } });
                            dispatch({ type: 'START_THINKING' });

                            try {
                                // Process message through agent with conversation ID
                                const response = await ipcRenderer.invoke('process-message', transcript, currentConversationId);

                                // Add assistant response to store
                                dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: response, timestamp: new Date().toISOString() } });
                            } catch (error) {
                                console.error('Error processing message:', error);
                                // Add error message
                                dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: 'Sorry, I encountered an error processing your request.', timestamp: new Date().toISOString() } });
                            } finally {
                                dispatch({ type: 'STOP_THINKING' });
                            }
                        }
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

    // Listen for wake word detection events
    useEffect(() => {
        const handleWakeWordDetected = () => {
            setIsListening(true);
            playSound('activation');

            // Reset listening state after a short delay
            const timer = setTimeout(() => {
                setIsListening(false);
            }, 1000);

            return () => clearTimeout(timer);
        };

        const handleWakeWordTimeout = () => {
            setIsListening(false);
        };

        ipcRenderer.on('wake-word-detected', handleWakeWordDetected);
        ipcRenderer.on('wake-word-timeout', handleWakeWordTimeout);

        // Cleanup listeners on unmount
        return () => {
            ipcRenderer.off('wake-word-detected', handleWakeWordDetected);
            ipcRenderer.off('wake-word-timeout', handleWakeWordTimeout);
        };
    }, [playSound]);

    // Handle send button click
    const handleSendClick = async () => {
        if (inputValue.trim()) {
            playSound('processing');
            // Add user message to store
            dispatch({ type: 'ADD_MESSAGE', payload: { role: 'user', content: inputValue, timestamp: new Date().toISOString() } });
            dispatch({ type: 'START_THINKING' });

            try {
                // Process message through agent with conversation ID
                const response = await ipcRenderer.invoke('process-message', inputValue, currentConversationId);

                // Add assistant response to store
                dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: response, timestamp: new Date().toISOString() } });
            } catch (error) {
                console.error('Error processing message:', error);
                // Add error message
                dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: 'Sorry, I encountered an error processing your request.', timestamp: new Date().toISOString() } });
            } finally {
                dispatch({ type: 'STOP_THINKING' });
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
            <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
                <ChatList
                    onSelectConversation={setCurrentConversationId}
                    onCreateNewChat={async () => {
                        try {
                            // Create new conversation through IPC handler
                            const newId = await ipcRenderer.invoke('create-conversation');
                            setCurrentConversationId(newId);
                            // Clear messages for the new conversation
                            dispatch({ type: 'CLEAR_MESSAGES' });
                        } catch (error) {
                            console.error('Failed to create new conversation:', error);
                            // Fallback to local ID generation if IPC fails
                            const fallbackId = Date.now().toString();
                            setCurrentConversationId(fallbackId);
                            dispatch({ type: 'CLEAR_MESSAGES' });
                        }
                    }}
                    currentConversationId={currentConversationId}
                />
            </div>
            <div className="main-content">
                <div className="window-controls" >
                    <IconButton
                        className="sidebar-toggle"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        aria-label="Toggle sidebar"
                        size="small"
                    >
                        <ViewSidebarIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                        className="new-chat"
                        onClick={async () => {
                            try {
                                // Create new conversation through IPC handler
                                const newId = await ipcRenderer.invoke('create-conversation');
                                setCurrentConversationId(newId);
                                // Clear messages for the new conversation
                                dispatch({ type: 'CLEAR_MESSAGES' });
                            } catch (error) {
                                console.error('Failed to create new conversation:', error);
                                // Fallback to local ID generation if IPC fails
                                const fallbackId = Date.now().toString();
                                setCurrentConversationId(fallbackId);
                                dispatch({ type: 'CLEAR_MESSAGES' });
                            }
                        }}
                        aria-label="New chat"
                        size="small"
                    >
                        <EditSquareIcon fontSize="small" />
                    </IconButton>
                    <div className="window-draggable-area"></div>
                    <IconButton
                        className="database-button"
                        onClick={() => dispatch({ type: 'TOGGLE_DATABASE_SIDEBAR' })}
                        aria-label="Open database settings"
                        size="small"
                    >
                        <DatabaseIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                        className={`settings-button ${showSettings ? 'active' : ''}`}
                        onClick={() => dispatch(toggleSettings())}
                        aria-label={showSettings ? "Close settings" : "Open settings"}
                        size="small"
                    >
                        <SettingsIcon fontSize="small" />
                    </IconButton>
                </div>

                <div className="chat-container">
                    <div className="chat-messages-container">
                        <div className="chat-messages">
                            {/* Show sound reactive circle when no messages and no current input */}
                            {messages.length === 0 && !inputValue && (
                                <SoundReactiveCircle isActive={true} />
                            )}
                            {messages.map((msg: any, index: number) => {
                                const messageClass = `message ${msg.role} ${isSpeaking && msg.role === 'assistant' ? 'speaking' : ''} ${isListening ? 'listening' : ''}`;

                                // Process message content to handle thinking sections
                                const processContent = (content: string) => {
                                    if (!content) return '';

                                    // Replace thinking sections with expandable blocks
                                    const regex = /<tool_call>([\s\S]*?)<\/think>/gi;
                                    return content.split(regex).map((part, i) => {
                                        // Even indices are non-thinking content, odd indices are thinking content
                                        if (i % 2 === 1) {
                                            const blockId = `thinking-${index}-${Math.floor(i / 2)}`;
                                            return (
                                                <div key={blockId} className="thinking-block">
                                                    <button
                                                        className="thinking-toggle"
                                                        onClick={() => {
                                                            const contentEl = document.getElementById(`${blockId}-content`);
                                                            const toggleEl = document.getElementById(`${blockId}-toggle`);
                                                            if (contentEl && toggleEl) {
                                                                contentEl.style.display = contentEl.style.display === 'none' ? 'block' : 'none';
                                                                toggleEl.textContent = contentEl.style.display === 'none' ? '▶' : '▼';
                                                            }
                                                        }}
                                                    >
                                                        <span id={`${blockId}-toggle`}>💡</span> <span className="thinking-text">Thought for</span> <span className="thinking-timer">{getElapsedTime()}</span>
                                                    </button>
                                                    <div
                                                        id={`${blockId}-content`}
                                                        className="thinking-content"
                                                        style={{ display: 'none' }}
                                                    >
                                                        {part}
                                                    </div>
                                                </div>
                                            );
                                        }
                                        // Regular text content (including content outside thinking tags)
                                        return part;
                                    });
                                };

                                // Calculate elapsed time since thinking started
                                const getElapsedTime = () => {
                                    if (!thinkingStartTime) return '00:00';
                                    const elapsed = Math.floor((Date.now() - thinkingStartTime) / 1000);
                                    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
                                    const seconds = (elapsed % 60).toString().padStart(2, '0');
                                    return `${minutes}:${seconds}`;
                                };

                                return (
                                    <div
                                        key={index}
                                        className={messageClass}
                                    >
                                        <div className="message-content">
                                            {msg.content && typeof msg.content === 'string' ? (
                                                processContent(msg.content)
                                            ) : (
                                                msg.content
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="input-area">
                        <input
                            type="text"
                            placeholder="Type your message..."
                            className="message-input"
                            value={inputValue}
                            style={{
                                flex: 1,
                                padding: '12px 16px',
                                borderRadius: '8px',
                                border: '1px solid #e5e5e5',
                                fontSize: '14px',
                                outline: 'none'
                            }}
                            onChange={handleInputChange}
                            onKeyPress={handleKeyPress}
                        />
                        <div className="button-group">
                            <IconButton
                                className={`mic-button ${isListening ? 'is-listening' : ''}`}
                                onClick={handleMicClick}
                                aria-label="Activate voice assistant"
                                color={isListening ? "error" : "primary"}
                                size="small"
                            >
                                <MicIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                                className="send-button"
                                onClick={handleSendClick}
                                aria-label="Send message"
                                color="primary"
                                size="small"
                            >
                                <SendIcon fontSize="small" />
                            </IconButton>
                        </div>
                    </div>
                </div>
                <div className={`settings-sidebar-container ${showSettings ? 'open' : ''}`}>
                    <SettingsPanel />
                </div>
                <div className={`database-sidebar-container ${showDatabase ? 'open' : ''}`}>
                    <DatabasePanel />
                </div>
            </div>
        </div>
    );
};

// Add accessibility attributes to the component
App.displayName = 'CindyVoiceAssistant';

export default App;