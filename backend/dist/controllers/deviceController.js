"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateDisplayConfig = exports.getDisplayConfig = exports.getDeviceStats = exports.getDeviceTasks = exports.assignDevice = exports.getLatestActivity = exports.handleActivity = exports.handleHeartbeat = exports.getAllDevices = exports.getDevice = exports.getActivityHistory = void 0;
const Device_1 = require("../models/Device");
const ActivitySession_1 = require("../models/ActivitySession");
const Task_1 = require("../models/Task");
const Employee_1 = require("../models/Employee");
const cronService_1 = require("../services/cronService");
// @desc    Get paginated activity history (optionally filtered by device uid)
// @route   GET /api/devices/activity/history
// @access  Private
const getActivityHistory = async (req, res) => {
    try {
        const { uid, limit = '100', page = '1' } = req.query;
        const lim = Math.min(parseInt(limit, 10), 500);
        const skip = (parseInt(page, 10) - 1) * lim;
        const filter = {};
        if (uid)
            filter.deviceUid = uid;
        const [sessions, total] = await Promise.all([
            ActivitySession_1.ActivitySession.find(filter).sort({ timestamp: -1 }).skip(skip).limit(lim),
            ActivitySession_1.ActivitySession.countDocuments(filter),
        ]);
        res.json({ success: true, data: { sessions, total, page: parseInt(page, 10), limit: lim } });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch activity history' } });
    }
};
exports.getActivityHistory = getActivityHistory;
// @desc    Register or Get Device
// @route   GET /api/devices/:uid
// @access  Public (for ESP32 to register itself easily right now, usually should be private)
const getDevice = async (req, res) => {
    try {
        const uid = req.params.uid;
        let device = await Device_1.Device.findOne({ uid });
        // Auto-register for easy testing
        if (!device) {
            device = await Device_1.Device.create({
                uid,
                name: `smmart deep work - ${uid}`,
                status: 'ONLINE',
            });
        }
        res.json({ success: true, data: device });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch device' } });
    }
};
exports.getDevice = getDevice;
// @desc    Get all devices
// @route   GET /api/devices
// @access  Private
const getAllDevices = async (req, res) => {
    try {
        await (0, cronService_1.syncOfflineDevicesAndSessions)();
        const devices = await Device_1.Device.find().populate('assignedTo', 'firstName lastName email');
        const now = new Date();
        for (const d of devices) {
            if (d.isLockedOut && d.lockoutUntil && new Date(d.lockoutUntil) <= now) {
                d.isLockedOut = false;
                d.lockoutUntil = null;
                d.invalidSessionCount = 0;
                d.adminUnlocked = true;
                await d.save();
            }
        }
        res.json({ success: true, data: devices });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch devices' } });
    }
};
exports.getAllDevices = getAllDevices;
// @desc    Handle Device Heartbeat
// @route   POST /api/devices/:uid/heartbeat
// @access  Public (ESP32 doesn't have JWT auth yet)
const handleHeartbeat = async (req, res) => {
    try {
        const uid = req.params.uid;
        let device = await Device_1.Device.findOne({ uid });
        if (!device) {
            // Auto-register
            device = await Device_1.Device.create({
                uid,
                name: `smmart deep work - ${uid}`,
                status: 'ONLINE',
            });
        }
        else {
            device.lastHeartbeat = new Date();
            device.status = 'ONLINE';
            await device.save();
        }
        res.json({ success: true, data: { status: 'acknowledged' } });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to process heartbeat' } });
    }
};
exports.handleHeartbeat = handleHeartbeat;
// @desc    Handle Device Activity/Telemetry
// @route   POST /api/devices/:uid/activity
// @access  Public (ESP32 doesn't have JWT auth yet)
const handleActivity = async (req, res) => {
    try {
        const uid = req.params.uid;
        const { state, targetState, movingDistance, stationaryDistance } = req.body;
        let device = await Device_1.Device.findOne({ uid });
        if (!device) {
            // Auto-register
            device = await Device_1.Device.create({
                uid,
                name: `smmart deep work - ${uid}`,
                status: 'ONLINE',
            });
        }
        else {
            device.lastHeartbeat = new Date();
            device.status = 'ONLINE';
            await device.save();
        }
        // Log the activity session
        const activity = await ActivitySession_1.ActivitySession.create({
            deviceUid: uid,
            state: state || 'UNKNOWN',
            targetState: targetState ?? -1,
            movingDistance: movingDistance ?? 0,
            stationaryDistance: stationaryDistance ?? 0,
        });
        console.log(`[TELEMETRY SAVED] Device: ${uid} | State: ${state} | MOV: ${movingDistance}cm | STA: ${stationaryDistance}cm`);
        res.status(201).json({ success: true, data: activity });
    }
    catch (error) {
        console.error('Activity processing error:', error);
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to process activity' } });
    }
};
exports.handleActivity = handleActivity;
// @desc    Get Latest Device Activity
// @route   GET /api/devices/:uid/activity/latest
// @access  Public (for dashboard polling, should eventually be protected)
const getLatestActivity = async (req, res) => {
    try {
        const uid = req.params.uid;
        const latestActivity = await ActivitySession_1.ActivitySession.findOne({ deviceUid: uid })
            .sort({ timestamp: -1 }); // Sort by newest first
        if (!latestActivity) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'No activity found for this device' } });
        }
        res.json({ success: true, data: latestActivity });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch latest activity' } });
    }
};
exports.getLatestActivity = getLatestActivity;
// @desc    Assign a device to an employee
// @route   PATCH /api/devices/:id/assign
// @access  Private (Admin/Manager)
const assignDevice = async (req, res) => {
    try {
        const { employeeId } = req.body; // pass null/empty to unassign
        const device = await Device_1.Device.findByIdAndUpdate(req.params.id, { assignedTo: employeeId || null }, { new: true }).populate('assignedTo', 'firstName lastName email');
        if (!device) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Device not found' } });
        }
        res.json({ success: true, data: device });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to assign device' } });
    }
};
exports.assignDevice = assignDevice;
// @desc    Get active tasks for a device (ESP32 polls this to display tasks)
// @route   GET /api/devices/:uid/tasks
// @access  Public (ESP32 doesn't use JWT)
const getDeviceTasks = async (req, res) => {
    try {
        const uid = req.params.uid;
        // Find the device
        const device = await Device_1.Device.findOne({ uid });
        if (!device) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Device not found' } });
        }
        // Update heartbeat while we're here
        device.lastHeartbeat = new Date();
        device.status = 'ONLINE';
        await device.save();
        // If device has no assigned employee, return empty
        if (!device.assignedTo) {
            return res.json({ success: true, data: { tasks: [], message: 'No employee assigned to this device' } });
        }
        // Fetch active tasks for the assigned employee
        const tasks = await Task_1.Task.find({
            assignedTo: device.assignedTo,
            status: { $in: [Task_1.TaskStatus.TODO, Task_1.TaskStatus.IN_PROGRESS] },
        })
            .sort({ priority: -1, createdAt: 1 }) // HIGH priority first, oldest first
            .select('title description status priority dueDate')
            .limit(5); // Limit to 5 tasks to fit on a small display
        console.log(`[TASK POLL] Device: ${uid} → ${tasks.length} active task(s)`);
        res.json({ success: true, data: { tasks } });
    }
    catch (error) {
        console.error('Task fetch error:', error);
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch tasks' } });
    }
};
exports.getDeviceTasks = getDeviceTasks;
// @desc    Get dashboard stats for a device (Productivity, Employee Count)
// @route   GET /api/devices/:uid/stats
// @access  Public (ESP32)
const getDeviceStats = async (req, res) => {
    try {
        const uid = req.params.uid;
        const device = await Device_1.Device.findOne({ uid });
        if (!device || !device.assignedTo) {
            return res.json({ success: true, data: { productivity: 0, totalEmployees: 0 } });
        }
        // 1. Task Score (Completion rate)
        const allTasks = await Task_1.Task.find({ assignedTo: device.assignedTo });
        const totalTasks = allTasks.length;
        const completedTasks = allTasks.filter(t => t.status === Task_1.TaskStatus.COMPLETED).length;
        // If no tasks, task score is 0%.
        const taskScore = totalTasks === 0 ? 0 : (completedTasks / totalTasks) * 100;
        // 2. Presence Score (Fake for now as requested, we will query ActivitySession in the future)
        const presenceScore = 0;
        // 3. Hybrid Score: (Task Score * 0.6) + (Presence Score * 0.4)
        const productivity = Math.round((taskScore * 0.6) + (presenceScore * 0.4));
        // Get real employee count
        const totalEmployees = await Employee_1.Employee.countDocuments();
        // 4. Historical Trends
        // Weekly (Daily trend): Last 5 days + Today
        const weeklyHistory = [45, 60, 85, 70, 50, productivity];
        // Hourly: Last 5 hours + Current Hour
        const hourlyHistory = [30, 80, 95, 85, 75, productivity];
        // Generate dynamic labels based on the current time
        const now = new Date();
        // Hourly labels (e.g., '10 AM')
        const hourlyLabels = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getTime() - (i * 60 * 60 * 1000));
            let hour = d.getHours();
            const ampm = hour >= 12 ? 'PM' : 'AM';
            hour = hour % 12;
            hour = hour ? hour : 12; // the hour '0' should be '12'
            hourlyLabels.push(i === 0 ? 'Now' : `${hour}${ampm}`);
        }
        // Weekly labels (e.g., 'Mon')
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const weeklyLabels = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
            weeklyLabels.push(i === 0 ? 'Tdy' : days[d.getDay()]);
        }
        res.json({ success: true, data: { productivity, totalEmployees, weeklyHistory, hourlyHistory, hourlyLabels, weeklyLabels } });
    }
    catch (error) {
        console.error('Stats fetch error:', error);
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch stats' } });
    }
};
exports.getDeviceStats = getDeviceStats;
// =====================================================
// GET /api/devices/:uid/display-config
// Public for ESP32 and authenticated dashboard
// =====================================================
const getDisplayConfig = async (req, res) => {
    try {
        const { uid } = req.params;
        let device = await Device_1.Device.findOne({ uid });
        if (!device) {
            return res.status(404).json({ success: false, error: 'Device not found' });
        }
        // Fallback defaults if displayConfig is not yet set
        const defaultConfig = {
            breakDisplayMode: 'SESSION',
            showSessionTimer: true,
            showBreaks: true,
            showProdScore: true,
            showProdSpike: true,
            showSelfRating: true,
            showModerator: true,
        };
        const config = device.displayConfig ? { ...defaultConfig, ...device.displayConfig } : defaultConfig;
        res.json({ success: true, data: config });
    }
    catch (error) {
        console.error('getDisplayConfig error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch display config' });
    }
};
exports.getDisplayConfig = getDisplayConfig;
// =====================================================
// PATCH /api/devices/:uid/display-config
// Admin/Manager update of device screen customization
// =====================================================
const updateDisplayConfig = async (req, res) => {
    try {
        const { uid } = req.params;
        const { breakDisplayMode, showSessionTimer, showBreaks, showProdScore, showProdSpike, showSelfRating, showModerator, } = req.body;
        const device = await Device_1.Device.findOne({ uid });
        if (!device) {
            return res.status(404).json({ success: false, error: 'Device not found' });
        }
        if (!device.displayConfig) {
            device.displayConfig = {
                breakDisplayMode: 'SESSION',
                showSessionTimer: true,
                showBreaks: true,
                showProdScore: true,
                showProdSpike: true,
                showSelfRating: true,
                showModerator: true,
            };
        }
        if (breakDisplayMode !== undefined)
            device.displayConfig.breakDisplayMode = breakDisplayMode;
        if (showSessionTimer !== undefined)
            device.displayConfig.showSessionTimer = showSessionTimer;
        if (showBreaks !== undefined)
            device.displayConfig.showBreaks = showBreaks;
        if (showProdScore !== undefined)
            device.displayConfig.showProdScore = showProdScore;
        if (showProdSpike !== undefined)
            device.displayConfig.showProdSpike = showProdSpike;
        if (showSelfRating !== undefined)
            device.displayConfig.showSelfRating = showSelfRating;
        if (showModerator !== undefined)
            device.displayConfig.showModerator = showModerator;
        await device.save();
        console.log(`[DISPLAY CONFIG] Updated for device ${uid}:`, device.displayConfig);
        res.json({ success: true, data: device.displayConfig });
    }
    catch (error) {
        console.error('updateDisplayConfig error:', error);
        res.status(500).json({ success: false, error: 'Failed to update display config' });
    }
};
exports.updateDisplayConfig = updateDisplayConfig;
