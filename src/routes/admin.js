import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const restaurantsPath = path.join(__dirname, '../../restaurants.json');

// GET all restaurants
router.get('/restaurants', async (req, res) => {
    try {
        const data = await fs.readFile(restaurantsPath, 'utf-8');
        const restaurants = JSON.parse(data);
        res.json(restaurants);
    } catch (error) {
        console.error("Admin GET Error:", error);
        res.status(500).json({ error: "Failed to load restaurants" });
    }
});

// POST new restaurant
router.post('/restaurants', async (req, res) => {
    const newRestaurant = req.body;

    if (!newRestaurant.id || !newRestaurant.name) {
        return res.status(400).json({ error: "ID and Name are required" });
    }

    try {
        const data = await fs.readFile(restaurantsPath, 'utf-8');
        const restaurants = JSON.parse(data);

        // Check if ID exists
        if (restaurants.find(r => r.id === newRestaurant.id)) {
            return res.status(400).json({ error: "Restaurant ID already exists" });
        }

        restaurants.push(newRestaurant);

        await fs.writeFile(restaurantsPath, JSON.stringify(restaurants, null, 2));

        console.log("Admin: Added new restaurant", newRestaurant.name);

        res.json({ ok: true, restaurant: newRestaurant });

    } catch (error) {
        console.error("Admin POST Error:", error);
        res.status(500).json({ error: "Failed to save restaurant" });
    }
});

export default router;
