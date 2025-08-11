import React from 'react';

/**
 * Renders text with styled hashtags
 * Converts hashtags like #search, #read, #write into styled spans
 */
export const renderTextWithHashtags = (text: string): React.ReactElement => {
    // Split text by hashtags while preserving them
    const parts = text.split(/(#\w+)/g);
    
    return (
        <>
            {parts.map((part, index) => {
                if (part.match(/^#\w+$/)) {
                    // This is a hashtag - render with special styling
                    return (
                        <span
                            key={index}
                            className="hashtag-tool"
                            style={{
                                backgroundColor: '#4A90E2',
                                color: 'white',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontSize: '0.9em',
                                fontWeight: '500',
                                margin: '0 2px',
                                display: 'inline-block'
                            }}
                            title={`Tool selector: ${part}`}
                        >
                            {part}
                        </span>
                    );
                } else {
                    // Regular text
                    return part;
                }
            })}
        </>
    );
};

/**
 * Checks if text contains hashtags that should be styled
 */
export const hasHashtags = (text: string): boolean => {
    return /#\w+/.test(text);
};

/**
 * Get hashtag color based on tool type
 */
const getHashtagColor = (hashtag: string): string => {
    const lowerTag = hashtag.toLowerCase();
    
    if (lowerTag.includes('search') || lowerTag.includes('find')) {
        return '#E74C3C'; // Red for search
    } else if (lowerTag.includes('read') || lowerTag.includes('file')) {
        return '#3498DB'; // Blue for read
    } else if (lowerTag.includes('write') || lowerTag.includes('create')) {
        return '#27AE60'; // Green for write
    } else if (lowerTag.includes('list') || lowerTag.includes('dir')) {
        return '#F39C12'; // Orange for list
    } else if (lowerTag.includes('web')) {
        return '#9B59B6'; // Purple for web
    } else {
        return '#4A90E2'; // Default blue
    }
};

/**
 * Enhanced hashtag renderer with color coding
 */
export const renderTextWithColoredHashtags = (text: string): React.ReactElement => {
    const parts = text.split(/(#\w+)/g);
    
    return (
        <>
            {parts.map((part, index) => {
                if (part.match(/^#\w+$/)) {
                    const color = getHashtagColor(part);
                    return (
                        <span
                            key={index}
                            className="hashtag-tool"
                            style={{
                                backgroundColor: color,
                                color: 'white',
                                padding: '3px 10px',
                                borderRadius: '15px',
                                fontSize: '0.85em',
                                fontWeight: '600',
                                margin: '0 3px',
                                display: 'inline-block',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                textTransform: 'lowercase'
                            }}
                            title={`Tool selector: ${part}`}
                        >
                            {part}
                        </span>
                    );
                } else {
                    return part;
                }
            })}
        </>
    );
};