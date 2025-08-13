import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { thinkingTokenHandler } from './services/ThinkingTokenHandler';
import { toolTokenHandler } from './services/ToolTokenHandler';
import ThinkingBlock from './components/ThinkingBlock';
import ToolBlock from './components/ToolBlock';
import ContentProcessor from './utils/contentProcessor';
import { renderTextWithLinks, hasLinks } from './utils/linkParser';
import { renderMarkdown, hasMarkdown } from './utils/markdownRenderer';
import { renderTextWithColoredHashtags, hasHashtags } from './utils/hashtagRenderer';
import HashtagManager from './components/HashtagManager';
// SoundReactiveCircle was imported but not used in the component
// The component now uses SoundReactiveBlob instead
import SoundReactiveBlob from './components/SoundReactiveBlob';
import useDocumentDetection from './hooks/useDocumentDetection';
import ModernSettingsPanel from './components/ModernSettingsPanel';
import ModernDatabasePanel from './components/ModernDatabasePanel';
import ChatDocumentPanel from './components/ChatDocumentPanel';
import ThemeToggle from './components/ThemeToggle';
import { ThemeProvider } from './contexts/ThemeContext';
import { getSettings } from '../store/actions';
import { toggleSettings } from '../store/actions';
import { hideDocument, showDocument } from '../store/actions';
import { streamError } from '../store/actions';
import { getWelcomeMessage, getPersonalizedMessage, shouldShowWelcome } from './utils/personalizedMessages';
import './styles/main.css';
import './styles/database-sidebar.css';
import { ipcRenderer } from 'electron';
import ChatList from './components/ChatList';
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
    Refresh as RetryIcon,
    PlayArrow as PlayIcon,
    Stop as StopIcon,
    ContentCopy as CopyIcon,
    Description as DocumentIcon
} from '@mui/icons-material';

