import React, { useState, useEffect } from 'react';
import { ipcRenderer } from 'electron';
import './ChatList.css';

interface Conversation {
    id: string;
    title: string;
    lastMessageAt: number;
}

const ChatList: React.FC<{
    onSelectConversation: (id: string) => void;
    onCreateNewChat: () => void;
    currentConversationId: string;
}> = ({ onSelectConversation, onCreateNewChat, currentConversationId }) => {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadConversations();
    }, []);

    const loadConversations = async () => {
        try {
            setIsLoading(true);
            const convos = await ipcRenderer.invoke('get-conversations');
            // Log the raw conversation data for debugging
            console.log('Raw conversations data:', convos);
            if (Array.isArray(convos)) {
                convos.forEach((convo, index) => {
                    if (typeof convo.title === 'object' && convo.title !== null) {
                        console.error(`Conversation at index ${index} has title as object:`, convo.title);
                    }
                });
            }
            setConversations(convos);
        } catch (error) {
            console.error('Failed to load conversations:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // const handleNewChat = () => {
    //     onCreateNewChat();
    //     // Refresh conversations list after creating new chat
    //     loadConversations();
    // };

    const formatTimeAgo = (timestamp: number) => {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'now';
    };

    const getConversationTitle = (conversation: Conversation) => {
        // Use the first message content or fallback to timestamp
        // Add type checking and logging for debugging
        if (typeof conversation.title === 'object' && conversation.title !== null) {
            console.error('Conversation title is an object, expected string:', conversation.title);
            return `Conversation ${new Date(conversation.lastMessageAt).toLocaleDateString()}`;
        }
        return conversation.title || `Conversation ${new Date(conversation.lastMessageAt).toLocaleDateString()}`;
    };

    return (
        <div className="chat-list">

            <div className="chat-list-body" style={{ position: 'relative' }}>
                {isLoading ? (
                    <div className="loading">Loading...</div>
                ) : conversations.length === 0 ? (
                    <div className="empty-state" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textWrap: 'nowrap' }}>
                        No conversations yet
                    </div>
                ) : (
                    conversations.map((conversation) => (
                        <div
                            key={conversation.id}
                            className={`chat-item ${conversation.id === currentConversationId ? 'active' : ''}`}
                             onClick={() => {
                                 console.log('Chat item clicked:', conversation.id);
                                 console.log('Current conversation ID:', currentConversationId);
                                 onSelectConversation(conversation.id);
                             }}
                            role="button"
                            tabIndex={0}
                            aria-label={`Conversation: ${getConversationTitle(conversation)}`}
                        >
                            <div className="chat-item-content">
                                <div className="chat-item-title" title={getConversationTitle(conversation)}>
                                    {getConversationTitle(conversation)}
                                </div>
                                <div className="chat-item-time">
                                    {formatTimeAgo(conversation.lastMessageAt)}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div >
    );
};

export default ChatList;