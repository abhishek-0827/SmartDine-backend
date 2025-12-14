import express from 'express';
import { clearUserCache, clearAllCache } from '../services/userAnalyzer.js';

const router = express.Router();

/**
 * Clear user profile cache
 * POST /api/clear-cache
 * Body: { userId: string }
 */
router.post('/', async (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        clearUserCache(userId);

        res.json({
            success: true,
            message: `Cache cleared for user ${userId}`
        });
    } catch (error) {
        console.error('[ClearCache] Error:', error);
        res.status(500).json({ error: 'Failed to clear cache' });
    }
});

/**
 * Clear all user profile caches
 * POST /api/clear-cache/all
 */
router.post('/all', async (req, res) => {
    try {
        clearAllCache();

        res.json({
            success: true,
            message: 'All user caches cleared'
        });
    } catch (error) {
        console.error('[ClearCache] Error:', error);
        res.status(500).json({ error: 'Failed to clear all caches' });
    }
});

export default router;
