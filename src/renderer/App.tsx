import React, { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { thinkingTokenHandler } from './services/ThinkingTokenHandler';
import ThinkingBlock from './components/ThinkingBlock';
// SoundReactiveCircle was imported but not used in the component
// The component now uses SoundReactiveBlob instead
import SoundReactiveBlob from './components/SoundReactiveBlob';
import RollingTranscription from './components/RollingTranscription';
import SettingsPanel from './components/SettingsPanel';
import DatabasePanel from './components/DatabasePanel';
import { getSettings } from '../store/actions';
import { toggleSettings } from '../store/actions';
import { appendToLastMessage, streamComplete, streamError } from '../store/actions';
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
    // const thinkingStartTime = useSelector((state: any) => state.ui.thinkingStartTime);
    const thinkingBlocks = useSelector((state: any) => state.messages?.thinkingBlocks || []);
    // settings is used in the welcome message, but we're replacing that with SoundReactiveCircle
    // const settings = useSelector((state: any) => state.settings);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [liveTranscription, setLiveTranscription] = useState('');
    const messages = useSelector((state: any) => state.messages?.messages || []);
    const [currentConversationId, setCurrentConversationId] = useState<string>(Date.now().toString());
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const audioContext = useRef<AudioContext | null>(null);
    const sounds = useRef<Record<string, AudioBuffer>>({});
    const streamController = useRef<AbortController | null>(null);

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
        console.log('DEBUG: Mic click handler called, isRecording:', isRecording);
        console.log('DEBUG: About to play activation sound');
        playSound('activation');

        if (isRecording) {
            console.log('DEBUG: Stopping recording...');
            // Stop recording
            try {
                console.log('App.tsx: Invoking stop-recording IPC');
                // Stop recording - this will trigger audio data to be sent
                const audioData = await ipcRenderer.invoke('stop-recording');
                console.log('Audio data received:', audioData);

                if (audioData && audioData.length > 0) {
                    // Send Int16Array[] directly to main process for proper WAV conversion
                    const transcript = await ipcRenderer.invoke('transcribe-audio', audioData);
                    if (transcript) {
                        // Update the live transcription display
                        setLiveTranscription(transcript);
                        // Also set the transcribed text in the input field
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
                } else {
                    console.log('No audio data received or audio data is empty');
                }
            } catch (error) {
                console.error('Error during recording/transcription:', error);
                playSound('error');
            } finally {
                setIsRecording(false);
                // Clear live transcription after a delay
                setTimeout(() => {
                    setLiveTranscription('');
                }, 3000);
            }
        } else {
            console.log('DEBUG: Starting recording...');
            // Show visual feedback that recording is starting
            setIsRecording(true);
            console.log('DEBUG: App.tsx: isRecording state set to true');

            // Test microphone permissions first
            try {
                console.log('DEBUG: App.tsx: Testing microphone permissions');
                const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
                console.log('DEBUG: App.tsx: Microphone permission status:', permissionStatus.state);

                if (permissionStatus.state === 'denied') {
                    console.error('DEBUG: App.tsx: Microphone permission denied');
                    setIsRecording(false);
                    playSound('error');
                    return;
                }
            } catch (permError) {
                console.warn('DEBUG: App.tsx: Could not check microphone permissions:', permError);
            }

            // Send start-recording IPC to renderer service
            try {
                console.log('DEBUG: App.tsx: About to invoke start-recording IPC');
                const result = await ipcRenderer.invoke('start-recording');
                console.log('DEBUG: App.tsx: start-recording IPC result:', result);
                if (!result?.success) {
                    console.error('DEBUG: App.tsx: start-recording failed:', result?.error);
                    setIsRecording(false);
                    playSound('error');
                }
            } catch (error) {
                console.error('DEBUG: App.tsx: Error sending start-recording IPC to renderer:', error);
                setIsRecording(false);
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

            // Create new AbortController for this request
            streamController.current = new AbortController();

            try {
                // Process message through agent with conversation ID
                await ipcRenderer.invoke('process-message', inputValue, currentConversationId);
            } catch (error) {
                console.error('Error processing message:', error);
                // Add error message
                dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: 'Sorry, I encountered an error processing your request.', timestamp: new Date().toISOString() } });
                dispatch({ type: 'STOP_THINKING' });
                setInputValue('');
            }
        }
    };

    // Cleanup function
    useEffect(() => {
        return () => {
            if (streamController.current) {
                streamController.current.abort();
            }
        };
    }, []);

    // Listen for streaming events from main process
    useEffect(() => {
        const handleStreamChunk = (event: any, data: { chunk: string, conversationId: string }) => {
            if (data.conversationId === currentConversationId) {
                // Process the chunk for thinking tokens
                const processed = thinkingTokenHandler.processChunk(data.chunk, currentConversationId);

                // Add any extracted thinking blocks to Redux
                processed.thinkingBlocks.forEach(block => {
                    dispatch({ type: 'ADD_THINKING_BLOCK', payload: block });
                });

                // Append the display content to the message
                if (processed.displayContent) {
                    dispatch(appendToLastMessage(processed.displayContent));
                }
            }
        };

        const handleStreamComplete = (event: any, data: { conversationId: string }) => {
            if (data.conversationId === currentConversationId) {
                // Finalize any open thinking blocks
                const finalizedBlocks = thinkingTokenHandler.finalizeThinkingBlocks(
                    thinkingBlocks.filter((block: any) => !block.endTime)
                );
                finalizedBlocks.forEach((block: any) => {
                    dispatch({ type: 'UPDATE_THINKING_BLOCK', payload: block });
                });

                dispatch(streamComplete());
                dispatch({ type: 'STOP_THINKING' });
                setInputValue('');
            }
        };

        const handleStreamError = (event: any, data: { error: string, conversationId: string }) => {
            if (data.conversationId === currentConversationId) {
                dispatch(streamError(data.error));
                dispatch({ type: 'STOP_THINKING' });
                dispatch({ type: 'ADD_MESSAGE', payload: { role: 'assistant', content: `Sorry, I encountered an error: ${data.error}`, timestamp: new Date().toISOString() } });
                setInputValue('');
            }
        };

        ipcRenderer.on('stream-chunk', handleStreamChunk);
        ipcRenderer.on('stream-complete', handleStreamComplete);
        ipcRenderer.on('stream-error', handleStreamError);

        // Cleanup listeners on unmount
        return () => {
            ipcRenderer.off('stream-chunk', handleStreamChunk);
            ipcRenderer.off('stream-complete', handleStreamComplete);
            ipcRenderer.off('stream-error', handleStreamError);
            if (streamController.current) {
                streamController.current.abort();
            }
        };
    }, [currentConversationId, dispatch, thinkingBlocks]);

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
                        <div className="chat-messages" style={{ height: '100%', overflowY: 'auto' }}>
                            {/* Show sound reactive circle when no messages and no current input */}
                            {messages.length === 0 && (
                                <div style={{ display: 'flex', justifyContent: 'center', flexDirection: "column", alignItems: 'center', height: '100%' }}>
                                    <div>
                                        <div style={{ position: "relative", width: "200px", height: "200px" }}>
                                            <SoundReactiveBlob isActive={true} />
                                        </div>
                                    </div>
                                    <div>
                                        <h2 style={{ textAlign: "center" }}>How can I assist you today?</h2>
                                    </div>
                                </div>
                            )}
                            {messages.map((msg: any, index: number) => {
                                const messageClass = `message ${msg.role} ${isSpeaking && msg.role === 'assistant' ? 'speaking' : ''} ${isListening ? 'listening' : ''}`;

                                return (
                                    <div
                                        key={index}
                                        className={messageClass}
                                    >
                                        <div className="message-content">
                                            {msg.content && typeof msg.content === 'string' ? (
                                                <>
                                                    {/* Render thinking blocks from Redux state */}
                                                    {thinkingBlocks
                                                        .filter((block: any) => block.startTime >= msg.timestamp)
                                                        .map((block: any) => (
                                                            <ThinkingBlock
                                                                key={block.id}
                                                                id={block.id}
                                                                content={block.content}
                                                                startTime={block.startTime}
                                                                endTime={block.endTime}
                                                                duration={block.duration}
                                                                defaultOpen={false}
                                                            />
                                                        ))}
                                                    {/* Display the message content */}
                                                    {msg.content}
                                                </>
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

                {/* Rolling Transcription Display */}
                <RollingTranscription
                    text={liveTranscription}
                    isRecording={isRecording}
                />

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