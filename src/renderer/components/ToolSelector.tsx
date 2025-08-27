/**
 * Tool Selection Component for forcing specific tool usage
 */

import React, { useState } from 'react';
import { 
    IconButton, 
    Menu, 
    MenuItem, 
    ListItemIcon, 
    ListItemText,
    Tooltip 
} from '@mui/material';
import {
    Search as SearchIcon,
    Cloud as WeatherIcon,
    Map as MapIcon,
    Email as EmailIcon,
    Description as DocumentIcon,
    Psychology as ResearchIcon,
    Build as ToolIcon
} from '@mui/icons-material';

export interface ToolOption {
    id: string;
    name: string;
    description: string;
    icon: React.ReactElement;
    category: string;
}

export interface ToolSelectorProps {
    onToolSelect: (toolId: string | null) => void;
    selectedTool: string | null;
    disabled?: boolean;
}

const availableTools: ToolOption[] = [
    {
        id: 'search',
        name: 'Web Search',
        description: 'Force web search for current query',
        icon: <SearchIcon fontSize="small" />,
        category: 'Search'
    },
    {
        id: 'weather',
        name: 'Weather',
        description: 'Get weather information',
        icon: <WeatherIcon fontSize="small" />,
        category: 'Data'
    },
    {
        id: 'maps',
        name: 'Maps',
        description: 'Show location information',
        icon: <MapIcon fontSize="small" />,
        category: 'Data'
    },
    {
        id: 'email',
        name: 'Email Search',
        description: 'Search through emails',
        icon: <EmailIcon fontSize="small" />,
        category: 'Connectors'
    },
    {
        id: 'research',
        name: 'Research',
        description: 'Deep research mode',
        icon: <ResearchIcon fontSize="small" />,
        category: 'Agent'
    },
    {
        id: 'vector',
        name: 'Document Search',
        description: 'Search indexed documents',
        icon: <DocumentIcon fontSize="small" />,
        category: 'Data'
    }
];

const ToolSelector: React.FC<ToolSelectorProps> = ({
    onToolSelect,
    selectedTool,
    disabled = false
}) => {
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleToolSelect = (toolId: string) => {
        if (selectedTool === toolId) {
            // Deselect if clicking the same tool
            onToolSelect(null);
        } else {
            onToolSelect(toolId);
        }
        handleClose();
    };

    const handleClear = () => {
        onToolSelect(null);
        handleClose();
    };

    const selectedToolData = availableTools.find(tool => tool.id === selectedTool);

    return (
        <>
            <Tooltip title={selectedToolData ? `Using ${selectedToolData.name}` : "Select a tool to force usage"}>
                <IconButton
                    onClick={handleClick}
                    disabled={disabled}
                    size="small"
                    sx={{
                        color: selectedTool ? '#007ACC' : '#666',
                        backgroundColor: selectedTool ? '#E3F2FD' : 'transparent',
                        border: selectedTool ? '1px solid #007ACC' : '1px solid transparent',
                        '&:hover': {
                            backgroundColor: selectedTool ? '#BBDEFB' : '#F5F5F5'
                        }
                    }}
                >
                    {selectedToolData?.icon || <ToolIcon fontSize="small" />}
                </IconButton>
            </Tooltip>

            <Menu
                anchorEl={anchorEl}
                open={open}
                onClose={handleClose}
                PaperProps={{
                    sx: {
                        maxWidth: 250,
                        mt: 1
                    }
                }}
            >
                {selectedTool && (
                    <>
                        <MenuItem onClick={handleClear} sx={{ color: '#d32f2f' }}>
                            <ListItemIcon>
                                <ToolIcon fontSize="small" sx={{ color: '#d32f2f' }} />
                            </ListItemIcon>
                            <ListItemText primary="Clear selection" />
                        </MenuItem>
                        <hr style={{ margin: '4px 0', border: 'none', borderTop: '1px solid #eee' }} />
                    </>
                )}
                
                {availableTools.map((tool) => (
                    <MenuItem
                        key={tool.id}
                        onClick={() => handleToolSelect(tool.id)}
                        selected={selectedTool === tool.id}
                    >
                        <ListItemIcon sx={{ color: selectedTool === tool.id ? '#007ACC' : 'inherit' }}>
                            {tool.icon}
                        </ListItemIcon>
                        <ListItemText
                            primary={tool.name}
                            secondary={tool.description}
                            sx={{
                                '& .MuiListItemText-primary': {
                                    fontSize: '0.875rem',
                                    fontWeight: selectedTool === tool.id ? 600 : 400,
                                    color: selectedTool === tool.id ? '#007ACC' : 'inherit'
                                },
                                '& .MuiListItemText-secondary': {
                                    fontSize: '0.75rem'
                                }
                            }}
                        />
                    </MenuItem>
                ))}
            </Menu>
        </>
    );
};

export default ToolSelector;