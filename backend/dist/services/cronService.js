"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startCronJobs = void 0;
const DeepWorkSession_1 = require("../models/DeepWorkSession");
const Task_1 = require("../models/Task");
const voiceService_1 = require("./voiceService");
const startCronJobs = () => {
    // Run every 5 minutes
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
                // Find if this task's assignee is currently active on a device
                if (!task.assignedTo)
                    continue;
                const activeSession = await DeepWorkSession_1.DeepWorkSession.findOne({
                    employeeId: task.assignedTo,
                    status: 'ACTIVE'
                });
                if (activeSession) {
                    // Send a voice command
                    voiceService_1.voiceService.queueMessage(activeSession.deviceUid, `Task Reminder: The task "${task.title}" has been pending for over 4 hours. Please prioritize it.`);
                }
            }
            // 2. Raise alarm if someone is on a break for too long (e.g. > 30 minutes)
            const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000);
            const longBreaks = await DeepWorkSession_1.DeepWorkSession.find({
                status: 'BREAK'
            });
            for (const session of longBreaks) {
                // Get the latest break
                const latestBreak = session.breaks[session.breaks.length - 1];
                if (latestBreak && !latestBreak.endTime && new Date(latestBreak.startTime) < thirtyMinsAgo) {
                    // Send an alarm
                    voiceService_1.voiceService.queueMessage(session.deviceUid, `ALARM: You have been away from your desk for over 30 minutes! Please return to work.`);
                }
            }
        }
        catch (err) {
            console.error('[CRON] Error in background checks:', err);
        }
    }, 5 * 60 * 1000); // 5 mins
};
exports.startCronJobs = startCronJobs;
