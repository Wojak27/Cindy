import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Settings API
    getSettings: (section: string) => ipcRenderer.invoke('settings-get', section),
    setSettings: (section: string, value: any) => ipcRenderer.invoke('settings-set', section, value),
    saveSettings: () => ipcRenderer.invoke('settings-save'),
    
    // Chat API
    createConversation: () => ipcRenderer.invoke('create-conversation'),
    loadConversation: (id: string) => ipcRenderer.invoke('load-conversation', id),
    loadConversations: () => ipcRenderer.invoke('load-conversations'),
    deleteConversation: (id: string) => ipcRenderer.invoke('delete-conversation', id),
    processMessage: (message: string, conversationId: string) => 
        ipcRenderer.invoke('process-message', message, conversationId),
    
    // Vector Store API
    createVectorStore: (options: any) => ipcRenderer.invoke('create-vector-store', options),
    indexDirectory: (path: string, options?: any) => 
        ipcRenderer.invoke('vector-store:index-directory', path, options),
    getIndexedItems: (path: string) => ipcRenderer.invoke('vector-store:get-indexed-items', path),
    
    // Wake Word API (disabled but keeping interface)
    getWakeWordStatus: () => ipcRenderer.invoke('wake-word:status'),
    
    // Link Preview API
    getLinkPreview: (url: string) => ipcRenderer.invoke('get-link-preview', url),
    
    // Path validation
    validatePath: (path: string) => ipcRenderer.invoke('validate-path', path),
    showDirectoryDialog: (defaultPath?: string) => 
        ipcRenderer.invoke('show-directory-dialog', defaultPath),
    
    // LLM API
    initializeLLM: () => ipcRenderer.invoke('initialize-llm'),
    
    // Event listeners
    on: (channel: string, callback: Function) => {
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
    
    removeListener: (channel: string, callback: Function) => {
        ipcRenderer.removeListener(channel, callback);
    },
    
    removeAllListeners: (channel: string) => {
        ipcRenderer.removeAllListeners(channel);
    }
});