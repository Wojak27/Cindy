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
    console.log('🗺️ [MapsWidget] Received mapData:', mapData);
    
    const theme = useTheme();
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const markersRef = useRef<L.Marker[]>([]);
    const [mapError, setMapError] = React.useState<string | null>(null);
    const [isMapReady, setIsMapReady] = React.useState(false);

    useEffect(() => {
        // Reset error state when new data arrives
        setMapError(null);
        setIsMapReady(false);
        
        try {
        if (!mapContainerRef.current || mapRef.current) return;

        console.log('[MapsWidget] Initializing map with data:', mapData);
        console.log('[MapsWidget] Container element:', mapContainerRef.current);
        console.log('[MapsWidget] Container dimensions:', {
            width: mapContainerRef.current.offsetWidth,
            height: mapContainerRef.current.offsetHeight
        });

        // Ensure container has dimensions before initializing map
        if (mapContainerRef.current.offsetWidth === 0 || mapContainerRef.current.offsetHeight === 0) {
            console.warn('[MapsWidget] Container has zero dimensions, delaying initialization');
            // Retry after a short delay to allow the container to be sized
            const timer = setTimeout(() => {
                if (mapContainerRef.current && !mapRef.current) {
                    console.log('[MapsWidget] Retrying map initialization after container sizing');
                    // Re-trigger this effect by forcing a re-render (this is a fallback)
                    // The parent should ensure the container is properly sized before showing
                }
            }, 100);
            return () => clearTimeout(timer);
        }

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
        console.log('[MapsWidget] Creating Leaflet map with center:', [centerLat, centerLng]);
        const map = L.map(mapContainerRef.current, {
            center: [centerLat, centerLng],
            zoom: mapData.zoom || (mapData.locations.length === 1 ? 13 : 5),
            zoomControl: true,
        });

        console.log('[MapsWidget] Map created successfully, adding tile layer');

        // Add tile layer (OpenStreetMap)
        const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19,
        });
        
        tileLayer.addTo(map);
        console.log('[MapsWidget] Tile layer added to map');

        // Store map reference
        mapRef.current = map;

        // Force map to resize after a short delay (common Leaflet issue)
        setTimeout(() => {
            if (map) {
                console.log('[MapsWidget] Invalidating map size to ensure proper rendering');
                map.invalidateSize();
            }
        }, 100);

        // Add markers for each location
        console.log('[MapsWidget] Adding', mapData.locations.length, 'markers');
        mapData.locations.forEach((location, index) => {
            console.log(`[MapsWidget] Adding marker ${index + 1}:`, location);
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

        console.log('[MapsWidget] Map initialization completed with', markersRef.current.length, 'markers');

        // If multiple locations, fit bounds to show all markers
        if (mapData.locations.length > 1) {
            const group = L.featureGroup(markersRef.current);
            map.fitBounds(group.getBounds().pad(0.1));
        }

        // Mark map as ready
        setIsMapReady(true);
        console.log('[MapsWidget] ✅ Map initialization successful');

        // Cleanup
        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
            markersRef.current = [];
        };

        } catch (error) {
            console.error('[MapsWidget] ❌ Map initialization failed:', error);
            setMapError(error instanceof Error ? error.message : 'Unknown map initialization error');
        }
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

                {/* Error state */}
                {mapError && (
                    <Box
                        sx={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            zIndex: 1000,
                            backgroundColor: theme.palette.background.paper,
                            padding: 2,
                        }}
                    >
                        <LocationIcon sx={{ fontSize: 48, color: theme.palette.error.main, mb: 2 }} />
                        <Typography variant="h6" color="error" gutterBottom>
                            Map Loading Failed
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            {mapError}
                        </Typography>
                        
                        {/* Show location info as fallback */}
                        {mapData.locations.length > 0 && (
                            <Box sx={{ mt: 2, width: '100%' }}>
                                <Typography variant="subtitle2" gutterBottom>
                                    Location Information:
                                </Typography>
                                {mapData.locations.map((location, index) => (
                                    <Box key={index} sx={{ mb: 1, p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                                        <Typography variant="body2" fontWeight="bold">
                                            {location.name}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                                        </Typography>
                                        {location.description && (
                                            <Typography variant="body2" sx={{ mt: 0.5 }}>
                                                {location.description}
                                            </Typography>
                                        )}
                                    </Box>
                                ))}
                            </Box>
                        )}
                    </Box>
                )}

                {/* Loading state for empty map */}
                {!mapError && mapData.locations.length === 0 && (
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

                {/* Loading state while map initializes */}
                {!mapError && !isMapReady && mapData.locations.length > 0 && (
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
                        <LocationIcon sx={{ fontSize: 48, color: theme.palette.primary.main, mb: 1 }} />
                        <Typography variant="body2" color="text.secondary">
                            Loading map...
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