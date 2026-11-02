"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startCronJobs = exports.syncOfflineDevicesAndSessions = void 0;
const DeepWorkSession_1 = require("../models/DeepWorkSession");
const Device_1 = require("../models/Device");
const Task_1 = require("../models/Task");
const voiceService_1 = require("./voiceService");
// Device offline threshold in milliseconds (default 120 seconds / 2 minutes)
const OFFLINE_THRESHOLD_MS = (parseInt(process.env.DEVICE_OFFLINE_THRESHOLD_SECONDS || '120', 10)) * 1000;
const syncOfflineDevicesAndSessions = async () => {
    try {
        const now = new Date();
        const cutoff = new Date(now.getTime() - OFFLINE_THRESHOLD_MS);
        // 1. Mark devices with no recent heartbeat as OFFLINE
        const offlineDevices = await Device_1.Device.find({
            lastHeartbeat: { $lt: cutoff },
        });
        for (const dev of offlineDevices) {
            if (dev.status !== 'OFFLINE') {
                dev.status = 'OFFLINE';
                await dev.save();
                console.log(`[DEVICE] Device ${dev.uid} marked OFFLINE (last heartbeat: ${dev.lastHeartbeat})`);
            }
            // Automatically complete any ongoing sessions on offline devices
            const activeSessions = await DeepWorkSession_1.DeepWorkSession.find({
                deviceUid: dev.uid,
                status: { $in: ['ACTIVE', 'BREAK', 'DYING'] },
            });
            for (const session of activeSessions) {
                console.log(`[SESSION] Auto-completing session ${session._id} for offline device ${dev.uid}`);
                session.status = 'COMPLETED';
                session.endTime = dev.lastHeartbeat || now;
                session.alarmActive = false;
                session.alarmMessage = '';
                // Calculate actual active minutes up to lastHeartbeat, capped at max session duration (e.g. 120m)
                const endMs = (dev.lastHeartbeat ? new Date(dev.lastHeartbeat).getTime() : now.getTime());
                const totalMs = Math.max(0, endMs - new Date(session.startTime).getTime());
                const totalMins = Math.floor(totalMs / 60000);
                const maxAllowed = (session.targetDurationMinutes || 120);
                session.activeMinutes = Math.min(maxAllowed, Math.max(0, totalMins - (session.totalBreakMinutes || 0)));
                await session.save();
            }
        }
        // 2. Clean up any completed/invalid sessions that still have alarmActive = true
        await DeepWorkSession_1.DeepWorkSession.updateMany({ status: { $in: ['COMPLETED', 'INVALID'] }, alarmActive: true }, { alarmActive: false, alarmMessage: '' });
        // 3. Normalize any historical runaway sessions where activeMinutes exceeds realistic limit (> 180m)
        const runawaySessions = await DeepWorkSession_1.DeepWorkSession.find({
            activeMinutes: { $gt: 180 },
        });
        for (const s of runawaySessions) {
            const capped = (s.targetDurationMinutes || 120);
            console.log(`[CLEANUP] Normalizing runaway session ${s._id}: ${s.activeMinutes}m -> ${capped}m`);
            s.activeMinutes = capped;
            if (s.startTime) {
                s.endTime = new Date(new Date(s.startTime).getTime() + (capped + (s.totalBreakMinutes || 0)) * 60000);
            }
            await s.save();
        }
    }
    catch (err) {
        console.error('[OFFLINE SYNC] Error syncing offline devices and sessions:', err);
    }
};
exports.syncOfflineDevicesAndSessions = syncOfflineDevicesAndSessions;
const startCronJobs = () => {
    // Run offline reconciliation immediately on start
    (0, exports.syncOfflineDevicesAndSessions)();
    // Run offline checks every 30 seconds
    setInterval(exports.syncOfflineDevicesAndSessions, 30 * 1000);
    // Background checks (task reminders & break alarms) every 5 minutes
    setInterval(async () => {
        try {
            console.log('[CRON] Running background checks...');
            const now = new Date();
            // 1. Check for tasks assigned today that haven't been completed for a long time (e.g. > 4 hours)
            const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
            const pendingTasks = await Task_1.Task.find({
                status: { $ne: Task_1.TaskStatus.COMPLETED },
                createdAt: { $lte: fourHoursAgo }
            });
            for (const task of pendingTasks) {
                if (!task.assignedTo)
                    continue;
                const activeSession = await DeepWorkSession_1.DeepWorkSession.findOne({
                    employeeId: task.assignedTo,
                    status: 'ACTIVE'
                });
                if (activeSession) {
                    voiceService_1.voiceService.queueMessage(activeSession.deviceUid, `Task Reminder: The task "${task.title}" has been pending for over 4 hours. Please prioritize it.`);
                }
            }
            // 2. Raise alarm if someone is on a break for too long (e.g. > 30 minutes)
            const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000);
            const longBreaks = await DeepWorkSession_1.DeepWorkSession.find({
                status: 'BREAK'
            });
            for (const session of longBreaks) {
                const latestBreak = session.breaks[session.breaks.length - 1];
                if (latestBreak && !latestBreak.endTime && new Date(latestBreak.startTime) < thirtyMinsAgo) {
                    voiceService_1.voiceService.queueMessage(session.deviceUid, `ALARM: You have been away from your desk for over 30 minutes! Please return to work.`);
                }
            }
        }
        catch (err) {
            console.error('[CRON] Error in background checks:', err);
        }
    }, 5 * 60 * 1000);
};
exports.startCronJobs = startCronJobs;
