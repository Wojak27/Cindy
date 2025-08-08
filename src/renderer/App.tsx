import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { thinkingTokenHandler } from './services/ThinkingTokenHandler';
import { toolTokenHandler } from './services/ToolTokenHandler';
import ThinkingBlock from './components/ThinkingBlock';
import ToolBlock from './components/ToolBlock';
import ContentProcessor from './utils/contentProcessor';
import { renderTextWithLinks, hasLinks } from './utils/linkParser';
import { renderMarkdown, hasMarkdown } from './utils/markdownRenderer';
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
import { simpleLiveTranscriptionService } from './services/SimpleLiveTranscriptionService';
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
    Refresh as RetryIcon
} from '@mui/icons-material';

const App: React.FC = () => {
    const dispatch = useDispatch();
    const showSettings = useSelector((state: any) => state.ui.showSettings);
    const showDatabase = useSelector((state: any) => state.ui.showDatabase);
    // const thinkingStartTime = useSelector((state: any) => state.ui.thinkingStartTime);
    const thinkingBlocks = useSelector((state: any) => state.messages?.thinkingBlocks || []);
    const toolCalls = useSelector((state: any) => state.messages?.toolCalls || []);
    const settings = useSelector((state: any) => state.settings);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const isListening = false; // No longer used for real-time transcription, kept for display compatibility
    const [inputValue, setInputValue] = useState('');
    const messages = useSelector((state: any) => state.messages?.messages || []);
    const [currentConversationId, setCurrentConversationId] = useState<string>(Date.now().toString());
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isAppLoading, setIsAppLoading] = useState(true);
    const [wakeWordDetected, setWakeWordDetected] = useState(false);
    const [isLiveListening, setIsLiveListening] = useState(false);
    const audioContext = useRef<AudioContext | null>(null);
    const sounds = useRef<Record<string, AudioBuffer>>({});
    const streamController = useRef<AbortController | null>(null);
    const speechTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const settingsSidebarRef = useRef<HTMLDivElement>(null);
    const databaseSidebarRef = useRef<HTMLDivElement>(null);
    const chatMessagesRef = useRef<HTMLDivElement>(null);

    // Memoize welcome message to prevent re-calculation on every render
    const welcomeMessage = useMemo(() => {
        if (settings?.profile?.name) {
            return getWelcomeMessage(settings.profile.name);
        }
        return null;
    }, [settings?.profile?.name]);

    const personalizedGreeting = useMemo(() => {
        if (settings?.profile?.name) {
            return getPersonalizedMessage(settings.profile.name, 'greeting');
        }
        return "How can I assist you today?";
    }, [settings?.profile?.name]);

    // Load conversation history when conversation changes
    useEffect(() => {
        const loadConversationHistory = async () => {
            if (!currentConversationId) return;

            try {
                const messages = await ipcRenderer.invoke('load-conversation', currentConversationId);

                // Clear current messages, thinking blocks, and tool calls
                dispatch({ type: 'CLEAR_MESSAGES' });
                dispatch({ type: 'CLEAR_THINKING_BLOCKS' });
                dispatch({ type: 'CLEAR_TOOL_CALLS' });

                // Reset token handlers
                thinkingTokenHandler.reset();
                toolTokenHandler.reset();

                // Process existing messages for thinking tokens and code blocks
                const { updatedMessages, extractedThinkingBlocks } = ContentProcessor.processExistingMessages(
                    messages,
                    currentConversationId
                );
                console.log("Messages before processing", messages);
                console.log("Updated messages after processing:", updatedMessages);


                // Load all processed messages at once to prevent duplication
                dispatch({ type: 'LOAD_MESSAGES', payload: updatedMessages });

                // Find and scroll to latest human message after a short delay
                setTimeout(async () => {
                    try {
                        const latestHumanMessage = await ipcRenderer.invoke('get-latest-human-message', currentConversationId);

                        if (latestHumanMessage) {
                            scrollToHumanMessage(latestHumanMessage.id);
                        }
                    } catch (error) {
                        console.error('🚨 DEBUG: Error finding latest human message:', error);
                    }
                }, 500); // Wait for messages to be rendered

                // Load extracted thinking blocks as batch
                if (extractedThinkingBlocks.length > 0) {
                    dispatch({ type: 'LOAD_THINKING_BLOCKS', payload: extractedThinkingBlocks });
                }

                // Load thinking blocks for this conversation
                try {
                    const conversationThinkingBlocks = await ipcRenderer.invoke('get-thinking-blocks', currentConversationId);

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
                                        return { ...block, messageId: closestMessage.id };
                                    }
                                }
                            }
                            return block;
                        });

                        // Add all thinking blocks to the store as batch (merge with existing)
                        dispatch({ type: 'LOAD_THINKING_BLOCKS', payload: [...extractedThinkingBlocks, ...updatedBlocks] });
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

    // Memoized callback function to prevent infinite re-renders
    const onWakeWord = useCallback(() => {
        console.log('🎤 Wake word detected via live transcription!');
        setWakeWordDetected(true);
        // Trigger wake word detection event instead of calling handleMicClick directly
        document.dispatchEvent(new CustomEvent('live-wake-word-detected'));
        // Reset wake word detected state after visual feedback
        setTimeout(() => {
            setWakeWordDetected(false);
        }, 2000);
    }, []);

    // Function to scroll to a specific human message
    const scrollToHumanMessage = useCallback((messageId: number) => {
        if (!chatMessagesRef.current) return;

        // Find the message element by ID
        const messageElement = chatMessagesRef.current.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            console.log('🔧 DEBUG: Scrolling to human message:', messageId);
            messageElement.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });

            // Highlight the message briefly
            messageElement.classList.add('highlighted');
            setTimeout(() => {
                messageElement.classList.remove('highlighted');
            }, 2000);
        } else {
            console.warn('🚨 DEBUG: Could not find message element for ID:', messageId);
        }
    }, []);

    // Start live transcription when app loads
    useEffect(() => {
        const startLiveTranscription = async () => {
            try {
                await simpleLiveTranscriptionService.startLiveTranscription(onWakeWord);
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
            simpleLiveTranscriptionService.stopLiveTranscription();
        };
    }, [isAppLoading, onWakeWord]);



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
            // Stop recording
            try {
                // Stop recording - this will trigger audio data to be sent
                const audioData = await ipcRenderer.invoke('stop-recording');

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
                                timestamp: Date.now(),
                                conversationId: currentConversationId
                            };
                            dispatch({ type: 'ADD_MESSAGE', payload: userMessage });

                            // Create assistant message placeholder for streaming
                            const assistantMessage = {
                                id: `assistant-${Date.now()}`,
                                role: 'assistant',
                                content: '',
                                timestamp: Date.now(),
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
                const result = await ipcRenderer.invoke('start-recording');
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
                timestamp: Date.now(),
                conversationId: currentConversationId
            };
            dispatch({ type: 'ADD_MESSAGE', payload: userMessage });

            // Create assistant message placeholder for streaming
            const assistantMessage = {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: '',
                timestamp: Date.now(),
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
                const processedThinking = thinkingTokenHandler.processChunk(data.chunk, currentConversationId);

                // Add any extracted thinking blocks to Redux with proper association
                processedThinking.thinkingBlocks.forEach(block => {
                    // Associate thinking block with the current assistant message
                    const enhancedBlock = {
                        ...block,
                        messageId: `assistant-${Date.now()}`, // Will be updated to actual message ID
                        conversationId: currentConversationId
                    };
                    dispatch({ type: 'ADD_THINKING_BLOCK', payload: enhancedBlock });
                });

                // IMMEDIATE THINKING DISPLAY: Check for incomplete thinking blocks and show them immediately
                const incompleteBlocks = thinkingTokenHandler.getIncompleteThinkingBlocks(currentConversationId);
                incompleteBlocks.forEach(incompleteBlock => {
                    // Check if this incomplete block is already being displayed
                    const existingBlock = thinkingBlocks.find((block: any) =>
                        block.id === incompleteBlock.id && block.isIncomplete
                    );

                    if (!existingBlock) {
                        // New incomplete thinking block - show it immediately
                        const enhancedIncompleteBlock = {
                            ...incompleteBlock,
                            messageId: `assistant-${Date.now()}`,
                            conversationId: currentConversationId,
                            isIncomplete: true, // Flag to indicate this is still being processed
                            isStreaming: true   // Flag for UI animation/styling
                        };
                        dispatch({ type: 'ADD_THINKING_BLOCK', payload: enhancedIncompleteBlock });
                        console.log('🧠 IMMEDIATE THINKING: Showing incomplete thinking block:', {
                            blockId: incompleteBlock.id,
                            contentLength: incompleteBlock.content.length,
                            contentPreview: incompleteBlock.content.substring(0, 50) + '...'
                        });
                    } else {
                        // Update existing incomplete block with new content
                        const updatedBlock = {
                            ...existingBlock,
                            content: incompleteBlock.content,
                            isStreaming: true
                        };
                        dispatch({ type: 'UPDATE_THINKING_BLOCK', payload: updatedBlock });
                    }
                });

                // Process the chunk for tool calls after thinking tokens
                const processedTools = toolTokenHandler.processChunk(processedThinking.displayContent, currentConversationId);

                // Add any extracted tool calls to Redux
                processedTools.toolCalls.forEach(toolCall => {
                    const enhancedToolCall = {
                        ...toolCall,
                        messageId: `assistant-${Date.now()}`, // Will be updated to actual message ID
                        conversationId: currentConversationId
                    };
                    dispatch({ type: 'ADD_TOOL_CALL', payload: enhancedToolCall });
                });

                // Don't add incomplete blocks - they cause infinite loops
                // Incomplete blocks will be visible through the token handlers' internal state
                // and will be properly added when the closing tags are found

                // Append the display content to the current assistant message
                if (processedTools.displayContent) {
                    dispatch({ type: 'APPEND_TO_LAST_ASSISTANT_MESSAGE', payload: processedTools.displayContent });
                }
            }
        };

        const handleStreamComplete = (_: any, data: { conversationId: string }) => {
            if (data.conversationId === currentConversationId) {
                // FINALIZE INCOMPLETE THINKING BLOCKS: Convert any remaining incomplete blocks to completed ones
                const remainingIncompleteBlocks = thinkingTokenHandler.getIncompleteThinkingBlocks(currentConversationId);
                remainingIncompleteBlocks.forEach(incompleteBlock => {
                    // Find the existing incomplete block in Redux
                    const existingIncompleteBlock = thinkingBlocks.find((block: any) =>
                        block.id === incompleteBlock.id && block.isIncomplete
                    );

                    if (existingIncompleteBlock) {
                        // Mark the incomplete block as completed
                        const completedBlock = {
                            ...existingIncompleteBlock,
                            content: incompleteBlock.content, // Final content
                            endTime: Date.now(),
                            isIncomplete: false,
                            isStreaming: false,
                            duration: '00:01' // Default duration for incomplete blocks
                        };
                        dispatch({ type: 'UPDATE_THINKING_BLOCK', payload: completedBlock });
                        console.log('🧠 FINALIZED INCOMPLETE: Converted incomplete thinking block to completed:', {
                            blockId: incompleteBlock.id,
                            finalContentLength: incompleteBlock.content.length
                        });
                    }
                });

                // DON'T reset thinking token handler - this causes thinking tokens 
                // from subsequent messages to accumulate in the first thinking block
                // Only reset tool token handler which doesn't need persistent state
                toolTokenHandler.reset();

                // Finalize any open thinking blocks (for properly closed thinking blocks)
                const finalizedBlocks = thinkingTokenHandler.finalizeThinkingBlocks(
                    thinkingBlocks.filter((block: any) => !block.endTime && !block.isIncomplete)
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

        const handleToolExecutionUpdate = (_: any, data: { toolCall: any, conversationId: string }) => {
            if (data.conversationId === currentConversationId) {
                // Update existing tool call or add new one
                dispatch({ type: 'UPDATE_TOOL_CALL', payload: data.toolCall });
            }
        };

        ipcRenderer.on('stream-chunk', handleStreamChunk);
        ipcRenderer.on('stream-complete', handleStreamComplete);
        ipcRenderer.on('stream-error', handleStreamError);
        ipcRenderer.on('tool-execution-update', handleToolExecutionUpdate);

        // Cleanup listeners on unmount
        return () => {
            ipcRenderer.off('stream-chunk', handleStreamChunk);
            ipcRenderer.off('stream-complete', handleStreamComplete);
            ipcRenderer.off('stream-error', handleStreamError);
            ipcRenderer.off('tool-execution-update', handleToolExecutionUpdate);
            if (streamController.current) {
                streamController.current.abort();
            }
        };
    }, [currentConversationId, dispatch]);

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

        const handleLiveWakeWord = async () => {
            console.log('🎤 Live wake word detected');
            playSound('activation');

            try {
                await handleMicClick();
                console.log('🎤 handleMicClick completed after live wake word');
            } catch (error) {
                console.error('🎤 Error in handleMicClick after live wake word:', error);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('test-wake-word', handleTestWakeWord);
        document.addEventListener('live-wake-word-detected', handleLiveWakeWord);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('test-wake-word', handleTestWakeWord);
            document.removeEventListener('live-wake-word-detected', handleLiveWakeWord);
        };
    }, []);

    // Handle click outside to close sidebars
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            // Close settings sidebar if clicking outside
            if (showSettings && settingsSidebarRef.current && !settingsSidebarRef.current.contains(event.target as Node)) {
                dispatch(toggleSettings());
            }
            // Close database sidebar if clicking outside
            if (showDatabase && databaseSidebarRef.current && !databaseSidebarRef.current.contains(event.target as Node)) {
                dispatch({ type: 'TOGGLE_DATABASE_SIDEBAR' });
            }
        };

        if (showSettings || showDatabase) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showSettings, showDatabase, dispatch]);

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
                                    // Reset token handlers for new conversation
                                    thinkingTokenHandler.reset();
                                    toolTokenHandler.reset();
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
                                    // Reset token handlers for new conversation
                                    thinkingTokenHandler.reset();
                                    toolTokenHandler.reset();
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
                        <ThemeToggle variant="icon" />
                    </div>

                    <div className="chat-container">
                        <div className="chat-messages-container">
                            <div
                                ref={chatMessagesRef}
                                className="chat-messages"
                                style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column-reverse' }}
                            >
                                {/* Show sound reactive circle when no messages and no current input */}
                                {messages.length === 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'center', flexDirection: "column", alignItems: 'center', height: '100%' }}>
                                        <div>
                                            <div style={{ position: "relative", width: "200px", height: "200px" }}>
                                                <SoundReactiveBlob isActive={isLiveListening} />
                                            </div>
                                        </div>
                                        <div style={{ maxWidth: '600px', textAlign: 'center', padding: '0 20px' }}>
                                            {settings?.profile?.name && shouldShowWelcome(settings.profile.name, settings.profile.hasCompletedSetup) ? (
                                                <div>
                                                    <h2 style={{ marginBottom: '10px' }}>Welcome!</h2>
                                                    <p style={{ fontSize: '16px', lineHeight: '1.5', color: 'var(--text-secondary)' }}>
                                                        {welcomeMessage}
                                                    </p>
                                                </div>
                                            ) : (
                                                <h2>{personalizedGreeting}</h2>
                                            )}
                                            {isLiveListening && (
                                                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '10px' }}>
                                                    Say "Hi Cindy" to start recording...
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {[...messages].reverse().map((msg: any, index: number) => {
                                    const messageClass = `message ${msg.role} ${msg.isStreaming ? 'streaming' : ''} ${isSpeaking && msg.role === 'assistant' ? 'speaking' : ''} ${isLiveListening ? 'listening' : ''}`;
                                    console.log('Rendering message:', msg)
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

                                    // Get tool calls associated with this specific message
                                    const associatedToolCalls = toolCalls.filter((toolCall: any) => {
                                        // Direct association by messageId
                                        if (toolCall.messageId === msg.id) {
                                            return true;
                                        }

                                        // For assistant messages without direct association, use timestamp-based matching
                                        if (msg.role === 'assistant' && !toolCall.messageId) {
                                            const msgTime = new Date(msg.timestamp).getTime();
                                            const toolTime = new Date(toolCall.startTime).getTime();
                                            const timeDiff = Math.abs(msgTime - toolTime);

                                            // Associate if within 30 seconds and no other assistant message is closer
                                            if (timeDiff <= 30000) { // 30 seconds
                                                const otherAssistantMessages = messages.filter((m: any) =>
                                                    m.role === 'assistant' && m.id !== msg.id && m.timestamp
                                                );

                                                const isClosest = otherAssistantMessages.every((otherMsg: any) => {
                                                    const otherMsgTime = new Date(otherMsg.timestamp).getTime();
                                                    const otherTimeDiff = Math.abs(otherMsgTime - toolTime);
                                                    return timeDiff <= otherTimeDiff;
                                                });

                                                return isClosest;
                                            }
                                        }

                                        // Fallback: associate with current streaming message (for live messages)
                                        return !toolCall.messageId && msg.role === 'assistant' && msg.isStreaming;
                                    });

                                    return (
                                        <div
                                            key={msg.id || index}
                                            className={messageClass}
                                            data-message-id={msg.id}
                                        >
                                            <div className="message-content">
                                                {msg.role === 'assistant' && (
                                                    <>
                                                        {/* Render thinking blocks before assistant content */}
                                                        {associatedBlocks.map((block: any) => (
                                                            block.isIncomplete ? <ThinkingBlock
                                                                key={block.id}
                                                                id={block.id}
                                                                content={block.content}
                                                                startTime={block.startTime}
                                                                endTime={block.endTime}
                                                                duration={block.duration}
                                                                defaultOpen={false}
                                                                isIncomplete={block.isIncomplete || false}
                                                                isStreaming={block.isStreaming || false}
                                                            /> : <></>
                                                        ))}

                                                        {/* Render tool calls after thinking blocks */}
                                                        {associatedToolCalls.map((toolCall: any) => (
                                                            <ToolBlock
                                                                key={toolCall.id}
                                                                toolCall={toolCall}
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
                                                                        const messageIndex = messages.findIndex((m: any) => m.id === msg.id);
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
                                                        // Enhanced rendering for AI messages with markdown and link support
                                                        msg.role === 'assistant' && msg.content && hasMarkdown(msg.content) ? (
                                                            // Full markdown rendering with link previews for AI responses
                                                            renderMarkdown(msg.content)
                                                        ) : msg.content && hasLinks(msg.content) ? (
                                                            // Simple link preview for messages with links but no markdown
                                                            renderTextWithLinks(msg.content)
                                                        ) : (
                                                            // Plain text or streaming content
                                                            msg.content || (msg.isStreaming ? '...' : '')
                                                        )
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


                    {/* Dark overlay when sidebars are open */}
                    {(showSettings || showDatabase) && (
                        <div className="sidebar-overlay" />
                    )}

                    <div ref={settingsSidebarRef} className={`settings-sidebar-container ${showSettings ? 'open' : ''}`}>
                        <SettingsPanel />
                    </div>
                    <div ref={databaseSidebarRef} className={`database-sidebar-container ${showDatabase ? 'open' : ''}`}>
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