/**
 * TodoListStep Component
 * Displays agent todo lists within the agent flow timeline
 */

import React, { useState } from 'react';
import { 
    Box, 
    Typography, 
    Collapse, 
    IconButton, 
    Chip,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    LinearProgress
} from '@mui/material';
import { 
    ExpandMore as ExpandMoreIcon,
    ExpandLess as ExpandLessIcon,
    CheckCircle as CompletedIcon,
    PlayArrow as InProgressIcon,
    RadioButtonUnchecked as PendingIcon,
    Assignment as TodoIcon
} from '@mui/icons-material';

export interface TodoItem {
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    activeForm: string;
}

export interface TodoListStepProps {
    todos: TodoItem[];
    timestamp?: Date;
    title?: string;
    className?: string;
}

const getStatusIcon = (status: TodoItem['status']) => {
    switch (status) {
        case 'completed':
            return <CompletedIcon sx={{ color: '#4CAF50', fontSize: 20 }} />;
        case 'in_progress':
            return <InProgressIcon sx={{ color: '#2196F3', fontSize: 20 }} />;
        case 'pending':
        default:
            return <PendingIcon sx={{ color: '#9E9E9E', fontSize: 20 }} />;
    }
};

const getStatusColor = (status: TodoItem['status']) => {
    switch (status) {
        case 'completed':
            return '#4CAF50';
        case 'in_progress':
            return '#2196F3';
        case 'pending':
        default:
            return '#9E9E9E';
    }
};

export const TodoListStep: React.FC<TodoListStepProps> = ({
    todos,
    timestamp,
    title = 'Task Planning',
    className
}) => {
    const [isExpanded, setIsExpanded] = useState(true);

    const completedCount = todos.filter(t => t.status === 'completed').length;
    const inProgressCount = todos.filter(t => t.status === 'in_progress').length;
    // const pendingCount = todos.filter(t => t.status === 'pending').length; // Currently unused
    const totalCount = todos.length;
    
    const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    return (
        <Box 
            className={className}
            sx={{ 
                mb: 2,
                border: '1px solid #E3F2FD',
                borderRadius: 2,
                overflow: 'hidden',
                bgcolor: '#F8F9FA',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }}
        >
            {/* Header */}
            <Box 
                sx={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    p: 2,
                    cursor: 'pointer',
                    bgcolor: '#E3F2FD',
                    '&:hover': {
                        bgcolor: '#BBDEFB'
                    }
                }}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <TodoIcon sx={{ color: '#1976D2', fontSize: 20 }} />
                
                <Typography 
                    variant="body2" 
                    sx={{ 
                        flex: 1,
                        fontWeight: 500,
                        color: '#1976D2'
                    }}
                >
                    {title}
                </Typography>

                {totalCount > 0 && (
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                        {inProgressCount > 0 && (
                            <Chip 
                                label={`${inProgressCount} active`}
                                size="small"
                                sx={{ 
                                    height: 20,
                                    fontSize: '0.7rem',
                                    bgcolor: '#E3F2FD',
                                    color: '#2196F3',
                                    fontWeight: 500
                                }}
                            />
                        )}
                        <Chip 
                            label={`${completedCount}/${totalCount}`}
                            size="small"
                            sx={{ 
                                height: 20,
                                fontSize: '0.7rem',
                                bgcolor: completedCount === totalCount ? '#E8F5E8' : '#F5F5F5',
                                color: completedCount === totalCount ? '#4CAF50' : '#666',
                                fontWeight: 500
                            }}
                        />
                    </Box>
                )}

                <IconButton size="small" sx={{ p: 0 }}>
                    {isExpanded ? 
                        <ExpandLessIcon sx={{ fontSize: 18 }} /> : 
                        <ExpandMoreIcon sx={{ fontSize: 18 }} />
                    }
                </IconButton>
            </Box>

            {/* Progress bar */}
            {totalCount > 0 && (
                <LinearProgress 
                    variant="determinate" 
                    value={progress}
                    sx={{
                        height: 3,
                        bgcolor: '#F5F5F5',
                        '& .MuiLinearProgress-bar': {
                            bgcolor: progress === 100 ? '#4CAF50' : '#2196F3'
                        }
                    }}
                />
            )}

            {/* Todo List */}
            <Collapse in={isExpanded}>
                <Box sx={{ bgcolor: 'white' }}>
                    {todos.length === 0 ? (
                        <Box sx={{ p: 2 }}>
                            <Typography variant="caption" sx={{ color: '#999', fontStyle: 'italic' }}>
                                No tasks available
                            </Typography>
                        </Box>
                    ) : (
                        <List sx={{ py: 0 }}>
                            {todos.map((todo, index) => (
                                <ListItem 
                                    key={index}
                                    sx={{ 
                                        py: 1,
                                        px: 2,
                                        borderBottom: index < todos.length - 1 ? '1px solid #F0F0F0' : 'none',
                                        '&:hover': {
                                            bgcolor: '#FAFAFA'
                                        }
                                    }}
                                >
                                    <ListItemIcon sx={{ minWidth: 32 }}>
                                        {getStatusIcon(todo.status)}
                                    </ListItemIcon>
                                    <ListItemText 
                                        primary={
                                            <Typography 
                                                variant="body2"
                                                sx={{ 
                                                    color: todo.status === 'completed' ? '#666' : '#333',
                                                    textDecoration: todo.status === 'completed' ? 'line-through' : 'none',
                                                    fontWeight: todo.status === 'in_progress' ? 500 : 400
                                                }}
                                            >
                                                {todo.status === 'in_progress' ? todo.activeForm : todo.content}
                                            </Typography>
                                        }
                                    />
                                    <Chip
                                        label={todo.status.replace('_', ' ')}
                                        size="small"
                                        sx={{
                                            height: 18,
                                            fontSize: '0.65rem',
                                            bgcolor: getStatusColor(todo.status) + '20',
                                            color: getStatusColor(todo.status),
                                            fontWeight: 500,
                                            textTransform: 'capitalize'
                                        }}
                                    />
                                </ListItem>
                            ))}
                        </List>
                    )}

                    {timestamp && (
                        <Box sx={{ p: 1.5, bgcolor: '#FAFAFA', borderTop: '1px solid #F0F0F0' }}>
                            <Typography 
                                variant="caption" 
                                sx={{ 
                                    color: '#999',
                                    fontSize: '0.65rem'
                                }}
                            >
                                Updated: {timestamp.toLocaleTimeString()}
                            </Typography>
                        </Box>
                    )}
                </Box>
            </Collapse>
        </Box>
    );
};

export default TodoListStep;