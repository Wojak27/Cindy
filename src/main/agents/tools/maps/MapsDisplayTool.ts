import { DuckDuckGoSearch } from '@langchain/community/tools/duckduckgo_search';

interface MapLocation {
    name: string;
    latitude: number;
    longitude: number;
    description?: string;
}

interface MapsDisplayInput {
    locations: MapLocation[];
    center?: {
        latitude: number;
        longitude: number;
    };
    zoom?: number;
}

export class MapsDisplayTool extends DuckDuckGoSearch {
    name = 'display_map';
    description = `Display locations on an interactive map for the user. Use this tool when:
- User asks about locations, places, directions, or geography
- You need to show where something is located
- User mentions addresses, cities, countries, or landmarks
- You want to visualize geographical information
- User asks "where is...", "show me on a map", "location of..."

Always provide accurate latitude/longitude coordinates. You can approximate based on your knowledge or use well-known coordinates for major locations.

Input should be a JSON string with the following format:
{
  "locations": [{"name": "Place Name", "latitude": 40.7128, "longitude": -74.0060, "description": "Optional description"}],
  "center": {"latitude": 40.7128, "longitude": -74.0060},
  "zoom": 13
}`;

    async _call(input: string): Promise<string> {
        try {
            // Parse the input JSON
            let parsedInput: MapsDisplayInput;
            try {
                parsedInput = JSON.parse(input);
            } catch (parseError) {
                return 'Error: Input must be a valid JSON string with locations array.';
            }

            // Validate required fields
            if (!parsedInput.locations || !Array.isArray(parsedInput.locations) || parsedInput.locations.length === 0) {
                return 'Error: locations array is required and must contain at least one location.';
            }

            // Validate each location
            for (const loc of parsedInput.locations) {
                if (!loc.name || typeof loc.latitude !== 'number' || typeof loc.longitude !== 'number') {
                    return 'Error: Each location must have name (string), latitude (number), and longitude (number).';
                }
            }

            // Create the map data object
            const mapData = {
                locations: parsedInput.locations,
                center: parsedInput.center,
                zoom: parsedInput.zoom || (parsedInput.locations.length === 1 ? 13 : 5)
            };

            // Format the side view data for the frontend
            const sideViewData = {
                type: 'map',
                data: mapData
            };

            // Emit the side view data through IPC if available
            try {
                const mainWindow = (global as any).mainWindow;
                const conversationId = (global as any).currentConversationId || 'default';
                console.log('[MapsDisplayTool] Attempting to send side-view-data via IPC');
                console.log('[MapsDisplayTool] Main window available:', !!mainWindow);
                console.log('[MapsDisplayTool] Conversation ID:', conversationId);
                console.log('[MapsDisplayTool] Side view data:', sideViewData);

                if (mainWindow) {
                    mainWindow.webContents.send('side-view-data', {
                        sideViewData,
                        conversationId
                    });
                    console.log('[MapsDisplayTool] ✅ Successfully sent side-view-data via IPC');
                } else {
                    console.warn('[MapsDisplayTool] ❌ Main window not available for IPC');
                }
            } catch (ipcError) {
                console.error('[MapsDisplayTool] ❌ Failed to send map data via IPC:', ipcError);
            }

            // Also include the data in the streaming output for backup
            const streamMarker = `📊 ${JSON.stringify(mapData)}`;

            // Generate a descriptive response
            const locationNames = parsedInput.locations.map(loc => loc.name).join(', ');
            let response = `I've displayed ${parsedInput.locations.length} location${parsedInput.locations.length > 1 ? 's' : ''} on the map: ${locationNames}.`;

            if (parsedInput.locations.length === 1) {
                const loc = parsedInput.locations[0];
                response += ` You can see ${loc.name} at coordinates ${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}.`;
                if (loc.description) {
                    response += ` ${loc.description}`;
                }
            } else {
                response += ` The map shows all locations with markers you can click for more details.`;
            }

            response += ` ${streamMarker}`;

            return response;
        } catch (error) {
            console.error('Error in MapsDisplayTool:', error);
            return `Error displaying map: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
    }
}

export default MapsDisplayTool;
