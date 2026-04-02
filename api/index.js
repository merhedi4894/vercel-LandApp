require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

// ফাইল পাথ ফিক্স: api ফোল্ডার থেকে বের হয়ে models ফোল্ডারে যাওয়ার জন্য ../ ব্যবহার করা হয়েছে
const { Profile, LandData } = require('../models/DataSchema');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// --- MongoDB Connection ---
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) { 
    console.error("Error: MONGO_URI not found in Environment Variables."); 
}

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected Successfully!'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// --- Helper Functions ---
function toEnglishDigits(str) {
    if (!str) return str;
    const map = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
    return String(str).replace(/[০-৯]/g, d => map[d] || d);
}

function getYearSafe(dateVal) { 
    if (!dateVal) return ""; 
    try { 
        const d = new Date(dateVal); 
        return isNaN(d.getTime()) ? "" : d.getFullYear().toString(); 
    } catch (e) { return ""; } 
}

// --- Routes ---

// Login API
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const validUser = process.env.ADMIN_USER || 'mehedi4894';
    const validPass = process.env.ADMIN_PASS || 'Mehedi@01747527352';
    
    if (username === validUser && password === validPass) {
        res.json({ success: true, user: { username, name: username } });
    } else {
        res.json({ success: false, message: 'ভুল ইউজারনেম বা পাসওয়ার্ড!' });
    }
});

// Save Entry API
app.post('/api/saveFormData', async (req, res) => {
    try {
        const fd = req.body;
        const cleanYear = toEnglishDigits(fd.hariYear);
        const cleanTkGiven = toEnglishDigits(fd.tkGiven);
        const totalTk = (parseFloat(fd.rate) / 33) * parseFloat(fd.land);
        
        await new LandData({ 
            name: fd.name, 
            land: fd.land, 
            rate: fd.rate, 
            totalTk: totalTk.toFixed(2), 
            tkGiven: cleanTkGiven || 0, 
            hariYear: cleanYear || "", 
            entryBy: fd.loggedInUser 
        }).save();
        
        res.json({ success: true });
    } catch (e) { 
        res.json({ success: false, message: e.toString() }); 
    }
});

// Initial Data & Dropdown Options API
app.post('/api/getInitData', async (req, res) => {
    try {
        const profiles = await Profile.find({}).sort({ name: 1 }).lean();
        const landStats = await LandData.aggregate([
            { $group: { _id: "$name", lands: { $addToSet: "$land" }, years: { $addToSet: "$hariYear" } } }
        ]);
        
        const allYears = new Set(), namesFromData = new Set(), landMap = {}, yearMap = {};
        
        landStats.forEach(g => {
            if (g._id) {
                namesFromData.add(g._id);
                landMap[g._id] = g.lands.sort((a, b) => a - b);
                yearMap[g._id] = g.years.filter(y => y).sort((a, b) => b - a);
                g.years.forEach(y => { if (y) allYears.add(y); });
            }
        });
        
        res.json({ 
            profiles, 
            searchOptions: { 
                names: Array.from(namesFromData).sort(), 
                years: Array.from(allYears).sort((a, b) => b - a), 
                yearMap, 
                landMap 
            } 
        });
    } catch (error) { 
        res.json({ success: false, profiles: [], searchOptions: { names: [], years: [], yearMap: {}, landMap: {} } }); 
    }
});

// Report Data API
app.post('/api/getReportData', async (req, res) => {
    const sd = req.body; 
    let query = {};
    const cleanSearchYear = toEnglishDigits(sd.year);
    
    if (sd.name !== "ALL") query.name = sd.name;
    if (sd.land !== "ALL") query.land = parseFloat(sd.land);
    if (cleanSearchYear !== "ALL") query.hariYear = cleanSearchYear;
    
    try {
        const records = await LandData.find(query).sort({ date: -1 }).lean();
        res.json({ 
            success: true, 
            records: records.map(r => ({ 
                date: new Date(r.date).toLocaleDateString('en-GB'), 
                year: getYearSafe(r.date), 
                name: r.name, 
                land: r.land, 
                rate: r.rate, 
                total: r.totalTk, 
                given: r.tkGiven, 
                hariYear: r.hariYear || "", 
                entryBy: r.entryBy 
            })) 
        });
    } catch (e) { 
        res.json({ success: false, records: [] }); 
    }
});

// Delete Records API
app.post('/api/deleteRecords', async (req, res) => {
    const { name, year } = req.body;
    const cleanYear = toEnglishDigits(year);
    if (name === "ALL" || cleanYear === "ALL") return res.json({ success: false, message: "নির্দিষ্ট নাম ও বছর সিলেক্ট করুন।" });
    
    try { 
        await LandData.deleteMany({ name, hariYear: cleanYear }); 
        res.json({ success: true, message: "সফলভাবে ডিলিট হয়েছে।" }); 
    } catch (e) { 
        res.json({ success: false, message: e.toString() }); 
    }
});

// Profile Settings APIs
app.post('/api/saveProfile', async (req, res) => {
    const d = req.body;
    try {
        const land = parseFloat(d.land); 
        const rate = parseFloat(d.rate);
        if (!d.name || isNaN(land) || isNaN(rate)) return res.json({ success: false, message: "সঠিক তথ্য দিন।" });
        
        if (d.oldName) {
            await Profile.findOneAndUpdate(
                { name: d.oldName, land: parseFloat(d.oldLand), rate: parseFloat(d.oldRate) }, 
                { name: d.name, land, rate, hariBorsho: d.hariBorsho }
            );
        } else {
            const exists = await Profile.findOne({ name: d.name, land });
            if (exists) {
                await Profile.findByIdAndUpdate(exists._id, { rate, hariBorsho: d.hariBorsho });
            } else {
                await new Profile({ name: d.name, land, rate, hariBorsho: d.hariBorsho }).save();
            }
        }
        res.json({ success: true });
    } catch (e) { res.json({ success: false, message: e.toString() }); }
});

app.post('/api/deleteProfile', async (req, res) => {
    try { 
        await Profile.findOneAndDelete({ name: req.body.name, land: parseFloat(req.body.land) }); 
        res.json({ success: true }); 
    } catch (e) { res.json({ success: false }); }
});

// Vercel এর জন্য এক্সপোর্ট
module.exports = app;
