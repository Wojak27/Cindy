/**
 * IPC Channel Constants
 * 
 * Centralized constants for all Inter-Process Communication (IPC) channels
 * between the main process and renderer process in the Electron application.
 * 
 * All constants use UPPER_SNAKE_CASE naming convention and match the actual
 * string literals used in ipcMain.handle() and ipcRenderer.invoke() calls.
 */

// ============================================================================
// SETTINGS & CONFIGURATION
// ============================================================================
export const GET_SETTINGS_SERVICE = 'get-settings-service';
export const SETTINGS_GET = 'settings-get';
export const SETTINGS_SET = 'settings-set';
export const SETTINGS_GET_ALL = 'settings-get-all';
export const SETTINGS_SAVE = 'settings-save';
export const SETTINGS_SET_ALL = 'settings-set-all';
export const INITIALIZE_LLM = 'initialize-llm';

// ============================================================================
// WAKE WORD DETECTION
// ============================================================================
export const WAKE_WORD_START = 'wake-word:start';
export const WAKE_WORD_STOP = 'wake-word:stop';
export const WAKE_WORD_UPDATE_KEYWORD = 'wake-word:update-keyword';
export const WAKE_WORD_STATUS = 'wake-word:status';

// ============================================================================
// LLM & MODEL MANAGEMENT
// ============================================================================
export const FETCH_PROVIDER_MODELS = 'fetch-provider-models';
export const UPDATE_LLM_PROVIDER = 'update-llm-provider';
export const LLM_GET_AVAILABLE_MODELS = 'llm:get-available-models';
export const LLM_TEST_CONNECTION = 'llm:test-connection';
export const OLLAMA_LIST_MODELS = 'ollama-list-models';
export const OLLAMA_PULL_MODEL = 'ollama-pull-model';
export const OLLAMA_REMOVE_MODEL = 'ollama-remove-model';

// ============================================================================
// VECTOR STORE OPERATIONS
// ============================================================================
export const CREATE_VECTOR_STORE = 'create-vector-store';
export const VECTOR_STORE_INDEX_DIRECTORY = 'vector-store:index-directory';
export const VECTOR_STORE_CHECK_STATUS = 'vector-store:check-status';
export const VECTOR_STORE_GET_INDEXED_ITEMS = 'vector-store:get-indexed-items';

// ============================================================================
// FILE SYSTEM & DIALOGS
// ============================================================================
export const VALIDATE_PATH = 'validate-path';
export const SHOW_DIRECTORY_DIALOG = 'show-directory-dialog';
export const READ_FILE_BUFFER = 'read-file-buffer';
export const START_FULL_INDEXING = 'start-full-indexing';

// ============================================================================
// DOCUMENT PROCESSING
// ============================================================================
export const RESOLVE_DOCUMENT_PATH = 'resolve-document-path';
export const DETECT_AND_RESOLVE_DOCUMENTS = 'detect-and-resolve-documents';

// ============================================================================
// TEXT-TO-SPEECH
// ============================================================================
export const TTS_SYNTHESIZE = 'tts-synthesize';
export const TTS_SYNTHESIZE_AND_PLAY = 'tts-synthesize-and-play';
export const TTS_GET_OPTIONS = 'tts-get-options';
export const TTS_UPDATE_OPTIONS = 'tts-update-options';
export const TTS_IS_READY = 'tts-is-ready';
export const TTS_STOP = 'tts-stop';
export const TTS_CLEANUP = 'tts-cleanup';
export const TTS_REQUEST_MODEL_DOWNLOAD_PERMISSION = 'tts-request-model-download-permission';

// ============================================================================
// AUDIO & SPEECH-TO-TEXT
// ============================================================================
export const START_REAL_TIME_TRANSCRIPTION = 'start-real-time-transcription';
export const STOP_REAL_TIME_TRANSCRIPTION = 'stop-real-time-transcription';
export const START_RECORDING = 'start-recording';
export const STOP_RECORDING = 'stop-recording';
export const TRANSCRIBE_AUDIO = 'transcribe-audio';
export const GET_DESKTOP_AUDIO_SOURCES = 'get-desktop-audio-sources';

