import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    IconButton,
    Card,
    CardContent,
    useTheme,
    alpha,
    Tabs,
    Tab,
} from '@mui/material';
import {
    Close as CloseIcon,
    InsertDriveFile as FileIcon,
    WbSunny as WeatherIcon,
    Map as MapIcon,
} from '@mui/icons-material';
import WeatherWidget from './WeatherWidget';
import MapsWidget from './MapsWidget';
import DocumentWidget from './DocumentWidget';

// Widget types
export type WidgetType = 'document' | 'weather' | 'map';

// Widget data interfaces
export interface IndexedFile {
    path: string;
    name: string;
    size: number | bigint;
    mtime: string;
    chunks: number;
}

export interface WeatherData {
    location: string;
    temperature: {
        celsius: number;
        fahrenheit: number;
        unit_metric: string;
        unit_imperial: string;
    };
    condition: string;
    humidity: string;
    wind: {
        speed_metric: number;
        speed_imperial: number;
        direction: string;
    };
    pressure: {
        metric: number;
        imperial: number;
    };
    visibility: {
        metric: number;
        imperial: number;
    };
    uv_index: number | string;
    is_day: boolean;
    observation_time: string;
    source: string;
}

export interface MapData {
    locations: Array<{
        name: string;
        latitude: number;
        longitude: number;
        description?: string;
    }>;
    center?: {
        latitude: number;
        longitude: number;
    };
    zoom?: number;
}

interface ChatSidePanelProps {
    widgetType: WidgetType | null;
    data: IndexedFile | WeatherData | MapData | null;
    conversationWidgets: Array<{ type: WidgetType; data: any; timestamp: number }>;
    onClose: () => void;
}

const ChatSidePanel: React.FC<ChatSidePanelProps> = ({ widgetType, data, conversationWidgets, onClose }) => {
    const theme = useTheme();
    const [activeTab, setActiveTab] = useState<number>(0);
    const [widgets, setWidgets] = useState<Array<{ type: WidgetType; data: any }>>([]);

    // Safe comparison function that handles BigInt values
    const safeStringify = (obj: any): string => {
        return JSON.stringify(obj, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value
        );
    };

    useEffect(() => {
        // Initialize local widgets from conversation widgets
        const localWidgets = (conversationWidgets || []).map(w => ({ type: w.type, data: w.data }));
        setWidgets(localWidgets);

        // If a specific widget is passed, find its index and set as active
        if (widgetType && data) {
            const targetIndex = localWidgets.findIndex(w =>
                w.type === widgetType &&
                safeStringify(w.data) === safeStringify(data)
            );
            if (targetIndex >= 0) {
                setActiveTab(targetIndex);
            }
        }
    }, [conversationWidgets, widgetType, data]);

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setActiveTab(newValue);
    };

    const handleCloseWidget = (index: number) => {
        // Note: For now, we only close individual widgets locally
        // The parent component manages the conversation widgets persistence
        setWidgets(prev => prev.filter((_, i) => i !== index));
        if (widgets.length === 1) {
            onClose();
        } else if (activeTab >= index && activeTab > 0) {
            setActiveTab(activeTab - 1);
        }
    };

    const getWidgetIcon = (type: WidgetType) => {
        switch (type) {
            case 'weather':
                return <WeatherIcon sx={{ fontSize: 16, mr: 0.5 }} />;
            case 'map':
                return <MapIcon sx={{ fontSize: 16, mr: 0.5 }} />;
            case 'document':
            default:
                return <FileIcon sx={{ fontSize: 16, mr: 0.5 }} />;
        }
    };

    const getWidgetTitle = (widget: { type: WidgetType; data: any }) => {
        switch (widget.type) {
            case 'weather':
                return (widget.data as WeatherData).location || 'Weather';
            case 'map':
                const mapData = widget.data as MapData;
                if (mapData.locations.length === 1) {
                    return mapData.locations[0].name;
                }
                return `${mapData.locations.length} Locations`;
            case 'document':
                return (widget.data as IndexedFile).name || 'Document';
            default:
                return 'Widget';
        }
    };

    const renderWidget = (widget: { type: WidgetType; data: any }) => {
        switch (widget.type) {
            case 'weather':
                return <WeatherWidget weatherData={widget.data as WeatherData} />;
            case 'map':
                return <MapsWidget mapData={widget.data as MapData} />;
            case 'document':
                return <DocumentWidget document={widget.data as IndexedFile} />;
            default:
                return <Typography>Unknown widget type</Typography>;
        }
    };

    if (widgets.length === 0) {
        return null;
    }

    return (
        <Card sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: alpha(theme.palette.background.paper, 0.95),
            backdropFilter: 'blur(10px)',
            position: 'relative',
        }}>
            {/* Header with tabs */}
            <CardContent sx={{ pb: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        Info Panel
                    </Typography>
                    <IconButton onClick={onClose} size="small">
                        <CloseIcon />
                    </IconButton>
                </Box>

                {widgets.length > 1 && (
                    <Tabs
                        value={activeTab}
                        onChange={handleTabChange}
                        variant="scrollable"
                        scrollButtons="auto"
                        sx={{
                            minHeight: 36,
                            '& .MuiTab-root': {
                                minHeight: 36,
                                textTransform: 'none',
                                fontSize: '0.875rem'
                            }
                        }}
                    >
                        {widgets.map((widget, index) => (
                            <Tab
                                key={index}
                                label={
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        {getWidgetIcon(widget.type)}
                                        {getWidgetTitle(widget)}
                                    </Box>
                                }
                            />
                        ))}
                    </Tabs>
                )}
            </CardContent>

            {/* Content */}
            <Box sx={{ flex: 1, overflow: 'hidden', p: 2 }}>
                {widgets.length > 0 && activeTab < widgets.length && (
                    <Box sx={{ height: '100%', position: 'relative' }}>
                        {renderWidget(widgets[activeTab])}

                        {/* Close button for individual widget */}
                        {widgets.length > 1 && (
                            <IconButton
                                onClick={() => handleCloseWidget(activeTab)}
                                size="small"
                                sx={{
                                    position: 'absolute',
                                    top: 0,
                                    right: 0,
                                    backgroundColor: alpha(theme.palette.background.paper, 0.9),
                                    '&:hover': {
                                        backgroundColor: alpha(theme.palette.background.paper, 1),
                                    }
                                }}
                            >
                                <CloseIcon fontSize="small" />
                            </IconButton>
                        )}
                    </Box>
                )}
            </Box>
        </Card>
    );
};

export default ChatSidePanel;