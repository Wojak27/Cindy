import React, { useState, useEffect } from 'react';
import { Chip } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';

interface HashtagManagerProps {
    inputValue: string;
    onHashtagsChange: (hashtags: string[]) => void;
}

const HashtagManager: React.FC<HashtagManagerProps> = ({ inputValue, onHashtagsChange }) => {
    const [activeHashtags, setActiveHashtags] = useState<string[]>([]);

    // Valid hashtags that can be converted to tools
    const validHashtags = [
        '#search', '#find',
        '#read', '#file', 
        '#write', '#create',
        '#list', '#dir',
        '#web'
    ];

    // Extract hashtags from input
    useEffect(() => {
        const hashtags = (inputValue.match(/#\w+/g) || [])
            .map(tag => tag.toLowerCase())
            .filter(tag => validHashtags.includes(tag))
            .filter((tag, index, arr) => arr.indexOf(tag) === index); // Remove duplicates

        setActiveHashtags(hashtags);
        onHashtagsChange(hashtags);
    }, [inputValue, onHashtagsChange]);

    const removeHashtag = (hashtagToRemove: string) => {
        const newHashtags = activeHashtags.filter(tag => tag !== hashtagToRemove);
        setActiveHashtags(newHashtags);
        onHashtagsChange(newHashtags);
    };

    const getHashtagColor = (hashtag: string): string => {
        const lowerTag = hashtag.toLowerCase();
        
        if (lowerTag.includes('search') || lowerTag.includes('find')) {
            return '#E74C3C'; // Red
        } else if (lowerTag.includes('read') || lowerTag.includes('file')) {
            return '#3498DB'; // Blue
        } else if (lowerTag.includes('write') || lowerTag.includes('create')) {
            return '#27AE60'; // Green
        } else if (lowerTag.includes('list') || lowerTag.includes('dir')) {
            return '#F39C12'; // Orange
        } else if (lowerTag.includes('web')) {
            return '#9B59B6'; // Purple
        } else {
            return '#4A90E2'; // Default blue
        }
    };

    if (activeHashtags.length === 0) {
        return null;
    }

    return (
        <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '8px',
            padding: '8px 12px',
            backgroundColor: 'rgba(0, 0, 0, 0.03)',
            borderRadius: '8px',
            border: '1px solid rgba(0, 0, 0, 0.1)'
        }}>
            <div style={{
                fontSize: '12px',
                color: '#666',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                marginRight: '4px'
            }}>
                Active Tools:
            </div>
            {activeHashtags.map((hashtag, index) => (
                <Chip
                    key={index}
                    label={hashtag}
                    onDelete={() => removeHashtag(hashtag)}
                    deleteIcon={<CloseIcon fontSize="small" />}
                    size="small"
                    style={{
                        backgroundColor: getHashtagColor(hashtag),
                        color: 'white',
                        fontWeight: '600',
                        fontSize: '12px',
                        height: '24px'
                    }}
                    sx={{
                        '& .MuiChip-deleteIcon': {
                            color: 'rgba(255, 255, 255, 0.8)',
                            '&:hover': {
                                color: 'white'
                            }
                        }
                    }}
                />
            ))}
        </div>
    );
};

export default HashtagManager;