/**
 * ThinkingBlock.tsx
 * 
 * Component for displaying collapsible thinking blocks with duration timers.
 * Shows AI's thought process in a user-friendly expandable format.
 */

import React, { useState, useEffect } from 'react';
import './ThinkingBlock.css';

interface ThinkingBlockProps {
    id: string;
    content: string;
    startTime: number;
    endTime?: number;
    duration?: string;
    defaultOpen?: boolean;
    onToggle?: (isOpen: boolean) => void;
}

const ThinkingBlock: React.FC<ThinkingBlockProps> = ({
    id,
    content,
    startTime,
    endTime,
    duration,
    defaultOpen = false,
    onToggle
}) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const [displayDuration, setDisplayDuration] = useState(duration || '00:00');

    // Calculate duration if not provided
    useEffect(() => {
        if (!duration) {
            const calculateDuration = () => {
                const end = endTime || Date.now();
                const durationMs = end - startTime;
                const seconds = Math.floor(durationMs / 1000);
                const minutes = Math.floor(seconds / 60);
                const remainingSeconds = seconds % 60;

                setDisplayDuration(`${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`);
            };

            // Update duration every second if thinking is still active
            if (!endTime) {
                const timer = setInterval(calculateDuration, 1000);
                return () => clearInterval(timer);
            } else {
                calculateDuration();
                return undefined; // Explicit return for this branch
            }
        }
        return undefined; // Explicit return when duration is provided
    }, [startTime, endTime, duration]);

    const toggleBlock = () => {
        const newIsOpen = !isOpen;
        setIsOpen(newIsOpen);
        if (onToggle) {
            onToggle(newIsOpen);
        }
    };

    return (
        <div className="thinking-block">
            <button
                className={`thinking-toggle ${isOpen ? 'open' : 'closed'}`}
                onClick={toggleBlock}
                aria-expanded={isOpen}
                aria-controls={`${id}-content`}
            >
                <span className="thinking-icon">💡</span>
                <span className="thinking-label">Thinking</span>
                <span className="thinking-duration">{displayDuration}</span>
                <span className="thinking-arrow">{isOpen ? '▼' : '▶'}</span>
            </button>
            <div
                id={`${id}-content`}
                className={`thinking-content ${isOpen ? 'expanded' : 'collapsed'}`}
                role="region"
                aria-labelledby={`${id}-toggle`}
            >
                <div className="thinking-content-inner">
                    {content.split('\n').map((paragraph, index) => (
                        <p key={index} className="thinking-paragraph">
                            {paragraph}
                        </p>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ThinkingBlock;