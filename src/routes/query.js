import express from 'express';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getUserProfile } from '../services/userAnalyzer.js';
import { getWeather, applyWeatherScoring } from '../services/weatherService.js';
import { getTimeContext, applyTimeScoring } from '../services/contextService.js';

const router = express.Router();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const restaurantsPath = path.join(__dirname, '../../restaurants.json');

// Configuration from .env
// Configuration from .env
// const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free'; // Moved inside function to ensure dotenv is loaded

// Helper to extract first valid JSON object
function extractFirstJson(text) {
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/) || text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return null;
    } catch (e) {
        return null;
    }
}

// Helper to call OpenRouter API with Context
async function callSmartLLM(userText, restaurantContext) {
    const prompt = `
You are a smart restaurant concierge.
User Query: "${userText}"

Available Restaurants:
${restaurantContext}

Task:
1. Analyze the user's mood, craving, and intent from the query.
2. Select the top 3-5 restaurants that BEST match the query.
3. If the user is sad/stressed, prioritize comfort food or desserts.
4. If the user is celebrating, prioritize premium/lively places.
5. If the user is in a rush, prioritize fast food. 
6. STRICTLY respect dietary keywords if present:
   - "Veg" / "Vegetarian" -> ONLY suggest restaurants/items that are explicitly vegetarian. DO NOT suggest "Egg" or "Chicken" or "Mutton" items.
   - If a specific dish (e.g. "Mutton Biryani") is requested but only "Veg" places are found, do not recommend them unless they have a veg alternative (e.g. "Veg Biryani").
   - If the user asks for "Veg Biryani" and it DOES NOT exist in a restaurant's menu, DO NOT Hallucinate it. Suggest a "Veg Pulao" or "Ghee Rice" instead if available.
7. STRICTLY respect Rating constraints:
   - If the user asks for "rating above X" or "X stars", ONLY recommend restaurants with Rating >= X.
   - If the user says "top rated", prioritize the highest rated options.
8. Return a JSON object with:
   - "analysis": Short description of what the user is looking for (mood/craving).
   - "recommendations": Array of objects, each containing:
     - "id": The restaurant ID.
     - "reason": A personalized reason why this fits their mood/query.
     - "suggested_item": A specific dish from the menu to try. MUST be from the provided menu list for that restaurant.

Output Format (JSON ONLY):
{
  "analysis": "User is feeling down and wants something sweet.",
  "recommendations": [
    { "id": "r010", "reason": "Perfect for lifting your spirits with sugary treats.", "suggested_item": "Red Velvet Cake" }
  ]
}
`;

    try {
        const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free';
        console.log(`Calling OpenRouter (Smart Ranking) with model: ${model}`);

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: model,
                messages: [
                    { role: "user", content: prompt }
                ]
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'HTTP-Referer': 'http://localhost:4000',
                    'X-Title': 'Smart Dine Backend',
                    'Content-Type': 'application/json'
                }
            }
        );

        const generatedText = response.data.choices[0].message.content;
        console.log("OpenRouter Raw Output:", generatedText);

        const result = extractFirstJson(generatedText);
        return result || { analysis: "Could not analyze", recommendations: [] };

    } catch (error) {
        console.error("LLM Call Failed:", error.message);
        return { analysis: "LLM_ERROR", recommendations: [] };
    }
}

// Helper to calculate distance using OSRM
async function calculateDistance(start, end) {
    if (!start || !end || start.lat === undefined || start.lon === undefined || end.lat === undefined || end.lon === undefined) return null;

    try {
        // OSRM expects: lon,lat
        const url = `http://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=false`;

        console.log(`[OSRM] Req: ${start.lat},${start.lon} -> ${end.lat},${end.lon}`);

        const response = await axios.get(url);

        if (response.data && response.data.routes && response.data.routes.length > 0) {
            const route = response.data.routes[0];
            const distanceKm = (route.distance / 1000).toFixed(1);
            const durationMins = Math.round(route.duration / 60);

            console.log(`[OSRM] Res: ${distanceKm} km, ${durationMins} mins`);

            return {
                distance: `${distanceKm} km`,
                trip_duration: `${durationMins} mins`
            };
        }
        return null;
    } catch (error) {
        console.error("OSRM Error:", error.message);
        return null;
    }
}

