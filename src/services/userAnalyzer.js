import { createClient } from '@supabase/supabase-js';
import { extractEntities } from './entityExtractor.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('[UserAnalyzer] ERROR: Supabase credentials not found in .env file!');
    console.error('[UserAnalyzer] SUPABASE_URL:', supabaseUrl);
    console.error('[UserAnalyzer] SUPABASE_ANON_KEY:', supabaseKey ? 'SET' : 'NOT SET');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Cache for user profiles (1 hour TTL)
// Cache for user profiles (1 hour TTL)
const userProfileCache = new Map();
const CACHE_TTL = 0; // DISABLED CACHE FOR DEBUGGING (was 60 * 60 * 1000)

/**
 * Get user profile from cache or compute it
 */
export async function getUserProfile(userId) {
    const cached = userProfileCache.get(userId);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        console.log(`[UserAnalyzer] Using cached profile for user ${userId}`);
        return cached.profile;
    }

    console.log(`[UserAnalyzer] Computing profile for user ${userId}`);
    const profile = await computeUserProfile(userId);

    userProfileCache.set(userId, {
        profile,
        timestamp: Date.now()
    });

    return profile;
}

/**
 * Compute user profile from Supabase data
 */
async function computeUserProfile(userId) {
    try {
        console.log(`[UserAnalyzer] Fetching data for userId: ${userId}`);

        // Fetch user's posts
        const { data: posts, error: postsError } = await supabase
            .from('posts')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(100);

        if (postsError) {
            console.error('[UserAnalyzer] Error fetching posts:', postsError);
        } else {
            console.log(`[UserAnalyzer] Found ${posts?.length || 0} posts for user ${userId}`);
            if (posts && posts.length > 0) {
                console.log('[UserAnalyzer] Sample post:', posts[0]);
            }
        }

        // Fetch user's likes
        const { data: likes, error: likesError } = await supabase
            .from('likes')
            .select('post_id, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(100);

        if (likesError) {
            console.error('[UserAnalyzer] Error fetching likes:', likesError);
        } else {
            console.log(`[UserAnalyzer] Found ${likes?.length || 0} likes for user ${userId}`);
        }

        // Fetch posts that user liked (to analyze content)
        let likedPosts = [];
        if (likes && likes.length > 0) {
            const likedPostIds = likes.map(l => l.post_id);
            const { data: likedPostsData, error: likedPostsError } = await supabase
                .from('posts')
                .select('*')
                .in('id', likedPostIds);

            if (!likedPostsError) {
                likedPosts = likedPostsData || [];
                console.log(`[UserAnalyzer] Found ${likedPosts.length} liked posts`);
            }
        }

        // Fetch user's comments
        const { data: comments, error: commentsError } = await supabase
            .from('comments')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(100);

        if (commentsError) {
            console.error('[UserAnalyzer] Error fetching comments:', commentsError);
        } else {
            console.log(`[UserAnalyzer] Found ${comments?.length || 0} comments for user ${userId}`);
        }

        // Fetch posts that user commented on (to get context)
        let commentedPosts = [];
        if (comments && comments.length > 0) {
            const commentedPostIds = [...new Set(comments.map(c => c.post_id))]; // Unique IDs
            const { data: commentedPostsData, error: commentedPostsError } = await supabase
                .from('posts')
                .select('*')
                .in('id', commentedPostIds);

            if (!commentedPostsError) {
                commentedPosts = commentedPostsData || [];
                console.log(`[UserAnalyzer] Found ${commentedPosts.length} posts commented on by user`);
            }
        }

        // Analyze all data
        const profile = await analyzeUserData({
            posts: posts || [],
            likedPosts: likedPosts || [],
            comments: comments || [],
            commentedPosts: commentedPosts || []
        });

        console.log(`[UserAnalyzer] Profile computed:`, {
            total_posts: profile.total_posts,
            total_likes: profile.total_likes,
            total_comments: profile.total_comments,
            favorite_cuisines: profile.favorite_cuisines,
            favorite_restaurants: profile.favorite_restaurants
        });

        return profile;

    } catch (error) {
        console.error('[UserAnalyzer] Error computing user profile:', error);
        return getDefaultProfile();
    }
}

/**
 * Analyze user data to extract preferences
 */
async function analyzeUserData({ posts, likedPosts, comments, commentedPosts }) {
    const restaurantFreq = {};
    const cuisineFreq = {};
    const dishFreq = {};
    const timeSlots = { morning: 0, afternoon: 0, evening: 0, night: 0 };

    // Create a map of commented posts for faster lookup
    const commentedPostsMap = new Map();
    if (commentedPosts) {
        commentedPosts.forEach(p => commentedPostsMap.set(p.id, p));
    }

    // Analyze user's own posts
    for (const post of posts) {
        if (!post.caption) continue;

        // Extract entities from caption
        const entities = await extractEntities(post.caption);

        // Count restaurant mentions
        entities.restaurants.forEach(r => {
            restaurantFreq[r.restaurant_id] = (restaurantFreq[r.restaurant_id] || 0) + 2; // Own posts weighted higher
        });

        // Loop through explicit location if available
        if (post.location) {
            const locationEntities = await extractEntities(post.location);
            locationEntities.restaurants.forEach(r => {
                // Avoid double counting if caption already mentioned it
                if (!entities.restaurants.find(er => er.restaurant_id === r.restaurant_id)) {
                    restaurantFreq[r.restaurant_id] = (restaurantFreq[r.restaurant_id] || 0) + 2;
                }
            });
        }


        // Count cuisine mentions
        entities.cuisines.forEach(c => {
            cuisineFreq[c] = (cuisineFreq[c] || 0) + 2;
        });

        // Count dish mentions
        entities.dishes.forEach(d => {
            dishFreq[d.dish_name] = (dishFreq[d.dish_name] || 0) + 2;
        });

        // Analyze posting time
        const postTime = new Date(post.created_at);
        const hour = postTime.getHours();
        const timeSlot = getTimeSlot(hour);
        timeSlots[timeSlot]++;
    }

    // Analyze liked posts
    for (const post of likedPosts) {
        if (!post.caption) continue;

        const entities = await extractEntities(post.caption);

        // Count with lower weight for liked posts
        entities.restaurants.forEach(r => {
            restaurantFreq[r.restaurant_id] = (restaurantFreq[r.restaurant_id] || 0) + 1;
        });

        entities.cuisines.forEach(c => {
            cuisineFreq[c] = (cuisineFreq[c] || 0) + 1;
        });

        entities.dishes.forEach(d => {
            dishFreq[d.dish_name] = (dishFreq[d.dish_name] || 0) + 1;
        });
    }

    // Analyze comments (with sentiment analysis + CONTEXT AWARENESS)
    for (const comment of comments) {
        if (!comment.text) continue;

        const entities = await extractEntities(comment.text);

        // Get sentiment score (-1 for negative, 0 for neutral, +1 for positive)
        const sentimentMultiplier = entities.sentiment_score || 0;

        let commentWeight = 1.5; // Base weight for comments

        if (sentimentMultiplier < 0) {
            commentWeight = -2;
        } else if (sentimentMultiplier > 0) {
            commentWeight = 2;
        } else {
            commentWeight = 0.5;
        }

        // Track if we found a restaurant in the comment text itself
        let foundRestaurantInText = false;

        // 1. Check explicit mentions in comment
        entities.restaurants.forEach(r => {
            restaurantFreq[r.restaurant_id] = (restaurantFreq[r.restaurant_id] || 0) + commentWeight;
            foundRestaurantInText = true;
        });

        // 2. If NO restaurant mentioned in comment, look at the parent post
        if (!foundRestaurantInText && comment.post_id) {
            const parentPost = commentedPostsMap.get(comment.post_id);
            if (parentPost) {
                // Check parent post location
                if (parentPost.location) {
                    const locationEntities = await extractEntities(parentPost.location);
                    locationEntities.restaurants.forEach(r => {
                        console.log(`[UserAnalyzer] Attributing comment "${comment.text}" to restaurant "${r.restaurant_name}" from post context`);
                        restaurantFreq[r.restaurant_id] = (restaurantFreq[r.restaurant_id] || 0) + commentWeight;
                    });
                }

                // Also check parent post caption if location didn't yield results?
                // Maybe safer to stick to explicit location to avoid noise, but let's check caption too if location failed
                if (parentPost.caption && !parentPost.location) { // optimized regex check could go here but let's reuse extractor
                    const captionEntities = await extractEntities(parentPost.caption);
                    captionEntities.restaurants.forEach(r => {
                        console.log(`[UserAnalyzer] Attributing comment "${comment.text}" to restaurant "${r.restaurant_name}" from post caption context`);
                        restaurantFreq[r.restaurant_id] = (restaurantFreq[r.restaurant_id] || 0) + commentWeight;
                    });
                }
            }
        }

        entities.cuisines.forEach(c => {
            cuisineFreq[c] = (cuisineFreq[c] || 0) + commentWeight;
        });

        entities.dishes.forEach(d => {
            dishFreq[d.dish_name] = (dishFreq[d.dish_name] || 0) + commentWeight;
        });
    }

    // Get top items
    const favoriteRestaurants = getTopItems(restaurantFreq, 10);
    const favoriteCuisines = getTopItems(cuisineFreq, 5);
    const favoriteDishes = getTopItems(dishFreq, 10);

    // Determine most active time
    const mostActiveTime = Object.entries(timeSlots)
        .sort((a, b) => b[1] - a[1])[0][0];

    return {
        favorite_restaurants: favoriteRestaurants,
        favorite_cuisines: favoriteCuisines,
        favorite_dishes: favoriteDishes,
        restaurant_frequency: restaurantFreq,
        cuisine_frequency: cuisineFreq,
        dish_frequency: dishFreq,
        most_active_time: mostActiveTime,
        time_slots: timeSlots,
        total_posts: posts.length,
        total_likes: likedPosts.length,
        total_comments: comments.length,
        activity_score: posts.length * 2 + likedPosts.length + comments.length * 1.5
    };
}

/**
 * Get time slot from hour
 */
function getTimeSlot(hour) {
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
}

/**
 * Get top N items from frequency map
 */
function getTopItems(freqMap, n) {
    return Object.entries(freqMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([item]) => item);
}

/**
 * Get default profile for users with no data
 */
function getDefaultProfile() {
    return {
        favorite_restaurants: [],
        favorite_cuisines: [],
        favorite_dishes: [],
        restaurant_frequency: {},
        cuisine_frequency: {},
        dish_frequency: {},
        most_active_time: 'evening',
        time_slots: { morning: 0, afternoon: 0, evening: 0, night: 0 },
        total_posts: 0,
        total_likes: 0,
        total_comments: 0,
        activity_score: 0
    };
}

/**
 * Clear cache for a specific user (call after new post/like/comment)
 */
export function clearUserCache(userId) {
    userProfileCache.delete(userId);
    console.log(`[UserAnalyzer] Cleared cache for user ${userId}`);
}

/**
 * Clear all cache
 */
export function clearAllCache() {
    userProfileCache.clear();
    console.log('[UserAnalyzer] Cleared all user profile cache');
}

export default {
    getUserProfile,
    clearUserCache,
    clearAllCache
};
