import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import queryRoutes from './routes/query.js';
import feedbackRoutes from './routes/feedback.js';
import routeRoutes from './routes/route.js';
import adminRoutes from './routes/admin.js';
import debugRoutes from './routes/debug.js';
import clearCacheRoutes from './routes/clearCache.js';
import discoverRoutes from './routes/discover.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(express.json());

const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://smartdine.vercel.app',
    'https://smartdine-frontend.vercel.app',
    'https://smartdine-frontendcode.vercel.app'
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            return callback(null, true);
        }
        // Allow all origins in development
        return callback(null, true);
    },
    credentials: true
}));

// Routes
app.use('/api/query', queryRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/route', routeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/debug', debugRoutes);
app.use('/api/clear-cache', clearCacheRoutes);
app.use('/api/discover', discoverRoutes);

// Fallback for frontend configuration mismatch
app.use('/query', queryRoutes);

// Health check
app.get('/', (req, res) => {
    res.json({ status: "ok" });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
