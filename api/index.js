require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// ফাইল পাথ ফিক্স: api ফোল্ডার থেকে বের হয়ে models ফোল্ডারে যাওয়ার জন্য ../ ব্যবহার করা হয়েছে
const { Profile, LandData } = require('../models/DataSchema');

const app = express();

app.use(cors());
app.use(express.json());

// --- MongoDB Connection ---
const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected!'))
    .catch(err => console.error('MongoDB Error:', err));

// Helper Functions
function toEnglishDigits(str) {
    if (!str) return str;
    const map = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
    return String(str).replace(/[০-৯]/g, d => map[d] || d);
}

// Routes
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
        res.json({ success: true, user: { username } });
    } else {
        res.json({ success: false, message: 'ভুল তথ্য!' });
    }
});

app.post('/api/saveFormData', async (req, res) => {
    try {
        const fd = req.body;
        const totalTk = (parseFloat(fd.rate) / 33) * parseFloat(fd.land);
        await new LandData({ 
            name: fd.name, 
            land: fd.land, 
            rate: fd.rate, 
            totalTk: totalTk.toFixed(2), 
            tkGiven: toEnglishDigits(fd.tkGiven) || 0, 
            hariYear: toEnglishDigits(fd.hariYear), 
            entryBy: fd.loggedInUser 
        }).save();
        res.json({ success: true });
    } catch (e) { res.json({ success: false, message: e.toString() }); }
});

app.post('/api/getInitData', async (req, res) => {
    try {
        const profiles = await Profile.find({}).sort({ name: 1 }).lean();
        res.json({ profiles });
    } catch (error) { res.json({ success: false, profiles: [] }); }
});

app.post('/api/saveProfile', async (req, res) => {
    try {
        const d = req.body;
        await new Profile({ name: d.name, land: d.land, rate: d.rate }).save();
        res.json({ success: true });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/deleteProfile', async (req, res) => {
    try { 
        await Profile.findOneAndDelete({ name: req.body.name, land: req.body.land }); 
        res.json({ success: true }); 
    } catch (e) { res.json({ success: false }); }
});

module.exports = app;