router.post('/', async (req, res) => {
    const { text, userLocation, userId } = req.body;

    if (!text) {
        return res.status(400).json({ error: "Text is required" });
    }

    try {
        console.log(`[Query] Processing search: "${text}" for user: ${userId || 'anonymous'}`);

        // 1. Load Restaurants
        const data = await fs.readFile(restaurantsPath, 'utf-8');
        let restaurants = JSON.parse(data);

        // 2. Get User Profile (if userId provided)
        let userProfile = null;
        if (userId) {
            try {
                userProfile = await getUserProfile(userId);
                console.log(`[Query] User profile: ${userProfile.favorite_cuisines.length} cuisines, ${userProfile.total_posts} posts`);
            } catch (error) {
                console.error('[Query] Error getting user profile:', error.message);
            }
        }

        // 3. Get Time Context
        const timeContext = getTimeContext();
        console.log(`[Query] Time context: ${timeContext.time_of_day}, ${timeContext.day_of_week}`);

        // 4. Get Weather Context (if location provided)
        let weather = null;
        if (userLocation) {
            try {
                weather = await getWeather(userLocation);
                console.log(`[Query] Weather: ${weather.condition}, ${weather.temperature}°C`);
            } catch (error) {
                console.error('[Query] Error getting weather:', error.message);
            }
        }

        // 5. Create Context String for AI
        const context = restaurants.map(r =>
            `ID: ${r.id} | Name: ${r.name} | Rating: ${r.rating} | Cuisine: ${r.cuisines.join(', ')} | Tags: ${r.tags.join(', ')} | Menu: ${r.menu_highlights.map(m => `${m.name} (${m.price})`).join(', ')} | Desc: ${r.description}`
        ).join('\n');

        // 6. Get Smart Recommendations from LLM (ONLY 1 AI CALL)
        const llmResult = await callSmartLLM(text, context);
        console.log(`[Query] AI returned ${llmResult.recommendations.length} recommendations`);

        // 7. Apply Time-Based Scoring
        restaurants = applyTimeScoring(restaurants, timeContext);

        // 8. Apply Weather-Based Scoring (if weather available)
        if (weather) {
            restaurants = applyWeatherScoring(restaurants, weather);
        }

        // 9. Merge LLM results with enhanced restaurant data
        let finalResults = llmResult.recommendations.map(rec => {
            const original = restaurants.find(r => r.id === rec.id);
            if (!original) return null;

            // Calculate AI score (normalized to 0-100)
            const aiScore = 50; // Base score from AI recommendation

            // Calculate User Behavior Score and build personalized reasons
            let userScore = 0;
            let personalizedReasons = [];

            if (userProfile) {
                // Check if user posted/liked/commented about this restaurant
                const weightedScore = userProfile.restaurant_frequency[rec.id] || 0;

                // CRITICAL: If user has negative sentiment (score < 0), skip this restaurant
                // unless there are very few alternatives
                if (weightedScore < 0) {
                    // User has negative feedback about this restaurant
                    // Apply heavy penalty to user_score
                    userScore = -50; // Heavy penalty
                    personalizedReasons.push("⚠️ You had a bad experience here before");
                } else if (weightedScore > 0) {
                    userScore += 40;

                    // Determine which specific interactions happened based on weighted score
                    // Posts: 2 points, Comments (positive): 2 points, Comments (neutral): 0.5, Likes: 1 point

                    let interactionMessage = null;

                    if (weightedScore >= 2) {
                        // Posted (2 points) or multiple interactions
                        if (weightedScore === 2) {
                            interactionMessage = "You posted about this place";
                        } else if (weightedScore % 2 === 0) {
                            // Multiple posts
                            const postCount = Math.floor(weightedScore / 2);
                            interactionMessage = `You posted about this ${postCount} times`;
                        } else {
                            // Mixed interactions
                            interactionMessage = "You've interacted with this place before";
                        }
                    } else if (weightedScore >= 1.5) {
                        interactionMessage = "You commented positively about this place";
                    } else if (weightedScore === 1) {
                        interactionMessage = "You liked a post about this place";
                    } else if (weightedScore > 0) {
                        interactionMessage = "This matches your preferences";
                    }

                    if (interactionMessage) {
                        personalizedReasons.push(interactionMessage);
                    }
                }

                // Check if user likes this cuisine
                const restaurantCuisines = original.cuisines || [];
                const matchingCuisines = restaurantCuisines.filter(c =>
                    userProfile.favorite_cuisines.includes(c)
                );
                if (matchingCuisines.length > 0) {
                    userScore += matchingCuisines.length * 15;
                    personalizedReasons.push(`You love ${matchingCuisines.join(', ')} cuisine`);
                }

                // Check if user posted about similar dishes
                const suggestedDish = rec.suggested_item?.toLowerCase() || '';
                const matchingDishes = userProfile.favorite_dishes.filter(d =>
                    suggestedDish.includes(d.toLowerCase())
                );
                if (matchingDishes.length > 0) {
                    userScore += matchingDishes.length * 10;
                    personalizedReasons.push(`You've enjoyed ${matchingDishes[0]} before`);
                }

                // Check total activity (posts + likes + comments)
                if (userProfile.total_posts > 0 || userProfile.total_likes > 0 || userProfile.total_comments > 0) {
                    const totalActivity = userProfile.total_posts + userProfile.total_likes + userProfile.total_comments;
                    if (totalActivity >= 10 && personalizedReasons.length === 0) {
                        personalizedReasons.push("Based on your food preferences");
                    }
                }
            }

            // Get Time and Weather Scores
            const timeScore = original.time_score || 0;
            const weatherScore = original.weather_score || 0;

            // Add time-based reasons
            if (timeContext.time_of_day === 'morning' && timeScore > 10) {
                personalizedReasons.push("Perfect for breakfast");
            } else if (timeContext.time_of_day === 'evening' && timeScore > 10) {
                personalizedReasons.push("Great for dinner");
            } else if (timeContext.time_of_day === 'night' && timeScore > 15) {
                personalizedReasons.push("Open late for you");
            }

            // Add weather-based reasons
            if (weather && weatherScore > 10) {
                if (weather.condition === 'Rain') {
                    personalizedReasons.push("Delivery available for rainy weather");
                } else if (weather.temperature > 30) {
                    personalizedReasons.push("Cool treats for hot weather");
                } else if (weather.temperature < 20) {
                    personalizedReasons.push("Warm comfort food");
                }
            }

            // Calculate Final Score (weighted combination)
            const finalScore =
                (aiScore * 0.4) +        // AI: 40%
                (userScore * 0.3) +      // User Behavior: 30%
                (timeScore * 0.15) +     // Time: 15%
                (weatherScore * 0.15);   // Weather: 15%

            // Combine AI reason with personalized reasons
            let enhancedReason = rec.reason;
            if (personalizedReasons.length > 0) {
                enhancedReason = `${rec.reason}. ${personalizedReasons.join('. ')}.`;
            }

            return {
                ...original,
                short_reason: enhancedReason,
                suggested_item: rec.suggested_item,
                ai_score: aiScore,
                user_score: userScore,
                time_score: timeScore,
                weather_score: weatherScore,
                final_score: Math.round(finalScore),
                score: Math.round(finalScore), // For compatibility
                personalized_insights: personalizedReasons // For debugging
            };
        }).filter(r => r !== null);

        // 10. Sort by final score
        finalResults.sort((a, b) => b.final_score - a.final_score);

        // 11. Enrich with Distance if userLocation is provided
        if (userLocation) {
            finalResults = await Promise.all(finalResults.map(async (r) => {
                const distInfo = await calculateDistance(userLocation, r.coordinates);
                return distInfo ? { ...r, ...distInfo } : r;
            }));
        }

        // 12. Fallback if LLM returns nothing
        if (finalResults.length === 0) {
            // Simple fallback search
            const fallback = restaurants.filter(r =>
                r.name.toLowerCase().includes(text.toLowerCase()) ||
                r.cuisines.some(c => c.toLowerCase().includes(text.toLowerCase()))
            ).slice(0, 3);

            let fallbackResults = fallback.map(r => ({ ...r, short_reason: "Keyword match" }));

            if (userLocation) {
                fallbackResults = await Promise.all(fallbackResults.map(async (r) => {
                    const distInfo = await calculateDistance(userLocation, r.coordinates);
                    return distInfo ? { ...r, ...distInfo } : r;
                }));
            }

            const analysisMsg = llmResult.analysis === "LLM_ERROR"
                ? "⚠️ AI Busy (Rate Limit) - Showing keyword matches."
                : "No AI matches found. Showing similar options.";

            res.json({
                query: text,
                analysis: analysisMsg,
                results: fallbackResults,
                context: {
                    time: timeContext.time_of_day,
                    weather: weather?.condition,
                    user_profile_loaded: !!userProfile
                }
            });
        } else {
            // 13. Find Similar Restaurants (Cuisine Match)
            const topIds = new Set(finalResults.map(r => r.id));
            const topCuisines = new Set(finalResults.flatMap(r => r.cuisines));

            // Helper to detect intent
            const lowerText = text.toLowerCase();
            let dietaryIntent = 'neutral';
            if (lowerText.includes('veg') && !lowerText.includes('non-veg')) {
                dietaryIntent = 'veg';
            } else if (
                lowerText.includes('non-veg') ||
                lowerText.includes('chicken') ||
                lowerText.includes('mutton') ||
                lowerText.includes('fish') ||
                lowerText.includes('egg') ||
                lowerText.includes('beef') ||
                lowerText.includes('pork')
            ) {
                dietaryIntent = 'non-veg';
            }

            let similarResults = restaurants
                .filter(r => !topIds.has(r.id)) // Exclude already recommended
                .filter(r => r.cuisines.some(c => topCuisines.has(c))) // Match cuisine
                .filter(r => {
                    // Strict Dietary Filtering for Similar Results
                    if (dietaryIntent === 'veg') {
                        if (r.cuisines.includes('Non-Veg') || r.tags.includes('non-veg-specialty')) return false;
                    }
                    if (dietaryIntent === 'non-veg') {
                        if (r.cuisines.includes('Vegetarian')) return false;
                    }
                    return true;
                })
                .map(r => {
                    let validHighlights = r.menu_highlights || [];
                    const suggested = validHighlights.length > 0 ? validHighlights[0] : null;

                    return {
                        ...r,
                        short_reason: "Similar cuisine to your top picks",
                        suggested_item: suggested ? suggested.name : null
                    };
                })
                .slice(0, 6); // Limit similar results

            if (userLocation) {
                similarResults = await Promise.all(similarResults.map(async (r) => {
                    const distInfo = await calculateDistance(userLocation, r.coordinates);
                    return distInfo ? { ...r, ...distInfo } : r;
                }));
            }

            res.json({
                query: text,
                analysis: llmResult.analysis,
                results: finalResults,
                similar_results: similarResults,
                // Enhanced context for debugging
                context: {
                    time: {
                        current_time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
                        time_of_day: timeContext.time_of_day,
                        day_of_week: timeContext.day_of_week,
                        is_weekend: timeContext.is_weekend,
                        season: timeContext.season
                    },
                    weather: weather ? {
                        condition: weather.condition,
                        temperature: `${weather.temperature}°C`,
                        description: weather.description,
                        feels_like: `${weather.feels_like}°C`
                    } : null,
                    user: userProfile ? {
                        profile_loaded: true,
                        favorite_cuisines: userProfile.favorite_cuisines.slice(0, 3),
                        favorite_restaurants: userProfile.favorite_restaurants.slice(0, 3),
                        total_posts: userProfile.total_posts,
                        total_likes: userProfile.total_likes,
                        total_comments: userProfile.total_comments,
                        most_active_time: userProfile.most_active_time
                    } : { profile_loaded: false }
                }
            });
        }

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ error: "Server error" });
    }
});

