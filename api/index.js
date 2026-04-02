require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { Profile, LandData } = require('../models/DataSchema');

const app = express();
app.use(cors());
app.use(express.json());

// ডাটাবেস কানেকশন (Optimized for Vercel)
let cachedDb = null;
async function connectToDatabase() {
    if (cachedDb) return cachedDb;
    const db = await mongoose.connect(process.env.MONGO_URI);
    cachedDb = db;
    return db;
}

// সংখ্যা ইংরেজি করার হেল্পার
function toEng(str) {
    const map = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
    return String(str).replace(/[০-৯]/g, d => map[d] || d);
}

// Routes
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
        res.json({ success: true, user: { username } });
    } else {
        res.json({ success: false, message: 'ভুল ইউজার বা পাসওয়ার্ড!' });
    }
});

app.post('/api/getInitData', async (req, res) => {
    try {
        await connectToDatabase();
        const profiles = await Profile.find({}).sort({ name: 1 }).lean();
        res.json({ success: true, profiles });
    } catch (e) { res.json({ success: false, profiles: [] }); }
});

app.post('/api/saveFormData', async (req, res) => {
    try {
        await connectToDatabase();
        const d = req.body;
        const total = (parseFloat(d.rate) / 33) * parseFloat(d.land);
        await new LandData({
            name: d.name,
            land: parseFloat(d.land),
            rate: parseFloat(d.rate),
            totalTk: total.toFixed(2),
            tkGiven: parseFloat(toEng(d.tkGiven)) || 0,
            hariYear: toEng(d.hariYear),
            entryBy: d.loggedInUser
        }).save();
        res.json({ success: true });
    } catch (e) { res.json({ success: false, message: e.toString() }); }
});

app.post('/api/saveProfile', async (req, res) => {
    try {
        await connectToDatabase();
        const { name, land, rate } = req.body;
        await new Profile({ name, land, rate }).save();
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/deleteProfile', async (req, res) => {
    try {
        await connectToDatabase();
        await Profile.findOneAndDelete({ name: req.body.name, land: req.body.land });
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

module.exports = app;
