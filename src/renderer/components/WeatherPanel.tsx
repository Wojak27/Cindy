import React from 'react';
import {
    Box,
    Typography,
    IconButton,
    Card,
    CardContent,
    Paper,
    useTheme,
    alpha,
    Divider,
} from '@mui/material';
import {
    Close as CloseIcon,
    WbSunny as SunnyIcon,
    Cloud as CloudIcon,
    CloudQueue as CloudyIcon,
    Grain as RainIcon,
    AcUnit as SnowIcon,
    Visibility as VisibilityIcon,
    Speed as WindIcon,
    Opacity as HumidityIcon,
    Compress as PressureIcon,
    WbTwilight as UvIcon,
} from '@mui/icons-material';

interface WeatherData {
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
    uv_index: number;
    is_day: boolean;
    observation_time: string;
    source: string;
}

interface WeatherPanelProps {
    weatherData: WeatherData;
    onClose: () => void;
}

const WeatherPanel: React.FC<WeatherPanelProps> = ({ weatherData, onClose }) => {
    const theme = useTheme();

    const getWeatherIcon = (condition: string, isDay: boolean) => {
        const iconStyle = { fontSize: 48, color: theme.palette.primary.main };
        
        if (condition.toLowerCase().includes('sunny') || condition.toLowerCase().includes('clear')) {
            return <SunnyIcon sx={iconStyle} />;
        } else if (condition.toLowerCase().includes('cloud')) {
            return condition.toLowerCase().includes('partly') ? <CloudIcon sx={iconStyle} /> : <CloudyIcon sx={iconStyle} />;
        } else if (condition.toLowerCase().includes('rain')) {
            return <RainIcon sx={iconStyle} />;
        } else if (condition.toLowerCase().includes('snow')) {
            return <SnowIcon sx={iconStyle} />;
        } else {
            return isDay ? <SunnyIcon sx={iconStyle} /> : <CloudIcon sx={iconStyle} />;
        }
    };

    const formatTime = (isoString: string) => {
        try {
            return new Date(isoString).toLocaleString();
        } catch {
            return isoString;
        }
    };

    return (
        <Paper
            elevation={3}
            sx={{
                position: 'fixed',
                top: 80,
                right: 20,
                width: 320,
                maxHeight: 'calc(100vh - 100px)',
                overflow: 'auto',
                backgroundColor: alpha(theme.palette.background.paper, 0.95),
                backdropFilter: 'blur(10px)',
                borderRadius: 2,
                border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                zIndex: 1300,
            }}
        >
            {/* Header */}
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 2,
                    borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                    background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)}, ${alpha(theme.palette.secondary.main, 0.1)})`,
                }}
            >
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Weather
                </Typography>
                <IconButton
                    onClick={onClose}
                    size="small"
                    sx={{
                        color: theme.palette.text.secondary,
                        '&:hover': {
                            backgroundColor: alpha(theme.palette.action.hover, 0.1),
                        },
                    }}
                >
                    <CloseIcon />
                </IconButton>
            </Box>

            {/* Content */}
            <Box sx={{ p: 2 }}>
                {/* Location and Main Conditions */}
                <Card sx={{ mb: 2, backgroundColor: alpha(theme.palette.background.default, 0.5) }}>
                    <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                            <Box sx={{ mr: 2 }}>
                                {getWeatherIcon(weatherData.condition, weatherData.is_day)}
                            </Box>
                            <Box sx={{ flex: 1 }}>
                                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                                    {weatherData.location}
                                </Typography>
                                <Typography variant="h4" sx={{ fontWeight: 700, color: theme.palette.primary.main }}>
                                    {weatherData.temperature.celsius}°C
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {weatherData.temperature.fahrenheit}°F
                                </Typography>
                            </Box>
                        </Box>
                        <Typography variant="body1" sx={{ fontWeight: 500, textAlign: 'center' }}>
                            {weatherData.condition}
                        </Typography>
                    </CardContent>
                </Card>

                {/* Detailed Information */}
                <Box sx={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(2, 1fr)', 
                    gap: 1 
                }}>
                    {/* Humidity */}
                    <Box>
                        <Card sx={{ p: 1.5, backgroundColor: alpha(theme.palette.info.main, 0.1) }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                <HumidityIcon sx={{ fontSize: 20, mr: 1, color: theme.palette.info.main }} />
                                <Typography variant="body2" color="text.secondary">
                                    Humidity
                                </Typography>
                            </Box>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                {weatherData.humidity}
                            </Typography>
                        </Card>
                    </Box>

                    {/* Wind */}
                    <Box>
                        <Card sx={{ p: 1.5, backgroundColor: alpha(theme.palette.success.main, 0.1) }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                <WindIcon sx={{ fontSize: 20, mr: 1, color: theme.palette.success.main }} />
                                <Typography variant="body2" color="text.secondary">
                                    Wind
                                </Typography>
                            </Box>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                {weatherData.wind.speed_metric} km/h
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {weatherData.wind.direction}
                            </Typography>
                        </Card>
                    </Box>

                    {/* Pressure */}
                    <Box>
                        <Card sx={{ p: 1.5, backgroundColor: alpha(theme.palette.warning.main, 0.1) }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                <PressureIcon sx={{ fontSize: 20, mr: 1, color: theme.palette.warning.main }} />
                                <Typography variant="body2" color="text.secondary">
                                    Pressure
                                </Typography>
                            </Box>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                {weatherData.pressure.metric} mb
                            </Typography>
                        </Card>
                    </Box>

                    {/* Visibility */}
                    <Box>
                        <Card sx={{ p: 1.5, backgroundColor: alpha(theme.palette.secondary.main, 0.1) }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                <VisibilityIcon sx={{ fontSize: 20, mr: 1, color: theme.palette.secondary.main }} />
                                <Typography variant="body2" color="text.secondary">
                                    Visibility
                                </Typography>
                            </Box>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                {weatherData.visibility.metric} km
                            </Typography>
                        </Card>
                    </Box>
                </Box>

                {/* UV Index - Full Width */}
                <Box sx={{ mt: 1 }}>
                        <Card sx={{ p: 1.5, backgroundColor: alpha(theme.palette.error.main, 0.1) }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                <UvIcon sx={{ fontSize: 20, mr: 1, color: theme.palette.error.main }} />
                                <Typography variant="body2" color="text.secondary">
                                    UV Index
                                </Typography>
                            </Box>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                {weatherData.uv_index} {weatherData.uv_index <= 2 ? '(Low)' : weatherData.uv_index <= 5 ? '(Moderate)' : weatherData.uv_index <= 7 ? '(High)' : '(Very High)'}
                            </Typography>
                        </Card>
                </Box>

                <Divider sx={{ my: 2 }} />

                {/* Footer */}
                <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">
                        Updated: {formatTime(weatherData.observation_time)}
                    </Typography>
                    <br />
                    <Typography variant="caption" color="text.secondary">
                        Source: {weatherData.source}
                    </Typography>
                </Box>
            </Box>
        </Paper>
    );
};

export default WeatherPanel;