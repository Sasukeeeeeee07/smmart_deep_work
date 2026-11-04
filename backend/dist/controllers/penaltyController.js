"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPenaltySummary = void 0;
const Employee_1 = require("../models/Employee");
const DeepWorkSession_1 = require("../models/DeepWorkSession");
const Task_1 = require("../models/Task");
const Penalty_1 = require("../models/Penalty");
const penaltyService_1 = require("../services/penaltyService");
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
        // Time wasted: break time inside sessions, plus the time of sessions that were thrown out as invalid
        const sessionFilter = { employeeId: { $in: empIds } };
        if (from)
            sessionFilter.startTime = { $gte: from };
        const sessions = await DeepWorkSession_1.DeepWorkSession.find(sessionFilter).select('totalBreakMinutes activeMinutes status');
        let breakMinutes = 0, invalidMinutes = 0, invalidSessions = 0;
        for (const s of sessions) {
            breakMinutes += s.totalBreakMinutes || 0;
            if (s.status === 'INVALID') {
                invalidMinutes += s.activeMinutes || 0;
                invalidSessions++;
            }
        }
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
                wasted: {
                    breakMinutes,
                    invalidMinutes,
                    invalidSessions,
                    totalMinutes: breakMinutes + invalidMinutes,
                },
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
