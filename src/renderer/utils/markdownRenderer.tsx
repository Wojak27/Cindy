import React from 'react';
import { marked } from 'marked';
import LinkPreview from '../components/LinkPreview';

// Configure marked options for security and compatibility
marked.setOptions({
    breaks: true, // Convert line breaks to <br>
    gfm: true,    // Enable GitHub Flavored Markdown
});

// Custom renderer to integrate with LinkPreview component
const renderer = new marked.Renderer();

// Override link rendering to use our LinkPreview component
renderer.link = function({ href, title, tokens }: { href: string; title?: string; tokens: any[] }) {
    const text = tokens.map(token => token.raw || token.text || '').join('');
    // Store the link data for later processing
    return `<link-preview data-url="${href}" data-title="${title || ''}">${text}</link-preview>`;
};

// Function to render markdown with interactive links
export const renderMarkdown = (content: string): React.ReactNode => {
    try {
        // Parse markdown to HTML
        const htmlContent = marked.parse(content, { renderer }) as string;
        
        // Convert the HTML to React elements with LinkPreview components
        return parseHTMLToReact(htmlContent);
    } catch (error) {
        console.error('Markdown parsing error:', error);
        // Fallback to plain text
        return content;
    }
};

// Function to parse HTML and replace custom link-preview tags with React components
const parseHTMLToReact = (html: string): React.ReactNode => {
    // Split content by our custom link-preview tags
    const parts = html.split(/(<link-preview[^>]*>.*?<\/link-preview>)/g);
    
    return parts.map((part, index) => {
        if (part.startsWith('<link-preview')) {
            // Extract URL and text from the custom tag
            const urlMatch = part.match(/data-url="([^"]*)"/);
            const textMatch = part.match(/>([^<]+)</);
            
            if (urlMatch && textMatch) {
                const url = urlMatch[1];
                const text = textMatch[1];
                
                return (
                    <LinkPreview key={index} url={url}>
                        {text}
                    </LinkPreview>
                );
            }
            return part; // Fallback if parsing fails
        } else if (part.trim()) {
            // Regular HTML content - render as HTML
            return (
                <span
                    key={index}
                    dangerouslySetInnerHTML={{ __html: part }}
                />
            );
        }
        return null;
    }).filter(Boolean);
};

// Function to check if content contains markdown formatting
export const hasMarkdown = (content: string): boolean => {
    const markdownPatterns = [
        /\*\*[^*]+\*\*/,         // Bold text
        /\*[^*]+\*/,             // Italic text
        /^#{1,6}\s/m,            // Headers
        /^\s*[-*+]\s/m,          // Lists
        /^\s*\d+\.\s/m,          // Ordered lists
        /```[\s\S]*?```/,        // Code blocks
        /`[^`]+`/,               // Inline code
        /\[([^\]]+)\]\([^)]+\)/, // Links
        /^\s*>\s/m,              // Blockquotes
    ];
    
    return markdownPatterns.some(pattern => pattern.test(content));
};

// Simple markdown to HTML conversion for basic formatting without links
export const renderSimpleMarkdown = (content: string): string => {
    return content
        // Bold text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Italic text  
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        // Inline code
        .replace(/`([^`]+)`/g, '<code style="background: rgba(0,0,0,0.1); padding: 2px 4px; border-radius: 3px;">$1</code>')
        // Line breaks
        .replace(/\n/g, '<br>');
};

// Function to sanitize HTML content
export const sanitizeHTML = (html: string): string => {
    // Basic HTML sanitization - remove potentially dangerous tags
    const dangerousTags = /<(script|iframe|object|embed|form|input|button)[^>]*>.*?<\/\1>/gi;
    return html.replace(dangerousTags, '');
};