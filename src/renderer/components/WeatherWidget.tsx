import React from 'react';
import {
    Box,
    Typography,
    Card,
    useTheme,
    alpha,
    Divider,
} from '@mui/material';
import {
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
    uv_index: number | string;
    is_day: boolean;
    observation_time: string;
    source: string;
}

interface WeatherWidgetProps {
    weatherData: WeatherData;
}

const WeatherWidget: React.FC<WeatherWidgetProps> = ({ weatherData }) => {
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
        <Box sx={{ height: '100%', overflow: 'auto' }}>
            {/* Location and Main Conditions */}
            <Card sx={{ mb: 2, backgroundColor: alpha(theme.palette.background.default, 0.5) }}>
                <Box sx={{ p: 2 }}>
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
                </Box>
            </Card>

            {/* Detailed Information Grid */}
            <Box sx={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(2, 1fr)', 
                gap: 1 
            }}>
                {/* Humidity */}
                <Card sx={{ p: 1.5, backgroundColor: alpha(theme.palette.info.main, 0.1) }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                        <HumidityIcon sx={{ fontSize: 20, mr: 1, color: theme.palette.info.main }} />
                        <Typography variant="body2" color="text.secondary">
                            Humidity
                        </Typography>
                    </Box>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        {weatherData.humidity}
                    </Typography>
                </Card>

                {/* Wind */}
                <Card sx={{ p: 1.5, backgroundColor: alpha(theme.palette.success.main, 0.1) }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                        <WindIcon sx={{ fontSize: 20, mr: 1, color: theme.palette.success.main }} />
                        <Typography variant="body2" color="text.secondary">
                            Wind
                        </Typography>
                    </Box>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        {weatherData.wind.speed_metric} km/h
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {weatherData.wind.direction}
                    </Typography>
                </Card>

                {/* Pressure */}
                <Card sx={{ p: 1.5, backgroundColor: alpha(theme.palette.warning.main, 0.1) }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                        <PressureIcon sx={{ fontSize: 20, mr: 1, color: theme.palette.warning.main }} />
                        <Typography variant="body2" color="text.secondary">
                            Pressure
                        </Typography>
                    </Box>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        {weatherData.pressure.metric} mb
                    </Typography>
                </Card>

                {/* Visibility */}
                <Card sx={{ p: 1.5, backgroundColor: alpha(theme.palette.secondary.main, 0.1) }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
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

            {/* UV Index - Full Width */}
            <Box sx={{ mt: 1 }}>
                <Card sx={{ p: 1.5, backgroundColor: alpha(theme.palette.error.main, 0.1) }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                        <UvIcon sx={{ fontSize: 20, mr: 1, color: theme.palette.error.main }} />
                        <Typography variant="body2" color="text.secondary">
                            UV Index
                        </Typography>
                    </Box>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        {weatherData.uv_index} {typeof weatherData.uv_index === 'number' ? 
                            (weatherData.uv_index <= 2 ? '(Low)' : 
                             weatherData.uv_index <= 5 ? '(Moderate)' : 
                             weatherData.uv_index <= 7 ? '(High)' : '(Very High)') : ''}
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
    );
};

export default WeatherWidget;