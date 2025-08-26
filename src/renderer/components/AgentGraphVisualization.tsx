import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { ipcRenderer } from 'electron';

interface AgentGraphVisualizationProps {
  autoRender?: boolean;
  showControls?: boolean;
  className?: string;
  onRenderComplete?: () => void;
  onError?: (error: Error) => void;
}

const AgentGraphVisualization: React.FC<AgentGraphVisualizationProps> = ({
  autoRender = true,
  showControls = true,
  className = '',
  onRenderComplete,
  onError
}) => {
  const graphRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mermaidCode, setMermaidCode] = useState<string>('');
  const [isVisible, setIsVisible] = useState(false);
  const [renderedSVG, setRenderedSVG] = useState<string>('');
  const [renderKey, setRenderKey] = useState<number>(0);

  // Initialize mermaid
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      themeVariables: {
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
        fontSize: '14px',
        primaryColor: '#e3f2fd',
        primaryTextColor: '#1565c0',
        primaryBorderColor: '#1976d2',
        lineColor: '#424242',
        secondaryColor: '#f3e5f5',
        tertiaryColor: '#fff3e0',
      },
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: 'linear'
      }
    });

    if (autoRender) {
      renderGraph();
    }
  }, [autoRender]);

  // No manual DOM cleanup needed - React handles it with dangerouslySetInnerHTML

  const renderGraph = async () => {
    setIsLoading(true);
    setError(null);
    setRenderedSVG('');

    try {
      console.log('🎨 [AgentGraph] Requesting mermaid code from main process...');
      
      // Request mermaid code from main process
      const code = await ipcRenderer.invoke('agent:mermaid');
      
      if (!code) {
        throw new Error('No mermaid code received from agent');
      }

      console.log('📊 [AgentGraph] Received mermaid code, rendering...');
      setMermaidCode(code);

      // Generate unique ID for this render
      const graphId = `agent-graph-${Date.now()}`;

      try {
        // Render the mermaid diagram
        const { svg } = await mermaid.render(graphId, code);
        
        // Set the rendered SVG in state - React will handle the DOM safely
        setRenderedSVG(svg);
        setRenderKey(prev => prev + 1); // Force re-render
        
        console.log('✅ [AgentGraph] Graph rendered successfully');
        onRenderComplete?.();
        
      } catch (renderError) {
        console.error('❌ [AgentGraph] Mermaid render error:', renderError);
        
        // Fallback: show the raw mermaid code
        const fallbackHTML = `
          <div class="mermaid-error">
            <h4>Graph Rendering Error</h4>
            <p>Could not render the agent graph. Raw mermaid code:</p>
            <pre style="background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow: auto;">
${code}
            </pre>
          </div>
        `;
        setRenderedSVG(fallbackHTML);
        setRenderKey(prev => prev + 1);
        
        throw renderError;
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ [AgentGraph] Graph generation failed:', errorMessage);
      setError(errorMessage);
      onError?.(err instanceof Error ? err : new Error(errorMessage));

      // Show error state
      const errorHTML = `
        <div style="text-align: center; padding: 2rem; color: #d32f2f;">
          <h4>Agent Graph Unavailable</h4>
          <p>Error: ${errorMessage}</p>
          <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #1976d2; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Retry
          </button>
        </div>
      `;
      setRenderedSVG(errorHTML);
      setRenderKey(prev => prev + 1);
    } finally {
      setIsLoading(false);
    }
  };

  // Node interactivity will be handled through React event delegation
  useEffect(() => {
    if (renderedSVG && graphRef.current) {
      // Add click handler to the container for event delegation
      const handleClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('.node')) {
          const nodeText = target.textContent || '';
          console.log('🔍 [AgentGraph] Node clicked:', nodeText);
        }
      };

      graphRef.current.addEventListener('click', handleClick);
      
      // Cleanup
      return () => {
        if (graphRef.current) {
          graphRef.current.removeEventListener('click', handleClick);
        }
      };
    }
  }, [renderedSVG, renderKey]);

  const refreshGraph = () => {
    renderGraph();
  };

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };

  const downloadGraph = async () => {
    if (!graphRef.current) return;

    try {
      const svgElement = graphRef.current.querySelector('svg');
      if (!svgElement) return;

      // Convert SVG to blob and download
      const svgData = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = 'agent-graph.svg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      console.log('💾 [AgentGraph] Graph downloaded as SVG');
    } catch (error) {
      console.error('❌ [AgentGraph] Download failed:', error);
    }
  };

  const copyMermaidCode = () => {
    if (mermaidCode) {
      navigator.clipboard.writeText(mermaidCode);
      console.log('📋 [AgentGraph] Mermaid code copied to clipboard');
    }
  };

  return (
    <div className={`agent-graph-container ${className}`} style={{ width: '100%', height: '100%' }}>
      {showControls && (
        <div className="graph-controls" style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1rem',
          padding: '0.5rem',
          background: '#f5f5f5',
          borderRadius: '4px',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={refreshGraph}
            disabled={isLoading}
            style={{
              padding: '0.25rem 0.75rem',
              background: '#1976d2',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem'
            }}
          >
            {isLoading ? '🔄 Loading...' : '🔄 Refresh'}
          </button>
          
          <button
            onClick={toggleVisibility}
            style={{
              padding: '0.25rem 0.75rem',
              background: '#424242',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            {isVisible ? '👁️ Hide' : '👁️ Show'}
          </button>

          <button
            onClick={downloadGraph}
            disabled={!mermaidCode || isLoading}
            style={{
              padding: '0.25rem 0.75rem',
              background: '#388e3c',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (!mermaidCode || isLoading) ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem'
            }}
          >
            💾 Download
          </button>

          <button
            onClick={copyMermaidCode}
            disabled={!mermaidCode}
            style={{
              padding: '0.25rem 0.75rem',
              background: '#7b1fa2',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: !mermaidCode ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem'
            }}
          >
            📋 Copy Code
          </button>
        </div>
      )}

      {error && (
        <div style={{
          background: '#ffebee',
          border: '1px solid #f44336',
          borderRadius: '4px',
          padding: '1rem',
          marginBottom: '1rem',
          color: '#d32f2f'
        }}>
          <strong>Graph Error:</strong> {error}
        </div>
      )}

      <div
        ref={graphRef}
        className="agent-graph"
        key={renderKey} // Force React to re-mount when content changes
        style={{
          width: '100%',
          height: 'auto',
          minHeight: '400px',
          border: '1px solid #ddd',
          borderRadius: '4px',
          padding: '1rem',
          background: 'white',
          overflow: 'auto',
          display: isVisible === false && showControls ? 'none' : 'block'
        }}
      >
        {isLoading && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            height: '200px',
            color: '#666',
            textAlign: 'center',
            gap: '12px'
          }}>
            <div style={{ fontSize: '2rem' }}>
              🔄
            </div>
            <div>
              <strong>Loading agent graph...</strong>
            </div>
            <div style={{ fontSize: '0.875rem', opacity: 0.8 }}>
              This may take a moment if the agent is still initializing
            </div>
          </div>
        )}
        
        {!isLoading && renderedSVG && (
          <div 
            dangerouslySetInnerHTML={{ __html: renderedSVG }}
            style={{ width: '100%', height: '100%' }}
          />
        )}
      </div>

      {mermaidCode && showControls && (
        <details style={{ marginTop: '1rem' }}>
          <summary style={{ cursor: 'pointer', padding: '0.5rem', background: '#f5f5f5', borderRadius: '4px' }}>
            📝 View Mermaid Source Code
          </summary>
          <pre style={{
            background: '#f8f8f8',
            padding: '1rem',
            borderRadius: '4px',
            overflow: 'auto',
            fontSize: '0.875rem',
            fontFamily: 'monospace',
            marginTop: '0.5rem'
          }}>
            {mermaidCode}
          </pre>
        </details>
      )}
    </div>
  );
};

export default AgentGraphVisualization;