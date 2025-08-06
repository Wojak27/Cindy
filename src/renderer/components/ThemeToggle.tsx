import React from 'react';
import {
    IconButton,
    Tooltip,
    Menu,
    MenuItem,
    ListItemIcon,
    ListItemText,
    Box,
    Typography
} from '@mui/material';
import {
    LightMode,
    DarkMode,
    SettingsBrightness
} from '@mui/icons-material';
import { useTheme, ThemeMode } from '../contexts/ThemeContext';

interface ThemeToggleProps {
    variant?: 'icon' | 'menu' | 'inline';
    showLabel?: boolean;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ 
    variant = 'icon',
    showLabel = false 
}) => {
    const { mode, actualMode, toggleTheme, setTheme, systemPrefersDark } = useTheme();
    const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);

    const handleClick = (event: React.MouseEvent<HTMLElement>) => {
        if (variant === 'menu') {
            setAnchorEl(event.currentTarget);
        } else {
            toggleTheme();
        }
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleThemeSelect = (selectedMode: ThemeMode) => {
        setTheme(selectedMode);
        handleClose();
    };

    const getThemeIcon = (themeMode: ThemeMode) => {
        switch (themeMode) {
            case 'light':
                return <LightMode />;
            case 'dark':
                return <DarkMode />;
            case 'system':
                return <SettingsBrightness />;
        }
    };

    const getThemeLabel = (themeMode: ThemeMode) => {
        switch (themeMode) {
            case 'light':
                return 'Light';
            case 'dark':
                return 'Dark';
            case 'system':
                return `System (${systemPrefersDark ? 'Dark' : 'Light'})`;
        }
    };

    const getCurrentTooltip = () => {
        return `Theme: ${getThemeLabel(mode)} - Click to cycle`;
    };

    if (variant === 'inline') {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="body2">Theme:</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    {(['light', 'dark', 'system'] as ThemeMode[]).map((themeMode) => (
                        <Tooltip key={themeMode} title={getThemeLabel(themeMode)}>
                            <IconButton
                                size="small"
                                onClick={() => setTheme(themeMode)}
                                color={mode === themeMode ? 'primary' : 'default'}
                                sx={{
                                    border: mode === themeMode ? 1 : 0,
                                    borderColor: 'primary.main',
                                }}
                            >
                                {getThemeIcon(themeMode)}
                            </IconButton>
                        </Tooltip>
                    ))}
                </Box>
                {showLabel && (
                    <Typography variant="caption" color="text.secondary">
                        Current: {getThemeLabel(mode)}
                    </Typography>
                )}
            </Box>
        );
    }

    if (variant === 'menu') {
        return (
            <>
                <Tooltip title="Theme settings">
                    <IconButton
                        onClick={handleClick}
                        size="small"
                        sx={{ ml: 1 }}
                        aria-controls={open ? 'theme-menu' : undefined}
                        aria-haspopup="true"
                        aria-expanded={open ? 'true' : undefined}
                    >
                        {getThemeIcon(mode)}
                    </IconButton>
                </Tooltip>
                <Menu
                    anchorEl={anchorEl}
                    id="theme-menu"
                    open={open}
                    onClose={handleClose}
                    onClick={handleClose}
                    transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                    anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                >
                    {(['light', 'dark', 'system'] as ThemeMode[]).map((themeMode) => (
                        <MenuItem
                            key={themeMode}
                            onClick={() => handleThemeSelect(themeMode)}
                            selected={mode === themeMode}
                        >
                            <ListItemIcon>
                                {getThemeIcon(themeMode)}
                            </ListItemIcon>
                            <ListItemText>
                                {getThemeLabel(themeMode)}
                            </ListItemText>
                        </MenuItem>
                    ))}
                </Menu>
            </>
        );
    }

    // Default icon variant
    return (
        <Tooltip title={getCurrentTooltip()}>
            <IconButton
                onClick={handleClick}
                size="small"
                color="inherit"
                sx={{
                    transition: 'all 0.3s ease',
                    '&:hover': {
                        backgroundColor: actualMode === 'dark' 
                            ? 'rgba(255, 255, 255, 0.08)' 
                            : 'rgba(0, 0, 0, 0.04)',
                    },
                }}
            >
                {getThemeIcon(mode)}
            </IconButton>
        </Tooltip>
    );
};

export default ThemeToggle;