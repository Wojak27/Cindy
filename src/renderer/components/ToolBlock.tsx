/**
 * ToolBlock.tsx
 * 
 * Component for displaying collapsible tool call blocks with execution status and results.
 * Shows tool execution progress, parameters, and results in a user-friendly expandable format.
 */

import React, { useState, useEffect } from 'react';
import './ToolBlock.css';

interface ToolCall {
    id: string;
    name: string;
    parameters: any;
    status: 'pending' | 'executing' | 'completed' | 'failed' | 'retrying';
    result?: any;
    error?: string;
    startTime: number;
    endTime?: number;
    duration?: string;
    retryCount?: number;
    maxRetries?: number;
    retryErrors?: string[];
    reasoning?: string;
    forced?: boolean;
    stepNumber?: number;
    totalSteps?: number;
}

interface ToolBlockProps {
    toolCall: ToolCall;
    defaultOpen?: boolean;
    onToggle?: (isOpen: boolean) => void;
}

const getStatusIcon = (status: string): string => {
    switch (status) {
        case 'pending': return '⏳';
        case 'executing': return '⚡';
        case 'retrying': return '🔄';
        case 'completed': return '✅';
        case 'failed': return '❌';
        default: return '🔧';
    }
};

const getStatusColor = (status: string): string => {
    switch (status) {
        case 'pending': return 'var(--warning)';
        case 'executing': return 'var(--primary)';
        case 'retrying': return 'var(--info)';
        case 'completed': return 'var(--success)';
        case 'failed': return 'var(--error)';
        default: return 'var(--text-secondary)';
    }
};

const ToolBlock: React.FC<ToolBlockProps> = ({
    toolCall,
    defaultOpen = false,
    onToggle
}) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const [displayDuration, setDisplayDuration] = useState(toolCall.duration || '00:00');

    // Calculate duration if not provided
    useEffect(() => {
        if (!toolCall.duration) {
            const calculateDuration = () => {
                const end = toolCall.endTime || Date.now();
                const durationMs = end - toolCall.startTime;
                const seconds = Math.floor(durationMs / 1000);
                const minutes = Math.floor(seconds / 60);
                const remainingSeconds = seconds % 60;

                setDisplayDuration(`${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`);
            };

            // Update duration every second if tool is still executing
            if (!toolCall.endTime && (toolCall.status === 'executing' || toolCall.status === 'retrying')) {
                const timer = setInterval(calculateDuration, 1000);
                return () => clearInterval(timer);
            } else {
                calculateDuration();
                return undefined;
            }
        }
        return undefined;
    }, [toolCall.startTime, toolCall.endTime, toolCall.duration, toolCall.status]);

    const toggleBlock = () => {
        const newIsOpen = !isOpen;
        setIsOpen(newIsOpen);
        if (onToggle) {
            onToggle(newIsOpen);
        }
    };

    const formatParameters = (params: any): string => {
        if (!params || typeof params !== 'object') {
            return JSON.stringify(params);
        }
        return JSON.stringify(params, null, 2);
    };

    const formatResult = (result: any): string => {
        if (typeof result === 'string') {
            return result;
        }
        if (result?.success === false && result?.error) {
            return `Error: ${result.error}`;
        }
        if (result?.data) {
            if (typeof result.data === 'string') {
                return result.data;
            }
            return JSON.stringify(result.data, null, 2);
        }
        return JSON.stringify(result, null, 2);
    };

    return (
        <div className="tool-block">
            <button
                className={`tool-toggle ${isOpen ? 'open' : 'closed'}`}
                onClick={toggleBlock}
                aria-expanded={isOpen}
                aria-controls={`${toolCall.id}-content`}
            >
                <span className="tool-icon">{getStatusIcon(toolCall.status)}</span>
                <span className="tool-name">
                    {toolCall.name}
                    {toolCall.stepNumber && toolCall.totalSteps && (
                        <span className="tool-step-counter"> ({toolCall.stepNumber}/{toolCall.totalSteps})</span>
                    )}
                </span>
                {toolCall.forced && (
                    <span className="tool-forced-badge">🔒 FORCED</span>
                )}
                <span 
                    className="tool-status"
                    style={{ color: getStatusColor(toolCall.status) }}
                >
                    {toolCall.status}
                    {toolCall.retryCount && toolCall.retryCount > 0 && (
                        <span className="tool-retry-count">
                            ({toolCall.retryCount + 1}/{(toolCall.maxRetries || 3) + 1})
                        </span>
                    )}
                </span>
                <span className="tool-duration">{displayDuration}</span>
                <span className="tool-arrow">{isOpen ? '▼' : '▶'}</span>
            </button>
            <div
                id={`${toolCall.id}-content`}
                className={`tool-content ${isOpen ? 'expanded' : 'collapsed'}`}
                role="region"
                aria-labelledby={`${toolCall.id}-toggle`}
            >
                <div className="tool-content-inner">
                    {/* Reasoning Section */}
                    {toolCall.reasoning && (
                        <div className="tool-section">
                            <div className="tool-section-header">Reasoning</div>
                            <div className="tool-reasoning">
                                {toolCall.reasoning}
                                {toolCall.forced && (
                                    <div className="tool-forced-notice">
                                        🔒 This tool was forced by a hashtag in your message
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Parameters Section */}
                    <div className="tool-section">
                        <div className="tool-section-header">Parameters</div>
                        <pre className="tool-code-block">
                            {formatParameters(toolCall.parameters)}
                        </pre>
                    </div>

                    {/* Result Section */}
                    {toolCall.status === 'completed' && toolCall.result && (
                        <div className="tool-section">
                            <div className="tool-section-header">Result</div>
                            <pre className="tool-code-block">
                                {formatResult(toolCall.result)}
                            </pre>
                        </div>
                    )}

                    {/* Error Section */}
                    {(toolCall.status === 'failed' || toolCall.error) && (
                        <div className="tool-section">
                            <div className="tool-section-header error">Error</div>
                            <div className="tool-error">
                                {toolCall.error || 'An unknown error occurred'}
                                {toolCall.retryErrors && toolCall.retryErrors.length > 1 && (
                                    <div style={{ marginTop: '8px', fontSize: '0.9em', opacity: 0.8 }}>
                                        Previous attempts:
                                        <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                                            {toolCall.retryErrors.slice(0, -1).map((err, idx) => (
                                                <li key={idx}>{err}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Status Info */}
                    <div className="tool-metadata">
                        <div className="tool-metadata-item">
                            <span className="tool-metadata-label">Status:</span>
                            <span className="tool-metadata-value" style={{ color: getStatusColor(toolCall.status) }}>
                                {toolCall.status}
                            </span>
                        </div>
                        {toolCall.duration && (
                            <div className="tool-metadata-item">
                                <span className="tool-metadata-label">Duration:</span>
                                <span className="tool-metadata-value">{toolCall.duration}</span>
                            </div>
                        )}
                        {toolCall.retryCount && toolCall.retryCount > 0 && (
                            <div className="tool-metadata-item">
                                <span className="tool-metadata-label">Attempts:</span>
                                <span className="tool-metadata-value">
                                    {toolCall.retryCount + 1}/{(toolCall.maxRetries || 3) + 1}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ToolBlock;