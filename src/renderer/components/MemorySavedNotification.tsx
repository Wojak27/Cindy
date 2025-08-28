import React, { useState, useEffect } from 'react';
import { MemoryNote } from '../../main/services/AgenticMemoryService';

interface MemorySavedNotificationProps {
    type: 'user_message' | 'assistant_response';
    memory: MemoryNote;
    conversationId: string;
    onDismiss?: () => void;
    autoHide?: boolean;
    autoHideDelay?: number;
}

const MemorySavedNotification: React.FC<MemorySavedNotificationProps> = ({
    type,
    memory,
    conversationId,
    onDismiss,
    autoHide = true,
    autoHideDelay = 3000
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isVisible, setIsVisible] = useState(true);
    const [shouldAutoHide, setShouldAutoHide] = useState(autoHide);

    useEffect(() => {
        if (shouldAutoHide && !isExpanded) {
            const timer = setTimeout(() => {
                setIsVisible(false);
                if (onDismiss) {
                    setTimeout(onDismiss, 300); // Wait for animation to complete
                }
            }, autoHideDelay);

            return () => clearTimeout(timer);
        }
    }, [shouldAutoHide, isExpanded, autoHideDelay, onDismiss]);

    const handleToggle = () => {
        setIsExpanded(!isExpanded);
        // Stop auto-hide when user interacts
        setShouldAutoHide(false);
    };

    const handleDismiss = () => {
        setIsVisible(false);
        if (onDismiss) {
            setTimeout(onDismiss, 300); // Wait for animation to complete
        }
    };

    const getTypeIcon = () => {
        return type === 'user_message' ? '👤' : '🤖';
    };

    const getTypeLabel = () => {
        return type === 'user_message' ? 'User Memory' : 'AI Memory';
    };

    const formatTimestamp = (timestamp: number) => {
        return new Date(timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    };

    const truncateText = (text: string, maxLength: number = 100) => {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    };

    if (!isVisible) {
        return null;
    }

    return (
        <div 
            className={`memory-saved-notification ${isVisible ? 'visible' : 'hidden'}`}
            style={{
                position: 'relative',
                backgroundColor: '#f0f9ff',
                border: '1px solid #0ea5e9',
                borderRadius: '8px',
                padding: '8px 12px',
                marginBottom: '8px',
                fontSize: '14px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                transition: 'all 0.3s ease',
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(-10px)',
                maxWidth: '400px'
            }}
        >
            {/* Header */}
            <div 
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer'
                }}
                onClick={handleToggle}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>🧠</span>
                    <span style={{ fontWeight: 'bold', color: '#0369a1' }}>
                        Memory saved
                    </span>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                        {getTypeIcon()} {getTypeLabel()}
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                        {formatTimestamp(memory.timestamp)}
                    </span>
                    <button
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '12px',
                            color: '#64748b',
                            padding: '2px',
                            borderRadius: '4px',
                            transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#e2e8f0';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                    >
                        {isExpanded ? '▼' : '▶'}
                    </button>
                    <button
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '16px',
                            color: '#94a3b8',
                            padding: '2px',
                            borderRadius: '4px',
                            transition: 'background-color 0.2s'
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDismiss();
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#e2e8f0';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                        title="Dismiss"
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* Quick Preview */}
            {!isExpanded && (
                <div style={{ 
                    marginTop: '4px', 
                    color: '#475569',
                    fontSize: '12px',
                    fontStyle: 'italic'
                }}>
                    {truncateText(memory.context)}
                </div>
            )}

            {/* Expanded Content */}
            {isExpanded && (
                <div 
                    style={{
                        marginTop: '12px',
                        paddingTop: '12px',
                        borderTop: '1px solid #e2e8f0',
                        animation: isExpanded ? 'fadeIn 0.3s ease' : 'fadeOut 0.3s ease'
                    }}
                >
                    {/* Context */}
                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ 
                            fontWeight: 'bold', 
                            color: '#0369a1', 
                            marginBottom: '4px',
                            fontSize: '13px'
                        }}>
                            Context:
                        </div>
                        <div style={{ 
                            color: '#475569',
                            fontSize: '12px',
                            lineHeight: '1.4',
                            backgroundColor: '#f8fafc',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            border: '1px solid #e2e8f0'
                        }}>
                            {memory.context}
                        </div>
                    </div>

                    {/* Keywords */}
                    {memory.keywords.length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                            <div style={{ 
                                fontWeight: 'bold', 
                                color: '#0369a1', 
                                marginBottom: '4px',
                                fontSize: '13px'
                            }}>
                                Keywords:
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {memory.keywords.map((keyword, index) => (
                                    <span
                                        key={index}
                                        style={{
                                            backgroundColor: '#dbeafe',
                                            color: '#1e40af',
                                            padding: '2px 6px',
                                            borderRadius: '12px',
                                            fontSize: '11px',
                                            fontWeight: '500'
                                        }}
                                    >
                                        {keyword}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Tags */}
                    {memory.tags.length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                            <div style={{ 
                                fontWeight: 'bold', 
                                color: '#0369a1', 
                                marginBottom: '4px',
                                fontSize: '13px'
                            }}>
                                Tags:
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {memory.tags.map((tag, index) => (
                                    <span
                                        key={index}
                                        style={{
                                            backgroundColor: '#ecfdf5',
                                            color: '#065f46',
                                            padding: '2px 6px',
                                            borderRadius: '12px',
                                            fontSize: '11px',
                                            fontWeight: '500',
                                            border: '1px solid #d1fae5'
                                        }}
                                    >
                                        #{tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Original Content */}
                    <div style={{ marginBottom: '8px' }}>
                        <div style={{ 
                            fontWeight: 'bold', 
                            color: '#0369a1', 
                            marginBottom: '4px',
                            fontSize: '13px'
                        }}>
                            Original Content:
                        </div>
                        <div style={{ 
                            color: '#374151',
                            fontSize: '12px',
                            lineHeight: '1.4',
                            backgroundColor: '#f9fafb',
                            padding: '8px',
                            borderRadius: '4px',
                            border: '1px solid #e5e7eb',
                            maxHeight: '120px',
                            overflowY: 'auto'
                        }}>
                            {memory.content}
                        </div>
                    </div>

                    {/* Meta Information */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '11px',
                        color: '#6b7280',
                        paddingTop: '8px',
                        borderTop: '1px solid #f3f4f6'
                    }}>
                        <div>
                            ID: {memory.id.substring(0, 8)}...
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            {memory.evolved && (
                                <span style={{ color: '#dc2626' }}>
                                    🔄 Evolved
                                </span>
                            )}
                            {memory.links.length > 0 && (
                                <span>
                                    🔗 {memory.links.length} links
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MemorySavedNotification;