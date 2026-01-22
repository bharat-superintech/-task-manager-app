const express = require('express');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Search users
router.get('/search', authenticateToken, async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.length < 2) {
            return res.json({ users: [] });
        }

        // Search by name or email using regex
        const searchRegex = new RegExp(q, 'i');
        const users = await db.users.find({
            $or: [
                { name: searchRegex },
                { email: searchRegex }
            ]
        });

        // Limit to 10 and map fields
        const result = users.slice(0, 10).map(u => ({
            id: u._id,
            name: u.name,
            email: u.email,
            avatar: u.avatar
        }));

        res.json({ users: result });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get all users
router.get('/', authenticateToken, async (req, res) => {
    try {
        const users = await db.users.find({});
        const result = users.map(u => ({
            id: u._id,
            name: u.name,
            email: u.email,
            avatar: u.avatar
        }));

        res.json({ users: result });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
