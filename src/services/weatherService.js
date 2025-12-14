import axios from 'axios';

// Weather cache (30 minutes TTL)
const weatherCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Get weather for a location using Open-Meteo API (Free, no API key needed)
 * API Docs: https://open-meteo.com/en/docs
 */
export async function getWeather(location) {
    const cacheKey = `${location.lat.toFixed(2)},${location.lon.toFixed(2)}`;

    // Check cache
    const cached = weatherCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        console.log('[Weather] Using cached weather data');
        return cached.weather;
    }

    try {
        // Open-Meteo API - completely free, no API key required
        const response = await axios.get(
            'https://api.open-meteo.com/v1/forecast',
            {
                params: {
                    latitude: location.lat,
                    longitude: location.lon,
                    current: 'temperature_2m,relative_humidity_2m,weather_code',
                    timezone: 'auto'
                }
            }
        );

        const current = response.data.current;

        // Map WMO weather codes to conditions
        // https://open-meteo.com/en/docs
        const weatherCode = current.weather_code;
        const weatherCondition = getWeatherCondition(weatherCode);

        const weather = {
            condition: weatherCondition.main,
            description: weatherCondition.description,
            temperature: Math.round(current.temperature_2m),
            feels_like: Math.round(current.temperature_2m), // Open-Meteo doesn't provide feels_like in free tier
            humidity: current.relative_humidity_2m
        };

        // Cache the result
        weatherCache.set(cacheKey, {
            weather,
            timestamp: Date.now()
        });

        console.log(`[Weather] Fetched weather: ${weather.condition}, ${weather.temperature}°C`);
        return weather;

    } catch (error) {
        console.error('[Weather] Error fetching weather:', error.message);
        return getDefaultWeather();
    }
}

/**
 * Map WMO Weather codes to readable conditions
 * https://open-meteo.com/en/docs
 */
function getWeatherCondition(code) {
    // Clear
    if (code === 0) return { main: 'Clear', description: 'clear sky' };

    // Cloudy
    if (code >= 1 && code <= 3) return { main: 'Clouds', description: 'partly cloudy' };

    // Fog
    if (code >= 45 && code <= 48) return { main: 'Fog', description: 'foggy' };

    // Drizzle
    if (code >= 51 && code <= 57) return { main: 'Drizzle', description: 'light drizzle' };

    // Rain
    if (code >= 61 && code <= 67) return { main: 'Rain', description: 'rainy' };
    if (code >= 80 && code <= 82) return { main: 'Rain', description: 'rain showers' };

    // Snow
    if (code >= 71 && code <= 77) return { main: 'Snow', description: 'snowy' };
    if (code >= 85 && code <= 86) return { main: 'Snow', description: 'snow showers' };

    // Thunderstorm
    if (code >= 95 && code <= 99) return { main: 'Thunderstorm', description: 'thunderstorm' };

    // Default
    return { main: 'Clear', description: 'clear sky' };
}

/**
 * Get default weather when API fails
 */
function getDefaultWeather() {
    return {
        condition: 'Clear',
        description: 'clear sky',
        temperature: 25,
        feels_like: 25,
        humidity: 60
    };
}

/**
 * Apply weather-based scoring to restaurants
 */
export function applyWeatherScoring(restaurants, weather) {
    return restaurants.map(restaurant => {
        let weatherScore = 0;

        // Rainy weather
        if (weather.condition === 'Rain' || weather.condition === 'Drizzle') {
            // Boost delivery restaurants
            if (restaurant.tags?.includes('delivery') || restaurant.tags?.includes('takeaway')) {
                weatherScore += 20;
            }
            // Boost comfort food
            if (restaurant.tags?.includes('comfort-food') || restaurant.cuisines?.includes('Indian')) {
                weatherScore += 10;
            }
            // Boost indoor seating
            if (restaurant.tags?.includes('indoor')) {
                weatherScore += 10;
            }
        }

        // Hot weather (>30°C)
        if (weather.temperature > 30) {
            // Boost ice cream/desserts
            if (restaurant.tags?.includes('desserts') || restaurant.tags?.includes('ice-cream')) {
                weatherScore += 15;
            }
            // Boost cold beverages
            if (restaurant.tags?.includes('cafe') || restaurant.tags?.includes('beverages')) {
                weatherScore += 10;
            }
            // Check menu for cold items
            if (hasMenuItems(restaurant, ['ice cream', 'cold coffee', 'milkshake', 'smoothie'])) {
                weatherScore += 10;
            }
        }

        // Cold weather (<20°C)
        if (weather.temperature < 20) {
            // Boost hot soups and comfort food
            if (restaurant.tags?.includes('comfort-food') || restaurant.tags?.includes('traditional')) {
                weatherScore += 15;
            }
            // Check menu for hot items
            if (hasMenuItems(restaurant, ['soup', 'coffee', 'tea', 'hot chocolate'])) {
                weatherScore += 10;
            }
        }

        // Pleasant weather (20-30°C)
        if (weather.temperature >= 20 && weather.temperature <= 30 && weather.condition === 'Clear') {
            // Boost outdoor seating
            if (restaurant.tags?.includes('outdoor') || restaurant.tags?.includes('rooftop')) {
                weatherScore += 15;
            }
        }

        return {
            ...restaurant,
            weather_score: weatherScore
        };
    });
}

/**
 * Check if restaurant menu has specific items
 */
function hasMenuItems(restaurant, keywords) {
    if (!restaurant.menu_highlights) return false;

    const menuText = restaurant.menu_highlights
        .map(item => item.name.toLowerCase())
        .join(' ');

    return keywords.some(keyword => menuText.includes(keyword.toLowerCase()));
}

/**
 * Clear weather cache
 */
export function clearWeatherCache() {
    weatherCache.clear();
    console.log('[Weather] Cleared weather cache');
}

export default {
    getWeather,
    applyWeatherScoring,
    clearWeatherCache
};
