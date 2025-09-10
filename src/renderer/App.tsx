import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { thinkingTokenHandler } from './services/ThinkingTokenHandler';
import { toolTokenHandler } from './services/ToolTokenHandler';
import ToolBlock from './components/ToolBlock';
import ContentProcessor from './utils/contentProcessor';
import { renderTextWithLinks, hasLinks } from './utils/linkParser';
import StreamdownRenderer from './components/StreamdownRenderer';
// SoundReactiveCircle was imported but not used in the component
// The component now uses SoundReactiveBlob instead
import SoundReactiveBlob from './components/SoundReactiveBlob';
import useDocumentDetection from './hooks/useDocumentDetection';
import ModernSettingsPanel from './components/ModernSettingsPanel';
import ModernDatabasePanel from './components/ModernDatabasePanel';
import ChatSidePanel, { WidgetType, WeatherData, MapData, IndexedFile } from './components/ChatSidePanel';
import ThemeToggle from './components/ThemeToggle';
import { ThemeProvider } from './contexts/ThemeContext';
import AgentVisualizationPanel from './components/AgentVisualizationPanel';
import AgentFlowVisualization from './components/AgentFlowVisualization';
import ToolSelector from './components/ToolSelector';
import MemorySavedNotification from './components/MemorySavedNotification';
import { agentFlowTracker } from './services/AgentFlowTracker';
import { generateStepDescription } from '../shared/AgentFlowStandard';
import { getSettings, setCurrentConversationId } from '../store/actions';
import { toggleSettings } from '../store/actions';
import { hideDocument } from '../store/actions';
import { streamError } from '../store/actions';
import { getWelcomeMessage, getPersonalizedMessage, shouldShowWelcome } from './utils/personalizedMessages';
import './styles/main.css';
import './styles/database-sidebar.css';
import './styles/streamdown.css';
import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipcChannels';
import ChatList from './components/ChatList';
import { v4 as uuidv4 } from 'uuid';
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
    Description as DocumentIcon,
    AccountTree as GraphIcon,
    Science as TestIcon
} from '@mui/icons-material';

