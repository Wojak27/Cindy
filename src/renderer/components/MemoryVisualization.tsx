import React, { useEffect, useState } from 'react';
import { ipcRenderer } from 'electron';

interface MemoryNode {
    id: string;
    content: string;
    conversationId?: string;
    timestamp: number;
    similarity?: number;
    connections: string[];
}

interface MemoryEdge {
    source: string;
    target: string;
    weight: number;
    type: 'semantic' | 'temporal' | 'conversational';
}

interface MemoryGraphData {
    nodes: MemoryNode[];
    edges: MemoryEdge[];
}

interface MemoryVisualizationProps {
    className?: string;
    autoRefresh?: boolean;
    onError?: (error: Error) => void;
}

const MemoryVisualization: React.FC<MemoryVisualizationProps> = ({
    className = '',
    autoRefresh = true,
    onError
}) => {
    const [memoryData, setMemoryData] = useState<MemoryGraphData>({ nodes: [], edges: [] });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedMemory, setSelectedMemory] = useState<MemoryNode | null>(null);

    // Load memory graph data
    const loadMemoryData = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const data = await ipcRenderer.invoke('memory-graph:get-data');
            console.log('[MemoryVisualization] Loaded memory data:', data);
            setMemoryData(data);
        } catch (err) {
            const errorMsg = `Failed to load memory data: ${err instanceof Error ? err.message : 'Unknown error'}`;
            setError(errorMsg);
            console.error('[MemoryVisualization]', errorMsg);
            onError?.(err instanceof Error ? err : new Error(errorMsg));
        } finally {
            setIsLoading(false);
        }
    };

    // Search memories
    const searchMemories = async (query: string) => {
        if (!query.trim()) return [];

        try {
            const results = await ipcRenderer.invoke('memory-graph:retrieve', query, 10);
            return results;
        } catch (err) {
            console.error('[MemoryVisualization] Search error:', err);
            return [];
        }
    };

    // Handle search
    const handleSearch = async () => {
        if (!searchQuery.trim()) {
            await loadMemoryData();
            return;
        }

        setIsLoading(true);
        try {
            const results = await searchMemories(searchQuery);
            
            // Convert search results to graph format
            const nodes = results.map((result: any) => ({
                id: result.id || `memory-${Date.now()}-${Math.random()}`,
                content: result.content || result.text || '',
                conversationId: result.conversationId,
                timestamp: result.timestamp || Date.now(),
                similarity: result.similarity || 0,
                connections: []
            }));

            setMemoryData({ nodes, edges: [] });
            setSelectedMemory(nodes.length > 0 ? nodes[0] : null);
        } catch (err) {
            console.error('[MemoryVisualization] Search failed:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // Format timestamp
    const formatTimestamp = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleString();
    };

    // Format content preview
    const formatContent = (content: string, maxLength: number = 100) => {
        if (content.length <= maxLength) return content;
        return content.substring(0, maxLength) + '...';
    };

    // Get memory type color
    const getMemoryTypeColor = (node: MemoryNode) => {
        if (node.conversationId) return '#e3f2fd'; // Blue for conversation memories
        return '#f3e5f5'; // Purple for general memories
    };

    // Initial load
    useEffect(() => {
        loadMemoryData();
    }, []);

    // Auto-refresh
    useEffect(() => {
        if (!autoRefresh) return;

        const interval = setInterval(loadMemoryData, 30000); // Refresh every 30 seconds
        return () => clearInterval(interval);
    }, [autoRefresh]);

    // Listen for memory updates
    useEffect(() => {
        const handleMemoryUpdate = (event: any, data: MemoryGraphData) => {
            console.log('[MemoryVisualization] Memory graph updated:', data);
            setMemoryData(data);
        };

        ipcRenderer.on('memory-graph:updated', handleMemoryUpdate);
        return () => {
            ipcRenderer.removeListener('memory-graph:updated', handleMemoryUpdate);
        };
    }, []);

    return (
        <div className={`memory-visualization ${className}`}>
            <div className="memory-header">
                <div className="memory-search">
                    <input
                        type="text"
                        placeholder="Search memories..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                        className="memory-search-input"
                    />
                    <button 
                        onClick={handleSearch}
                        disabled={isLoading}
                        className="memory-search-button"
                    >
                        {isLoading ? '🔄' : '🔍'}
                    </button>
                    <button 
                        onClick={loadMemoryData}
                        disabled={isLoading}
                        className="memory-refresh-button"
                        title="Refresh all memories"
                    >
                        ↻
                    </button>
                </div>
                
                <div className="memory-stats">
                    <span className="memory-count">
                        {memoryData.nodes.length} memories
                    </span>
                    <span className="connection-count">
                        {memoryData.edges.length} connections
                    </span>
                </div>
            </div>

            {error && (
                <div className="memory-error">
                    <span>⚠️ {error}</span>
                    <button onClick={loadMemoryData} className="retry-button">
                        Retry
                    </button>
                </div>
            )}

            {isLoading && (
                <div className="memory-loading">
                    <div className="loading-spinner"></div>
                    <span>Loading memories...</span>
                </div>
            )}

            <div className="memory-content">
                <div className="memory-list">
                    <h4>🧠 Memory Nodes</h4>
                    {memoryData.nodes.length === 0 && !isLoading && (
                        <div className="no-memories">
                            <p>No memories found.</p>
                            <p>Memories will appear here as you interact with the assistant.</p>
                        </div>
                    )}
                    
                    {memoryData.nodes.map((node) => (
                        <div
                            key={node.id}
                            className={`memory-node ${selectedMemory?.id === node.id ? 'selected' : ''}`}
                            style={{ borderLeftColor: getMemoryTypeColor(node) }}
                            onClick={() => setSelectedMemory(node)}
                        >
                            <div className="memory-content-preview">
                                {formatContent(node.content)}
                            </div>
                            <div className="memory-metadata">
                                <span className="memory-timestamp">
                                    {formatTimestamp(node.timestamp)}
                                </span>
                                {node.conversationId && (
                                    <span className="memory-conversation">
                                        💬 {node.conversationId.substring(0, 8)}...
                                    </span>
                                )}
                                {node.similarity && (
                                    <span className="memory-similarity">
                                        📊 {Math.round(node.similarity * 100)}%
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {selectedMemory && (
                    <div className="memory-detail">
                        <h4>📝 Memory Detail</h4>
                        <div className="memory-detail-content">
                            <div className="memory-full-content">
                                {selectedMemory.content}
                            </div>
                            <div className="memory-detail-metadata">
                                <div className="metadata-row">
                                    <strong>ID:</strong> {selectedMemory.id}
                                </div>
                                <div className="metadata-row">
                                    <strong>Created:</strong> {formatTimestamp(selectedMemory.timestamp)}
                                </div>
                                {selectedMemory.conversationId && (
                                    <div className="metadata-row">
                                        <strong>Conversation:</strong> {selectedMemory.conversationId}
                                    </div>
                                )}
                                {selectedMemory.similarity && (
                                    <div className="metadata-row">
                                        <strong>Relevance:</strong> {Math.round(selectedMemory.similarity * 100)}%
                                    </div>
                                )}
                                <div className="metadata-row">
                                    <strong>Connections:</strong> {selectedMemory.connections.length}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <style jsx>{`
                .memory-visualization {
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }

                .memory-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px;
                    border-bottom: 1px solid #e0e0e0;
                    background: #fafafa;
                }

                .memory-search {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .memory-search-input {
                    padding: 6px 12px;
                    border: 1px solid #d0d0d0;
                    border-radius: 4px;
                    font-size: 14px;
                    width: 200px;
                }

                .memory-search-button, .memory-refresh-button {
                    padding: 6px 12px;
                    border: 1px solid #d0d0d0;
                    border-radius: 4px;
                    background: white;
                    cursor: pointer;
                    font-size: 14px;
                }

                .memory-search-button:hover, .memory-refresh-button:hover {
                    background: #f0f0f0;
                }

                .memory-stats {
                    display: flex;
                    gap: 16px;
                    font-size: 12px;
                    color: #666;
                }

                .memory-error {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px;
                    background: #fff3cd;
                    border: 1px solid #ffeaa7;
                    color: #856404;
                }

                .memory-loading {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 32px;
                    color: #666;
                }

                .loading-spinner {
                    width: 20px;
                    height: 20px;
                    border: 2px solid #e0e0e0;
                    border-top: 2px solid #1976d2;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-right: 12px;
                }

                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }

                .memory-content {
                    display: flex;
                    height: calc(100% - 60px);
                    overflow: hidden;
                }

                .memory-list {
                    flex: 1;
                    overflow-y: auto;
                    padding: 12px;
                    border-right: 1px solid #e0e0e0;
                }

                .memory-list h4 {
                    margin: 0 0 12px 0;
                    font-size: 14px;
                    font-weight: 600;
                    color: #333;
                }

                .no-memories {
                    text-align: center;
                    color: #666;
                    font-size: 14px;
                    padding: 32px;
                }

                .memory-node {
                    padding: 12px;
                    margin-bottom: 8px;
                    border: 1px solid #e0e0e0;
                    border-left: 4px solid #e3f2fd;
                    border-radius: 4px;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .memory-node:hover {
                    background: #f8f9fa;
                    border-color: #1976d2;
                }

                .memory-node.selected {
                    background: #e3f2fd;
                    border-color: #1976d2;
                }

                .memory-content-preview {
                    font-size: 14px;
                    line-height: 1.4;
                    margin-bottom: 8px;
                }

                .memory-metadata {
                    display: flex;
                    gap: 12px;
                    font-size: 12px;
                    color: #666;
                }

                .memory-detail {
                    flex: 1;
                    overflow-y: auto;
                    padding: 12px;
                    background: #fafafa;
                }

                .memory-detail h4 {
                    margin: 0 0 12px 0;
                    font-size: 14px;
                    font-weight: 600;
                    color: #333;
                }

                .memory-detail-content {
                    background: white;
                    border: 1px solid #e0e0e0;
                    border-radius: 4px;
                    overflow: hidden;
                }

                .memory-full-content {
                    padding: 16px;
                    font-size: 14px;
                    line-height: 1.5;
                    border-bottom: 1px solid #e0e0e0;
                }

                .memory-detail-metadata {
                    padding: 16px;
                    background: #f8f9fa;
                }

                .metadata-row {
                    display: flex;
                    margin-bottom: 8px;
                    font-size: 13px;
                }

                .metadata-row strong {
                    width: 120px;
                    font-weight: 600;
                }

                .retry-button {
                    padding: 4px 8px;
                    border: 1px solid #856404;
                    border-radius: 4px;
                    background: white;
                    color: #856404;
                    cursor: pointer;
                    font-size: 12px;
                }
            `}</style>
        </div>
    );
};

export default MemoryVisualization;