const App: React.FC = () => {
    const dispatch = useDispatch();
    const showSettings = useSelector((state: any) => state.ui.showSettings);
    const showDatabase = useSelector((state: any) => state.ui.showDatabase);
    const showDocumentPanel = useSelector((state: any) => state.ui.showDocumentPanel);
    const currentDocument = useSelector((state: any) => state.ui.currentDocument);
    // const thinkingStartTime = useSelector((state: any) => state.ui.thinkingStartTime);
    const thinkingBlocks = useSelector((state: any) => state.messages?.thinkingBlocks || []);
    const toolCalls = useSelector((state: any) => state.messages?.toolCalls || []);
    const settings = useSelector((state: any) => state.settings);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const isListening = false; // No longer used for real-time transcription, kept for display compatibility
    const [inputValue, setInputValue] = useState('');
    const messages = useSelector((state: any) => state.messages?.messages || []);
    const [currentConversationId, setCurrentConversationId] = useState<string | undefined>(undefined);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isAppLoading, setIsAppLoading] = useState(true);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [isTTSPlaying, setIsTTSPlaying] = useState(false);
    const [currentTTSMessage, setCurrentTTSMessage] = useState<string | null>(null);
    const [isInputExpanded, setIsInputExpanded] = useState(false);
    const [activeHashtags, setActiveHashtags] = useState<string[]>([]);
    const audioContext = useRef<AudioContext | null>(null);
    const sounds = useRef<Record<string, AudioBuffer>>({});
    const streamController = useRef<AbortController | null>(null);
    const { detectAndShowDocuments } = useDocumentDetection();
    const settingsSidebarRef = useRef<HTMLDivElement>(null);
    const databaseSidebarRef = useRef<HTMLDivElement>(null);
    const chatMessagesRef = useRef<HTMLDivElement>(null);
    const [availableDocuments, setAvailableDocuments] = useState<any[]>([]);

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
                // Get ALL messages without any filtering (duplicates, ordering fixes, etc.)
                // To use filtered messages (with cleanup), change to: 'load-conversation'
                const messages = await ipcRenderer.invoke('load-all-conversation-messages', currentConversationId);
                console.log('📝 Loading ALL unfiltered messages:', messages.length, 'messages found');

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

        // Hide loading screen after a delay with transition effect
        const timer = setTimeout(() => {
            setIsTransitioning(true);
            // Wait for transition to start, then load the app
            setTimeout(() => {
                setIsAppLoading(false);
                setIsTransitioning(false);
            }, 800); // Allow time for transition animation
        }, 2000); // Show loading blob for 2 seconds

        return () => clearTimeout(timer);
    }, [dispatch]);


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

    // Auto-scroll to bottom when new messages are added
    useEffect(() => {
        if (chatMessagesRef.current && messages.length > 0) {
            const scrollContainer = chatMessagesRef.current;
            // Scroll to bottom smoothly
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
    }, [messages.length]);

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
        console.log('🎤 handleMicClick called, current state:', { isRecording, isListening });

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
                        const chatID = currentConversationId || getNewConversationId();
                        // Handle the transcribed text by sending it as a message
                        if (transcript.trim()) {
                            // Combine transcript with active hashtags
                            let messageContent = transcript;
                            if (activeHashtags.length > 0) {
                                const hashtagsToAdd = activeHashtags.filter(tag =>
                                    !messageContent.toLowerCase().includes(tag.toLowerCase())
                                );
                                if (hashtagsToAdd.length > 0) {
                                    messageContent = hashtagsToAdd.join(' ') + ' ' + messageContent;
                                }
                            }

                            // User message will be saved by backend during processing
                            // Don't add to frontend store here to prevent duplicates

                            // Create assistant message placeholder for streaming
                            const assistantMessageId = `assistant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                            const assistantMessage = {
                                id: assistantMessageId,
                                role: 'assistant',
                                content: '',
                                timestamp: Date.now(),
                                isStreaming: true,
                                conversationId: chatID
                            };
                            dispatch({ type: 'ADD_MESSAGE', payload: assistantMessage });
                            dispatch({ type: 'START_THINKING' });
                            setInputValue(''); // Clear input field after sending
                            setActiveHashtags([]); // Clear hashtags after sending

                            try {
                                // Process message through agent with conversation ID
                                await ipcRenderer.invoke('process-message', transcript, chatID);
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
                        if (chatID !== currentConversationId) {
                            setCurrentConversationId(chatID);
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

    const getNewConversationId = () => {
        return Date.now().toString();
    }

    // Handle send button click
    const handleSendClick = async () => {
        if (inputValue.trim()) {
            // Only play recording activation sound, no other sound effects
            const convID = currentConversationId || getNewConversationId();

            // Combine input with active hashtags
            let messageContent = inputValue;
            if (activeHashtags.length > 0) {
                // Add hashtags to message if they're not already in the text
                const hashtagsToAdd = activeHashtags.filter(tag =>
                    !messageContent.toLowerCase().includes(tag.toLowerCase())
                );
                if (hashtagsToAdd.length > 0) {
                    messageContent = hashtagsToAdd.join(' ') + ' ' + messageContent;
                }
            }

            // Clear input immediately for better UX
            const messageToProcess = messageContent;  // Use the content with hashtags
            setInputValue('');
            setActiveHashtags([]); // Clear hashtags after sending

            // IMMEDIATE UI UPDATE: Add user message to UI immediately for better UX
            const userMessage = {
                id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                role: 'user',
                content: messageToProcess,
                timestamp: Date.now(),
                conversationId: convID
            };
            dispatch({ type: 'ADD_MESSAGE', payload: userMessage });
            
            // Create assistant message placeholder immediately
            const assistantMessageId = `assistant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const assistantMessage = {
                id: assistantMessageId,
                role: 'assistant',
                content: '',
                timestamp: Date.now() + 1, // Ensure it's after user message
                isStreaming: true,
                conversationId: convID
            };
            dispatch({ type: 'ADD_MESSAGE', payload: assistantMessage });
            dispatch({ type: 'START_THINKING' });

            // Create new AbortController for this request
            streamController.current = new AbortController();

            try {
                // Process message through agent with conversation ID
                await ipcRenderer.invoke('process-message', messageToProcess, convID);
            } catch (error) {
                console.error('Error processing message:', error);
                // Find and mark the last assistant message as failed
                const lastAssistantMsg = messages.filter((m: any) => 
                    m.role === 'assistant' && m.conversationId === convID
                ).pop();
                
                if (lastAssistantMsg) {
                    dispatch({
                        type: 'MARK_MESSAGE_FAILED',
                        payload: {
                            messageId: lastAssistantMsg.id,
                            error: error instanceof Error ? error.message : 'Unknown error occurred'
                        }
                    });
                }
                dispatch({ type: 'STOP_THINKING' });
            }
            if (convID !== currentConversationId) {
                setCurrentConversationId(convID);
            }
        }
    };

    // Document handling functions
    const loadAvailableDocuments = async () => {
        try {
            const databasePath = settings?.database?.path;
            if (!databasePath) return;
            
            const result = await ipcRenderer.invoke('vector-store:get-indexed-items', databasePath);
            if (result.success) {
                setAvailableDocuments(result.items || []);
            }
        } catch (error) {
            console.error('Error loading documents:', error);
        }
    };

    const handleShowDocument = (document: any) => {
        dispatch(showDocument(document));
    };

    // Load documents when component mounts or database path changes
    useEffect(() => {
        loadAvailableDocuments();
    }, [settings?.database?.path]);

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
                // FINALIZE STREAMING MESSAGE: Set isStreaming to false for the last assistant message
                const streamingMessage = messages.find((msg: any) => 
                    msg.role === 'assistant' && msg.conversationId === currentConversationId && msg.isStreaming
                );
                
                if (streamingMessage) {
                    dispatch({ 
                        type: 'FINALIZE_STREAMING_MESSAGE', 
                        payload: { 
                            messageId: streamingMessage.id,
                            conversationId: currentConversationId
                        } 
                    });
                    console.log('📝 FINALIZED MESSAGE: Set isStreaming to false for message:', streamingMessage.id);
                }

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

                // Process the final message content for code blocks and document detection
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

                    // Detect and auto-show documents mentioned in the AI response
                    try {
                        console.log('🔍 DEBUG: Detecting documents in completed AI response');
                        detectAndShowDocuments(lastMessage.content).then(detectedDocs => {
                            if (detectedDocs.length > 0) {
                                console.log('🔍 DEBUG: Auto-detected', detectedDocs.length, 'documents from AI response');
                            }
                        }).catch(error => {
                            console.warn('🔍 DEBUG: Document detection failed:', error);
                        });
                    } catch (error) {
                        console.warn('🔍 DEBUG: Document detection error:', error);
                    }
                }

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

        // Handle user message emitted from backend - no longer used since frontend adds immediately
        const handleUserMessage = (_: any, data: { message: any }) => {
            // Backend no longer emits user messages - frontend handles them immediately
            console.log('Backend user-message event received (should not happen):', data.message);
        };

        ipcRenderer.on('stream-chunk', handleStreamChunk);
        ipcRenderer.on('stream-complete', handleStreamComplete);
        ipcRenderer.on('stream-error', handleStreamError);
        ipcRenderer.on('tool-execution-update', handleToolExecutionUpdate);
        ipcRenderer.on('user-message', handleUserMessage);

        // Cleanup listeners on unmount
        return () => {
            ipcRenderer.off('stream-chunk', handleStreamChunk);
            ipcRenderer.off('stream-complete', handleStreamComplete);
            ipcRenderer.off('stream-error', handleStreamError);
            ipcRenderer.off('tool-execution-update', handleToolExecutionUpdate);
            ipcRenderer.off('user-message', handleUserMessage);
            if (streamController.current) {
                streamController.current.abort();
            }
        };
    }, [currentConversationId, dispatch]);

    // Handle input change with auto-resize
    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        setInputValue(value);
        setIsInputExpanded(value.length > 0 || e.target === document.activeElement);

        // Auto-resize textarea
        const textarea = e.target;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    };

    // Handle key press (Enter to send, Shift+Enter for new line)
    const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendClick();
        }
    };



    const handleInputBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
        setIsInputExpanded(inputValue.length > 0);
        // Reset height if empty
        if (!inputValue.trim()) {
            e.target.style.height = '48px';
        }
    };

    // TTS Functions
    const handlePlayMessage = async (messageContent: string) => {
        console.log('🔊 handlePlayMessage called with content:', messageContent.substring(0, 50) + '...');

        // Prevent multiple simultaneous TTS playback
        if (isTTSPlaying) {
            console.log('TTS already playing, ignoring request');
            return;
        }

        try {
            setIsTTSPlaying(true);
            setCurrentTTSMessage(messageContent);
            console.log('Playing message with TTS:', messageContent.substring(0, 50) + '...');
            const result = await ipcRenderer.invoke('tts-synthesize-and-play', messageContent);

            if (!result.success) {
                console.error('TTS playback failed:', result.error);
                // Optionally show error to user
            }
        } catch (error) {
            console.error('Error playing message:', error);
        } finally {
            setIsTTSPlaying(false);
            setCurrentTTSMessage(null);
        }
    };

    const handleStopTTS = async () => {
        console.log('🛑 handleStopTTS called');
        try {
            await ipcRenderer.invoke('tts-stop');
            setIsTTSPlaying(false);
            setCurrentTTSMessage(null);
        } catch (error) {
            console.error('Error stopping TTS:', error);
            // Force reset state even if IPC fails
            setIsTTSPlaying(false);
            setCurrentTTSMessage(null);
        }
    };

    const handleCopyMessage = async (messageContent: string) => {
        try {
            await navigator.clipboard.writeText(messageContent);
            console.log('Message copied to clipboard');
            // Optionally show success notification
        } catch (error) {
            console.error('Failed to copy message:', error);
            // Fallback for older browsers  
            const textArea = document.createElement('textarea');
            textArea.value = messageContent;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
            } catch (e) {
                console.warn('Copy fallback failed:', e);
            }
            document.body.removeChild(textArea);
            console.log('Message copied to clipboard (fallback)');
        }
    };


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
                    backgroundColor: 'var(--background)',
                    transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: isTransitioning ? 'scale(0.7) translateY(20vh)' : 'scale(1) translateY(0)',
                    opacity: isTransitioning ? 0 : 1
                }}>
                    <div style={{ 
                        position: "relative", 
                        width: "280px", 
                        height: "280px",
                        transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}>
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
                                    <SoundReactiveBlob isActive={isSpeaking || isRecording} />
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
                            className={`document-button ${showDocumentPanel ? 'active' : ''}`}
                            onClick={() => {
                                if (showDocumentPanel) {
                                    dispatch(hideDocument());
                                } else if (availableDocuments.length > 0) {
                                    handleShowDocument(availableDocuments[0]);
                                } else {
                                    // If no documents, show message to user to index documents first
                                    console.log('No documents available. Please index documents from the database panel first.');
                                    // Could also show a toast notification here
                                }
                            }}
                            aria-label={showDocumentPanel ? "Hide document" : "Show retrieved files"}
                            size="small"
                        >
                            <DocumentIcon fontSize="small" />
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

                    <div className="chat-container" style={{ 
                        display: 'flex', 
                        height: '100%',
                        gap: showDocumentPanel ? '12px' : '0'
                    }}>
                        {/* Chat area - adjust width when document panel is open */}
                        <div 
                            className="chat-messages-container"
                            style={{
                                flex: showDocumentPanel ? '1 1 60%' : '1 1 100%',
                                minWidth: 0,
                                display: 'flex',
                                flexDirection: 'column',
                            }}
                        >
                            <div
                                ref={chatMessagesRef}
                                className="chat-messages"
                                style={{ 
                                    flex: 1, 
                                    overflowY: 'auto', 
                                    display: 'flex', 
                                    flexDirection: 'column'
                                }}
                            >
                                {/* Show sound reactive circle when no messages and no current input */}
                                {messages.length === 0 && (
                                    <div style={{ 
                                        display: 'flex', 
                                        justifyContent: 'center', 
                                        flexDirection: "column", 
                                        alignItems: 'center', 
                                        height: '100%', 
                                        gap: '32px',
                                        animation: 'fadeInUp 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards'
                                    }}>
                                        <div>
                                            <div style={{ 
                                                position: "relative", 
                                                width: "280px", 
                                                height: "280px",
                                                transform: 'scale(0.7)',
                                                animation: 'blobEntrance 0.8s cubic-bezier(0.4, 0, 0.2, 1) 0.2s forwards'
                                            }}>
                                                <SoundReactiveBlob isActive={true} />
                                            </div>
                                        </div>
                                        <div style={{ maxWidth: '600px', textAlign: 'center', padding: '0 20px' }}>
                                            {settings?.profile?.name && shouldShowWelcome(settings.profile.name, settings.profile.hasCompletedSetup) ? (
                                                <div>
                                                    <h2 style={{ marginBottom: '10px' }}>Welcome!</h2>
                                                    <p style={{ fontSize: '16px', lineHeight: '1.5', color: 'var(--text-secondary)', marginBottom: '32px' }}>
                                                        {welcomeMessage}
                                                    </p>
                                                </div>
                                            ) : (
                                                <h2 style={{ marginBottom: '32px' }}>{personalizedGreeting}</h2>
                                            )}

                                            {/* Input area when no messages */}
                                            <div className={`welcome-input-area ${isInputExpanded ? 'expanded' : ''}`}>
                                                {/* Hashtag Manager */}
                                                <HashtagManager
                                                    inputValue={inputValue}
                                                    onHashtagsChange={setActiveHashtags}
                                                />

                                                <div className="welcome-input-row">
                                                    <textarea
                                                        value={inputValue}
                                                        onChange={handleInputChange}
                                                        onKeyDown={handleKeyPress}
                                                        onBlur={handleInputBlur}
                                                        placeholder="Type your message (try #search, #read, #write)... Press Shift+Enter for new line"
                                                        disabled={isRecording}
                                                        className={`message-input ${inputValue.length > 0 ? 'has-content' : ''}`}
                                                        style={{
                                                            flex: 1,
                                                            marginRight: '12px',
                                                            fontFamily: 'inherit',
                                                            resize: 'none',
                                                            minHeight: '40px',
                                                            maxHeight: '200px',
                                                            width: "500px",
                                                            overflow: 'hidden',
                                                            wordWrap: 'break-word',
                                                            whiteSpace: 'pre-wrap',
                                                            fontSize: '16px',
                                                            padding: '12px 16px'
                                                        }}
                                                    />
                                                    <div className={`mic-button-wrapper ${isRecording ? 'is-recording' : ''} ${!isRecording ? 'is-listening' : ''}`}>
                                                        <IconButton
                                                            className="mic-button"
                                                            onClick={handleMicClick}
                                                            aria-label={isRecording ? "Stop recording" : "Start recording"}
                                                            size="large"
                                                            sx={{
                                                                width: '48px',
                                                                height: '48px',
                                                                backgroundColor: isRecording ? '#dc3545' : '#28a745',
                                                                color: 'white',
                                                                '&:hover': {
                                                                    backgroundColor: isRecording ? '#c82333' : '#218838'
                                                                }
                                                            }}
                                                        >
                                                            <MicIcon fontSize="large" />
                                                        </IconButton>
                                                    </div>
                                                    <IconButton
                                                        className="send-button"
                                                        onClick={handleSendClick}
                                                        aria-label="Send message"
                                                        size="large"
                                                        disabled={!inputValue.trim() || isRecording}
                                                        sx={{
                                                            width: '52px',
                                                            height: '52px',
                                                            backgroundColor: '#007ACC',
                                                            color: 'white',
                                                            '&:hover': {
                                                                backgroundColor: '#005A9E'
                                                            }
                                                        }}
                                                    >
                                                        <SendIcon fontSize="medium" />
                                                    </IconButton>

                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {[...messages].sort((a, b) => a.timestamp - b.timestamp).map((msg: any, index: number) => {
                                    const messageClass = `message ${msg.role} ${msg.isStreaming ? 'streaming' : ''} ${isSpeaking && msg.role === 'assistant' ? 'speaking' : ''} ''}`;
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
                                                        {/* Render thinking blocks and tool calls in chronological order */}
                                                        {(() => {
                                                            // Combine thinking blocks and tool calls, then sort chronologically
                                                            const allItems = [
                                                                ...associatedBlocks.map((block: any) => ({
                                                                    ...block,
                                                                    type: 'thinking',
                                                                    timestamp: block.startTime || block.timestamp || 0
                                                                })),
                                                                ...associatedToolCalls.map((toolCall: any) => ({
                                                                    ...toolCall,
                                                                    type: 'tool',
                                                                    timestamp: toolCall.startTime || toolCall.timestamp || 0
                                                                }))
                                                            ];
                                                            
                                                            // Sort by timestamp for proper chronological order
                                                            allItems.sort((a, b) => a.timestamp - b.timestamp);
                                                            
                                                            return allItems.map((item: any) => {
                                                                if (item.type === 'thinking') {
                                                                    return (
                                                                        <ThinkingBlock
                                                                            key={item.id}
                                                                            id={item.id}
                                                                            content={item.content}
                                                                            startTime={item.startTime}
                                                                            endTime={item.endTime}
                                                                            duration={item.duration}
                                                                            defaultOpen={false}
                                                                            isIncomplete={item.isIncomplete || false}
                                                                            isStreaming={item.isStreaming || false}
                                                                        />
                                                                    );
                                                                } else {
                                                                    return (
                                                                        <ToolBlock
                                                                            key={item.id}
                                                                            toolCall={item}
                                                                            defaultOpen={false}
                                                                        />
                                                                    );
                                                                }
                                                            });
                                                        })()}
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
                                                        // Enhanced rendering for user and AI messages with hashtag, markdown and link support
                                                        msg.content && hasHashtags(msg.content) ? (
                                                            // Render hashtags with colored oval styling
                                                            renderTextWithColoredHashtags(msg.content)
                                                        ) : msg.role === 'assistant' && msg.content && hasMarkdown(msg.content) ? (
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

                                                    {/* Play/Stop and Copy buttons for assistant messages */}
                                                    {msg.role === 'assistant' && msg.content && !msg.isStreaming && !msg.failed && (
                                                        <div className="message-actions" style={{
                                                            marginTop: '8px',
                                                            display: 'flex',
                                                            gap: '8px',
                                                            alignItems: 'center',
                                                            opacity: 0.7,
                                                            fontSize: '12px'
                                                        }}>
                                                            {/* Show Stop button if TTS is playing this message, otherwise show Play button */}
                                                            {isTTSPlaying && currentTTSMessage === msg.content ? (
                                                                <IconButton
                                                                    onClick={handleStopTTS}
                                                                    size="small"
                                                                    title="Stop text-to-speech playback"
                                                                    style={{
                                                                        padding: '4px',
                                                                        backgroundColor: 'rgba(220, 53, 69, 0.1)',
                                                                        borderRadius: '4px',
                                                                        color: '#dc3545'
                                                                    }}
                                                                >
                                                                    <StopIcon fontSize="small" />
                                                                </IconButton>
                                                            ) : (
                                                                <IconButton
                                                                    onClick={() => handlePlayMessage(msg.content)}
                                                                    size="small"
                                                                    title="Play message with text-to-speech"
                                                                    disabled={isTTSPlaying}
                                                                    style={{
                                                                        padding: '4px',
                                                                        backgroundColor: isTTSPlaying ? 'rgba(0, 0, 0, 0.02)' : 'rgba(0, 0, 0, 0.05)',
                                                                        borderRadius: '4px',
                                                                        opacity: isTTSPlaying ? 0.5 : 1
                                                                    }}
                                                                >
                                                                    <PlayIcon fontSize="small" />
                                                                </IconButton>
                                                            )}
                                                            <IconButton
                                                                onClick={() => handleCopyMessage(msg.content)}
                                                                size="small"
                                                                title="Copy message to clipboard"
                                                                style={{
                                                                    padding: '4px',
                                                                    backgroundColor: 'rgba(0, 0, 0, 0.05)',
                                                                    borderRadius: '4px'
                                                                }}
                                                            >
                                                                <CopyIcon fontSize="small" />
                                                            </IconButton>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Only show input area at bottom when there are messages */}
                            {messages.length > 0 && (
                                <div className="input-area" style={{ alignItems: "center" }}>
                                    {/* Hashtag Manager */}
                                    <HashtagManager
                                        inputValue={inputValue}
                                        onHashtagsChange={setActiveHashtags}
                                    />

                                    <textarea
                                        placeholder="Type your message... Press Shift+Enter for new line"
                                        className="message-input"
                                        value={inputValue}
                                        onChange={handleInputChange}
                                        onKeyDown={handleKeyPress}
                                        onBlur={handleInputBlur}
                                        disabled={isRecording}
                                        style={{
                                            fontFamily: 'inherit',
                                            resize: 'none',
                                            minHeight: '40px',
                                            maxHeight: '200px',
                                            width: "400px",
                                            overflow: 'hidden',
                                            wordWrap: 'break-word',
                                            whiteSpace: 'pre-wrap',
                                            fontSize: '16px',
                                            padding: '12px 16px'
                                        }}
                                    />
                                    <div className="button-group">
                                        <div className={`mic-button-wrapper ${isRecording ? 'is-recording' : ''} ${!isRecording ? 'is-listening' : ''}`}>
                                            <IconButton
                                                className="mic-button"
                                                onClick={handleMicClick}
                                                aria-label={isRecording ? "Stop recording" : "Start recording"}
                                                size="large"
                                                sx={{
                                                    width: '48px',
                                                    height: '48px',
                                                    backgroundColor: isRecording ? '#dc3545' : '#28a745',
                                                    color: 'white',
                                                    '&:hover': {
                                                        backgroundColor: isRecording ? '#c82333' : '#218838'
                                                    }
                                                }}
                                            >
                                                <MicIcon fontSize="medium" />
                                            </IconButton>
                                        </div>
                                        <IconButton
                                            className="send-button"
                                            onClick={handleSendClick}
                                            aria-label="Send message"
                                            size="large"
                                            disabled={!inputValue.trim() || isRecording}
                                            sx={{
                                                width: '48px',
                                                height: '48px',
                                                backgroundColor: '#007ACC',
                                                color: 'white',
                                                '&:hover': {
                                                    backgroundColor: '#005A9E'
                                                }
                                            }}
                                        >
                                            <SendIcon fontSize="medium" />
                                        </IconButton>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Document panel - shows when a document is selected */}
                        {showDocumentPanel && currentDocument && (
                            <div style={{
                                flex: '1 1 40%',
                                minWidth: '300px',
                                maxWidth: '500px',
                                height: '100%',
                                overflow: 'hidden',
                            }}>
                                <ChatDocumentPanel 
                                    document={currentDocument}
                                    onClose={() => dispatch(hideDocument())}
                                />
                            </div>
                        )}
                    </div>


                    {/* Dark overlay when sidebars are open */}
                    {(showSettings || showDatabase) && (
                        <div className="sidebar-overlay" />
                    )}

                    <div ref={settingsSidebarRef} className={`settings-sidebar-container ${showSettings ? 'open' : ''}`}>
                        <ModernSettingsPanel />
                    </div>
                    <div ref={databaseSidebarRef} className={`database-sidebar-container ${showDatabase ? 'open' : ''}`}>
                        <ModernDatabasePanel />
                    </div>
                </div>
            </div>
        </ThemeProvider>
    );
};

// Add accessibility attributes to the component
App.displayName = 'CindyVoiceAssistant';

export default App;