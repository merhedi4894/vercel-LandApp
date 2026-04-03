require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');

const { Profile, LandData } = require('../models/DataSchema');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- MongoDB Connection ---
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) { console.error("Error: MONGO_URI not found."); process.exit(1); }
mongoose.connect(MONGO_URI).then(() => console.log('MongoDB Connected!')).catch(err => console.error('MongoDB Error:', err));

// --- Mongoose Schema for Admin ---
const AdminSchema = new mongoose.Schema({
    username: { type: String, default: 'mehedi4894', unique: true },
    password: { type: String, required: true }
});
const Admin = mongoose.model('Admin', AdminSchema);

// --- Email Transporter Setup ---
// এখানে process.env.EMAIL_PASS না থাকলে, ডাবল কোটেশনের ভেতরে আপনার ১৬ ডিজিটের কোডটি বসিয়ে দিন
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'mehedi24.info@gmail.com',
        pass: process.env.EMAIL_PASS || 'vuwa izeu becj luhj' 
    }
});
const resetCodes = {};

// --- Helper Functions ---
function toEnglishDigits(str) {
    if (!str) return str;
    const map = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
    return String(str).replace(/[০-৯]/g, d => map[d] || d);
}
function getYearSafe(dateVal) { if (!dateVal) return ""; try { const d = new Date(dateVal); if (isNaN(d.getTime())) return ""; return d.getFullYear().toString(); } catch (e) { return ""; } }
function generateCode() { return Math.floor(100000 + Math.random() * 900000).toString(); }

// --- Routes ---

// 1. Login Route (Fixed Syntax Error)
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    // Environment Variable থাকলে সেটা নিবে, না থাকলে ডিফল্ট পাসওয়ার্ড ব্যবহার করবে
    const validUser = process.env.ADMIN_USER || 'mehedi4894';
    const validPass = process.env.ADMIN_PASS || 'Mehedi@01747527352'; 

    // ১. প্রথমে Environment Variable চেক করবে
    if (username === validUser && password === validPass) {
        return res.json({ success: true, user: { username, name: username } });
    }

    // ২. যদি Env মিলে না যায়, তবে Database চেক করবে (রিসেট করা পাসওয়ার্ড)
    try {
        const adminInDb = await Admin.findOne({ username });
        if (adminInDb && await bcrypt.compare(password, adminInDb.password)) {
            return res.json({ success: true, user: { username, name: username } });
        }
    } catch (e) { console.log("DB Login check error", e); }

    res.json({ success: false, message: 'Invalid Credentials!' });
}); // <--- ভুলটি এখানে ছিল, এটি ঠিক করা হয়েছে

// 2. Forgot Password Route
app.post('/api/forgotPassword', async (req, res) => {
    const { email } = req.body;
    const adminEmail = process.env.EMAIL_USER || 'mehedi24.info@gmail.com';

    if (email !== adminEmail) {
        return res.json({ success: false, message: "This email is not registered as admin." });
    }
    
    // আগের চেকটি সরিয়ে দেওয়া হলো যাতে কোডে পাসওয়ার্ড থাকলেই কাজ হয়
    // যদি এখানে এরর আসে তবে বুঝবেন আপনার জিমেইল অ্যাকাউন্ট থেকে ব্লক করা হয়েছে
    
    const username = process.env.ADMIN_USER || 'mehedi4894';
    const code = generateCode();
    const expires = new Date(Date.now() + 5 * 60 * 1000); 

    try {
        await Admin.findOneAndUpdate(
            { username: username },
            { resetCode: code, resetCodeExpires: expires },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
    } catch (e) { return res.json({ success: false, message: "DB Error" }); }

    const mailOptions = {
        from: adminEmail,
        to: email,
        subject: 'Password Reset Code - Land Lease',
        text: `Your verification code is: ${code}. It will expire in 5 minutes.`
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true });
    } catch (error) {
        console.error("Email Sending Error:", error); 
        // এখানে স্পেসিফিক এরর মেসেজ দেখাবে কেন ইমেইল যায়নি
        res.json({ success: false, message: `Failed to send email: ${error.message}` }); 
    }
});
// 3. Reset Password Route
app.post('/api/resetPassword', async (req, res) => {
    const { code, newPassword } = req.body;
    const email = process.env.EMAIL_USER || 'mehedi24.info@gmail.com';
    const username = process.env.ADMIN_USER || 'mehedi4894';

    const storedData = resetCodes[email];

    if (!storedData || storedData.code !== code) return res.json({ success: false, message: "Invalid code." });
    if (Date.now() > storedData.expires) return res.json({ success: false, message: "Code expired." });

    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await Admin.findOneAndUpdate(
            { username: username },
            { password: hashedPassword },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        delete resetCodes[email]; 
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, message: "Error updating password." });
    }
});

