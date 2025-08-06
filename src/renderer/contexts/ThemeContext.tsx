import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createTheme, ThemeProvider as MuiThemeProvider, Theme } from '@mui/material/styles';
import { useSelector, useDispatch } from 'react-redux';
import { updateSettings } from '../../store/actions';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
    mode: ThemeMode;
    actualMode: 'light' | 'dark';
    toggleTheme: () => void;
    setTheme: (mode: ThemeMode) => void;
    systemPrefersDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Light theme configuration
const lightTheme = createTheme({
    palette: {
        mode: 'light',
        primary: {
            main: '#000000',
            light: '#4a4a4a',
            dark: '#000000',
            contrastText: '#fff',
        },
        secondary: {
            main: '#666666',
            light: '#999999',
            dark: '#333333',
            contrastText: '#fff',
        },
        background: {
            default: '#ffffff',
            paper: '#ffffff',
        },
        text: {
            primary: '#000000',
            secondary: '#4a4a4a',
        },
        divider: '#f3f4f6',
        action: {
            hover: 'rgba(0, 0, 0, 0.04)',
            selected: 'rgba(0, 0, 0, 0.08)',
            disabled: 'rgba(0, 0, 0, 0.26)',
            disabledBackground: 'rgba(0, 0, 0, 0.12)',
        },
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    transition: 'background-color 0.3s ease, color 0.3s ease',
                    backgroundColor: '#ffffff !important',
                    color: '#000000 !important',
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    transition: 'background-color 0.3s ease, box-shadow 0.3s ease',
                    backgroundColor: '#ffffff !important',
                    color: '#000000 !important',
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    transition: 'all 0.3s ease',
                    backgroundColor: '#ffffff !important',
                    color: '#000000 !important',
                    border: '1px solid #f3f4f6 !important',
                    '&:hover': {
                        backgroundColor: '#f9f9f9 !important',
                        borderColor: '#9ca3af !important',
                    },
                },
            },
        },
        MuiIconButton: {
            styleOverrides: {
                root: {
                    backgroundColor: '#ffffff !important',
                    color: '#000000 !important',
                    border: '1px solid #f3f4f6 !important',
                    '&:hover': {
                        backgroundColor: '#f9f9f9 !important',
                        borderColor: '#9ca3af !important',
                    },
                },
            },
        },
        MuiTextField: {
            styleOverrides: {
                root: {
                    '& .MuiOutlinedInput-root': {
                        '& fieldset': {
                            borderColor: '#f3f4f6',
                        },
                        '&:hover fieldset': {
                            borderColor: '#e5e7eb',
                        },
                        '&.Mui-focused fieldset': {
                            borderColor: '#6b7280',
                        },
                        '& input': {
                            color: '#000000',
                            backgroundColor: '#ffffff !important',
                        },
                    },
                    '& .MuiInputLabel-root': {
                        color: '#6b7280',
                        '&.Mui-focused': {
                            color: '#000000',
                        },
                    },
                    '& .MuiFormHelperText-root': {
                        color: '#6b7280',
                    },
                },
            },
        },
        MuiSelect: {
            styleOverrides: {
                root: {
                    '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#f3f4f6',
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#e5e7eb',
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#6b7280',
                    },
                    '& .MuiSelect-select': {
                        color: '#000000',
                    },
                },
            },
        },
        MuiFormControl: {
            styleOverrides: {
                root: {
                    '& .MuiInputLabel-root': {
                        color: '#6b7280',
                        '&.Mui-focused': {
                            color: '#000000',
                        },
                    },
                },
            },
        },
        MuiTypography: {
            styleOverrides: {
                root: {
                    color: '#000000 !important',
                },
                h1: {
                    color: '#000000 !important',
                },
                h2: {
                    color: '#000000 !important',
                },
                h3: {
                    color: '#000000 !important',
                },
                h4: {
                    color: '#000000 !important',
                },
                h5: {
                    color: '#000000 !important',
                },
                h6: {
                    color: '#000000 !important',
                },
            },
        },
        MuiDialog: {
            styleOverrides: {
                paper: {
                    backgroundColor: '#ffffff !important',
                    color: '#000000 !important',
                },
            },
        },
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    backgroundColor: '#ffffff !important',
                    color: '#000000 !important',
                },
            },
        },
    },
});

