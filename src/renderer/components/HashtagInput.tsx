import React, { useState, useRef, useEffect } from 'react';
import { renderTextWithColoredHashtags, hasHashtags } from '../utils/hashtagRenderer';

interface HashtagInputProps {
    value: string;
    onChange: (value: string) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    placeholder?: string;
    disabled?: boolean;
    style?: React.CSSProperties;
    className?: string;
}

const HashtagInput: React.FC<HashtagInputProps> = ({
    value,
    onChange,
    onKeyDown,
    placeholder,
    disabled,
    style,
    className
}) => {
    const [isFocused, setIsFocused] = useState(false);
    const hiddenInputRef = useRef<HTMLInputElement>(null);
    const displayRef = useRef<HTMLDivElement>(null);

    // Handle clicks on the display to focus the hidden input
    const handleDisplayClick = () => {
        if (hiddenInputRef.current && !disabled) {
            hiddenInputRef.current.focus();
        }
    };

    // Handle input changes
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(e.target.value);
    };

    // Handle key events
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (onKeyDown) {
            onKeyDown(e);
        }
    };

    // Handle focus events
    const handleFocus = () => {
        setIsFocused(true);
    };

    const handleBlur = () => {
        setIsFocused(false);
    };

    // Synchronize cursor position (basic implementation)
    useEffect(() => {
        if (hiddenInputRef.current && displayRef.current && isFocused) {
            // This is a simple approach - for a more sophisticated cursor sync,
            // you'd need more complex positioning calculations
            // const cursorPosition = hiddenInputRef.current.selectionStart || 0;
        }
    }, [value, isFocused]);

    const baseStyle: React.CSSProperties = {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        minHeight: '40px',
        padding: '8px 12px',
        border: `1px solid ${isFocused ? '#007ACC' : '#ddd'}`,
        borderRadius: '4px',
        backgroundColor: disabled ? '#f5f5f5' : '#fff',
        cursor: disabled ? 'not-allowed' : 'text',
        fontSize: '14px',
        lineHeight: '1.4',
        ...style
    };

    const hiddenInputStyle: React.CSSProperties = {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        opacity: 0,
        zIndex: 1,
        border: 'none',
        outline: 'none',
        background: 'transparent',
        fontSize: 'inherit',
        fontFamily: 'inherit',
        padding: '8px 12px',
        cursor: disabled ? 'not-allowed' : 'text'
    };

    const displayStyle: React.CSSProperties = {
        position: 'relative',
        width: '100%',
        minHeight: '24px',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '2px',
        zIndex: 0,
        pointerEvents: 'none'
    };

    const placeholderStyle: React.CSSProperties = {
        color: '#999',
        fontStyle: 'italic'
    };

    const cursorStyle: React.CSSProperties = {
        display: 'inline-block',
        width: '1px',
        height: '20px',
        backgroundColor: '#007ACC',
        animation: isFocused ? 'blink 1s infinite' : 'none',
        marginLeft: '1px'
    };

    return (
        <div style={baseStyle} className={className} onClick={handleDisplayClick}>
            {/* Hidden input for actual text editing */}
            <input
                ref={hiddenInputRef}
                type="text"
                value={value}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={handleFocus}
                onBlur={handleBlur}
                disabled={disabled}
                style={hiddenInputStyle}
                autoComplete="off"
            />
            
            {/* Visible display with hashtag styling */}
            <div ref={displayRef} style={displayStyle}>
                {value ? (
                    <>
                        {hasHashtags(value) ? (
                            renderTextWithColoredHashtags(value)
                        ) : (
                            <span>{value}</span>
                        )}
                        {isFocused && <span style={cursorStyle} />}
                    </>
                ) : (
                    <span style={placeholderStyle}>{placeholder}</span>
                )}
            </div>

            {/* CSS for cursor blinking animation */}
            <style>{`
                @keyframes blink {
                    0%, 50% { opacity: 1; }
                    51%, 100% { opacity: 0; }
                }
            `}</style>
        </div>
    );
};

export default HashtagInput;