import React, { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { thinkingTokenHandler } from './services/ThinkingTokenHandler';
import ThinkingBlock from './components/ThinkingBlock';
import ContentProcessor from './utils/contentProcessor';
// SoundReactiveCircle was imported but not used in the component
// The component now uses SoundReactiveBlob instead
import SoundReactiveBlob from './components/SoundReactiveBlob';
import SettingsPanel from './components/SettingsPanel';
import DatabasePanel from './components/DatabasePanel';
import ThemeToggle from './components/ThemeToggle';
import { ThemeProvider } from './contexts/ThemeContext';
import { getSettings } from '../store/actions';
import { toggleSettings } from '../store/actions';
import { streamError } from '../store/actions';
import { getWelcomeMessage, getPersonalizedMessage, shouldShowWelcome } from './utils/personalizedMessages';
import './styles/main.css';
import './styles/database-sidebar.css';
import { ipcRenderer } from 'electron';
import ChatList from './components/ChatList';
import { liveTranscriptionService } from './services/LiveTranscriptionService';
import {
    IconButton,
    CssBaseline
} from '@mui/material';
import {
    Mic as MicIcon,
    ArrowUpward as SendIcon,
    ViewSidebar as ViewSidebarIcon,
    EditSquare as EditSquareIcon,
    Settings as SettingsIcon,
    Storage as DatabaseIcon,
    Hearing as WakeWordIcon,
    Refresh as RetryIcon
} from '@mui/icons-material';

const App: React.FC = () => {
    const dispatch = useDispatch();
    const showSettings = useSelector((state: any) => state.ui.showSettings);
    const showDatabase = useSelector((state: any) => state.ui.showDatabase);
    // const thinkingStartTime = useSelector((state: any) => state.ui.thinkingStartTime);
    const thinkingBlocks = useSelector((state: any) => state.messages?.thinkingBlocks || []);
    const settings = useSelector((state: any) => state.settings);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const isListening = false; // No longer used for real-time transcription, kept for display compatibility
    const [inputValue, setInputValue] = useState('');
    const messages = useSelector((state: any) => state.messages?.messages || []);
    const [currentConversationId, setCurrentConversationId] = useState<string>(Date.now().toString());
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isAppLoading, setIsAppLoading] = useState(true);
    const [wakeWordActive, setWakeWordActive] = useState(false);
    const [wakeWordDetected, setWakeWordDetected] = useState(false);
    const [isLiveListening, setIsLiveListening] = useState(false);
    const [liveTranscript, setLiveTranscript] = useState('');
    const audioContext = useRef<AudioContext | null>(null);
    const sounds = useRef<Record<string, AudioBuffer>>({});
    const streamController = useRef<AbortController | null>(null);
    const speechTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Load conversation history when conversation changes
    useEffect(() => {
        const loadConversationHistory = async () => {
            if (!currentConversationId) return;

            try {
                console.log('🔧 DEBUG: Loading conversation history for:', currentConversationId);
                const messages = await ipcRenderer.invoke('load-conversation', currentConversationId);
                console.log('🔧 DEBUG: Loaded messages from ChatStorageService:', messages.length, 'messages');

                // Clear current messages and thinking blocks
                dispatch({ type: 'CLEAR_MESSAGES' });
                dispatch({ type: 'CLEAR_THINKING_BLOCKS' });
                
                // Process existing messages for thinking tokens and code blocks
                const { updatedMessages, extractedThinkingBlocks } = ContentProcessor.processExistingMessages(
                    messages, 
                    currentConversationId
                );
                
                console.log('🔧 DEBUG: Processed', messages.length, 'messages, extracted', extractedThinkingBlocks.length, 'thinking blocks');
                
                // Load all processed messages at once to prevent duplication
                dispatch({ type: 'LOAD_MESSAGES', payload: updatedMessages });
                
                // Load extracted thinking blocks as batch
                if (extractedThinkingBlocks.length > 0) {
                    dispatch({ type: 'LOAD_THINKING_BLOCKS', payload: extractedThinkingBlocks });
                    console.log('🔧 DEBUG: Loaded', extractedThinkingBlocks.length, 'extracted thinking blocks');
                }
                
                // Load thinking blocks for this conversation
                try {
                    console.log('🔧 DEBUG: Loading thinking blocks for conversation:', currentConversationId);
                    const conversationThinkingBlocks = await ipcRenderer.invoke('get-thinking-blocks', currentConversationId);
                    console.log('🔧 DEBUG: Loaded thinking blocks:', conversationThinkingBlocks?.length || 0, 'blocks');
                    
                    if (conversationThinkingBlocks && conversationThinkingBlocks.length > 0) {
                        // Retroactively associate thinking blocks with messages if not already associated
                        const updatedBlocks = conversationThinkingBlocks.map((block: any) => {
                            if (!block.messageId) {
                                // Find the closest assistant message by timestamp
                                const assistantMessages = messages.filter((msg: any) => msg.role === 'assistant');
                                if (assistantMessages.length > 0) {
                                    const blockTime = new Date(block.startTime).getTime();
                                    let closestMessage = assistantMessages[0];
                                    let smallestDiff = Math.abs(new Date(closestMessage.timestamp).getTime() - blockTime);
                                    
                                    assistantMessages.forEach((msg: any) => {
                                        if (msg.timestamp) {
                                            const msgTime = new Date(msg.timestamp).getTime();
                                            const diff = Math.abs(msgTime - blockTime);
                                            if (diff < smallestDiff) {
                                                smallestDiff = diff;
                                                closestMessage = msg;
                                            }
                                        }
                                    });
                                    
                                    // Associate if within 2 minutes
                                    if (smallestDiff <= 120000) { // 2 minutes
                                        console.log('🔧 DEBUG: Associated thinking block', block.id, 'with message', closestMessage.id);
                                        return { ...block, messageId: closestMessage.id };
                                    }
                                }
                            }
                            return block;
                        });
                        
                        // Add all thinking blocks to the store as batch (merge with existing)
                        dispatch({ type: 'LOAD_THINKING_BLOCKS', payload: [...extractedThinkingBlocks, ...updatedBlocks] });
                        console.log('🔧 DEBUG: Loaded', updatedBlocks.length, 'conversation thinking blocks to store');
                    }
                } catch (thinkingError) {
                    console.warn('🔧 DEBUG: Failed to load thinking blocks, continuing without them:', thinkingError);
                }
            } catch (error) {
                console.error('🚨 DEBUG: Failed to load conversation history:', error);
                dispatch({ type: 'CLEAR_MESSAGES' });
                dispatch({ type: 'CLEAR_THINKING_BLOCKS' });
            }
        };

        loadConversationHistory();
    }, [currentConversationId, dispatch]);

    useEffect(() => {
        dispatch(getSettings());
        
        // Hide loading screen after a delay to show the app is ready
        const timer = setTimeout(() => {
            setIsAppLoading(false);
        }, 2000); // Show loading blob for 2 seconds
        
        return () => clearTimeout(timer);
    }, [dispatch]);

    // Start live transcription when app loads
    useEffect(() => {
        const startLiveTranscription = async () => {
            try {
                await liveTranscriptionService.startLiveTranscription(
                    // On transcription (before wake word)
                    (transcript) => {
                        console.log('🎤 Live transcription:', transcript);
                        setLiveTranscript(transcript);
                        // Auto-clear transcript after 3 seconds
                        setTimeout(() => setLiveTranscript(''), 3000);
                    },
                    // On wake word detected
                    () => {
                        console.log('🎤 Wake word detected via live transcription!');
                        setWakeWordDetected(true);
                        setLiveTranscript('');
                        handleMicClick();
                        // Reset wake word detected state after visual feedback
                        setTimeout(() => {
                            setWakeWordDetected(false);
                        }, 2000);
                    },
                    // On speech stop
                    () => {
                        console.log('🎤 Speech stopped');
                        // Clear transcript after speech stops
                        setTimeout(() => setLiveTranscript(''), 1000);
                    }
                );
                setIsLiveListening(true);
                console.log('🎤 Live transcription started successfully');
            } catch (error) {
                console.error('🎤 Failed to start live transcription:', error);
            }
        };

        if (!isAppLoading) {
            startLiveTranscription();
        }

        // Cleanup on unmount
        return () => {
            liveTranscriptionService.stopLiveTranscription();
        };
    }, [isAppLoading]);

    // Check wake word status periodically
    useEffect(() => {
        const checkWakeWordStatus = async () => {
            try {
                const result = await ipcRenderer.invoke('wake-word:status');
                if (result.success) {
                    setWakeWordActive(result.isListening);
                }
            } catch (error) {
                console.error('Failed to check wake word status:', error);
            }
        };

        // Check immediately and then every 5 seconds
        checkWakeWordStatus();
        const interval = setInterval(checkWakeWordStatus, 5000);

        return () => clearInterval(interval);
    }, []);

    // Initialize audio context for recording activation sound only
    useEffect(() => {
        const initAudio = async () => {
            try {
                audioContext.current = new AudioContext();

                // Only load activation sound for recording
                try {
                    const response = await fetch('/assets/sounds/activation.wav');
                    const arrayBuffer = await response.arrayBuffer();
                    const audioBuffer = await audioContext.current.decodeAudioData(arrayBuffer);
                    sounds.current['activation'] = audioBuffer;
                } catch (error) {
                    console.warn('Failed to load activation sound:', error);
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
        // Detect when Cindy is speaking (no sound effects except for recording)
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role === 'assistant' && !lastMessage.isStreaming) {
            setIsSpeaking(true);
            const timer = setTimeout(() => setIsSpeaking(false), 2000);
            return () => clearTimeout(timer);
        }
        return undefined;
    }, [messages]);


    // Handle microphone button click for recording
    const handleMicClick = async () => {
        console.log('🎤 handleMicClick called, current state:', { isRecording, isListening, wakeWordDetected });
        
        // Only play activation sound for recording (as requested)
        if (!isRecording) {
            playSound('activation');
        }

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
                        // Set the transcribed text in the input field
                        setInputValue(transcript);

                        // Handle the transcribed text by sending it as a message
                        if (transcript.trim()) {
                            // Add user message to store with unique ID
                            const userMessage = {
                                id: `user-${Date.now()}`,
                                role: 'user',
                                content: transcript,
                                timestamp: new Date().toISOString(),
                                conversationId: currentConversationId
                            };
                            console.log('🔧 DEBUG: Adding user message (from voice) - will be persisted to ChatStorageService:', userMessage);
                            dispatch({ type: 'ADD_MESSAGE', payload: userMessage });

                            // Create assistant message placeholder for streaming
                            const assistantMessage = {
                                id: `assistant-${Date.now()}`,
                                role: 'assistant',
                                content: '',
                                timestamp: new Date().toISOString(),
                                isStreaming: true,
                                conversationId: currentConversationId
                            };
                            dispatch({ type: 'ADD_MESSAGE', payload: assistantMessage });
                            dispatch({ type: 'START_THINKING' });

                            try {
                                // Process message through agent with conversation ID
                                await ipcRenderer.invoke('process-message', transcript, currentConversationId);
                            } catch (error) {
                                console.error('Error processing message:', error);
                                // Mark the assistant message as failed
                                dispatch({ 
                                    type: 'MARK_MESSAGE_FAILED', 
                                    payload: { 
                                        messageId: assistantMessage.id, 
                                        error: error instanceof Error ? error.message : 'Unknown error occurred' 
                                    } 
                                });
                                dispatch({ type: 'STOP_THINKING' });
                            }
                        }
                    }
                } else {
                    console.log('No audio data received or audio data is empty');
                }
            } catch (error) {
                console.error('Error during recording/transcription:', error);
                // Removed error sound effect
            } finally {
                setIsRecording(false);
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


    // Retry a failed message
    const retryMessage = async (messageId: string, userMessage: any) => {
        console.log('Retrying message:', messageId, userMessage);
        
        // Mark message as retrying
        dispatch({ type: 'RETRY_MESSAGE', payload: { messageId } });
        dispatch({ type: 'START_THINKING' });
        
        try {
            // Find the user message content to retry
            const userContent = userMessage?.content || '';
            if (userContent.trim()) {
                // Process through agent again
                await ipcRenderer.invoke('process-message', userContent, currentConversationId);
            }
        } catch (error) {
            console.error('Error retrying message:', error);
            dispatch({ 
                type: 'MARK_MESSAGE_FAILED', 
                payload: { 
                    messageId: messageId, 
                    error: error instanceof Error ? error.message : 'Unknown error occurred' 
                } 
            });
            dispatch({ type: 'STOP_THINKING' });
        }
    };

    // Listen for wake word detection events
    useEffect(() => {
        const handleWakeWordDetected = async () => {
            console.log('🎤 Wake word detected in renderer! Activating recording...');
            setWakeWordDetected(true);
            playSound('activation');

            // Activate the same function as microphone click
            try {
                await handleMicClick();
                console.log('🎤 handleMicClick completed after wake word');
            } catch (error) {
                console.error('🎤 Error in handleMicClick after wake word:', error);
            }

            // Reset wake word detected state after visual feedback
            setTimeout(() => {
                setWakeWordDetected(false);
            }, 2000);
        };

        const handleWakeWordTimeout = () => {
            console.log('🎤 Wake word timeout');
        };


        ipcRenderer.on('wake-word-detected', handleWakeWordDetected);
        ipcRenderer.on('wake-word-timeout', handleWakeWordTimeout);

        // Cleanup listeners on unmount
        return () => {
            ipcRenderer.off('wake-word-detected', handleWakeWordDetected);
            ipcRenderer.off('wake-word-timeout', handleWakeWordTimeout);
            if (speechTimeoutRef.current) {
                clearTimeout(speechTimeoutRef.current);
            }
        };
    }, []);

    // Handle send button click
    const handleSendClick = async () => {
        if (inputValue.trim()) {
            // Only play recording activation sound, no other sound effects

            // Add user message to store with unique ID
            const userMessage = {
                id: `user-${Date.now()}`,
                role: 'user',
                content: inputValue,
                timestamp: new Date().toISOString(),
                conversationId: currentConversationId
            };
            console.log('🔧 DEBUG: Adding user message (from text) - will be persisted to ChatStorageService:', userMessage);
            dispatch({ type: 'ADD_MESSAGE', payload: userMessage });

            // Create assistant message placeholder for streaming
            const assistantMessage = {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: '',
                timestamp: new Date().toISOString(),
                isStreaming: true,
                conversationId: currentConversationId
            };
            dispatch({ type: 'ADD_MESSAGE', payload: assistantMessage });
            dispatch({ type: 'START_THINKING' });

            // Clear input immediately for better UX
            const messageToProcess = inputValue;
            setInputValue('');

            // Create new AbortController for this request
            streamController.current = new AbortController();

            try {
                // Process message through agent with conversation ID
                await ipcRenderer.invoke('process-message', messageToProcess, currentConversationId);
            } catch (error) {
                console.error('Error processing message:', error);
                // Mark the assistant message as failed
                dispatch({ 
                    type: 'MARK_MESSAGE_FAILED', 
                    payload: { 
                        messageId: assistantMessage.id, 
                        error: error instanceof Error ? error.message : 'Unknown error occurred' 
                    } 
                });
                dispatch({ type: 'STOP_THINKING' });
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
        const handleStreamChunk = (_: any, data: { chunk: string, conversationId: string }) => {
            if (data.conversationId === currentConversationId) {
                // Process the chunk for thinking tokens
                const processed = thinkingTokenHandler.processChunk(data.chunk, currentConversationId);

                // Add any extracted thinking blocks to Redux with proper association
                processed.thinkingBlocks.forEach(block => {
                    // Associate thinking block with the current assistant message
                    const enhancedBlock = {
                        ...block,
                        messageId: `assistant-${Date.now()}`, // Will be updated to actual message ID
                        conversationId: currentConversationId
                    };
                    dispatch({ type: 'ADD_THINKING_BLOCK', payload: enhancedBlock });
                });

                // Append the display content to the current assistant message
                if (processed.displayContent) {
                    dispatch({ type: 'APPEND_TO_LAST_ASSISTANT_MESSAGE', payload: processed.displayContent });
                }
            }
        };

        const handleStreamComplete = (_: any, data: { conversationId: string }) => {
            if (data.conversationId === currentConversationId) {
                // Finalize any open thinking blocks
                const finalizedBlocks = thinkingTokenHandler.finalizeThinkingBlocks(
                    thinkingBlocks.filter((block: any) => !block.endTime)
                );
                finalizedBlocks.forEach((block: any) => {
                    dispatch({ type: 'UPDATE_THINKING_BLOCK', payload: block });
                });

                // Process the final message content for code blocks
                const lastMessage = messages[messages.length - 1];
                if (lastMessage && lastMessage.role === 'assistant' && lastMessage.content) {
                    const processed = ContentProcessor.processMessageContent(
                        lastMessage.content,
                        lastMessage.id,
                        currentConversationId
                    );
                    
                    if (processed.hasCodeBlocks) {
                        console.log('🔧 DEBUG: Processing code blocks for completed message');
                        dispatch({ 
                            type: 'UPDATE_LAST_ASSISTANT_MESSAGE', 
                            payload: { 
                                content: processed.displayContent, 
                                hasCodeBlocks: processed.hasCodeBlocks 
                            } 
                        });
                    }
                }

                // Mark assistant message as complete
                dispatch({ type: 'COMPLETE_ASSISTANT_MESSAGE' });
                dispatch({ type: 'STOP_THINKING' });
            }
        };

        const handleStreamError = (_: any, data: { error: string, conversationId: string }) => {
            if (data.conversationId === currentConversationId) {
                dispatch(streamError(data.error));
                dispatch({ type: 'STOP_THINKING' });
                
                // Find the last assistant message and mark it as failed
                const lastAssistantMessage = messages.find(msg => 
                    msg.role === 'assistant' && msg.conversationId === currentConversationId && msg.isStreaming
                );
                
                if (lastAssistantMessage) {
                    dispatch({ 
                        type: 'MARK_MESSAGE_FAILED', 
                        payload: { 
                            messageId: lastAssistantMessage.id, 
                            error: data.error 
                        } 
                    });
                }
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

    // Add keyboard shortcut to test wake word detection
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Press Ctrl/Cmd + W to simulate wake word detection
            if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
                e.preventDefault();
                console.log('🎤 Simulating wake word detection via keyboard shortcut');
                // Trigger the same event as the IPC
                document.dispatchEvent(new CustomEvent('test-wake-word'));
            }
        };

        const handleTestWakeWord = async () => {
            console.log('🎤 Test wake word triggered');
            setWakeWordDetected(true);
            playSound('activation');

            try {
                await handleMicClick();
                console.log('🎤 handleMicClick completed after test wake word');
            } catch (error) {
                console.error('🎤 Error in handleMicClick after test wake word:', error);
            }

            // Reset wake word detected state after visual feedback
            setTimeout(() => {
                setWakeWordDetected(false);
            }, 2000);
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('test-wake-word', handleTestWakeWord);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('test-wake-word', handleTestWakeWord);
        };
    }, []);

    // Show loading screen with just the blob
    if (isAppLoading) {
        return (
            <ThemeProvider>
                <CssBaseline />
                <div style={{ 
                    width: '100vw', 
                    height: '100vh', 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center',
                    backgroundColor: 'var(--background)' 
                }}>
                    <div style={{ position: "relative", width: "200px", height: "200px" }}>
                        <SoundReactiveBlob isActive={true} />
                    </div>
                </div>
            </ThemeProvider>
        );
    }

    return (
        <ThemeProvider>
            <CssBaseline />
            <div className="app-container">
                <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
                    <div className="sidebar-content">
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
                </div>
            <div className="main-content">
                <div className="window-controls" >
                    {/* Compact blob at top after first message */}
                    {messages.length > 0 && (
                        <div className="compact-blob-container">
                            <div style={{ position: "relative", width: "32px", height: "32px" }}>
                                <SoundReactiveBlob isActive={isSpeaking || isRecording || isLiveListening} />
                            </div>
                        </div>
                    )}
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
                    
                    {/* Wake Word Status Indicator */}
                    <IconButton
                        className={`wake-word-indicator ${
                            wakeWordDetected ? 'detected' : 
                            isLiveListening ? 'listening' : 
                            wakeWordActive ? 'active' : 'inactive'
                        }`}
                        title={
                            wakeWordDetected ? 'Wake word detected!' :
                            isLiveListening ? 'Live transcription active' :
                            wakeWordActive ? 'Wake word listening' : 'Wake word inactive'
                        }
                        size="small"
                        onClick={() => {
                            // Manual wake word trigger for testing
                            console.log('🎤 Manual wake word trigger');
                            document.dispatchEvent(new CustomEvent('test-wake-word'));
                        }}
                    >
                        <WakeWordIcon fontSize="small" />
                    </IconButton>
                    
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
                    <ThemeToggle variant="icon" />
                </div>

                <div className="chat-container">
                    <div className="chat-messages-container">
                        <div className="chat-messages" style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column-reverse' }}>
                            {/* Show sound reactive circle when no messages and no current input */}
                            {messages.length === 0 && (
                                <div style={{ display: 'flex', justifyContent: 'center', flexDirection: "column", alignItems: 'center', height: '100%' }}>
                                    <div>
                                        <div style={{ position: "relative", width: "200px", height: "200px" }}>
                                            <SoundReactiveBlob isActive={isLiveListening} />
                                        </div>
                                    </div>
                                    <div style={{ maxWidth: '600px', textAlign: 'center', padding: '0 20px' }}>
                                        {/* Show live transcription if available */}
                                        {liveTranscript && (
                                            <div style={{ 
                                                background: 'var(--surface)', 
                                                padding: '10px 15px', 
                                                borderRadius: '20px', 
                                                margin: '10px 0',
                                                fontSize: '14px',
                                                color: 'var(--text-secondary)',
                                                fontStyle: 'italic'
                                            }}>
                                                "{liveTranscript}"
                                            </div>
                                        )}
                                        {settings?.profile?.name && shouldShowWelcome(settings.profile.name, settings.profile.hasCompletedSetup) ? (
                                            <div>
                                                <h2 style={{ marginBottom: '10px' }}>Welcome!</h2>
                                                <p style={{ fontSize: '16px', lineHeight: '1.5', color: 'var(--text-secondary)' }}>
                                                    {getWelcomeMessage(settings.profile.name)}
                                                </p>
                                            </div>
                                        ) : settings?.profile?.name ? (
                                            <h2>{getPersonalizedMessage(settings.profile.name, 'greeting')}</h2>
                                        ) : (
                                            <h2>How can I assist you today?</h2>
                                        )}
                                        {isLiveListening && !liveTranscript && (
                                            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '10px' }}>
                                                Say "Hi Cindy" to start recording...
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                            {[...messages].reverse().map((msg: any, index: number) => {
                                const messageClass = `message ${msg.role} ${msg.isStreaming ? 'streaming' : ''} ${isSpeaking && msg.role === 'assistant' ? 'speaking' : ''} ${isListening ? 'listening' : ''}`;

                                // Get thinking blocks associated with this specific message
                                // For older chats, associate thinking blocks with assistant messages based on timestamp proximity
                                const associatedBlocks = thinkingBlocks.filter((block: any) => {
                                    // Direct association by messageId (new messages)
                                    if (block.messageId === msg.id) {
                                        return true;
                                    }
                                    
                                    // For assistant messages without direct association, use timestamp-based matching
                                    if (msg.role === 'assistant' && !block.messageId) {
                                        // Check if this is the closest assistant message to the thinking block
                                        const msgTime = new Date(msg.timestamp).getTime();
                                        const blockTime = new Date(block.startTime).getTime();
                                        const timeDiff = Math.abs(msgTime - blockTime);
                                        
                                        // Associate if within 30 seconds and no other assistant message is closer
                                        if (timeDiff <= 30000) { // 30 seconds
                                            const otherAssistantMessages = messages.filter((m: any) => 
                                                m.role === 'assistant' && m.id !== msg.id && m.timestamp
                                            );
                                            
                                            const isClosest = otherAssistantMessages.every((otherMsg: any) => {
                                                const otherMsgTime = new Date(otherMsg.timestamp).getTime();
                                                const otherTimeDiff = Math.abs(otherMsgTime - blockTime);
                                                return timeDiff <= otherTimeDiff;
                                            });
                                            
                                            return isClosest;
                                        }
                                    }
                                    
                                    // Fallback: associate with current streaming message (for live messages)
                                    return !block.messageId && msg.role === 'assistant' && msg.isStreaming;
                                });

                                return (
                                    <div
                                        key={msg.id || index}
                                        className={messageClass}
                                    >
                                        <div className="message-avatar">
                                            {msg.role === 'user' ? '👤' : '🤖'}
                                        </div>
                                        <div className="message-content">
                                            {msg.role === 'assistant' && (
                                                <>
                                                    {/* Render thinking blocks before assistant content */}
                                                    {associatedBlocks.map((block: any) => (
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
                                                </>
                                            )}

                                            {/* Display the message content */}
                                            <div className="message-text">
                                                {msg.failed ? (
                                                    <div className="error-message">
                                                        <div className="error-content">
                                                            <span className="error-icon">⚠️</span>
                                                            <span className="error-text">
                                                                {msg.error || 'Something went wrong. Please try again.'}
                                                            </span>
                                                        </div>
                                                        <div className="error-actions">
                                                            <IconButton
                                                                className="retry-button"
                                                                onClick={() => {
                                                                    // Find the corresponding user message
                                                                    const messageIndex = messages.findIndex(m => m.id === msg.id);
                                                                    const userMessage = messageIndex > 0 ? messages[messageIndex - 1] : null;
                                                                    if (userMessage && userMessage.role === 'user') {
                                                                        retryMessage(msg.id, userMessage);
                                                                    }
                                                                }}
                                                                size="small"
                                                                title="Retry message"
                                                            >
                                                                <RetryIcon fontSize="small" />
                                                            </IconButton>
                                                        </div>
                                                    </div>
                                                ) : msg.hasCodeBlocks ? (
                                                    <div dangerouslySetInnerHTML={{ __html: msg.content || '' }} />
                                                ) : (
                                                    msg.content || (msg.isStreaming ? '...' : '')
                                                )}
                                                {msg.isStreaming && <span className="streaming-cursor">▋</span>}
                                                {msg.retryCount > 0 && !msg.failed && !msg.isStreaming && (
                                                    <div className="retry-indicator">
                                                        <small>Retry attempt #{msg.retryCount}</small>
                                                    </div>
                                                )}
                                            </div>
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
                            onChange={handleInputChange}
                            onKeyDown={handleKeyPress}
                            disabled={isRecording}
                        />
                        <div className="button-group">
                            <div className={`mic-button-wrapper ${isRecording ? 'is-recording' : ''} ${wakeWordDetected ? 'wake-word-detected' : ''} ${isLiveListening && !isRecording ? 'is-listening' : ''}`}>
                                <IconButton
                                    className="mic-button"
                                    onClick={handleMicClick}
                                    aria-label={isRecording ? "Stop recording" : "Start recording"}
                                    size="small"
                                >
                                    <MicIcon fontSize="small" />
                                </IconButton>
                            </div>
                            <IconButton
                                className="send-button"
                                onClick={handleSendClick}
                                aria-label="Send message"
                                size="small"
                                disabled={!inputValue.trim() || isRecording}
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
        </ThemeProvider>
    );
};

// Add accessibility attributes to the component
App.displayName = 'CindyVoiceAssistant';

export default App;