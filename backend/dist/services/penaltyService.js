"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MISSED_TASK_PENALTY = void 0;
exports.markTaskMissed = markTaskMissed;
exports.flagOverdueTasks = flagOverdueTasks;
const Task_1 = require("../models/Task");
const Employee_1 = require("../models/Employee");
const SDWPoints_1 = require("../models/SDWPoints");
const Notification_1 = require("../models/Notification");
const notificationController_1 = require("../controllers/notificationController");
/** SDW points taken off for every task that was not done. */
exports.MISSED_TASK_PENALTY = 1;
function isoWeek(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
/** The employee who carries the penalty: the assignee, else the person who created the task. */
async function penaltyOwner(task) {
    if (task.assignedTo) {
        const assignee = await Employee_1.Employee.findById(task.assignedTo);
        if (assignee)
            return assignee;
    }
    return Employee_1.Employee.findOne({ user: task.createdBy });
}
/**
 * Marks a task as missed and records the penalty. The claim is atomic, so a task that two
 * requests flag at the same moment is only penalised once. Returns the updated task, or null
 * if it was already missed.
 */
async function markTaskMissed(taskId, reason) {
    const now = new Date();
    const task = await Task_1.Task.findOneAndUpdate({ _id: taskId, missed: { $ne: true } }, { $set: { missed: true, missedAt: now, missedReason: reason } }, { new: true });
    if (!task)
        return null;
    const owner = await penaltyOwner(task);
    if (owner) {
        await SDWPoints_1.SDWPoints.create({
            employeeId: owner._id,
            taskId: task._id,
            reason: `Missed task: ${task.title}`,
            points: -exports.MISSED_TASK_PENALTY,
            earnedAt: now,
            weekNumber: isoWeek(now),
            month: now.getMonth() + 1,
            year: now.getFullYear(),
        });
        task.penaltyApplied = true;
        task.penaltyPoints = exports.MISSED_TASK_PENALTY;
        await task.save();
        if (owner.user) {
            await (0, notificationController_1.createNotificationInternal)({
                type: Notification_1.NotificationType.TASK,
                title: `Missed task: -${exports.MISSED_TASK_PENALTY} SDW point`,
                message: reason === 'OVERDUE'
                    ? `"${task.title}" passed its due date without being completed.`
                    : `You logged "${task.title}" as not done.`,
                targetUser: String(owner.user),
                relatedId: String(task._id),
            });
        }
    }
    return task;
}
/** Flags every task that is past its due date (before today) and still not completed. */
async function flagOverdueTasks() {
    try {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const overdue = await Task_1.Task.find({
            dueDate: { $lt: startOfToday },
            status: { $ne: Task_1.TaskStatus.COMPLETED },
            missed: { $ne: true },
        }).select('_id');
        for (const t of overdue) {
            await markTaskMissed(String(t._id), 'OVERDUE');
        }
        return overdue.length;
    }
    catch (err) {
        console.error('[PENALTY] flagOverdueTasks error:', err);
        return 0;
    }
}
