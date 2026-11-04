"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importWastedTime = exports.setWastedTime = exports.getWastedTime = exports.getPenaltySummary = void 0;
const Employee_1 = require("../models/Employee");
const DeepWorkSession_1 = require("../models/DeepWorkSession");
const Task_1 = require("../models/Task");
const Penalty_1 = require("../models/Penalty");
const WastedTime_1 = require("../models/WastedTime");
const penaltyService_1 = require("../services/penaltyService");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function rangeStart(range) {
    const now = new Date();
    if (range === 'week') {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
        return d;
    }
    if (range === 'month')
        return new Date(now.getFullYear(), now.getMonth(), 1);
    return null;
}
// @desc    Everything the Penalty page shows: wasted hours, missed-task and deep-work penalties
// @route   GET /api/penalties/summary?range=week|month|all
// @access  Private
const getPenaltySummary = async (req, res) => {
    try {
        const range = req.query.range === 'week' || req.query.range === 'all' ? req.query.range : 'month';
        const from = rangeStart(range);
        await (0, penaltyService_1.flagOverdueTasks)();
        const emps = await Employee_1.Employee.find({ $or: [{ user: req.user._id }, { email: req.user.email }] }).select('_id');
        const empIds = emps.map(e => e._id);
        // Time wasted inside deep work sessions: the breaks (the hours typed on the Dashboard are added on the page)
        const sessionFilter = { employeeId: { $in: empIds } };
        if (from)
            sessionFilter.startTime = { $gte: from };
        const sessions = await DeepWorkSession_1.DeepWorkSession.find(sessionFilter).select('totalBreakMinutes');
        const breakMinutes = sessions.reduce((sum, s) => sum + (s.totalBreakMinutes || 0), 0);
        // Hours the user typed on the Dashboard card
        const wastedFilter = { user: req.user._id };
        if (from)
            wastedFilter.date = { $gte: ymd(from) };
        const manual = await WastedTime_1.WastedTime.find(wastedFilter).select('minutes');
        const manualMinutes = manual.reduce((sum, w) => sum + (w.minutes || 0), 0);
        // Tasks that were not done
        const taskFilter = {
            missed: true,
            $or: [{ createdBy: req.user._id }, { assignedTo: { $in: empIds } }],
        };
        if (from)
            taskFilter.missedAt = { $gte: from };
        const missedTasks = await Task_1.Task.find(taskFilter).sort({ missedAt: -1 }).select('title missedAt missedReason dueDate status');
        // Inactivity (deep work) penalties
        const penaltyFilter = { employeeId: { $in: empIds } };
        if (from)
            penaltyFilter.triggeredAt = { $gte: from };
        const inactivity = await Penalty_1.Penalty.find(penaltyFilter).sort({ triggeredAt: -1 });
        const running = await Penalty_1.Penalty.findOne({ employeeId: { $in: empIds }, status: { $in: ['PENDING', 'ACTIVE'] } }).sort({ triggeredAt: -1 });
        res.json({
            success: true,
            data: {
                range,
                rules: {
                    inactivityDays: penaltyService_1.INACTIVITY_DAYS,
                    penaltySessionHours: penaltyService_1.INACTIVITY_SESSION_MINUTES / 60,
                    penaltyDays: penaltyService_1.INACTIVITY_PENALTY_DAYS,
                    missedTaskHours: penaltyService_1.MISSED_TASK_PENALTY_HOURS,
                },
                wasted: { breakMinutes, manualMinutes },
                tasks: {
                    count: missedTasks.length,
                    hours: missedTasks.length * penaltyService_1.MISSED_TASK_PENALTY_HOURS,
                    items: missedTasks.slice(0, 20),
                },
                deepWork: {
                    count: inactivity.length,
                    currentHours: running ? running.sessionMinutes / 60 : 0,
                    days: running ? running.days : penaltyService_1.INACTIVITY_PENALTY_DAYS,
                    status: running ? running.status : null,
                    expiresAt: running?.expiresAt || null,
                    reason: running?.reason || null,
                    history: inactivity.slice(0, 10),
                },
            },
        });
    }
    catch (error) {
        console.error('[PENALTY] summary error:', error);
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to load penalties' } });
    }
};
exports.getPenaltySummary = getPenaltySummary;
// @desc    Hours the user typed as wasted, between two days (inclusive)
// @route   GET /api/penalties/wasted?from=YYYY-MM-DD&to=YYYY-MM-DD
// @access  Private
const getWastedTime = async (req, res) => {
    try {
        const { from, to } = req.query;
        const filter = { user: req.user._id };
        const range = {};
        if (from && DATE_RE.test(from))
            range.$gte = from;
        if (to && DATE_RE.test(to))
            range.$lte = to;
        if (Object.keys(range).length)
            filter.date = range;
        const entries = await WastedTime_1.WastedTime.find(filter).sort({ date: -1 }).limit(400).select('date minutes -_id');
        res.json({ success: true, data: entries });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to load wasted time' } });
    }
};
exports.getWastedTime = getWastedTime;
// @desc    Save the minutes wasted on one day. 0 removes the entry.
// @route   PUT /api/penalties/wasted/:date   body { minutes }
// @access  Private
const setWastedTime = async (req, res) => {
    try {
        const date = String(req.params.date);
        const minutes = Math.round(Number(req.body.minutes));
        if (!DATE_RE.test(date) || !Number.isFinite(minutes) || minutes < 0 || minutes > 24 * 60) {
            return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'A valid day and 0 to 1440 minutes are required' } });
        }
        if (minutes === 0) {
            await WastedTime_1.WastedTime.deleteOne({ user: req.user._id, date });
        }
        else {
            await WastedTime_1.WastedTime.findOneAndUpdate({ user: req.user._id, date }, { $set: { minutes } }, { upsert: true });
        }
        res.json({ success: true, data: { date, minutes } });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to save wasted time' } });
    }
};
exports.setWastedTime = setWastedTime;
// @desc    One-time import of entries that were only saved in the browser. Days that already have an entry are kept.
// @route   POST /api/penalties/wasted/import   body { entries: [{ date, minutes }] }
// @access  Private
const importWastedTime = async (req, res) => {
    try {
        const entries = (Array.isArray(req.body.entries) ? req.body.entries : []).slice(0, 400)
            .map((e) => ({ date: String(e?.date), minutes: Math.round(Number(e?.minutes)) }))
            .filter((e) => DATE_RE.test(e.date) && Number.isFinite(e.minutes) && e.minutes > 0 && e.minutes <= 24 * 60);
        if (entries.length) {
            await WastedTime_1.WastedTime.bulkWrite(entries.map((e) => ({
                updateOne: {
                    filter: { user: req.user._id, date: e.date },
                    update: { $setOnInsert: { minutes: e.minutes } },
                    upsert: true,
                },
            })));
        }
        res.json({ success: true, data: { received: entries.length } });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to import wasted time' } });
    }
};
exports.importWastedTime = importWastedTime;
