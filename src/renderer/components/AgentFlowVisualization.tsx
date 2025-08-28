/**
 * Agent Flow Visualization Component
 * Shows a collapsible timeline of agent workflow steps
 */

import React, { useState } from 'react';
import { Box, Typography, IconButton, Collapse, Chip, Avatar } from '@mui/material';
import '../styles/AgentFlowVisualization.css';
import TodoListStep from './TodoListStep';
import { 
    ExpandMore as ExpandMoreIcon,
    ExpandLess as ExpandLessIcon,
    Psychology as ThinkingIcon,
    Search as SearchIcon,
    AutoAwesome as SynthesisIcon,
    CheckCircle as CompleteIcon,
    Error as ErrorIcon,
    PlayArrow as ProcessingIcon
} from '@mui/icons-material';

export interface AgentFlowStep {
    id: string;
    title: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    timestamp?: Date;
    details?: string;
    substeps?: AgentFlowStep[];
    duration?: number;
    metadata?: {
        type?: string;
        todos?: any[];
        [key: string]: any;
    };
}

export interface AgentFlowVisualizationProps {
    steps: AgentFlowStep[];
    isExpanded?: boolean;
    onToggle?: (expanded: boolean) => void;
    className?: string;
}

const getStatusIcon = (status: AgentFlowStep['status']) => {
    switch (status) {
        case 'completed':
            return <CompleteIcon sx={{ color: '#4CAF50', fontSize: 16 }} />;
        case 'running':
            return <ProcessingIcon sx={{ color: '#2196F3', fontSize: 16 }} />;
        case 'error':
            return <ErrorIcon sx={{ color: '#F44336', fontSize: 16 }} />;
        case 'pending':
        default:
            return <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: '#E0E0E0' }} />;
    }
};

const getStatusColor = (status: AgentFlowStep['status']) => {
    switch (status) {
        case 'completed':
            return '#4CAF50';
        case 'running':
            return '#2196F3';
        case 'error':
            return '#F44336';
        case 'pending':
        default:
            return '#9E9E9E';
    }
};

const StepComponent: React.FC<{ step: AgentFlowStep; isLast?: boolean; level?: number }> = ({ 
    step, 
    isLast = false, 
    level = 0 
}) => {
    const [isSubstepsExpanded, setIsSubstepsExpanded] = useState(false);
    const hasSubsteps = step.substeps && step.substeps.length > 0;

    return (
        <Box sx={{ position: 'relative', ml: level * 2 }}>
            {/* Timeline line */}
            {!isLast && (
                <Box
                    sx={{
                        position: 'absolute',
                        left: 8,
                        top: 32,
                        bottom: 0,
                        width: 2,
                        bgcolor: '#E0E0E0',
                        zIndex: 0
                    }}
                />
            )}

            {/* Step content */}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, position: 'relative', zIndex: 1 }}>
                {/* Status indicator */}
                <Box 
                    sx={{ 
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 16,
                        height: 16,
                        mt: 0.5,
                        position: 'relative'
                    }}
                >
                    {getStatusIcon(step.status)}
                </Box>

                {/* Step details */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Typography 
                            variant="body2" 
                            sx={{ 
                                fontWeight: 500,
                                color: step.status === 'completed' ? '#2E7D32' : 
                                       step.status === 'running' ? '#1976D2' :
                                       step.status === 'error' ? '#C62828' : '#424242'
                            }}
                        >
                            {step.title}
                        </Typography>

                        {step.duration && step.status === 'completed' && (
                            <Chip 
                                label={`${step.duration}ms`}
                                size="small"
                                variant="outlined"
                                sx={{ 
                                    height: 20,
                                    fontSize: '0.7rem',
                                    color: '#666',
                                    borderColor: '#E0E0E0'
                                }}
                            />
                        )}

                        {hasSubsteps && (
                            <IconButton
                                size="small"
                                onClick={() => setIsSubstepsExpanded(!isSubstepsExpanded)}
                                sx={{ p: 0.25, ml: 0.5 }}
                            >
                                {isSubstepsExpanded ? 
                                    <ExpandLessIcon sx={{ fontSize: 16 }} /> : 
                                    <ExpandMoreIcon sx={{ fontSize: 16 }} />
                                }
                            </IconButton>
                        )}
                    </Box>

                    {step.details && (
                        <Typography 
                            variant="caption" 
                            sx={{ 
                                color: '#666',
                                display: 'block',
                                lineHeight: 1.3,
                                mb: 1
                            }}
                        >
                            {step.details}
                        </Typography>
                    )}

                    {step.timestamp && (
                        <Typography 
                            variant="caption" 
                            sx={{ 
                                color: '#999',
                                fontSize: '0.65rem'
                            }}
                        >
                            {step.timestamp.toLocaleTimeString()}
                        </Typography>
                    )}

                    {/* Todo List Component */}
                    {step.metadata?.type === 'todo-list' && step.metadata.todos && (
                        <Box sx={{ mt: 1 }}>
                            <TodoListStep 
                                todos={step.metadata.todos}
                                timestamp={step.timestamp}
                                title={step.title}
                            />
                        </Box>
                    )}
                </Box>
            </Box>

            {/* Substeps */}
            {hasSubsteps && (
                <Collapse in={isSubstepsExpanded}>
                    <Box sx={{ ml: 2, mt: 1 }}>
                        {step.substeps!.map((substep, index) => (
                            <StepComponent
                                key={substep.id}
                                step={substep}
                                isLast={index === step.substeps!.length - 1}
                                level={level + 1}
                            />
                        ))}
                    </Box>
                </Collapse>
            )}
        </Box>
    );
};

