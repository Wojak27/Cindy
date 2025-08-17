/**
 * AccuWeather Tool for weather information
 * Provides current weather conditions and forecasts
 */

import { Tool } from '@langchain/core/tools';
import { ToolCategory } from '../ToolDefinitions';
import type { ToolSpecification } from '../ToolDefinitions';

/**
 * AccuWeather API Tool
 */
export class AccuWeatherTool extends Tool {
    name = 'weather';
    description = 'Get current weather information for any location worldwide using AccuWeather API';

    private apiKey: string | null = null;
    private baseUrl = 'http://dataservice.accuweather.com';

    constructor(apiKey?: string) {
        super();
        this.apiKey = apiKey || process.env.ACCUWEATHER_API_KEY || null;

        if (!this.apiKey) {
            console.warn('[AccuWeatherTool] No API key provided. Weather requests will use mock data.');
        } else {
            console.log('[AccuWeatherTool] Initialized with AccuWeather API');
        }
    }

    async _call(input: string): Promise<string> {
        try {
            console.log(`[AccuWeatherTool] Received input:`, input, typeof input);
            
            // Handle different input formats:
            // 1. String: "Paris"
            // 2. Object: { location: "Paris" } (converted to JSON string by ToolRegistry)
            // 3. JSON string: '{"location": "Paris"}'
            let location: string;
            
            if (typeof input === 'string') {
                try {
                    // Try to parse as JSON first
                    const parsed = JSON.parse(input);
                    location = parsed.location || parsed.query || parsed.input || input;
                } catch {
                    // Not JSON, treat as plain string
                    location = input;
                }
            } else {
                // Fallback for other types
                location = String(input);
            }

            console.log(`[AccuWeatherTool] Fetching weather for: ${location}`);

            if (!this.apiKey) {
                return this.getMockWeatherData(location);
            }

            // Step 1: Get location key
            const locationKey = await this.getLocationKey(location);
            if (!locationKey) {
                throw new Error(`Could not find location: ${location}`);
            }

            // Step 2: Get current conditions
            const weatherData = await this.getCurrentConditions(locationKey);

            // Format the response
            return this.formatWeatherResponse(weatherData, location);

        } catch (error: any) {
            console.error('[AccuWeatherTool] Error fetching weather:', error);

            // Fallback to mock data on error  
            console.log('[AccuWeatherTool] Falling back to mock data due to error');
            // Extract location from input for fallback
            let fallbackLocation: string;
            try {
                const parsed = JSON.parse(input);
                fallbackLocation = parsed.location || input;
            } catch {
                fallbackLocation = input;
            }
            return this.getMockWeatherData(fallbackLocation);
        }
    }

