/**
 * EventBlock.tsx
 * 
 * Component for displaying collapsible agent event blocks with status and timing.
 * Shows agent transitions, tool executions, and other system events.
 */

import React, { useState, useEffect } from 'react';
import '../styles/components/EventBlock.css';

interface EventBlockProps {
    id: string;
    title: string;
    eventType: 'agent_transition' | 'tool_execution' | 'document_retrieval' | 'completion' | 'error';
    status: 'running' | 'completed' | 'failed';
    context?: any;
    timestamp: number;
    duration?: number;
    defaultOpen?: boolean;
    isStreaming?: boolean;
    onToggle?: (isOpen: boolean) => void;
}

const EventBlock: React.FC<EventBlockProps> = ({
    id,
    title,
    eventType,
    status,
    context,
    timestamp,
    duration,
    defaultOpen = false,
    isStreaming = false,
    onToggle
}) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const [displayDuration, setDisplayDuration] = useState('00:00');

    // Calculate duration if not provided
    useEffect(() => {
        if (!duration && status === 'running') {
            const timer = setInterval(() => {
                const elapsed = Date.now() - timestamp;
                const seconds = Math.floor(elapsed / 1000);
                const minutes = Math.floor(seconds / 60);
                const remainingSeconds = seconds % 60;
                setDisplayDuration(`${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`);
            }, 1000);
            return () => clearInterval(timer);
        } else if (duration) {
            const seconds = Math.floor(duration / 1000);
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            setDisplayDuration(`${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`);
        }
    }, [duration, status, timestamp]);

    const toggleBlock = () => {
        const newIsOpen = !isOpen;
        setIsOpen(newIsOpen);
        if (onToggle) {
            onToggle(newIsOpen);
        }
    };

    // Get icon based on event type
    const getEventIcon = () => {
        switch (eventType) {
            case 'agent_transition':
                return '🤖';
            case 'tool_execution':
                return '🛠️';
            case 'document_retrieval':
                return '📄';
            case 'completion':
                return '✅';
            case 'error':
                return '❌';
            default:
                return '⚡';
        }
    };

    // Get status indicator
    const getStatusIndicator = () => {
        switch (status) {
            case 'running':
                return '⏳';
            case 'completed':
                return '✅';
            case 'failed':
                return '❌';
            default:
                return '⏳';
        }
    };

    // Determine CSS classes
    const blockClasses = [
        'event-block',
        `event-${eventType}`,
        `status-${status}`,
        isStreaming ? 'streaming' : ''
    ].filter(Boolean).join(' ');

    const toggleClasses = [
        'event-toggle',
        isOpen ? 'open' : 'closed',
        status
    ].filter(Boolean).join(' ');

    // Format context for display
    const formatContext = () => {
        if (!context) return null;

        if (eventType === 'tool_execution') {
            return (
                <div className="event-context">
                    <div className="context-item">
                        <strong>Tool:</strong> {context.toolName || 'Unknown'}
                    </div>
                    {context.input && (
                        <div className="context-item">
                            <strong>Input:</strong> {JSON.stringify(context.input).substring(0, 100)}...
                        </div>
                    )}
                </div>
            );
        }

        if (eventType === 'document_retrieval' && context.file) {
            return (
                <div className="event-context">
                    <div className="context-item">
                        <strong>Document:</strong> {context.file.name}
                    </div>
                    <div className="context-item">
                        <strong>Path:</strong> {context.file.path}
                    </div>
                </div>
            );
        }

        // Generic context display
        return (
            <div className="event-context">
                <pre>{JSON.stringify(context, null, 2)}</pre>
            </div>
        );
    };

    return (
        <div className={blockClasses}>
            <button
                className={toggleClasses}
                onClick={toggleBlock}
                aria-expanded={isOpen}
                aria-controls={`${id}-content`}
            >
                <span className="event-icon">{getEventIcon()}</span>
                <span className="event-title">{title}</span>
                <span className="event-status">{getStatusIndicator()}</span>
                <span className="event-duration">
                    {status === 'running' && !duration ? '⏱️' : displayDuration}
                </span>
                <span className="event-arrow">{isOpen ? '▼' : '▶'}</span>
            </button>
            <div
                id={`${id}-content`}
                className={`event-content ${isOpen ? 'expanded' : 'collapsed'}`}
                role="region"
                aria-labelledby={`${id}-toggle`}
            >
                <div className="event-content-inner">
                    {formatContext()}
                    <div className="event-timestamp">
                        Started: {new Date(timestamp).toLocaleTimeString()}
                        {duration && ` • Duration: ${displayDuration}`}
                    </div>
                    {isStreaming && (
                        <div className="event-streaming">
                            <span className="streaming-indicator">⚡ Active</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EventBlock;