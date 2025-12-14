import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load restaurants data
let restaurantsCache = null;

async function loadRestaurants() {
    if (restaurantsCache) return restaurantsCache;

    const restaurantsPath = path.join(__dirname, '../../restaurants.json');
    const data = await fs.readFile(restaurantsPath, 'utf-8');
    restaurantsCache = JSON.parse(data);
    return restaurantsCache;
}

/**
 * Calculate Levenshtein distance for fuzzy matching
 */
function levenshteinDistance(str1, str2) {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = [];

    for (let i = 0; i <= len1; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }

    return matrix[len1][len2];
}

/**
 * Calculate similarity score (0-1)
 */
function similarityScore(str1, str2) {
    const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
    const maxLen = Math.max(str1.length, str2.length);
    return 1 - (distance / maxLen);
}

/**
 * Analyze sentiment of text
 * Returns: { sentiment: 'positive' | 'negative' | 'neutral', score: number }
 */
export function analyzeSentiment(text) {
    const lowerText = text.toLowerCase();

    // Negative keywords (stronger weight)
    const negativeKeywords = [
        'bad', 'worst', 'terrible', 'horrible', 'disgusting', 'awful', 'poor',
        'not good', 'waste', 'pathetic', 'disappointing', 'disappointed',
        'never again', 'avoid', 'overpriced', 'overrated', 'stale', 'cold',
        'tasteless', 'bland', 'rude', 'slow', 'dirty', 'unhygienic',
        'not worth', 'regret', 'hate', 'hated', 'nasty', 'gross'
    ];

    // Positive keywords
    const positiveKeywords = [
        'good', 'great', 'excellent', 'amazing', 'awesome', 'fantastic',
        'delicious', 'tasty', 'yummy', 'love', 'loved', 'best', 'perfect',
        'wonderful', 'superb', 'outstanding', 'brilliant', 'incredible',
        'fresh', 'hot', 'flavorful', 'recommend', 'must try', 'worth it',
        'satisfied', 'happy', 'enjoyed', 'favorite', 'favourite'
    ];

    let positiveCount = 0;
    let negativeCount = 0;

    // Count keyword matches
    for (const keyword of negativeKeywords) {
        if (lowerText.includes(keyword)) {
            negativeCount += 2; // Negative keywords have stronger weight
        }
    }

    for (const keyword of positiveKeywords) {
        if (lowerText.includes(keyword)) {
            positiveCount += 1;
        }
    }

    // Determine sentiment
    let sentiment = 'neutral';
    let score = 0;

    if (negativeCount > positiveCount) {
        sentiment = 'negative';
        score = -1; // Negative sentiment gets -1
    } else if (positiveCount > negativeCount) {
        sentiment = 'positive';
        score = 1; // Positive sentiment gets +1
    }

    return { sentiment, score };
}

/**
 * Extract restaurant mentions from text
 * Example: "I ate at Anandhaas" -> matches "Shree Anandhaas"
 */
export async function extractRestaurantMentions(text) {
    const restaurants = await loadRestaurants();
    const lowerText = text.toLowerCase();
    const matches = [];

    // Blacklist of common food words that shouldn't be matched as restaurant names
    const foodWordBlacklist = new Set([
        'biryani', 'dosa', 'idli', 'vada', 'rice', 'curry', 'chicken', 'mutton',
        'fish', 'prawn', 'paneer', 'masala', 'tandoor', 'grill', 'fry', 'roast',
        'pizza', 'burger', 'sandwich', 'pasta', 'noodles', 'fried', 'spicy',
        'sweet', 'sour', 'hot', 'cold', 'fresh', 'tasty', 'delicious'
    ]);

    for (const restaurant of restaurants) {
        const restaurantName = restaurant.name.toLowerCase();

        // Direct substring match
        if (lowerText.includes(restaurantName)) {
            matches.push({
                restaurant_id: restaurant.id,
                restaurant_name: restaurant.name,
                match_type: 'exact',
                confidence: 1.0
            });
            continue;
        }

        // Check for partial matches (e.g., "anandhaas" in "Shree Anandhaas")
        // Also handle parenthetical names like "Cream Centre (Coimbatore)"
        const cleanedName = restaurantName.replace(/\([^)]*\)/g, '').trim(); // Remove parentheses
        const nameParts = cleanedName.split(' ');
        let foundPartialMatch = false;

        for (const part of nameParts) {
            // Skip if part is a common food word
            if (foodWordBlacklist.has(part)) {
                continue;
            }

            // Check for direct match or spelling variations (center/centre, flavor/flavour)
            if (part.length > 4) {
                const variations = [
                    part,
                    part.replace('re', 'er'), // centre -> center
                    part.replace('er', 're'), // center -> centre
                    part.replace('our', 'or'), // flavour -> flavor
                    part.replace('or', 'our')  // flavor -> flavour
                ];

                for (const variation of variations) {
                    if (lowerText.includes(variation)) {
                        matches.push({
                            restaurant_id: restaurant.id,
                            restaurant_name: restaurant.name,
                            match_type: 'partial',
                            confidence: 0.8
                        });
                        foundPartialMatch = true;
                        break;
                    }
                }
            }
        }

        if (foundPartialMatch) continue;

        // Fuzzy matching for typos
        const words = lowerText.split(/\s+/);
        for (const word of words) {
            // Skip if word is a common food word
            if (foodWordBlacklist.has(word)) {
                continue;
            }

            if (word.length > 4) {
                const similarity = similarityScore(word, restaurantName);
                if (similarity > 0.7) {
                    matches.push({
                        restaurant_id: restaurant.id,
                        restaurant_name: restaurant.name,
                        match_type: 'fuzzy',
                        confidence: similarity
                    });
                    break;
                }

                // Also check against name parts
                for (const part of nameParts) {
                    // Skip if part is a common food word
                    if (foodWordBlacklist.has(part)) {
                        continue;
                    }

                    if (part.length > 4) {
                        const partSimilarity = similarityScore(word, part);
                        if (partSimilarity > 0.75) {
                            matches.push({
                                restaurant_id: restaurant.id,
                                restaurant_name: restaurant.name,
                                match_type: 'fuzzy_partial',
                                confidence: partSimilarity
                            });
                            break;
                        }
                    }
                }
            }
        }
    }

    // Sort by confidence and remove duplicates
    const uniqueMatches = [];
    const seenIds = new Set();

    matches.sort((a, b) => b.confidence - a.confidence);

    for (const match of matches) {
        if (!seenIds.has(match.restaurant_id)) {
            uniqueMatches.push(match);
            seenIds.add(match.restaurant_id);
        }
    }

    return uniqueMatches;
}

