import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { Box, Paper, Typography, Chip, IconButton, TextField, Tooltip, Card, CardContent, Divider, Stack } from '@mui/material';
import { Search, ZoomIn, ZoomOut, CenterFocusStrong, FilterList, Close } from '@mui/icons-material';
import './MemoryGraphVisualization.css';

interface MemoryNode {
    id: string;
    label: string;
    content: string;
    context: string;
    keywords: string[];
    tags: string[];
    importance: number;
    timestamp: number;
    accessCount: number;
    evolved: boolean;
    color: string;
    size: number;
    x?: number;
    y?: number;
    fx?: number | null;
    fy?: number | null;
}

interface MemoryLink {
    source: string | MemoryNode;
    target: string | MemoryNode;
    strength: number;
    type: 'semantic' | 'temporal' | 'evolved';
}

interface MemoryGraphData {
    nodes: MemoryNode[];
    edges: MemoryLink[];
}

interface MemoryGraphVisualizationProps {
    data?: MemoryGraphData;
    width?: number;
    height?: number;
    onNodeClick?: (node: MemoryNode) => void;
}

const MemoryGraphVisualization: React.FC<MemoryGraphVisualizationProps> = ({
    data,
    width = 800,
    height = 600,
    onNodeClick
}) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [selectedNode, setSelectedNode] = useState<MemoryNode | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filteredTags, setFilteredTags] = useState<string[]>([]);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [hoveredNode, setHoveredNode] = useState<MemoryNode | null>(null);

    // Initialize D3 force simulation
    useEffect(() => {
        if (!data || !svgRef.current) return;

        // Clear previous graph
        d3.select(svgRef.current).selectAll('*').remove();

        const svg = d3.select(svgRef.current);
        const g = svg.append('g');

        // Set up zoom behavior
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 10])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
                setZoomLevel(event.transform.k);
            });

        svg.call(zoom);

        // Filter nodes based on search and tags
        const filteredNodes = data.nodes.filter(node => {
            const matchesSearch = !searchQuery || 
                node.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
                node.context.toLowerCase().includes(searchQuery.toLowerCase()) ||
                node.keywords.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()));
            
            const matchesTags = filteredTags.length === 0 ||
                filteredTags.some(tag => node.tags.includes(tag));
            
            return matchesSearch && matchesTags;
        });

        // Filter edges to only include those with both nodes visible
        const visibleNodeIds = new Set(filteredNodes.map(n => n.id));
        const filteredEdges = data.edges.filter(edge => {
            const sourceId = typeof edge.source === 'string' ? edge.source : edge.source.id;
            const targetId = typeof edge.target === 'string' ? edge.target : edge.target.id;
            return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
        });

        // Create force simulation
        const simulation = d3.forceSimulation<MemoryNode>(filteredNodes)
            .force('link', d3.forceLink<MemoryNode, MemoryLink>(filteredEdges)
                .id(d => d.id)
                .distance(d => 100 * (1 - d.strength))
                .strength(d => d.strength))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(d => d.size + 10));

        // Create arrow markers for directed edges
        svg.append('defs').selectAll('marker')
            .data(['semantic', 'temporal', 'evolved'])
            .enter().append('marker')
            .attr('id', d => `arrow-${d}`)
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 20)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', d => {
                switch(d) {
                    case 'semantic': return '#999';
                    case 'temporal': return '#66b3ff';
                    case 'evolved': return '#ff6b6b';
                    default: return '#999';
                }
            });

        // Create links
        const link = g.append('g')
            .attr('class', 'links')
            .selectAll('line')
            .data(filteredEdges)
            .enter().append('line')
            .attr('class', 'link')
            .attr('stroke', d => {
                switch(d.type) {
                    case 'semantic': return '#999';
                    case 'temporal': return '#66b3ff';
                    case 'evolved': return '#ff6b6b';
                    default: return '#999';
                }
            })
            .attr('stroke-width', d => Math.sqrt(d.strength * 10))
            .attr('stroke-opacity', 0.6)
            .attr('marker-end', d => `url(#arrow-${d.type})`);

        // Create node groups
        const node = g.append('g')
            .attr('class', 'nodes')
            .selectAll('g')
            .data(filteredNodes)
            .enter().append('g')
            .attr('class', 'node-group');

        // Add circles for nodes
        node.append('circle')
            .attr('class', 'node')
            .attr('r', d => d.size)
            .attr('fill', d => d.color)
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .style('cursor', 'pointer')
            .on('click', (event, d) => {
                setSelectedNode(d);
                if (onNodeClick) onNodeClick(d);
            })
            .on('mouseover', (event, d) => {
                setHoveredNode(d);
                // Highlight connected nodes
                link.style('stroke-opacity', l => {
                    const source = typeof l.source === 'object' ? l.source.id : l.source;
                    const target = typeof l.target === 'object' ? l.target.id : l.target;
                    return source === d.id || target === d.id ? 1 : 0.2;
                });
                node.style('opacity', n => {
                    const isConnected = filteredEdges.some(l => {
                        const source = typeof l.source === 'object' ? l.source.id : l.source;
                        const target = typeof l.target === 'object' ? l.target.id : l.target;
                        return (source === d.id && target === n.id) || 
                               (target === d.id && source === n.id) ||
                               n.id === d.id;
                    });
                    return isConnected ? 1 : 0.3;
                });
            })
            .on('mouseout', () => {
                setHoveredNode(null);
                link.style('stroke-opacity', 0.6);
                node.style('opacity', 1);
            });

        // Add labels
        node.append('text')
            .attr('class', 'node-label')
            .attr('dy', '.35em')
            .attr('text-anchor', 'middle')
            .text(d => d.label)
            .style('font-size', '10px')
            .style('pointer-events', 'none');

        // Add evolution indicator
        node.filter(d => d.evolved)
            .append('circle')
            .attr('class', 'evolution-indicator')
            .attr('r', 5)
            .attr('cx', d => d.size - 5)
            .attr('cy', d => -d.size + 5)
            .attr('fill', '#ffd700')
            .attr('stroke', '#fff')
            .attr('stroke-width', 1);

        // Drag behavior
        const drag = d3.drag<SVGGElement, MemoryNode>()
            .on('start', (event, d) => {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            });

        node.call(drag);

        // Update positions on simulation tick
        simulation.on('tick', () => {
            link
                .attr('x1', d => (d.source as MemoryNode).x!)
                .attr('y1', d => (d.source as MemoryNode).y!)
                .attr('x2', d => (d.target as MemoryNode).x!)
                .attr('y2', d => (d.target as MemoryNode).y!);

            node.attr('transform', d => `translate(${d.x},${d.y})`);
        });

        // Cleanup on unmount
        return () => {
            simulation.stop();
        };
    }, [data, searchQuery, filteredTags, width, height, onNodeClick]);

    // Helper functions for controls
    const handleZoomIn = () => {
        const svg = d3.select(svgRef.current);
        svg.transition().duration(300).call(
            d3.zoom<SVGSVGElement, unknown>().scaleTo as any, 
            zoomLevel * 1.5
        );
    };

    const handleZoomOut = () => {
        const svg = d3.select(svgRef.current);
        svg.transition().duration(300).call(
            d3.zoom<SVGSVGElement, unknown>().scaleTo as any, 
            zoomLevel * 0.75
        );
    };

    const handleResetZoom = () => {
        const svg = d3.select(svgRef.current);
        svg.transition().duration(300).call(
            d3.zoom<SVGSVGElement, unknown>().transform as any,
            d3.zoomIdentity
        );
        setZoomLevel(1);
    };

    // Get all unique tags from nodes
    const allTags = data ? Array.from(new Set(data.nodes.flatMap(n => n.tags))) : [];

    return (
        <Box className="memory-graph-container" ref={containerRef}>
            {/* Controls Panel */}
            <Paper className="graph-controls" elevation={2}>
                <Stack direction="row" spacing={2} alignItems="center">
                    {/* Search */}
                    <TextField
                        size="small"
                        placeholder="Search memories..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        InputProps={{
                            startAdornment: <Search fontSize="small" />,
                        }}
                    />

                    {/* Tag Filter */}
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', maxWidth: 300 }}>
                        {allTags.slice(0, 5).map(tag => (
                            <Chip
                                key={tag}
                                label={tag}
                                size="small"
                                variant={filteredTags.includes(tag) ? "filled" : "outlined"}
                                onClick={() => {
                                    if (filteredTags.includes(tag)) {
                                        setFilteredTags(filteredTags.filter(t => t !== tag));
                                    } else {
                                        setFilteredTags([...filteredTags, tag]);
                                    }
                                }}
                            />
                        ))}
                    </Box>

                    {/* Zoom Controls */}
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Tooltip title="Zoom In">
                            <IconButton size="small" onClick={handleZoomIn}>
                                <ZoomIn />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Zoom Out">
                            <IconButton size="small" onClick={handleZoomOut}>
                                <ZoomOut />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Reset View">
                            <IconButton size="small" onClick={handleResetZoom}>
                                <CenterFocusStrong />
                            </IconButton>
                        </Tooltip>
                    </Box>

                    <Typography variant="caption" color="textSecondary">
                        Zoom: {Math.round(zoomLevel * 100)}%
                    </Typography>
                </Stack>
            </Paper>

            {/* Graph Canvas */}
            <Paper className="graph-canvas" elevation={1}>
                <svg ref={svgRef} width={width} height={height}></svg>
            </Paper>

            {/* Node Details Panel */}
            {selectedNode && (
                <Card className="node-details-panel" elevation={3}>
                    <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                            <Typography variant="h6">Memory Details</Typography>
                            <IconButton size="small" onClick={() => setSelectedNode(null)}>
                                <Close />
                            </IconButton>
                        </Box>
                        
                        <Stack spacing={2}>
                            <Box>
                                <Typography variant="caption" color="textSecondary">Content</Typography>
                                <Typography variant="body2">{selectedNode.content}</Typography>
                            </Box>
                            
                            <Box>
                                <Typography variant="caption" color="textSecondary">Context</Typography>
                                <Typography variant="body2">{selectedNode.context}</Typography>
                            </Box>
                            
                            <Box>
                                <Typography variant="caption" color="textSecondary">Keywords</Typography>
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                                    {selectedNode.keywords.map(k => (
                                        <Chip key={k} label={k} size="small" variant="outlined" />
                                    ))}
                                </Box>
                            </Box>
                            
                            <Box>
                                <Typography variant="caption" color="textSecondary">Tags</Typography>
                                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                                    {selectedNode.tags.map(t => (
                                        <Chip key={t} label={t} size="small" color="primary" variant="outlined" />
                                    ))}
                                </Box>
                            </Box>
                            
                            <Divider />
                            
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="caption">
                                    Importance: {(selectedNode.importance * 100).toFixed(0)}%
                                </Typography>
                                <Typography variant="caption">
                                    Accessed: {selectedNode.accessCount} times
                                </Typography>
                            </Box>
                            
                            {selectedNode.evolved && (
                                <Chip 
                                    label="Evolved Memory" 
                                    color="warning" 
                                    size="small" 
                                    icon={<FilterList />}
                                />
                            )}
                            
                            <Typography variant="caption" color="textSecondary">
                                Created: {new Date(selectedNode.timestamp).toLocaleString()}
                            </Typography>
                        </Stack>
                    </CardContent>
                </Card>
            )}

            {/* Hover Tooltip */}
            {hoveredNode && !selectedNode && (
                <Paper className="node-tooltip" elevation={2} sx={{
                    position: 'absolute',
                    pointerEvents: 'none',
                    p: 1,
                    maxWidth: 300
                }}>
                    <Typography variant="body2" fontWeight="bold">
                        {hoveredNode.label}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                        {hoveredNode.context}
                    </Typography>
                </Paper>
            )}

            {/* Legend */}
            <Paper className="graph-legend" elevation={1}>
                <Typography variant="caption" fontWeight="bold" gutterBottom>
                    Legend
                </Typography>
                <Stack spacing={0.5}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#4ecdc4' }} />
                        <Typography variant="caption">Normal Memory</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#ff6b6b' }} />
                        <Typography variant="caption">Evolved Memory</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 20, height: 2, bgcolor: '#999' }} />
                        <Typography variant="caption">Semantic Link</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 20, height: 2, bgcolor: '#66b3ff' }} />
                        <Typography variant="caption">Temporal Link</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 20, height: 2, bgcolor: '#ff6b6b' }} />
                        <Typography variant="caption">Evolution Link</Typography>
                    </Box>
                </Stack>
            </Paper>
        </Box>
    );
};

export default MemoryGraphVisualization;