const App: React.FC = () => {

    // Redux state and dispatch
    const dispatch = useDispatch();
    const showSettings = useSelector((state: any) => state.ui.showSettings);
    const showDatabase = useSelector((state: any) => state.ui.showDatabase);
    const thinkingBlocks = useSelector((state: any) => state.messages?.thinkingBlocks || []);
    const toolCalls = useSelector((state: any) => state.messages?.toolCalls || []);
    const settings = useSelector((state: any) => state.settings);
    const messages = useSelector((state: any) => state.messages?.messages || []);
    const currentConversationId = useSelector((state: any) => state.messages?.currentConversationId || null);

    // Local state
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const isListening = false; // No longer used for real-time transcription, kept for display compatibility
    const [inputValue, setInputValue] = useState('');
    const [realtimeTranscript, setRealtimeTranscript] = useState('');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isAppLoading, setIsAppLoading] = useState(true);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [isTTSPlaying, setIsTTSPlaying] = useState(false);
    const [currentTTSMessage, setCurrentTTSMessage] = useState<string | null>(null);
    const [isInputExpanded, setIsInputExpanded] = useState(false);
    const [sidePanelWidgetType, setSidePanelWidgetType] = useState<WidgetType | null>(null);
    const [sidePanelData, setSidePanelData] = useState<WeatherData | MapData | IndexedFile | null>(null);
    const [showSidePanel, setShowSidePanel] = useState(false);
    const [conversationWidgets, setConversationWidgets] = useState<Array<{ type: WidgetType; data: any; timestamp: number }>>([]);
    const [widgetsByConversation, setWidgetsByConversation] = useState<Record<string, Array<{ type: WidgetType; data: any; timestamp: number }>>>({});
    const [selectedTool, setSelectedTool] = useState<string | null>(null);
    const [workspacePanelWidth, setWorkspacePanelWidth] = useState(350); // Default width in pixels

    // Memory notifications state
    const [memoryNotifications, setMemoryNotifications] = useState<Array<{
        id: string;
        type: 'user_message' | 'assistant_response';
        memory: any;
        conversationId: string;
        timestamp: number;
    }>>([]);

    // Helper function to add widget to current conversation
    const addWidgetToConversation = (widget: { type: WidgetType; data: any; timestamp: number }) => {
        const conversationId = currentConversationIdRef.current;
        if (!conversationId) return;

        setWidgetsByConversation(prev => ({
            ...prev,
            [conversationId]: [...(prev[conversationId] || []), widget]
        }));

        // Update current conversation widgets if it's the active conversation
        if (conversationId === currentConversationId) {
            setConversationWidgets(prev => [...prev, widget]);
        }
    };
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [showDebugGraph, setShowDebugGraph] = useState(false);
    const audioContext = useRef<AudioContext | null>(null);
    const sounds = useRef<Record<string, AudioBuffer>>({});
    const streamController = useRef<AbortController | null>(null);
    const { detectAndShowDocuments } = useDocumentDetection();
    const settingsSidebarRef = useRef<HTMLDivElement>(null);
    const databaseSidebarRef = useRef<HTMLDivElement>(null);
    const chatMessagesRef = useRef<HTMLDivElement>(null);
    const [availableDocuments, setAvailableDocuments] = useState<any[]>([]);
    const [agentFlowSteps, setAgentFlowSteps] = useState<any[]>([]);
    const [currentFlowMessageId, setCurrentFlowMessageId] = useState<string | null>(null);
    const [flowStepsByMessage, setFlowStepsByMessage] = useState<Record<string, any[]>>({});


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

    useEffect(() => {
        if (!currentConversationId) {
            dispatch(setCurrentConversationId(uuidv4()));
        }
    }, [dispatch]);

    // Auto-show debug graph in debug mode
    useEffect(() => {
        const isDebugMode = process.env.NODE_ENV === 'development' ||
            window.location.search.includes('debug=true') ||
            window.location.search.includes('graph=true');

        if (isDebugMode) {
            console.log('🔍 [Debug] Auto-opening agent graph visualization in debug mode');

            // Delay showing the graph to allow the app to initialize
            setTimeout(() => {
                console.log('🌳 [Debug] Showing agent graph after initialization delay');
                setShowDebugGraph(false);
            }, 3000); // 3 second delay to allow LLM provider to initialize
        }
    }, []);

    // Initialize real-time speech recognition
    useEffect(() => {
        console.log('🔧 DEBUG: Initializing RealTimeSpeechRecognition...');
        console.log('🔧 DEBUG: Browser SpeechRecognition support:', {
            'window.SpeechRecognition': typeof (window as any).SpeechRecognition,
            'window.webkitSpeechRecognition': typeof (window as any).webkitSpeechRecognition,
            'navigator.mediaDevices': typeof navigator.mediaDevices,
            'navigator.mediaDevices.getUserMedia': typeof navigator?.mediaDevices?.getUserMedia
        });



        // console.log('🔧 DEBUG: RealTimeSpeechRecognition created, isSupported:', realTimeSpeech.current.isWebSpeechSupported());

        return () => {

        };
    }, []);

    // Load conversation history when conversation changes
    useEffect(() => {

        const loadConversationHistory = async () => {
            if (!currentConversationId) return;

            setIsLoadingHistory(true);

            try {
                // Check conversation health first
                const health = await ipcRenderer.invoke(IPC_CHANNELS.GET_CONVERSATION_HEALTH, currentConversationId);

                // Get ALL messages without any filtering (duplicates, ordering fixes, etc.)
                // To use filtered messages (with cleanup), change to: 'load-conversation'
                const messages = await ipcRenderer.invoke(IPC_CHANNELS.LOAD_ALL_CONVERSATION_MESSAGES, currentConversationId);

                // Log health information if conversation is incomplete
                if (health && !health.isComplete) {
                    console.warn('⚠️ [DEBUG] Incomplete conversation detected:', {
                        conversationId: currentConversationId,
                        totalMessages: health.totalMessages,
                        userMessages: health.userMessages,
                        assistantMessages: health.assistantMessages,
                        missingResponses: health.missingResponseCount,
                        lastMessageRole: health.lastMessageRole
                    });
                }

                // Clear current messages, thinking blocks, and tool calls
                dispatch({ type: 'CLEAR_MESSAGES' });
                dispatch({ type: 'CLEAR_THINKING_BLOCKS' });
                dispatch({ type: 'CLEAR_TOOL_CALLS' });

                // Load conversation-specific widgets
                const conversationWidgetsForChat = widgetsByConversation[currentConversationId] || [];
                setConversationWidgets(conversationWidgetsForChat);


                // Reset token handlers
                thinkingTokenHandler.reset();
                toolTokenHandler.reset();

                // Process existing messages for thinking tokens and code blocks
                const { updatedMessages, extractedThinkingBlocks } = ContentProcessor.processExistingMessages(
                    messages,
                    currentConversationId
                );


                // Load all processed messages at once to prevent duplication
                dispatch({ type: 'LOAD_MESSAGES', payload: updatedMessages });

                // Add informational message for incomplete conversations (only if not already shown)
                if (health && !health.isComplete && health.missingResponseCount > 0) {
                    // Check if we've already shown the notice for this conversation
                    const hasNoticeAlready = updatedMessages.some((msg: any) =>
                        msg.role === 'system' && msg.content.includes('Incomplete Conversation Notice')
                    );

                    if (!hasNoticeAlready) {
                        const incompleteMessage = {
                            id: `incomplete-notice-${Date.now()}`,
                            conversationId: currentConversationId,
                            role: 'system' as const,
                            content: `⚠️ **Incomplete Conversation Notice**\n\nThis conversation appears to be missing ${health.missingResponseCount} AI response${health.missingResponseCount > 1 ? 's' : ''}. This can happen if the app was closed while AI was responding, or due to connection issues.\n\n**What you can do:**\n• Continue chatting normally - new messages will work fine\n• Start a new conversation for a fresh start\n• Your previous messages are preserved and safe\n\n*This is just a one-time notice for older conversations.*`,
                            timestamp: Date.now(),
                            isSystemNotice: true
                        };
                        dispatch({ type: 'ADD_MESSAGE', payload: incompleteMessage });
                    }
                }

                // Find and scroll to latest human message after a short delay
                setTimeout(async () => {
                    try {
                        const latestHumanMessage = await ipcRenderer.invoke(IPC_CHANNELS.GET_LATEST_HUMAN_MESSAGE, currentConversationId);

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
                    const conversationThinkingBlocks = await ipcRenderer.invoke(IPC_CHANNELS.GET_THINKING_BLOCKS, currentConversationId);

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
            } finally {
                setIsLoadingHistory(false);
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

    // Subscribe to agent flow tracker updates
    useEffect(() => {
        const unsubscribe = agentFlowTracker.subscribe((steps) => {
            setAgentFlowSteps([...steps]);

            // Store steps for the current message
            if (currentFlowMessageId && steps.length > 0) {
                setFlowStepsByMessage(prev => ({
                    ...prev,
                    [currentFlowMessageId]: [...steps]
                }));
            }
        });
        return unsubscribe;
    }, [currentFlowMessageId]);

    // Listen for agent flow events from main process
    useEffect(() => {
        const handleFlowEvent = (event: any, { type, data }: { type: string, data: any }) => {

            switch (type) {
                case 'step-add':
                    agentFlowTracker.addStep({
                        title: data.title,
                        details: data.details
                    });
                    break;

                case 'step-update':
                    if (data.stepId === 'initial') {
                        // Update the first step we created
                        const steps = agentFlowTracker.getSteps();
                        if (steps.length > 0) {
                            agentFlowTracker.updateStepStatus(steps[0].id, data.status, data.details);
                        }
                    } else {
                        agentFlowTracker.updateStepStatus(data.stepId, data.status, data.details);
                    }
                    break;

                case 'step-complete':
                    agentFlowTracker.completeStep(data.stepId, data.details);
                    break;

                case 'step-error':
                    agentFlowTracker.errorStep(data.stepId, data.error);
                    break;
            }
        };

        ipcRenderer.on('agent-flow-event', handleFlowEvent);

        return () => {
            ipcRenderer.removeListener('agent-flow-event', handleFlowEvent);
        };
    }, []);


    // Function to scroll to a specific human message
    const scrollToHumanMessage = useCallback((messageId: number) => {
        if (!chatMessagesRef.current) return;

        // Find the message element by ID
        const messageElement = chatMessagesRef.current.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
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

    // Auto-scroll to bottom when new messages are added (but not when loading history)
    useEffect(() => {
        if (chatMessagesRef.current && messages.length > 0 && !isLoadingHistory) {
            const scrollContainer = chatMessagesRef.current;
            // Scroll to bottom smoothly
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
    }, [messages.length, isLoadingHistory]);

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
    // const playSound = (soundName: string) => {
    //     if (!audioContext.current || !sounds.current[soundName]) return;

    //     try {
    //         const source = audioContext.current.createBufferSource();
    //         source.buffer = sounds.current[soundName];
    //         source.connect(audioContext.current.destination);
    //         source.start();
    //     } catch (error) {
    //         console.warn(`Failed to play sound: ${soundName}`, error);
    //     }
    // };

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
        navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: {

            }
        }).then(stream => {

        }).catch(e => console.log(e))
    };

    const handleTestSidePanelClick = async () => {
        // Cycle through widget types for testing
        const widgetTypes: WidgetType[] = ['document', 'weather', 'map'];
        const currentTypeIndex = widgetTypes.indexOf('document'); // Default to weather if none selected
        const nextTypeIndex = (currentTypeIndex) % widgetTypes.length;
        const type = widgetTypes[nextTypeIndex];

        console.log('🧪 [Test] Testing side panel with type:', type);

        if (type === 'document') {
            handleShowDocument({
                name: 'Test Document.md',
                size: 123456,
                path: '/Users/karwo09/code/voice-assistant/data/test-vectorstore/friend.md',
                mtime: Date.now(),
                chunks: 10,
            });
        } else if (type === 'weather') {
            // Test weather data
            const weatherData: WeatherData = {
                location: 'Stockholm, Sweden',
                temperature: {
                    celsius: 22,
                    fahrenheit: 72,
                    unit_metric: '°C',
                    unit_imperial: '°F'
                },
                condition: 'Partly Cloudy',
                humidity: '65%',
                wind: {
                    speed_metric: 12,
                    speed_imperial: 7.5,
                    direction: 'SW'
                },
                pressure: {
                    metric: 1013,
                    imperial: 30.01
                },
                visibility: {
                    metric: 10,
                    imperial: 6.2
                },
                uv_index: 5,
                is_day: true,
                observation_time: new Date().toISOString(),
                source: 'Test Data'
            };

            const newWidget = {
                type: 'weather' as WidgetType,
                data: weatherData,
                timestamp: Date.now()
            };

            // Add to conversation widgets history
            const existsInCurrent = conversationWidgets.some(w =>
                w.type === 'weather' &&
                (w.data as WeatherData).location === weatherData.location
            );
            if (!existsInCurrent) {
                addWidgetToConversation(newWidget);
            }

            setSidePanelWidgetType('weather');
            setSidePanelData(weatherData);
            setShowSidePanel(true);
        } else if (type === 'map') {
            // Test map data
            const mapData: MapData = {
                locations: [
                    {
                        name: 'Stockholm',
                        latitude: 59.3293,
                        longitude: 18.0686,
                        description: 'Capital of Sweden'
                    },
                    {
                        name: 'Gothenburg',
                        latitude: 57.7089,
                        longitude: 11.9746,
                        description: 'Second largest city in Sweden'
                    },
                    {
                        name: 'Malmö',
                        latitude: 55.6049,
                        longitude: 13.0038,
                        description: 'Southernmost city in Sweden'
                    }
                ],
                center: {
                    latitude: 59.3293,
                    longitude: 18.0686
                },
                zoom: 6
            };

            const newWidget = {
                type: 'map' as WidgetType,
                data: mapData,
                timestamp: Date.now()
            };

            // Add to conversation widgets history
            const existsInCurrent = conversationWidgets.some(w =>
                w.type === 'map' &&
                JSON.stringify(w.data) === JSON.stringify(mapData)
            );
            if (!existsInCurrent) {
                addWidgetToConversation(newWidget);
            }

            setSidePanelWidgetType('map');
            setSidePanelData(mapData);
            setShowSidePanel(true);
        }
    }

    // Retry a failed message
    const retryMessage = async (messageId: string, userMessage: any) => {

        // Mark message as retrying
        dispatch({ type: 'RETRY_MESSAGE', payload: { messageId } });
        dispatch({ type: 'START_THINKING' });

        try {
            // Find the user message content to retry
            const userContent = userMessage?.content || '';
            if (userContent.trim()) {
                // Process through agent again
                await ipcRenderer.invoke(IPC_CHANNELS.PROCESS_MESSAGE, userContent, currentConversationId);
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

            let messageContent = inputValue;

            // Add tool instruction if a tool is selected
            if (selectedTool) {
                const toolInstructions: Record<string, string> = {
                    'search': 'Use web search to answer this query:',
                    'weather': 'Get weather information for:',
                    'maps': 'Show location and map information for:',
                    'email': 'Search emails for:',
                    'research': 'Use deep research mode for:',
                    'vector': 'Search indexed documents for:'
                };

                const instruction = toolInstructions[selectedTool] || 'Use specific tools to answer:';
                messageContent = `${instruction} ${inputValue}`;
            }

            // Clear input immediately for better UX
            const messageToProcess = messageContent;
            setInputValue('');
            setSelectedTool(null); // Clear tool selection after sending

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

            // Initialize flow tracking for this message
            agentFlowTracker.reset();
            setCurrentFlowMessageId(assistantMessageId);


            // Create new AbortController for this request
            streamController.current = new AbortController();

            try {
                // Process message through agent with conversation ID
                await ipcRenderer.invoke(IPC_CHANNELS.PROCESS_MESSAGE, messageToProcess, convID);
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
                dispatch(setCurrentConversationId(convID));
            }
        }
    };

    // Document handling functions
    const loadAvailableDocuments = async () => {
        try {
            const databasePath = settings?.database?.path;
            if (!databasePath) return;

            const result = await ipcRenderer.invoke(IPC_CHANNELS.VECTOR_STORE_GET_INDEXED_ITEMS, databasePath);
            if (result.success) {
                setAvailableDocuments(result.items || []);
            }
        } catch (error) {
            console.error('Error loading documents:', error);
        }
    };

    const handleShowDocument = (document: any) => {
        const newWidget = {
            type: 'document' as WidgetType,
            data: document as IndexedFile,
            timestamp: Date.now()
        };

        // Add to conversation widgets history
        const existsInCurrent = conversationWidgets.some(w =>
            w.type === 'document' &&
            (w.data as IndexedFile).path === (document as IndexedFile).path
        );
        if (!existsInCurrent) {
            addWidgetToConversation(newWidget);
        }

        setSidePanelWidgetType('document');
        setSidePanelData(document as IndexedFile);
        setShowSidePanel(true);
        dispatch(hideDocument()); // Hide old document panel state
    };

    // Load documents when component mounts or database path changes
    useEffect(() => {
        loadAvailableDocuments();
    }, [settings?.database?.path]);

    // DevTools keyboard shortcuts
    useEffect(() => {
        const handleGlobalKeyDown = (event: KeyboardEvent) => {
            // F12 or Ctrl+Shift+I (Cmd+Option+I on Mac) to toggle DevTools
            if (event.key === 'F12' ||
                (event.ctrlKey && event.shiftKey && event.key === 'I') ||
                (event.metaKey && event.altKey && event.key === 'i')) {
                event.preventDefault();

                // Toggle DevTools via IPC
                ipcRenderer.invoke(IPC_CHANNELS.TOGGLE_DEV_TOOLS)
                    .then((result) => {
                        if (result.success) {
                            console.log('DevTools toggled:', result.isOpen ? 'opened' : 'closed');
                        } else {
                            console.error('Failed to toggle DevTools:', result.error);
                        }
                    })
                    .catch((error) => {
                        console.error('DevTools toggle error:', error);
                    });
            }
        };

        // Add global keyboard listener
        document.addEventListener('keydown', handleGlobalKeyDown);

        // Cleanup listener
        return () => {
            document.removeEventListener('keydown', handleGlobalKeyDown);
        };
    }, []);

    // Cleanup function
    useEffect(() => {
        return () => {
            if (streamController.current) {
                streamController.current.abort();
            }
        };
    }, []);

    // Create a ref to store current conversation ID for IPC handlers
    const currentConversationIdRef = useRef(currentConversationId);

    // Update ref when conversation ID changes
    useEffect(() => {
        currentConversationIdRef.current = currentConversationId;
    }, [currentConversationId]);

    // Listen for streaming events from main process
    const currentAssistantId = useSelector((s: any) => s.messages.currentAssistantIdByConversation?.[currentConversationIdRef.current]);
    useEffect(() => {
        const handleStreamChunk = (_: any, data: { chunk: string, conversationId: string }) => {
            if (data.conversationId === currentConversationIdRef.current) {
                // console.log('📨 Stream chunk received for conversation', data.conversationId, ':', data.chunk);
                // Process the chunk for thinking tokens
                const processedThinking = thinkingTokenHandler.processChunk(data.chunk, currentConversationIdRef.current);

                // Add any extracted thinking blocks to Redux with proper association
                processedThinking.thinkingBlocks.forEach(block => {
                    // Add thinking block to flow visualization using standard format
                    if (currentFlowMessageId === currentAssistantId) {
                        const thinkingStep = generateStepDescription('THINKING', {
                            contentLength: block.content.length
                        });

                        agentFlowTracker.addCompletedStep({
                            title: thinkingStep.title,
                            details: thinkingStep.description
                        });
                    }

                    // Still add to Redux for potential debugging/fallback
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
                            messageId: currentAssistantId,            // << use the real id
                            conversationId: currentConversationIdRef.current,
                            isIncomplete: true,
                            isStreaming: true
                        };
                        dispatch({ type: 'ADD_THINKING_BLOCK', payload: enhancedIncompleteBlock });

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
                    // Add tool execution to flow visualization
                    if (currentFlowMessageId === currentAssistantId) {
                        const toolName = (toolCall as any).toolName || (toolCall as any).name || 'Tool';
                        const toolStepId = agentFlowTracker.startNewStep({
                            title: `Executing ${toolName}`,
                            details: `Tool execution in progress`
                        });
                        // Mark as complete after a short delay to show progress
                        setTimeout(() => {
                            agentFlowTracker.completeStep(toolStepId, `${toolName} completed`);
                        }, 500);
                    }

                    const enhancedToolCall = {
                        ...toolCall,
                        messageId: currentAssistantId,            // << use the real id
                        conversationId: currentConversationIdRef.current
                    };
                    dispatch({ type: 'ADD_TOOL_CALL', payload: enhancedToolCall });
                });

                // Don't add incomplete blocks - they cause infinite loops
                // Incomplete blocks will be visible through the token handlers' internal state
                // and will be properly added when the closing tags are found

                // Append the display content to the current assistant message
                if (processedTools.displayContent) {
                    // console.log('🧩 Appending to assistant message:', processedTools.displayContent);
                    dispatch({ type: 'APPEND_TO_LAST_ASSISTANT_MESSAGE', payload: processedTools.displayContent });
                }

                // Check for side view data (weather/map) in streaming updates
                if (data.chunk.includes('side-panel-weather')) {

                    // Try to extract JSON from the side view marker  
                    const jsonMatch = data.chunk.match(/side-panel-weather (.+)/);
                    console.log('🌤️ Detected side-panel-weather marker in stream:', jsonMatch);
                    if (jsonMatch) {
                        const sideViewContent = jsonMatch[1].trim();

                        // Try to parse as JSON (for weather/map data)
                        try {
                            const parsedData = JSON.parse(sideViewContent);

                            if (parsedData.location && parsedData.temperature) {
                                setSidePanelWidgetType('weather');
                                setSidePanelData(parsedData as WeatherData);
                                setShowSidePanel(true);
                            } else if (parsedData.locations && Array.isArray(parsedData.locations)) {
                                setSidePanelWidgetType('map');
                                setSidePanelData(parsedData as MapData);
                                setShowSidePanel(true);
                            } else {
                                console.log('📊 [DEBUG] Unknown side view data format:', parsedData);
                            }
                        } catch (parseError) {
                            // Not JSON, might be just a marker like "Weather information"
                            console.log('🌤️ Side view marker detected (not JSON):', sideViewContent);
                        }
                    }
                }
                // Detect side-panel-document marker from agent stream
                if (data.chunk.includes('side-panel-document')) {
                    const jsonMatch = data.chunk.match(/side-panel-document (.+)/);
                    console.log('📄 Detected side-panel-document marker in stream:', jsonMatch);
                    if (jsonMatch) {
                        try {
                            const docData = JSON.parse(jsonMatch[1]);
                            handleShowDocument(docData);
                        } catch (e) {
                            console.error("❌ Failed to parse side-panel-document JSON:", e);
                        }
                    }
                }
            }


        };

        const handleStreamComplete = (_: any, data: { conversationId: string }) => {
            if (data.conversationId === currentConversationIdRef.current) {
                // FINALIZE STREAMING MESSAGE: Set isStreaming to false for the last assistant message
                const streamingMessage = messages.find((msg: any) =>
                    msg.role === 'assistant' && msg.conversationId === currentConversationIdRef.current && msg.isStreaming
                );




                // FINALIZE INCOMPLETE THINKING BLOCKS: Convert any remaining incomplete blocks to completed ones
                const remainingIncompleteBlocks = thinkingTokenHandler.getIncompleteThinkingBlocks(currentConversationIdRef.current);
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
                        detectAndShowDocuments(lastMessage.content).then(detectedDocs => {
                            if (detectedDocs.length > 0) {
                                console.log('🔍 DEBUG: Auto-detected', detectedDocs.length, 'documents from AI response');
                                // Show the first detected document in side panel
                                handleShowDocument(detectedDocs[0]);

                                // Log all detected documents
                                detectedDocs.forEach(doc => {
                                    console.log('📄 [Detected Document]:', doc.name, doc.path);
                                });
                            }
                        }).catch(error => {
                            console.warn('🔍 DEBUG: Document detection failed:', error);
                        });
                    } catch (error) {
                        console.warn('🔍 DEBUG: Document detection error:', error);
                    }
                }

                dispatch({ type: 'STOP_THINKING' });
                if (streamingMessage) {
                    dispatch({
                        type: 'FINALIZE_STREAMING_MESSAGE',
                        payload: {
                            messageId: streamingMessage.id,
                            conversationId: currentConversationIdRef.current
                        }
                    });
                } else {
                    console.log('🔧 DEBUG: No streaming message found to finalize. Current messages:',
                        messages.filter(msg => msg.role === 'assistant' && msg.conversationId === currentConversationIdRef.current).map(msg => ({
                            id: msg.id,
                            isStreaming: msg.isStreaming
                        }))
                    );
                }
            }
        };

        const handleStreamError = (_: any, data: { error: string, conversationId: string }) => {
            if (data.conversationId === currentConversationIdRef.current) {
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
            if (data.conversationId === currentConversationIdRef.current) {
                // Update existing tool call or add new one
                dispatch({ type: 'UPDATE_TOOL_CALL', payload: data.toolCall });
            }
        };


        const handleSideViewData = (_: any, data: { sideViewData: any, conversationId: string }) => {

            if (data.conversationId === currentConversationIdRef.current && data.sideViewData) {

                // Check if this is weather data or map data
                if (data.sideViewData.type === 'weather' && data.sideViewData.data) {


                    const newWidget = {
                        type: 'weather' as WidgetType,
                        data: data.sideViewData.data as WeatherData,
                        timestamp: Date.now()
                    };

                    // Add to conversation widgets history
                    const existsInCurrent = conversationWidgets.some(w =>
                        w.type === 'weather' &&
                        JSON.stringify(w.data) === JSON.stringify(newWidget.data)
                    );
                    if (!existsInCurrent) {
                        addWidgetToConversation(newWidget);
                    }

                    setSidePanelWidgetType('weather');
                    setSidePanelData(data.sideViewData.data as WeatherData);
                    setShowSidePanel(true);
                } else if (data.sideViewData.type === 'map' && data.sideViewData.data) {

                    const newWidget = {
                        type: 'map' as WidgetType,
                        data: data.sideViewData.data as MapData,
                        timestamp: Date.now()
                    };

                    // Add to conversation widgets history
                    const existsInCurrent = conversationWidgets.some(w =>
                        w.type === 'map' &&
                        JSON.stringify(w.data) === JSON.stringify(newWidget.data)
                    );
                    if (!existsInCurrent) {
                        addWidgetToConversation(newWidget);
                    } else {
                        console.log('🗺️ [DEBUG] Map widget already exists, skipping duplicate');
                    }

                    setSidePanelWidgetType('map');
                    setSidePanelData(data.sideViewData.data as MapData);
                    setShowSidePanel(true);
                }
            }
        };

        const handleTodoListUpdate = (_: any, data: { todos: any[], timestamp: Date, conversationId: string }) => {

            // Only process if it's for the current conversation
            if (data.conversationId === currentConversationIdRef.current && currentFlowMessageId === currentAssistantId) {
                agentFlowTracker.addTodoListStep({
                    title: 'Task Planning',
                    todos: data.todos,
                    timestamp: new Date(data.timestamp)
                });
            }
        };

        const handleMemorySaved = (_: any, data: {
            type: 'user_message' | 'assistant_response',
            conversationId: string,
            memory: any
        }) => {

            // Only show notifications for the current conversation
            if (data.conversationId === currentConversationIdRef.current) {
                const notification = {
                    id: data.memory.id,
                    type: data.type,
                    memory: data.memory,
                    conversationId: data.conversationId,
                    timestamp: Date.now()
                };

                setMemoryNotifications(prev => [...prev, notification]);

                // Auto-remove notification after 10 seconds if not interacted with
                setTimeout(() => {
                    setMemoryNotifications(prev => prev.filter(n => n.id !== notification.id));
                }, 10000);
            }
        };

        ipcRenderer.on('stream-chunk', handleStreamChunk);
        ipcRenderer.on('stream-complete', handleStreamComplete);
        ipcRenderer.on('stream-error', handleStreamError);

        // Test IPC channel registration

        ipcRenderer.on('tool-execution-update', handleToolExecutionUpdate);
        ipcRenderer.on('side-view-data', handleSideViewData);
        ipcRenderer.on('todo-list:updated', handleTodoListUpdate);
        ipcRenderer.on('memory-saved', handleMemorySaved);

        // Cleanup listeners on unmount
        return () => {
            ipcRenderer.off('stream-chunk', handleStreamChunk);
            ipcRenderer.off('stream-complete', handleStreamComplete);
            ipcRenderer.off('stream-error', handleStreamError);
            ipcRenderer.off('tool-execution-update', handleToolExecutionUpdate);
            ipcRenderer.off('side-view-data', handleSideViewData);
            ipcRenderer.off('todo-list:updated', handleTodoListUpdate);
            ipcRenderer.off('memory-saved', handleMemorySaved);
            if (streamController.current) {
                streamController.current.abort();
            }
        };
    }, [dispatch, messages]); // Removed currentConversationId dependency to prevent listener re-registration

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

        // Prevent multiple simultaneous TTS playback
        if (isTTSPlaying) {
            console.log('TTS already playing, ignoring request');
            return;
        }

        try {
            setIsTTSPlaying(true);
            setCurrentTTSMessage(messageContent);
            const result = await ipcRenderer.invoke(IPC_CHANNELS.TTS_SYNTHESIZE_AND_PLAY, messageContent);

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
        try {
            await ipcRenderer.invoke(IPC_CHANNELS.TTS_STOP);
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
        }
    };


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
                            onSelectConversation={(id: string) => dispatch(setCurrentConversationId(id))}
                            onCreateNewChat={async () => {
                                try {
                                    // Create new conversation through IPC handler
                                    const newId = await ipcRenderer.invoke(IPC_CHANNELS.CREATE_CONVERSATION);
                                    dispatch(setCurrentConversationId(newId));
                                    // Clear messages for the new conversation
                                    dispatch({ type: 'CLEAR_MESSAGES' });
                                    // Reset token handlers for new conversation
                                    thinkingTokenHandler.reset();
                                    toolTokenHandler.reset();
                                } catch (error) {
                                    console.error('Failed to create new conversation:', error);
                                    // Fallback to local ID generation if IPC fails
                                    const fallbackId = Date.now().toString();
                                    dispatch(setCurrentConversationId(fallbackId));
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
                                    const newId = await ipcRenderer.invoke(IPC_CHANNELS.CREATE_CONVERSATION);
                                    dispatch(setCurrentConversationId(newId));
                                    // Clear messages for the new conversation
                                    dispatch({ type: 'CLEAR_MESSAGES' });
                                    // Reset token handlers for new conversation
                                    thinkingTokenHandler.reset();
                                    toolTokenHandler.reset();
                                    // Clear conversation widgets for the new conversation
                                    setConversationWidgets([]);
                                    // Close side panel if it's open
                                    setShowSidePanel(false);
                                    setSidePanelWidgetType(null);
                                    setSidePanelData(null);
                                } catch (error) {
                                    console.error('Failed to create new conversation:', error);
                                    // Fallback to local ID generation if IPC fails
                                    const fallbackId = Date.now().toString();
                                    setCurrentConversationId(fallbackId);
                                    dispatch({ type: 'CLEAR_MESSAGES' });
                                    // Clear conversation widgets for the new conversation
                                    setConversationWidgets([]);
                                    // Close side panel if it's open
                                    setShowSidePanel(false);
                                    setSidePanelWidgetType(null);
                                    setSidePanelData(null);
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
                            className={`document-button ${showSidePanel ? 'active' : ''}`}
                            disabled={false}
                            onClick={() => {
                                if (showSidePanel) {
                                    setShowSidePanel(false);
                                    setSidePanelWidgetType(null);
                                    setSidePanelData(null);
                                } else if (conversationWidgets.length > 0) {
                                    // Show all conversation widgets - start with the most recent one
                                    const mostRecent = conversationWidgets[conversationWidgets.length - 1];
                                    setSidePanelWidgetType(mostRecent.type);
                                    setSidePanelData(mostRecent.data);
                                    setShowSidePanel(true);
                                } else if (availableDocuments.length > 0) {
                                    // Fallback to showing a document widget if no conversation widgets exist
                                    handleShowDocument(availableDocuments[0]);
                                } else {
                                    // Always show workspace even when empty
                                    setSidePanelWidgetType(null);
                                    setSidePanelData(null);
                                    setShowSidePanel(true);
                                }
                            }}
                            aria-label={
                                showSidePanel ? "Hide workspace" : "Show workspace"
                            }
                            size="small"
                            sx={{
                                opacity: 1
                            }}
                        >
                            <DocumentIcon fontSize="small" />
                        </IconButton>

                        <IconButton
                            className={`graph-button ${showDebugGraph ? 'active' : ''}`}
                            onClick={() => setShowDebugGraph(!showDebugGraph)}
                            aria-label={showDebugGraph ? "Hide agent visualization" : "Show agent visualization"}
                            size="small"
                            title="Agent Architecture & Memory"
                        >
                            <GraphIcon fontSize="small" />
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
                        gap: showSidePanel ? '12px' : '0'
                    }}>
                        {/* Chat area - adjust width when document panel is open */}
                        <div
                            className="chat-messages-container"
                            style={{
                                flex: showSidePanel ? '1 1 60%' : '1 1 100%',
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

                                                <div className="welcome-input-row">
                                                    <ToolSelector
                                                        selectedTool={selectedTool}
                                                        onToolSelect={setSelectedTool}
                                                        disabled={isRecording}
                                                    />
                                                    <textarea
                                                        value={inputValue + (realtimeTranscript ? (inputValue ? ' ' : '') + realtimeTranscript : '')}
                                                        onChange={handleInputChange}
                                                        onKeyDown={handleKeyPress}
                                                        onBlur={handleInputBlur}
                                                        placeholder={isRecording ? "Listening... Speak now" : "Type your message"}
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

                                                        <IconButton
                                                            className="mic-button"
                                                            onClick={handleTestSidePanelClick}
                                                            aria-label={isRecording ? "Stop recording" : "Start recording"}
                                                            size="large"
                                                            sx={{
                                                                width: '48px',
                                                                height: '48px',
                                                                backgroundColor: "red",
                                                                color: 'white',
                                                                '&:hover': {
                                                                    backgroundColor: '#218838'
                                                                }
                                                            }}
                                                        >
                                                            <TestIcon fontSize="large" />
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
                                                        {/* Agent Flow Visualization */}
                                                        {(() => {
                                                            // Show current flow for active message or stored flow for completed messages
                                                            const messageFlowSteps = currentFlowMessageId === msg.id
                                                                ? agentFlowSteps
                                                                : flowStepsByMessage[msg.id] || [];

                                                            if (messageFlowSteps.length > 0) {
                                                                return (
                                                                    <AgentFlowVisualization
                                                                        steps={messageFlowSteps}
                                                                        isExpanded={false}
                                                                    />
                                                                );
                                                            }
                                                            return null;
                                                        })()}

                                                        {/* Render tool calls only (thinking blocks moved to flow timeline) */}
                                                        {associatedToolCalls.length > 0 &&
                                                            associatedToolCalls.map((toolCall: any) => (
                                                                <ToolBlock
                                                                    key={toolCall.id}
                                                                    toolCall={toolCall}
                                                                    defaultOpen={false}
                                                                />
                                                            ))
                                                        }
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
                                                        // Enhanced rendering for user and AI messages with markdown and link support
                                                        msg.role === 'assistant' && msg.content ? (
                                                            // Use Streamdown for all AI responses (handles markdown, streaming, and plain text)
                                                            <StreamdownRenderer
                                                                content={msg.content}
                                                                isStreaming={msg.isStreaming}
                                                                className="ai-response"
                                                            />
                                                        ) : msg.content && hasLinks(msg.content) ? (
                                                            // Simple link preview for messages with links but no markdown
                                                            renderTextWithLinks(msg.content)
                                                        ) : (
                                                            // Plain text or streaming content
                                                            msg.content || (msg.isStreaming ? '...' : '')
                                                        )
                                                    )}
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
                                    <ToolSelector
                                        selectedTool={selectedTool}
                                        onToolSelect={setSelectedTool}
                                        disabled={isRecording}
                                    />
                                    <textarea
                                        placeholder={isRecording ? "Listening... Speak now" : "Type your message... Press Shift+Enter for new line"}
                                        className="message-input"
                                        value={inputValue + (realtimeTranscript ? (inputValue ? ' ' : '') + realtimeTranscript : '')}
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

                        {/* Workspace panel - resizable with handle */}
                        {showSidePanel && (
                            <div style={{
                                width: `${workspacePanelWidth}px`,
                                minWidth: '300px',
                                // maxWidth: '500px',
                                height: '100%',
                                overflow: 'hidden',
                                position: 'relative',
                                borderLeft: '6px solid rgb(226 225 225)'
                            }}>
                                {/* Resize handle */}
                                <div
                                    style={{
                                        position: 'absolute',
                                        left: -2,
                                        top: 0,
                                        bottom: 0,
                                        width: 4,
                                        cursor: 'col-resize',
                                        backgroundColor: 'transparent',
                                        zIndex: 10,
                                        transition: 'background-color 0.2s'
                                    }}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        const startX = e.clientX;
                                        const startWidth = workspacePanelWidth;

                                        const handleMouseMove = (e: MouseEvent) => {
                                            const deltaX = startX - e.clientX; // Subtract because we're resizing from right to left
                                            const newWidth = Math.max(300, Math.min(1000, startWidth + deltaX));
                                            setWorkspacePanelWidth(newWidth);
                                        };

                                        const handleMouseUp = () => {
                                            document.removeEventListener('mousemove', handleMouseMove);
                                            document.removeEventListener('mouseup', handleMouseUp);
                                        };

                                        document.addEventListener('mousemove', handleMouseMove);
                                        document.addEventListener('mouseup', handleMouseUp);
                                    }}
                                    onMouseEnter={(e) => {
                                        (e.target as HTMLElement).style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                                    }}
                                    onMouseLeave={(e) => {
                                        (e.target as HTMLElement).style.backgroundColor = 'transparent';
                                    }}
                                />
                                <ChatSidePanel
                                    widgetType={sidePanelWidgetType}
                                    data={sidePanelData}
                                    conversationWidgets={conversationWidgets}
                                    onClose={() => {
                                        setShowSidePanel(false);
                                        setSidePanelWidgetType(null);
                                        setSidePanelData(null);
                                    }}
                                />
                            </div>
                        )}
                    </div>


                    <div ref={settingsSidebarRef} className={`settings-sidebar-container ${showSettings ? 'open' : ''}`}>
                        <ModernSettingsPanel />
                    </div>
                    <div ref={databaseSidebarRef} className={`database-sidebar-container ${showDatabase ? 'open' : ''}`}>
                        <ModernDatabasePanel />
                    </div>
                    <div className={`debug-graph-container ${showDebugGraph ? 'open' : ''}`}>
                        <div className="debug-graph-panel">
                            <div className="debug-graph-header">
                                <h3>🤖 Agent Architecture & Memory</h3>
                                <button
                                    className="close-button"
                                    onClick={() => setShowDebugGraph(false)}
                                    aria-label="Close debug graph"
                                >
                                    ×
                                </button>
                            </div>
                            <div className="debug-graph-content">
                                <AgentVisualizationPanel
                                    autoRender={showDebugGraph}
                                    showControls={true}
                                    onRenderComplete={() => console.log('🎨 [Debug] Agent visualization rendered')}
                                    onError={(error) => console.error('❌ [Debug] Agent visualization error:', error)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Memory saved notifications */}
                    <div className="memory-notification-container">
                        {memoryNotifications.map(notification => (
                            <MemorySavedNotification
                                key={notification.id}
                                type={notification.type}
                                memory={notification.memory}
                                conversationId={notification.conversationId}
                                onDismiss={() => {
                                    setMemoryNotifications(prev =>
                                        prev.filter(n => n.id !== notification.id)
                                    );
                                }}
                            />
                        ))}
                    </div>

                    {/* Dark overlay when sidebars are open */}
                    {(showSettings || showDatabase || showDebugGraph) && (
                        <div className="sidebar-overlay" />
                    )}


                </div>
            </div>
        </ThemeProvider>
    );
};

// Add accessibility attributes to the component
App.displayName = 'CindyVoiceAssistant';

export default App;