// ============================================================================
// CONVERSATIONS & MESSAGES
// ============================================================================
export const CREATE_CONVERSATION = 'create-conversation';
export const LOAD_CONVERSATION = 'load-conversation';
export const LOAD_ALL_CONVERSATION_MESSAGES = 'load-all-conversation-messages';
export const GET_CONVERSATIONS = 'get-conversations';
export const GET_INCOMPLETE_CONVERSATIONS = 'get-incomplete-conversations';
export const GET_CONVERSATION_HEALTH = 'get-conversation-health';
export const GET_THINKING_BLOCKS = 'get-thinking-blocks';
export const GET_LATEST_HUMAN_MESSAGE = 'get-latest-human-message';
export const SAVE_MESSAGE = 'save-message';
export const PROCESS_MESSAGE = 'process-message';

// ============================================================================
// MEMORY & AGENT OPERATIONS
// ============================================================================
export const MEMORY_GRAPH_GET_DATA = 'memory-graph:get-data';
export const MEMORY_GRAPH_ADD_MEMORY = 'memory-graph:add-memory';
export const MEMORY_GRAPH_RETRIEVE = 'memory-graph:retrieve';
export const AGENT_MERMAID = 'agent:mermaid';
export const TODO_LIST_GET_CURRENT = 'todo-list:get-current';
export const TODO_LIST_UPDATE = 'todo-list:update';

// ============================================================================
// CONNECTOR INTEGRATIONS
// ============================================================================
export const CONNECTOR_GET_STATUS = 'connector-get-status';
export const CONNECTOR_START_OAUTH = 'connector-start-oauth';
export const CONNECTOR_CONFIGURE_ZOTERO = 'connector-configure-zotero';
export const CONNECTOR_DISCONNECT = 'connector-disconnect';
export const CONNECTOR_TEST = 'connector-test';
export const CONNECTOR_GET_CONNECTED = 'connector-get-connected';
export const SETTINGS_GET_OAUTH_CREDENTIALS = 'settings-get-oauth-credentials';
export const SETTINGS_SET_OAUTH_CREDENTIALS = 'settings-set-oauth-credentials';
export const SETTINGS_DELETE_OAUTH_CREDENTIALS = 'settings-delete-oauth-credentials';

// ============================================================================
// DEVELOPER TOOLS
// ============================================================================
export const TOGGLE_DEV_TOOLS = 'toggle-dev-tools';
export const DEV_TOOLS_IS_OPEN = 'dev-tools-is-open';

// ============================================================================
// UTILITIES
// ============================================================================
export const GET_LINK_PREVIEW = 'get-link-preview';
export const SHELL_OPEN_EXTERNAL = 'shell-open-external';
export const GET_ASSET_PATH = 'get-asset-path';

// ============================================================================
// GROUPED EXPORTS FOR CONVENIENCE
// ============================================================================

export const SETTINGS_CHANNELS = {
  GET_SETTINGS_SERVICE,
  SETTINGS_GET,
  SETTINGS_SET,
  SETTINGS_GET_ALL,
  SETTINGS_SAVE,
  SETTINGS_SET_ALL,
  INITIALIZE_LLM,
} as const;

export const WAKE_WORD_CHANNELS = {
  WAKE_WORD_START,
  WAKE_WORD_STOP,
  WAKE_WORD_UPDATE_KEYWORD,
  WAKE_WORD_STATUS,
} as const;

export const LLM_CHANNELS = {
  FETCH_PROVIDER_MODELS,
  UPDATE_LLM_PROVIDER,
  LLM_GET_AVAILABLE_MODELS,
  LLM_TEST_CONNECTION,
  OLLAMA_LIST_MODELS,
  OLLAMA_PULL_MODEL,
  OLLAMA_REMOVE_MODEL,
} as const;

export const VECTOR_STORE_CHANNELS = {
  CREATE_VECTOR_STORE,
  VECTOR_STORE_INDEX_DIRECTORY,
  VECTOR_STORE_CHECK_STATUS,
  VECTOR_STORE_GET_INDEXED_ITEMS,
} as const;

export const FILE_SYSTEM_CHANNELS = {
  VALIDATE_PATH,
  SHOW_DIRECTORY_DIALOG,
  READ_FILE_BUFFER,
  START_FULL_INDEXING,
} as const;