// Endpoint to get similar restaurants for a specific ID
router.post('/similar', async (req, res) => {
    const { restaurantId, userLocation } = req.body;

    if (!restaurantId) {
        return res.status(400).json({ error: "restaurantId is required" });
    }

    try {
        const data = await fs.readFile(restaurantsPath, 'utf-8');
        const restaurants = JSON.parse(data);

        const source = restaurants.find(r => r.id === restaurantId);
        if (!source) {
            return res.status(404).json({ error: "Restaurant not found" });
        }

        const sourceCuisines = new Set(source.cuisines || []);
        const sourceTags = new Set(source.tags || []);

        let similar = restaurants
            .filter(r => r.id !== restaurantId) // Exclude self
            .map(r => {
                let score = 0;
                let reasons = [];

                // Score by Cuisine Overlap
                r.cuisines.forEach(c => {
                    if (sourceCuisines.has(c)) {
                        score += 2; // Higher weight for cuisine
                    }
                });

                // Score by Tag Overlap
                r.tags.forEach(t => {
                    if (sourceTags.has(t)) {
                        score += 1;
                        reasons.push(t);
                    }
                });

                // Small boost for same price level
                if (r.price_level === source.price_level) {
                    score += 0.5;
                }

                return {
                    ...r,
                    score,
                    match_reasons: reasons
                };
            })
            .filter(r => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5); // Top 5 similar

        // Assign short reasons based on overlap
        similar = similar.map(r => {
            const overlappingCuisines = r.cuisines.filter(c => sourceCuisines.has(c));
            let reason = "Similar vibes";
            if (overlappingCuisines.length > 0) {
                reason = `Also serves ${overlappingCuisines[0]}`;
            } else if (r.match_reasons.length > 0) {
                reason = `Matches '${r.match_reasons[0]}' tag`;
            }

            // Pick a suggested item (just the first valid highlight for now)
            const suggested = (r.menu_highlights && r.menu_highlights.length > 0)
                ? r.menu_highlights[0].name
                : null;

            return {
                ...r,
                short_reason: reason,
                suggested_item: suggested
            };
        });

        // Add distance if user location provided
        if (userLocation) {
            similar = await Promise.all(similar.map(async (r) => {
                const distInfo = await calculateDistance(userLocation, r.coordinates);
                return distInfo ? { ...r, ...distInfo } : r;
            }));
        }

        res.json({
            source: source.name,
            similar_restaurants: similar
        });

    } catch (error) {
        console.error("Error finding similar restaurants:", error);
        res.status(500).json({ error: "Server error" });
    }
});

export default router;