/**
 * Extract dish mentions from text
 * Example: "the masala dosa was very tasty" -> finds "Masala Dosa"
 */
export async function extractDishMentions(text, restaurantId = null) {
    const restaurants = await loadRestaurants();
    const lowerText = text.toLowerCase();
    const dishMatches = [];

    // If restaurant is specified, search only that restaurant's menu
    const restaurantsToSearch = restaurantId
        ? restaurants.filter(r => r.id === restaurantId)
        : restaurants;

    for (const restaurant of restaurantsToSearch) {
        if (!restaurant.menu_highlights) continue;

        for (const dish of restaurant.menu_highlights) {
            const dishName = dish.name.toLowerCase();

            // Direct match
            if (lowerText.includes(dishName)) {
                dishMatches.push({
                    dish_name: dish.name,
                    restaurant_id: restaurant.id,
                    restaurant_name: restaurant.name,
                    match_type: 'exact',
                    confidence: 1.0
                });
                continue;
            }

            // Partial match (e.g., "dosa" matches "Masala Dosa")
            const dishWords = dishName.split(' ');
            for (const dishWord of dishWords) {
                if (dishWord.length > 3 && lowerText.includes(dishWord)) {
                    dishMatches.push({
                        dish_name: dish.name,
                        restaurant_id: restaurant.id,
                        restaurant_name: restaurant.name,
                        match_type: 'partial',
                        confidence: 0.7
                    });
                    break;
                }
            }
        }
    }

    // Remove duplicates and sort by confidence
    const uniqueDishes = [];
    const seenDishes = new Set();

    dishMatches.sort((a, b) => b.confidence - a.confidence);

    for (const match of dishMatches) {
        const key = `${match.restaurant_id}:${match.dish_name}`;
        if (!seenDishes.has(key)) {
            uniqueDishes.push(match);
            seenDishes.add(key);
        }
    }

    return uniqueDishes.slice(0, 5);
}

/**
 * Extract cuisine types from text
 */
export async function extractCuisineTypes(text) {
    const restaurants = await loadRestaurants();
    const lowerText = text.toLowerCase();
    const cuisineMatches = new Set();

    // Blacklist of dish names that are not cuisines
    const dishNameBlacklist = new Set([
        'biryani', 'dosa', 'idli', 'vada', 'thali', 'curry', 'masala',
        'tandoori', 'tikka', 'kebab', 'naan', 'roti', 'paratha'
    ]);

    // Get all unique cuisines
    const allCuisines = new Set();
    restaurants.forEach(r => {
        r.cuisines.forEach(c => allCuisines.add(c));
    });

    // Match cuisines in text
    for (const cuisine of allCuisines) {
        const cuisineLower = cuisine.toLowerCase();

        // Skip if it's a dish name, not a cuisine
        if (dishNameBlacklist.has(cuisineLower)) {
            continue;
        }

        if (lowerText.includes(cuisineLower)) {
            cuisineMatches.add(cuisine);
        }
    }

    return Array.from(cuisineMatches);
}

/**
 * Complete entity extraction from text
 */
export async function extractEntities(text) {
    const [restaurants, dishes, cuisines] = await Promise.all([
        extractRestaurantMentions(text),
        extractDishMentions(text),
        extractCuisineTypes(text)
    ]);

    // Analyze sentiment
    const sentimentAnalysis = analyzeSentiment(text);

    return {
        restaurants,
        dishes,
        cuisines,
        sentiment: sentimentAnalysis.sentiment,
        sentiment_score: sentimentAnalysis.score,
        text
    };
}

export default {
    extractRestaurantMentions,
    extractDishMentions,
    extractCuisineTypes,
    extractEntities,
    analyzeSentiment
};