export const AgentFlowVisualization: React.FC<AgentFlowVisualizationProps> = ({
    steps,
    isExpanded = false,
    onToggle,
    className
}) => {
    const [internalExpanded, setInternalExpanded] = useState(isExpanded);
    const expanded = onToggle ? isExpanded : internalExpanded;
    const handleToggle = () => {
        if (onToggle) {
            onToggle(!expanded);
        } else {
            setInternalExpanded(!expanded);
        }
    };

    const hasActiveSteps = steps.some(step => step.status === 'running');
    const hasCompletedSteps = steps.some(step => step.status === 'completed');
    const hasErrorSteps = steps.some(step => step.status === 'error');

    const getThinkingState = () => {
        if (hasErrorSteps) return { text: 'Encountered issues', color: '#F44336', icon: <ErrorIcon />, animate: false };
        if (hasActiveSteps) return { text: 'Thinking', color: '#2196F3', icon: <ThinkingIcon />, animate: true };
        if (hasCompletedSteps) return { text: 'Analysis complete', color: '#4CAF50', icon: <CompleteIcon />, animate: false };
        return { text: 'Preparing', color: '#9E9E9E', icon: <ThinkingIcon />, animate: true };
    };

    const thinkingState = getThinkingState();

    return (
        <Box 
            className={className}
            sx={{ 
                mb: 2,
                border: '1px solid #E0E0E0',
                borderRadius: 2,
                overflow: 'hidden',
                bgcolor: '#FAFAFA'
            }}
        >
            {/* Header */}
            <Box 
                sx={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    p: 1.5,
                    cursor: 'pointer',
                    '&:hover': {
                        bgcolor: '#F5F5F5'
                    }
                }}
                onClick={handleToggle}
            >
                <Avatar 
                    sx={{ width: 24, height: 24, bgcolor: thinkingState.color }}
                    className={thinkingState.animate ? 'thinking-icon-animate' : ''}
                >
                    {React.cloneElement(thinkingState.icon, { sx: { fontSize: 14, color: 'white' } })}
                </Avatar>
                
                <Typography 
                    variant="body2" 
                    className={thinkingState.animate ? 'thinking-text-shimmer' : 'thinking-text-static'}
                    sx={{ 
                        flex: 1,
                        color: thinkingState.color
                    }}
                >
                    {thinkingState.text}
                </Typography>

                {steps.length > 0 && (
                    <Chip 
                        label={`${steps.length} steps`}
                        size="small"
                        variant="outlined"
                        sx={{ 
                            height: 20,
                            fontSize: '0.7rem',
                            color: '#666',
                            borderColor: '#E0E0E0'
                        }}
                    />
                )}

                <IconButton size="small" sx={{ p: 0 }}>
                    {expanded ? 
                        <ExpandLessIcon sx={{ fontSize: 18 }} /> : 
                        <ExpandMoreIcon sx={{ fontSize: 18 }} />
                    }
                </IconButton>
            </Box>

            {/* Timeline */}
            <Collapse in={expanded}>
                <Box sx={{ p: 2, pt: 0, bgcolor: 'white' }}>
                    {steps.length === 0 ? (
                        <Typography variant="caption" sx={{ color: '#999', fontStyle: 'italic' }}>
                            No workflow steps available
                        </Typography>
                    ) : (
                        <Box sx={{ position: 'relative' }}>
                            {steps.map((step, index) => (
                                <Box key={step.id} sx={{ mb: index < steps.length - 1 ? 2 : 0 }}>
                                    <StepComponent 
                                        step={step} 
                                        isLast={index === steps.length - 1}
                                    />
                                </Box>
                            ))}
                        </Box>
                    )}
                </Box>
            </Collapse>
        </Box>
    );
};

export default AgentFlowVisualization;