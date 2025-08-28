import React, { useState } from 'react';
import AgentGraphVisualization from './AgentGraphVisualization';
import MemoryVisualization from './MemoryVisualization';

interface AgentVisualizationPanelProps {
    autoRender?: boolean;
    showControls?: boolean;
    className?: string;
    onRenderComplete?: () => void;
    onError?: (error: Error) => void;
}

type TabType = 'graph' | 'memory';

const AgentVisualizationPanel: React.FC<AgentVisualizationPanelProps> = ({
    autoRender = true,
    showControls = true,
    className = '',
    onRenderComplete,
    onError
}) => {
    const [activeTab, setActiveTab] = useState<TabType>('graph');

    return (
        <div className={`agent-visualization-panel ${className}`}>
            <div className="visualization-tabs">
                <button
                    className={`tab-button ${activeTab === 'graph' ? 'active' : ''}`}
                    onClick={() => setActiveTab('graph')}
                >
                    🌳 Agent Graph
                </button>
                <button
                    className={`tab-button ${activeTab === 'memory' ? 'active' : ''}`}
                    onClick={() => setActiveTab('memory')}
                >
                    🧠 Memory Map
                </button>
            </div>

            <div className="visualization-content">
                {activeTab === 'graph' && (
                    <AgentGraphVisualization
                        autoRender={autoRender}
                        showControls={showControls}
                        className="graph-view"
                        onRenderComplete={onRenderComplete}
                        onError={onError}
                    />
                )}
                
                {activeTab === 'memory' && (
                    <MemoryVisualization
                        className="memory-view"
                        autoRefresh={true}
                        onError={onError}
                    />
                )}
            </div>

            <style jsx>{`
                .agent-visualization-panel {
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }

                .visualization-tabs {
                    display: flex;
                    border-bottom: 1px solid #e0e0e0;
                    background: #fafafa;
                }

                .tab-button {
                    padding: 12px 20px;
                    border: none;
                    background: transparent;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                    color: #666;
                    transition: all 0.2s;
                    position: relative;
                }

                .tab-button:hover {
                    background: #f0f0f0;
                    color: #333;
                }

                .tab-button.active {
                    color: #1976d2;
                    background: white;
                }

                .tab-button.active::after {
                    content: '';
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    height: 2px;
                    background: #1976d2;
                }

                .visualization-content {
                    flex: 1;
                    overflow: hidden;
                }

                .graph-view, .memory-view {
                    height: 100%;
                }
            `}</style>
        </div>
    );
};

export default AgentVisualizationPanel;