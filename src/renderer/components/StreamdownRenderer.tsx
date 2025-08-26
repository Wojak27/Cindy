import React, { useMemo } from 'react';
import { hasMarkdown, renderMarkdown } from '../utils/markdownRenderer';

// Props interface for the StreamdownRenderer component
interface StreamdownRendererProps {
    content: string;
    isStreaming?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * StreamdownRenderer - Enhanced markdown renderer with Streamdown integration
 * 
 * Currently using fallback renderer to ensure stability while Streamdown has
 * component loading issues. The component structure is ready for when the
 * ES module import issues with Streamdown are resolved.
 * 
 * Features ready for activation:
 * - Streaming-aware parsing for incomplete markdown
 * - Syntax highlighting with Shiki
 * - Math rendering with KaTeX  
 * - Mermaid diagram support
 * - Security hardening for links and images
 */
const StreamdownRenderer: React.FC<StreamdownRendererProps> = ({
    content,
    isStreaming = false,
    className = '',
    style = {}
}) => {
    // Don't render markdown for non-markdown content unless streaming
    if (!hasMarkdown(content) && !isStreaming) {
        return <span className={className} style={style}>{content}</span>;
    }

    // Use the reliable fallback renderer to ensure the app remains functional
    // TODO: Re-enable Streamdown once ES module import issues are resolved
    const renderedContent = useMemo(() => {
        return (
            <div className={`streamdown-renderer ${className}`} style={style}>
                <div className={`streamdown-content ${isStreaming ? 'streaming' : ''}`}>
                    {renderMarkdown(content)}
                </div>
            </div>
        );
    }, [content, isStreaming, className, style]);

    return renderedContent;
};

export default StreamdownRenderer;