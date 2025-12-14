import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const feedbackPath = path.join(__dirname, '../../data/feedback.json');

router.post('/', async (req, res) => {
    const { restaurantId, liked } = req.body;

    if (!restaurantId || liked === undefined) {
        return res.status(400).json({ error: "restaurantId and liked status are required" });
    }

    try {
        let feedbackData = [];
        try {
            const data = await fs.readFile(feedbackPath, 'utf-8');
            feedbackData = JSON.parse(data);
        } catch (err) {
            feedbackData = [];
        }

        const newEntry = {
            id: crypto.randomUUID(),
            restaurantId,
            liked,
            timestamp: new Date().toISOString()
        };

        feedbackData.push(newEntry);

        await fs.writeFile(feedbackPath, JSON.stringify(feedbackData, null, 2));

        console.log("Feedback saved:", newEntry);

        res.json({ ok: true, entry: newEntry });

    } catch (error) {
        console.error("Feedback Error:", error);
        res.status(500).json({ error: "Failed to save feedback" });
    }
});

export default router;
