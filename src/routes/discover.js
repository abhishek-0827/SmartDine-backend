import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getUserProfile } from '../services/userAnalyzer.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const restaurantsPath = path.join(__dirname, '../../restaurants.json');

/**
 * GET /api/discover
 * Get all restaurants with pagination and search
 * Query params:
 *   - page: page number (default: 1)
 *   - limit: items per page (default: 12)
 *   - search: search query (optional)
 *   - userId: user ID for interaction status (optional)
 */
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const search = req.query.search || '';
        const userId = req.query.userId;

        // Load restaurants
        const data = await fs.readFile(restaurantsPath, 'utf-8');
        let restaurants = JSON.parse(data);

        // Apply search filter for restaurants
        let matchedRestaurants = [];
        let matchedDishes = [];

        if (search) {
            const searchLower = search.toLowerCase();

            // Search restaurants
            matchedRestaurants = restaurants.filter(r =>
                r.name.toLowerCase().includes(searchLower) ||
                r.cuisines.some(c => c.toLowerCase().includes(searchLower)) ||
                r.tags.some(t => t.toLowerCase().includes(searchLower)) ||
                r.description.toLowerCase().includes(searchLower)
            );

            // Search dishes in menu_highlights
            restaurants.forEach(restaurant => {
                restaurant.menu_highlights.forEach(dish => {
                    if (dish.name.toLowerCase().includes(searchLower)) {
                        matchedDishes.push({
                            type: 'dish',
                            dish_name: dish.name,
                            dish_price: dish.price,
                            restaurant_id: restaurant.id,
                            restaurant_name: restaurant.name,
                            restaurant_rating: restaurant.rating,
                            restaurant_cuisines: restaurant.cuisines,
                            restaurant_price_level: restaurant.price_level
                        });
                    }
                });
            });
        } else {
            // If no search, show all restaurants
            matchedRestaurants = restaurants;
        }

        // Get user profile if userId provided
        let userProfile = null;
        if (userId) {
            try {
                userProfile = await getUserProfile(userId);
            } catch (error) {
                console.error('[Discover] Error getting user profile:', error.message);
            }
        }

        // Add user interaction status to each restaurant
        const restaurantsWithStatus = matchedRestaurants.map(r => {
            let interactionStatus = 'none'; // none, liked, commented, posted

            if (userProfile) {
                const frequency = userProfile.restaurant_frequency[r.id] || 0;

                if (frequency >= 2) {
                    interactionStatus = 'posted';
                } else if (frequency >= 1.5) {
                    interactionStatus = 'commented';
                } else if (frequency >= 1) {
                    interactionStatus = 'liked';
                }
            }

            return {
                ...r,
                type: 'restaurant',
                user_interaction: interactionStatus
            };
        });

        // Combine restaurants and dishes
        const allResults = [...restaurantsWithStatus, ...matchedDishes];

        // Calculate pagination
        const totalResults = allResults.length;
        const totalPages = Math.ceil(totalResults / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;

        // Get page data
        const pageData = allResults.slice(startIndex, endIndex);

        res.json({
            results: pageData,
            pagination: {
                current_page: page,
                total_pages: totalPages,
                total_results: totalResults,
                per_page: limit,
                has_next: page < totalPages,
                has_prev: page > 1
            },
            search_query: search,
            counts: {
                restaurants: restaurantsWithStatus.length,
                dishes: matchedDishes.length
            }
        });

    } catch (error) {
        console.error('[Discover] Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
