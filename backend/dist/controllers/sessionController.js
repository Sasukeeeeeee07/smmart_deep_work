"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.raiseAlarm = exports.sendCommand = exports.getSDWPoints = exports.rateSession = exports.endSession = exports.resumeSession = exports.startBreak = exports.startSession = exports.getAllSessions = void 0;
const Device_1 = require("../models/Device");
const DeepWorkSession_1 = require("../models/DeepWorkSession");
const SDWPoints_1 = require("../models/SDWPoints");
const voiceService_1 = require("../services/voiceService");
// Helper: get ISO week number
function getWeekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
// =====================================================
// GET /api/sessions/all (Admin view of all sessions)
// =====================================================
const getAllSessions = async (req, res) => {
    try {
        const { uid, limit = '50', page = '1' } = req.query;
        const lim = Math.min(parseInt(limit, 10), 200);
        const skip = (parseInt(page, 10) - 1) * lim;
        const filter = {};
        if (uid)
            filter.deviceUid = uid;
        const [sessions, total] = await Promise.all([
            DeepWorkSession_1.DeepWorkSession.find(filter)
                .sort({ startTime: -1 })
                .skip(skip)
                .limit(lim)
                .populate('employeeId', 'firstName lastName'),
            DeepWorkSession_1.DeepWorkSession.countDocuments(filter),
        ]);
        res.json({ success: true, data: { sessions, total, page: parseInt(page, 10), limit: lim } });
    }
    catch (err) {
        console.error('[SESSIONS] getAllSessions error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch sessions' });
    }
};
exports.getAllSessions = getAllSessions;
// =====================================================
// POST /api/sessions/:uid/start
// ESP32 calls this when radar detects a person
// =====================================================
const startSession = async (req, res) => {
    try {
        const device = await Device_1.Device.findOne({ uid: req.params.uid });
        if (!device || !device.assignedTo) {
            return res.status(404).json({ success: false, error: 'Device or employee not found' });
        }
        // Close any stale ACTIVE/BREAK session for this device
        await DeepWorkSession_1.DeepWorkSession.updateMany({ deviceUid: req.params.uid, status: { $in: ['ACTIVE', 'BREAK', 'DYING'] } }, { $set: { status: 'COMPLETED', endTime: new Date() } });
        const session = await DeepWorkSession_1.DeepWorkSession.create({
            deviceUid: req.params.uid,
            employeeId: device.assignedTo,
            startTime: new Date(),
            status: 'ACTIVE',
        });
        console.log(`[SESSION] Started: ${session._id} for device ${req.params.uid}`);
        res.json({ success: true, data: { sessionId: session._id } });
    }
    catch (err) {
        console.error('[SESSION] start error:', err);
        res.status(500).json({ success: false, error: 'Failed to start session' });
    }
};
exports.startSession = startSession;
// =====================================================
// POST /api/sessions/:uid/break
// ESP32 calls this when radar loses person
// =====================================================
const startBreak = async (req, res) => {
    try {
        const session = await DeepWorkSession_1.DeepWorkSession.findOne({
            deviceUid: req.params.uid,
            status: { $in: ['ACTIVE'] },
        });
        if (!session) {
            return res.status(404).json({ success: false, error: 'No active session' });
        }
        const { activeMinutes } = req.body;
        session.activeMinutes = activeMinutes || session.activeMinutes;
        session.status = 'BREAK';
        session.breaks.push({ startTime: new Date() });
        session.breakCount = session.breaks.length;
        // Productivity spike check: 45+ active minutes with 0 breaks
        if (session.activeMinutes >= 45 && session.breakCount === 1) {
            session.productivitySpike = true;
        }
        await session.save();
        res.json({ success: true, data: { breakCount: session.breakCount } });
    }
    catch (err) {
        console.error('[SESSION] break error:', err);
        res.status(500).json({ success: false, error: 'Failed to log break' });
    }
};
exports.startBreak = startBreak;
// =====================================================
// POST /api/sessions/:uid/resume
// ESP32 calls this when radar re-detects person
// =====================================================
const resumeSession = async (req, res) => {
    try {
        const session = await DeepWorkSession_1.DeepWorkSession.findOne({
            deviceUid: req.params.uid,
            status: 'BREAK',
        });
        if (!session) {
            return res.status(404).json({ success: false, error: 'No session in break' });
        }
        // Close the last open break record
        const lastBreak = session.breaks[session.breaks.length - 1];
        if (lastBreak && !lastBreak.endTime) {
            lastBreak.endTime = new Date();
            const breakMins = Math.round((lastBreak.endTime.getTime() - lastBreak.startTime.getTime()) / 60000);
            lastBreak.durationMinutes = breakMins;
            session.totalBreakMinutes += breakMins;
        }
        session.status = 'ACTIVE';
        await session.save();
        res.json({ success: true, data: { totalBreakMinutes: session.totalBreakMinutes } });
    }
    catch (err) {
        console.error('[SESSION] resume error:', err);
        res.status(500).json({ success: false, error: 'Failed to resume session' });
    }
};
exports.resumeSession = resumeSession;
// =====================================================
// POST /api/sessions/:uid/end
// ESP32 calls this to end a session (dying or completed)
// =====================================================
const endSession = async (req, res) => {
    try {
        const { activeMinutes, selfRating } = req.body;
        const session = await DeepWorkSession_1.DeepWorkSession.findOne({
            deviceUid: req.params.uid,
            status: { $in: ['ACTIVE', 'BREAK', 'DYING'] },
        });
        if (!session) {
            return res.status(404).json({ success: false, error: 'No session to end' });
        }
        session.endTime = new Date();
        session.activeMinutes = activeMinutes || session.activeMinutes;
        session.status = 'COMPLETED';
        if (selfRating && selfRating >= 1 && selfRating <= 5) {
            session.selfRating = selfRating;
        }
        // Award SDW points if active time >= 120 minutes (2 hours)
        let pointsEarned = 0;
        if (session.activeMinutes >= 120) {
            session.sdwPointsEarned = 5;
            pointsEarned = 5;
            const now = new Date();
            await SDWPoints_1.SDWPoints.create({
                employeeId: session.employeeId,
                sessionId: session._id,
                points: 5,
                earnedAt: now,
                weekNumber: getWeekNumber(now),
                month: now.getMonth() + 1,
                year: now.getFullYear(),
            });
            console.log(`[SDW] +5 points earned for employee ${session.employeeId}`);
        }
        await session.save();
        // Voice feedback
        if (pointsEarned > 0) {
            voiceService_1.voiceService.queueMessage(req.params.uid, `Incredible work! You just completed a 2 hour deep work session and earned 5 points.`);
        }
        else {
            voiceService_1.voiceService.queueMessage(req.params.uid, `Session ended. You worked for ${session.activeMinutes} minutes.`);
        }
        res.json({ success: true, data: { pointsEarned, activeMinutes: session.activeMinutes } });
    }
    catch (err) {
        console.error('[SESSION] end error:', err);
        res.status(500).json({ success: false, error: 'Failed to end session' });
    }
};
exports.endSession = endSession;
// =====================================================
// POST /api/sessions/:uid/rate
// ESP32 calls this when user taps a self-rating star
// =====================================================
const rateSession = async (req, res) => {
    try {
        const { rating } = req.body;
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, error: 'Rating must be 1-5' });
        }
        const session = await DeepWorkSession_1.DeepWorkSession.findOne({
            deviceUid: req.params.uid,
            status: { $in: ['ACTIVE', 'BREAK', 'COMPLETED'] },
        }).sort({ startTime: -1 });
        if (!session) {
            return res.status(404).json({ success: false, error: 'No session found' });
        }
        session.selfRating = rating;
        await session.save();
        res.json({ success: true, data: { selfRating: rating } });
    }
    catch (err) {
        console.error('[SESSION] rate error:', err);
        res.status(500).json({ success: false, error: 'Failed to rate session' });
    }
};
exports.rateSession = rateSession;
// =====================================================
// GET /api/sessions/:uid/sdwpoints
// ESP32 fetches weekly + monthly SDW points for settings page
// =====================================================
const getSDWPoints = async (req, res) => {
    try {
        const device = await Device_1.Device.findOne({ uid: req.params.uid });
        if (!device || !device.assignedTo) {
            return res.json({ success: true, data: { weekly: 0, monthly: 0 } });
        }
        const now = new Date();
        const week = getWeekNumber(now);
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        const [weeklyResult, monthlyResult] = await Promise.all([
            SDWPoints_1.SDWPoints.aggregate([
                { $match: { employeeId: device.assignedTo, year, weekNumber: week } },
                { $group: { _id: null, total: { $sum: '$points' } } },
            ]),
            SDWPoints_1.SDWPoints.aggregate([
                { $match: { employeeId: device.assignedTo, year, month } },
                { $group: { _id: null, total: { $sum: '$points' } } },
            ]),
        ]);
        const weekly = weeklyResult[0]?.total || 0;
        const monthly = monthlyResult[0]?.total || 0;
        res.json({ success: true, data: { weekly, monthly } });
    }
    catch (err) {
        console.error('[SDW] points error:', err);
        res.status(500).json({ success: false, error: 'Failed to get SDW points' });
    }
};
exports.getSDWPoints = getSDWPoints;
const sendCommand = async (req, res) => {
    const { command } = req.body;
    if (command) {
        voiceService_1.voiceService.queueMessage(req.params.uid, command);
    }
    res.json({ success: true });
};
exports.sendCommand = sendCommand;
const raiseAlarm = async (req, res) => {
    const { message } = req.body;
    if (message) {
        voiceService_1.voiceService.queueMessage(req.params.uid, message);
    }
    res.json({ success: true });
};
exports.raiseAlarm = raiseAlarm;