export const DOCUMENT_CHANNELS = {
  RESOLVE_DOCUMENT_PATH,
  DETECT_AND_RESOLVE_DOCUMENTS,
} as const;

export const TTS_CHANNELS = {
  TTS_SYNTHESIZE,
  TTS_SYNTHESIZE_AND_PLAY,
  TTS_GET_OPTIONS,
  TTS_UPDATE_OPTIONS,
  TTS_IS_READY,
  TTS_STOP,
  TTS_CLEANUP,
  TTS_REQUEST_MODEL_DOWNLOAD_PERMISSION,
} as const;

export const AUDIO_CHANNELS = {
  START_REAL_TIME_TRANSCRIPTION,
  STOP_REAL_TIME_TRANSCRIPTION,
  START_RECORDING,
  STOP_RECORDING,
  TRANSCRIBE_AUDIO,
  GET_DESKTOP_AUDIO_SOURCES,
} as const;

export const CONVERSATION_CHANNELS = {
  CREATE_CONVERSATION,
  LOAD_CONVERSATION,
  LOAD_ALL_CONVERSATION_MESSAGES,
  GET_CONVERSATIONS,
  GET_INCOMPLETE_CONVERSATIONS,
  GET_CONVERSATION_HEALTH,
  GET_THINKING_BLOCKS,
  GET_LATEST_HUMAN_MESSAGE,
  SAVE_MESSAGE,
  PROCESS_MESSAGE,
} as const;

export const MEMORY_AGENT_CHANNELS = {
  MEMORY_GRAPH_GET_DATA,
  MEMORY_GRAPH_ADD_MEMORY,
  MEMORY_GRAPH_RETRIEVE,
  AGENT_MERMAID,
  TODO_LIST_GET_CURRENT,
  TODO_LIST_UPDATE,
} as const;

export const CONNECTOR_CHANNELS = {
  CONNECTOR_GET_STATUS,
  CONNECTOR_START_OAUTH,
  CONNECTOR_CONFIGURE_ZOTERO,
  CONNECTOR_DISCONNECT,
  CONNECTOR_TEST,
  CONNECTOR_GET_CONNECTED,
  SETTINGS_GET_OAUTH_CREDENTIALS,
  SETTINGS_SET_OAUTH_CREDENTIALS,
  SETTINGS_DELETE_OAUTH_CREDENTIALS,
} as const;

export const DEV_TOOLS_CHANNELS = {
  TOGGLE_DEV_TOOLS,
  DEV_TOOLS_IS_OPEN,
} as const;

export const UTILITY_CHANNELS = {
  GET_LINK_PREVIEW,
  SHELL_OPEN_EXTERNAL,
  GET_ASSET_PATH,
} as const;

export const TEST_SIDE_VIEW = 'test-side-view';

// ============================================================================
// ALL CHANNELS EXPORT
// ============================================================================

/**
 * Complete collection of all IPC channels used in the application.
 * Use this for type safety and centralized channel management.
 */
export const IPC_CHANNELS = {
  // Settings & Configuration
  ...SETTINGS_CHANNELS,
  TEST_SIDE_VIEW,

  // Wake Word Detection
  ...WAKE_WORD_CHANNELS,

  // LLM & Model Management
  ...LLM_CHANNELS,

  // Vector Store Operations
  ...VECTOR_STORE_CHANNELS,

  // File System & Dialogs
  ...FILE_SYSTEM_CHANNELS,

  // Document Processing
  ...DOCUMENT_CHANNELS,

  // Text-to-Speech
  ...TTS_CHANNELS,

  // Audio & Speech-to-Text
  ...AUDIO_CHANNELS,

  // Conversations & Messages
  ...CONVERSATION_CHANNELS,

  // Memory & Agent Operations
  ...MEMORY_AGENT_CHANNELS,

  // Connector Integrations
  ...CONNECTOR_CHANNELS,

  // Developer Tools
  ...DEV_TOOLS_CHANNELS,

  // Utilities
  ...UTILITY_CHANNELS,
} as const;

/**
 * Type representing all valid IPC channel names
 */
export type IPCChannelName = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

/**
 * Default export for convenience
 */
export default IPC_CHANNELS;