// Dark theme configuration
const darkTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#90caf9',
            light: '#e3f2fd',
            dark: '#42a5f5',
            contrastText: '#000',
        },
        secondary: {
            main: '#f48fb1',
            light: '#ffc1e3',
            dark: '#bf5f82',
            contrastText: '#000',
        },
        background: {
            default: '#121212',
            paper: '#1e1e1e',
        },
        text: {
            primary: '#ffffff',
            secondary: '#aaaaaa',
        },
        divider: '#333333',
        action: {
            hover: 'rgba(255, 255, 255, 0.08)',
            selected: 'rgba(255, 255, 255, 0.12)',
            disabled: 'rgba(255, 255, 255, 0.3)',
            disabledBackground: 'rgba(255, 255, 255, 0.12)',
        },
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    transition: 'background-color 0.3s ease, color 0.3s ease',
                    backgroundColor: '#121212',
                },
                '::-webkit-scrollbar': {
                    width: '8px',
                },
                '::-webkit-scrollbar-track': {
                    backgroundColor: '#2d2d2d',
                },
                '::-webkit-scrollbar-thumb': {
                    backgroundColor: '#555555',
                    borderRadius: '4px',
                    '&:hover': {
                        backgroundColor: '#777777',
                    },
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    transition: 'background-color 0.3s ease, box-shadow 0.3s ease',
                    backgroundImage: 'none',
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    transition: 'all 0.3s ease',
                },
            },
        },
        MuiTextField: {
            styleOverrides: {
                root: {
                    '& .MuiOutlinedInput-root': {
                        '& fieldset': {
                            borderColor: '#f3f4f6',
                        },
                        '&:hover fieldset': {
                            borderColor: '#e5e7eb',
                        },
                        '&.Mui-focused fieldset': {
                            borderColor: '#6b7280',
                        },
                        '& input': {
                            color: '#000000',
                            backgroundColor: '#ffffff !important',
                        },
                    },
                    '& .MuiInputLabel-root': {
                        color: '#6b7280',
                        '&.Mui-focused': {
                            color: '#000000',
                        },
                    },
                },
            },
        },
        MuiSelect: {
            styleOverrides: {
                root: {
                    '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#555555',
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#777777',
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#90caf9',
                    },
                },
            },
        },
    },
});

interface ThemeProviderProps {
    children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
    const dispatch = useDispatch();
    const themeMode = useSelector((state: any) => state.settings.theme || 'system') as ThemeMode;
    const [systemPrefersDark, setSystemPrefersDark] = useState(false);

    // Detect system theme preference
    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        setSystemPrefersDark(mediaQuery.matches);

        const handleChange = (e: MediaQueryListEvent) => {
            setSystemPrefersDark(e.matches);
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    // Determine the actual theme to use
    const getActualMode = (mode: ThemeMode): 'light' | 'dark' => {
        if (mode === 'system') {
            return systemPrefersDark ? 'dark' : 'light';
        }
        return mode;
    };

    const actualMode = getActualMode(themeMode);
    const theme = actualMode === 'dark' ? darkTheme : lightTheme;

    // Apply theme to document body
    useEffect(() => {
        document.body.setAttribute('data-theme', actualMode);
        return () => {
            document.body.removeAttribute('data-theme');
        };
    }, [actualMode]);

    const toggleTheme = () => {
        const modes: ThemeMode[] = ['light', 'dark', 'system'];
        const currentIndex = modes.indexOf(themeMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        const newMode = modes[nextIndex];
        
        dispatch(updateSettings({ theme: newMode }));
    };

    const setTheme = (mode: ThemeMode) => {
        dispatch(updateSettings({ theme: mode }));
    };

    const contextValue: ThemeContextType = {
        mode: themeMode,
        actualMode,
        toggleTheme,
        setTheme,
        systemPrefersDark,
    };

    return (
        <ThemeContext.Provider value={contextValue}>
            <MuiThemeProvider theme={theme}>
                {children}
            </MuiThemeProvider>
        </ThemeContext.Provider>
    );
};

export const useTheme = (): ThemeContextType => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

// Hook to get the current MUI theme
export const useMuiTheme = (): Theme => {
    const { actualMode } = useTheme();
    return actualMode === 'dark' ? darkTheme : lightTheme;
};