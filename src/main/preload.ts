import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipcChannels';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Settings API
    getSettings: (section: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, section),
    setSettings: (section: string, value: any) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, section, value),
    saveSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE),
    
    // Chat API
    createConversation: () => ipcRenderer.invoke(IPC_CHANNELS.CREATE_CONVERSATION),
    loadConversation: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.LOAD_CONVERSATION, id),
    loadConversations: () => ipcRenderer.invoke(IPC_CHANNELS.GET_CONVERSATIONS),
    // Note: delete-conversation handler doesn't exist in main.ts
    deleteConversation: (id: string) => ipcRenderer.invoke('delete-conversation', id),
    processMessage: (message: string, conversationId: string) => 
        ipcRenderer.invoke(IPC_CHANNELS.PROCESS_MESSAGE, message, conversationId),
    
    // Vector Store API
    createVectorStore: (options: any) => ipcRenderer.invoke(IPC_CHANNELS.CREATE_VECTOR_STORE, options),
    indexDirectory: (path: string, options?: any) => 
        ipcRenderer.invoke(IPC_CHANNELS.VECTOR_STORE_INDEX_DIRECTORY, path, options),
    getIndexedItems: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.VECTOR_STORE_GET_INDEXED_ITEMS, path),
    readFileBuffer: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.READ_FILE_BUFFER, filePath),
    
    // Wake Word API (disabled but keeping interface)
    getWakeWordStatus: () => ipcRenderer.invoke(IPC_CHANNELS.WAKE_WORD_STATUS),
    
    // Link Preview API
    getLinkPreview: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_LINK_PREVIEW, url),
    
    // Path validation
    validatePath: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.VALIDATE_PATH, path),
    showDirectoryDialog: (defaultPath?: string) => 
        ipcRenderer.invoke(IPC_CHANNELS.SHOW_DIRECTORY_DIALOG, defaultPath),
    
    // LLM API
    initializeLLM: () => ipcRenderer.invoke(IPC_CHANNELS.INITIALIZE_LLM),
    
    // Event listeners
    on: (channel: string, callback: (...args: any[]) => void) => {
        const validChannels = [
            'stream-chunk',
            'stream-complete',
            'stream-error',
            'llm-ready',
            'thinking-start',
            'thinking-update',
            'thinking-end',
            'tool-start',
            'tool-update',
            'tool-end',
            'tool-error',
            'open-settings',
            'open-about',
            'vector-store:indexing-progress'
        ];
        
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        }
    },
    
    removeListener: (channel: string, callback: (...args: any[]) => void) => {
        ipcRenderer.removeListener(channel, callback as any);
    },
    
    removeAllListeners: (channel: string) => {
        ipcRenderer.removeAllListeners(channel);
    }
});