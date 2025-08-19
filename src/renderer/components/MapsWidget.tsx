import React, { useEffect, useRef } from 'react';
import {
    Box,
    Typography,
    Card,
    Chip,
    useTheme,
    alpha,
} from '@mui/material';
import {
    LocationOn as LocationIcon,
    ZoomIn as ZoomInIcon,
    ZoomOut as ZoomOutIcon,
} from '@mui/icons-material';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default markers in Leaflet with webpack
// Use CDN URLs for markers to avoid webpack loading issues
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface MapLocation {
    name: string;
    latitude: number;
    longitude: number;
    description?: string;
}

interface MapData {
    locations: MapLocation[];
    center?: {
        latitude: number;
        longitude: number;
    };
    zoom?: number;
}

interface MapsWidgetProps {
    mapData: MapData;
}

const MapsWidget: React.FC<MapsWidgetProps> = ({ mapData }) => {
    const theme = useTheme();
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const markersRef = useRef<L.Marker[]>([]);

    useEffect(() => {
        if (!mapContainerRef.current || mapRef.current) return;

        // Determine center point
        let centerLat = 0;
        let centerLng = 0;
        
        if (mapData.center) {
            centerLat = mapData.center.latitude;
            centerLng = mapData.center.longitude;
        } else if (mapData.locations.length > 0) {
            // Calculate center from all locations
            const sumLat = mapData.locations.reduce((sum, loc) => sum + loc.latitude, 0);
            const sumLng = mapData.locations.reduce((sum, loc) => sum + loc.longitude, 0);
            centerLat = sumLat / mapData.locations.length;
            centerLng = sumLng / mapData.locations.length;
        } else {
            // Default to world view
            centerLat = 20;
            centerLng = 0;
        }

        // Initialize map
        const map = L.map(mapContainerRef.current, {
            center: [centerLat, centerLng],
            zoom: mapData.zoom || (mapData.locations.length === 1 ? 13 : 5),
            zoomControl: true,
        });

        // Add tile layer (OpenStreetMap)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19,
        }).addTo(map);

        // Store map reference
        mapRef.current = map;

        // Add markers for each location
        mapData.locations.forEach((location) => {
            const marker = L.marker([location.latitude, location.longitude])
                .addTo(map);
            
            // Create popup content
            let popupContent = `<strong>${location.name}</strong>`;
            if (location.description) {
                popupContent += `<br/>${location.description}`;
            }
            popupContent += `<br/><small>${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}</small>`;
            
            marker.bindPopup(popupContent);
            markersRef.current.push(marker);
        });

        // If multiple locations, fit bounds to show all markers
        if (mapData.locations.length > 1) {
            const group = L.featureGroup(markersRef.current);
            map.fitBounds(group.getBounds().pad(0.1));
        }

        // Cleanup
        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
            markersRef.current = [];
        };
    }, [mapData]);

    // Update markers when mapData changes
    useEffect(() => {
        if (!mapRef.current) return;

        // Clear existing markers
        markersRef.current.forEach(marker => marker.remove());
        markersRef.current = [];

        // Add new markers
        mapData.locations.forEach((location) => {
            const marker = L.marker([location.latitude, location.longitude])
                .addTo(mapRef.current!);
            
            let popupContent = `<strong>${location.name}</strong>`;
            if (location.description) {
                popupContent += `<br/>${location.description}`;
            }
            popupContent += `<br/><small>${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}</small>`;
            
            marker.bindPopup(popupContent);
            markersRef.current.push(marker);
        });

        // Update view
        if (mapData.center) {
            mapRef.current.setView(
                [mapData.center.latitude, mapData.center.longitude],
                mapData.zoom || mapRef.current.getZoom()
            );
        } else if (mapData.locations.length > 1) {
            const group = L.featureGroup(markersRef.current);
            mapRef.current.fitBounds(group.getBounds().pad(0.1));
        } else if (mapData.locations.length === 1) {
            mapRef.current.setView(
                [mapData.locations[0].latitude, mapData.locations[0].longitude],
                mapData.zoom || 13
            );
        }
    }, [mapData]);

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Location chips */}
            {mapData.locations.length > 0 && (
                <Box sx={{ mb: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {mapData.locations.map((location, index) => (
                        <Chip
                            key={index}
                            icon={<LocationIcon />}
                            label={location.name}
                            size="small"
                            onClick={() => {
                                if (mapRef.current && markersRef.current[index]) {
                                    mapRef.current.setView(
                                        [location.latitude, location.longitude],
                                        15
                                    );
                                    markersRef.current[index].openPopup();
                                }
                            }}
                            sx={{
                                backgroundColor: alpha(theme.palette.primary.main, 0.1),
                                '&:hover': {
                                    backgroundColor: alpha(theme.palette.primary.main, 0.2),
                                },
                            }}
                        />
                    ))}
                </Box>
            )}

            {/* Map container */}
            <Card 
                sx={{ 
                    flex: 1, 
                    position: 'relative',
                    backgroundColor: theme.palette.background.paper,
                    overflow: 'hidden',
                }}
            >
                <Box
                    ref={mapContainerRef}
                    sx={{
                        width: '100%',
                        height: '100%',
                        minHeight: 400,
                        '& .leaflet-control-zoom': {
                            border: 'none',
                            boxShadow: theme.shadows[2],
                        },
                        '& .leaflet-control-zoom-in, & .leaflet-control-zoom-out': {
                            backgroundColor: theme.palette.background.paper,
                            color: theme.palette.text.primary,
                            borderColor: theme.palette.divider,
                            '&:hover': {
                                backgroundColor: alpha(theme.palette.action.hover, 0.1),
                            },
                        },
                        '& .leaflet-control-attribution': {
                            backgroundColor: alpha(theme.palette.background.paper, 0.8),
                            color: theme.palette.text.secondary,
                            fontSize: '10px',
                        },
                        '& .leaflet-popup-content-wrapper': {
                            backgroundColor: theme.palette.background.paper,
                            color: theme.palette.text.primary,
                            boxShadow: theme.shadows[4],
                        },
                        '& .leaflet-popup-tip': {
                            backgroundColor: theme.palette.background.paper,
                        },
                    }}
                />

                {/* Loading state for empty map */}
                {mapData.locations.length === 0 && (
                    <Box
                        sx={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            textAlign: 'center',
                            zIndex: 1000,
                            backgroundColor: alpha(theme.palette.background.paper, 0.9),
                            padding: 2,
                            borderRadius: 1,
                        }}
                    >
                        <LocationIcon sx={{ fontSize: 48, color: theme.palette.text.secondary, mb: 1 }} />
                        <Typography variant="body2" color="text.secondary">
                            No locations to display
                        </Typography>
                    </Box>
                )}
            </Card>

            {/* Location count */}
            {mapData.locations.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
                    Showing {mapData.locations.length} location{mapData.locations.length !== 1 ? 's' : ''}
                </Typography>
            )}
        </Box>
    );
};

export default MapsWidget;