// --- Existing Routes ---

app.post('/api/saveFormData', async (req, res) => {
    try {
        const fd = req.body;
        const cleanYear = toEnglishDigits(fd.hariYear);
        const cleanTkGiven = toEnglishDigits(fd.tkGiven);
        const totalTk = (parseFloat(fd.rate) / 33) * parseFloat(fd.land);
        await new LandData({ name: fd.name, land: fd.land, rate: fd.rate, totalTk: totalTk.toFixed(2), tkGiven: cleanTkGiven || 0, hariYear: cleanYear || "", entryBy: fd.loggedInUser }).save();
        res.json({ success: true });
    } catch (e) { res.json({ success: false, message: e.toString() }); }
});

app.post('/api/getInitData', async (req, res) => {
    try {
        const profiles = await Profile.find({}).sort({ name: 1 }).lean();
        const landStats = await LandData.aggregate([{ $group: { _id: "$name", lands: { $addToSet: "$land" }, years: { $addToSet: "$hariYear" } } }]);
        const allYears = new Set(), namesFromData = new Set(), landMap = {}, yearMap = {};
        landStats.forEach(g => {
            if (g._id) {
                namesFromData.add(g._id);
                landMap[g._id] = g.lands.sort((a, b) => a - b);
                yearMap[g._id] = g.years.filter(y => y).sort((a, b) => b - a);
                g.years.forEach(y => { if (y) allYears.add(y); });
            }
        });
        res.json({ profiles, searchOptions: { names: Array.from(namesFromData).sort(), years: Array.from(allYears).sort((a, b) => b - a), yearMap, landMap } });
    } catch (error) { res.json({ profiles: [], searchOptions: { names: [], years: [], yearMap: {}, landMap: {} } }); }
});

app.post('/api/getReportData', async (req, res) => {
    const sd = req.body; let query = {};
    const cleanSearchYear = toEnglishDigits(sd.year);
    if (sd.name !== "ALL") query.name = sd.name;
    if (sd.land !== "ALL") query.land = parseFloat(sd.land);
    if (cleanSearchYear !== "ALL") query.hariYear = cleanSearchYear;
    try {
        const records = await LandData.find(query).sort({ date: -1 }).lean();
        res.json({ success: true, records: records.map(r => ({ date: new Date(r.date).toLocaleDateString('en-GB'), year: getYearSafe(r.date), name: r.name, land: r.land, rate: r.rate, total: r.totalTk?.toFixed(2), given: r.tkGiven?.toFixed(2), hariYear: r.hariYear || "", entryBy: r.entryBy })) });
    } catch (e) { res.json({ success: false, records: [] }); }
});

app.post('/api/deleteRecords', async (req, res) => {
    const { name, year } = req.body;
    const cleanYear = toEnglishDigits(year);
    if (name === "ALL" || cleanYear === "ALL") return res.json({ success: false, message: "Select specific." });
    try { await LandData.deleteMany({ name, hariYear: cleanYear }); res.json({ success: true, message: "Deleted" }); } catch (e) { res.json({ success: false, message: e.toString() }); }
});

app.post('/api/saveProfile', async (req, res) => {
    const d = req.body;
    try {
        const land = parseFloat(d.land); const rate = parseFloat(d.rate);
        if (!d.name || isNaN(land) || isNaN(rate)) return res.json({ success: false, message: "Invalid Data" });
        if (d.oldName) await Profile.findOneAndUpdate({ name: d.oldName, land: parseFloat(d.oldLand), rate: parseFloat(d.oldRate) }, { name: d.name, land, rate, hariBorsho: d.hariBorsho });
        else {
            const exists = await Profile.findOne({ name: d.name, land });
            if (exists) await Profile.findByIdAndUpdate(exists._id, { rate, hariBorsho: d.hariBorsho });
            else await new Profile({ name: d.name, land, rate, hariBorsho: d.hariBorsho }).save();
        }
        res.json({ success: true });
    } catch (e) { res.json({ success: false, message: e.toString() }); }
});

app.post('/api/deleteProfile', async (req, res) => {
    try { await Profile.findOneAndDelete({ name: req.body.name, land: parseFloat(req.body.land) }); res.json({ success: true }); } catch (e) { res.json({ success: false }); }
});

module.exports = app;
