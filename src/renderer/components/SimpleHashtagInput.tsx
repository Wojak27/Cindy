import React from 'react';
import { renderTextWithColoredHashtags, hasHashtags } from '../utils/hashtagRenderer';

interface SimpleHashtagInputProps {
    value: string;
    onChange: (value: string) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    placeholder?: string;
    disabled?: boolean;
    style?: React.CSSProperties;
    className?: string;
}

const SimpleHashtagInput: React.FC<SimpleHashtagInputProps> = ({
    value,
    onChange,
    onKeyDown,
    placeholder,
    disabled,
    style,
    className
}) => {
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(e.target.value);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (onKeyDown) {
            onKeyDown(e);
        }
    };

    return (
        <div style={{ position: 'relative', width: '100%' }}>
            {/* Preview of hashtag styling above input */}
            {value && hasHashtags(value) && (
                <div
                    style={{
                        marginBottom: '4px',
                        padding: '6px 8px',
                        backgroundColor: 'rgba(0, 0, 0, 0.05)',
                        border: '1px solid rgba(0, 0, 0, 0.1)',
                        borderRadius: '4px',
                        fontSize: '13px',
                        lineHeight: '1.4'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                        <span style={{ fontSize: '11px', color: '#666', fontWeight: '500' }}>Preview:</span>
                    </div>
                    {renderTextWithColoredHashtags(value)}
                </div>
            )}
            
            {/* Regular input field */}
            <input
                type="text"
                value={value}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                className={className}
                style={style}
                autoComplete="off"
            />
        </div>
    );
};

export default SimpleHashtagInput;