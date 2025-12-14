import axios from 'axios';

async function getDistance(start, end, label) {
    try {
        const url = `http://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=false`;
        console.log(`\n--- Test: ${label} ---`);
        console.log(`URL: ${url}`);

        const response = await axios.get(url);
        if (response.data.routes && response.data.routes.length > 0) {
            const distMeters = response.data.routes[0].distance;
            console.log(`Distance: ${(distMeters / 1000).toFixed(2)} km`);
            console.log(`Duration: ${(response.data.routes[0].duration / 60).toFixed(1)} mins`);
        } else {
            console.log("No route found");
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

// 1. Correct (Coimbatore -> Sree Annapoorna)
// Ramnagar (User): 11.0168, 76.9558
// Sree Annapoorna: 11.0169, 76.9558
getDistance(
    { lat: 11.0168, lon: 76.9558 },
    { lat: 11.0169, lon: 76.9558 },
    "Expected: Very Short Distance"
);

// 2. Swapped Coords (User Input Swapped)
getDistance(
    { lat: 76.9558, lon: 11.0168 },
    { lat: 11.0169, lon: 76.9558 },
    "User Swapped (Lat/Lon mixed)"
);

// 3. User at 0,0
getDistance(
    { lat: 0, lon: 0 },
    { lat: 11.0169, lon: 76.9558 },
    "User at 0,0"
);

// 4. Chennai to Coimbatore (Approx)
getDistance(
    { lat: 13.0827, lon: 80.2707 },
    { lat: 11.0169, lon: 76.9558 },
    "Chennai to Coimbatore (~500km)"
);
