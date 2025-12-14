import express from 'express';
import axios from 'axios';

const router = express.Router();

/**
 * Get route between two points using public OSRM API
 * POST /api/route
 * Body: { origin: {lat, lon}, destination: {lat, lon} }
 * Returns: { distance_km, duration_min, route_geojson }
 */
router.post('/', async (req, res) => {
    const { origin, destination } = req.body;

    // Validate input
    if (!origin || !destination ||
        !origin.lat || !origin.lon ||
        !destination.lat || !destination.lon) {
        return res.status(400).json({
            error: "Both origin and destination with lat/lon are required"
        });
    }

    try {
        // OSRM expects: lon,lat (NOT lat,lon)
        const url = `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=full&geometries=geojson`;

        console.log(`[OSRM Route] Fetching route: ${origin.lat},${origin.lon} -> ${destination.lat},${destination.lon}`);

        const response = await axios.get(url);

        if (response.data && response.data.routes && response.data.routes.length > 0) {
            const route = response.data.routes[0];

            // Extract data
            const distance_km = (route.distance / 1000).toFixed(1); // meters to km
            const duration_min = Math.round(route.duration / 60); // seconds to minutes
            const route_geojson = route.geometry; // GeoJSON LineString

            console.log(`[OSRM Route] Success: ${distance_km} km, ${duration_min} mins`);

            res.json({
                distance_km: parseFloat(distance_km),
                duration_min,
                route_geojson,
                summary: `${distance_km} km · ${duration_min} min drive`
            });
        } else {
            console.log('[OSRM Route] No route found');
            res.status(404).json({
                error: "No route found between these locations"
            });
        }

    } catch (error) {
        console.error('[OSRM Route] Error:', error.message);
        res.status(500).json({
            error: "Failed to calculate route",
            details: error.message
        });
    }
});

export default router;
