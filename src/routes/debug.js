import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'your-anon-key';
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Debug endpoint to check user data in Supabase
 */
router.get('/user/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        console.log(`[Debug] Checking data for userId: ${userId}`);

        // Fetch posts
        const { data: posts, error: postsError } = await supabase
            .from('posts')
            .select('*')
            .eq('user_id', userId);

        // Fetch likes
        const { data: likes, error: likesError } = await supabase
            .from('likes')
            .select('*')
            .eq('user_id', userId);

        // Fetch comments
        const { data: comments, error: commentsError } = await supabase
            .from('comments')
            .select('*')
            .eq('user_id', userId);

        // Also fetch ALL posts to see what user_ids exist
        const { data: allPosts } = await supabase
            .from('posts')
            .select('user_id, caption, created_at')
            .limit(10);

        res.json({
            userId: userId,
            posts: {
                count: posts?.length || 0,
                data: posts || [],
                error: postsError
            },
            likes: {
                count: likes?.length || 0,
                data: likes || [],
                error: likesError
            },
            comments: {
                count: comments?.length || 0,
                data: comments || [],
                error: commentsError
            },
            allPosts: {
                sample: allPosts || [],
                message: "These are sample posts to see what user_ids exist in Supabase"
            }
        });

    } catch (error) {
        console.error('[Debug] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
