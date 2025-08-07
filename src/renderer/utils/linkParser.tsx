import React from 'react';
import LinkPreview from '../components/LinkPreview';

// Regular expression to match URLs and markdown links
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/gi;

interface ParsedContent {
    type: 'text' | 'link' | 'markdown-link';
    content: string;
    url?: string;
    text?: string;
}

export const parseLinksInText = (text: string): ParsedContent[] => {
    const parts: ParsedContent[] = [];
    let lastIndex = 0;

    // First, handle markdown links
    const markdownMatches: Array<{ match: RegExpExecArray; type: 'markdown' }> = [];
    let markdownMatch;
    const markdownRegex = new RegExp(MARKDOWN_LINK_REGEX.source, MARKDOWN_LINK_REGEX.flags);
    
    while ((markdownMatch = markdownRegex.exec(text)) !== null) {
        markdownMatches.push({ match: markdownMatch, type: 'markdown' });
    }

    // Then handle plain URLs (but exclude those already in markdown links)
    const urlMatches: Array<{ match: RegExpExecArray; type: 'url' }> = [];
    let urlMatch;
    const urlRegex = new RegExp(URL_REGEX.source, URL_REGEX.flags);
    
    while ((urlMatch = urlRegex.exec(text)) !== null) {
        // Check if this URL is already part of a markdown link
        const isInMarkdown = markdownMatches.some(md => 
            urlMatch!.index >= md.match.index && 
            urlMatch!.index < md.match.index + md.match[0].length
        );
        
        if (!isInMarkdown) {
            urlMatches.push({ match: urlMatch, type: 'url' });
        }
    }

    // Combine and sort all matches by position
    const allMatches = [...markdownMatches, ...urlMatches].sort((a, b) => a.match.index - b.match.index);

    // Process matches in order
    allMatches.forEach(({ match, type }) => {
        // Add text before the match
        if (match.index > lastIndex) {
            const textBefore = text.slice(lastIndex, match.index);
            if (textBefore) {
                parts.push({ type: 'text', content: textBefore });
            }
        }

        // Add the match
        if (type === 'markdown') {
            parts.push({
                type: 'markdown-link',
                content: match[0],
                text: match[1], // Link text
                url: match[2]   // URL
            });
        } else {
            parts.push({
                type: 'link',
                content: match[0],
                url: match[0]
            });
        }

        lastIndex = match.index + match[0].length;
    });

    // Add remaining text
    if (lastIndex < text.length) {
        const remainingText = text.slice(lastIndex);
        if (remainingText) {
            parts.push({ type: 'text', content: remainingText });
        }
    }

    // If no matches found, return the entire text
    if (parts.length === 0) {
        parts.push({ type: 'text', content: text });
    }

    return parts;
};

export const renderTextWithLinks = (text: string): React.ReactNode => {
    const parts = parseLinksInText(text);
    
    return parts.map((part, index) => {
        switch (part.type) {
            case 'link':
                return (
                    <LinkPreview key={index} url={part.url!}>
                        {part.content}
                    </LinkPreview>
                );
            
            case 'markdown-link':
                return (
                    <LinkPreview key={index} url={part.url!}>
                        {part.text}
                    </LinkPreview>
                );
            
            default:
                return part.content;
        }
    });
};

// Function to check if text contains any links
export const hasLinks = (text: string): boolean => {
    return URL_REGEX.test(text) || MARKDOWN_LINK_REGEX.test(text);
};