    /**
     * Get location key from AccuWeather API
     */
    private async getLocationKey(location: string): Promise<string | null> {
        try {
            const url = `${this.baseUrl}/locations/v1/cities/search`;
            const params = new URLSearchParams({
                apikey: this.apiKey!,
                q: location,
                details: 'false'
            });

            const response = await fetch(`${url}?${params}`);

            if (!response.ok) {
                throw new Error(`Location search failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            if (data && data.length > 0) {
                return data[0].Key;
            }

            return null;

        } catch (error) {
            console.error('[AccuWeatherTool] Error getting location key:', error);
            return null;
        }
    }

    /**
     * Get current weather conditions
     */
    private async getCurrentConditions(locationKey: string): Promise<any> {
        try {
            const url = `${this.baseUrl}/currentconditions/v1/${locationKey}`;
            const params = new URLSearchParams({
                apikey: this.apiKey!,
                details: 'true'
            });

            const response = await fetch(`${url}?${params}`);

            if (!response.ok) {
                throw new Error(`Weather data fetch failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            return data[0]; // Current conditions return an array with one item

        } catch (error) {
            console.error('[AccuWeatherTool] Error getting current conditions:', error);
            throw error;
        }
    }

    /**
     * Format weather response for display
     */
    private formatWeatherResponse(weatherData: any, location: string): string {
        try {
            const formatted = {
                location: location,
                temperature: {
                    celsius: weatherData.Temperature?.Metric?.Value || 'N/A',
                    fahrenheit: weatherData.Temperature?.Imperial?.Value || 'N/A',
                    unit_metric: weatherData.Temperature?.Metric?.Unit || 'C',
                    unit_imperial: weatherData.Temperature?.Imperial?.Unit || 'F'
                },
                condition: weatherData.WeatherText || 'Unknown',
                humidity: weatherData.RelativeHumidity ? `${weatherData.RelativeHumidity}%` : 'N/A',
                wind: {
                    speed_metric: weatherData.Wind?.Speed?.Metric?.Value || 'N/A',
                    speed_imperial: weatherData.Wind?.Speed?.Imperial?.Value || 'N/A',
                    direction: weatherData.Wind?.Direction?.English || 'N/A'
                },
                pressure: {
                    metric: weatherData.Pressure?.Metric?.Value || 'N/A',
                    imperial: weatherData.Pressure?.Imperial?.Value || 'N/A'
                },
                visibility: {
                    metric: weatherData.Visibility?.Metric?.Value || 'N/A',
                    imperial: weatherData.Visibility?.Imperial?.Value || 'N/A'
                },
                uv_index: weatherData.UVIndex || 'N/A',
                is_day: weatherData.IsDayTime || false,
                observation_time: weatherData.LocalObservationDateTime || new Date().toISOString(),
                source: 'AccuWeather'
            };

            return JSON.stringify(formatted, null, 2);

        } catch (error) {
            console.error('[AccuWeatherTool] Error formatting weather response:', error);
            return `Weather data retrieved but formatting failed. Raw data: ${JSON.stringify(weatherData)}`;
        }
    }

    /**
     * Generate mock weather data for testing/fallback
     */
    private getMockWeatherData(location: string): string {
        const mockData = {
            location: location,
            temperature: {
                celsius: Math.round(Math.random() * 30 + 5),
                fahrenheit: Math.round(Math.random() * 50 + 40),
                unit_metric: 'C',
                unit_imperial: 'F'
            },
            condition: ['Sunny', 'Partly Cloudy', 'Cloudy', 'Light Rain', 'Clear'][Math.floor(Math.random() * 5)],
            humidity: `${Math.round(Math.random() * 40 + 30)}%`,
            wind: {
                speed_metric: Math.round(Math.random() * 20 + 5),
                speed_imperial: Math.round(Math.random() * 15 + 3),
                direction: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.floor(Math.random() * 8)]
            },
            pressure: {
                metric: Math.round(Math.random() * 50 + 1000),
                imperial: Math.round(Math.random() * 2 + 29)
            },
            visibility: {
                metric: Math.round(Math.random() * 10 + 5),
                imperial: Math.round(Math.random() * 10 + 5)
            },
            uv_index: Math.round(Math.random() * 10),
            is_day: new Date().getHours() > 6 && new Date().getHours() < 20,
            observation_time: new Date().toISOString(),
            source: 'Mock Data (AccuWeather API not available)'
        };

        return JSON.stringify(mockData, null, 2);
    }

    /**
     * Test the weather tool
     */
    async test(location: string = 'New York, NY'): Promise<string> {
        console.log(`[AccuWeatherTool] Testing with location: ${location}`);
        return await this._call(location);
    }
}

/**
 * Create and configure AccuWeather tool specification
 */
export function createAccuWeatherTool(apiKey?: string): ToolSpecification {
    const tool = new AccuWeatherTool(apiKey);
    
    const specification: ToolSpecification = {
        name: 'weather',
        description: tool.description,
        parameters: {
            type: 'object',
            properties: {
                input: { 
                    type: 'string', 
                    description: 'Location for weather information (e.g., "New York, NY" or "Paris, France")' 
                }
            },
            required: ['input']
        },
        tool,
        metadata: {
            category: ToolCategory.WEATHER,
            version: '1.0.0',
            requiresAuth: false, // Works with mock data when no API key
            tags: ['weather', 'accuweather', 'current-conditions', 'forecast'],
            rateLimit: {
                requestsPerMinute: 50, // AccuWeather free tier
                requestsPerDay: 1000
            }
        },
        config: {
            apiKey
        }
    };
    
    return specification;
}