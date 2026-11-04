import { Task, TaskStatus, ITask } from '../models/Task';
import { Employee } from '../models/Employee';
import { SDWPoints } from '../models/SDWPoints';
import { NotificationType } from '../models/Notification';
import { createNotificationInternal } from '../controllers/notificationController';

/** SDW points taken off for every task that was not done. */
export const MISSED_TASK_PENALTY = 1;

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** The employee who carries the penalty: the assignee, else the person who created the task. */
async function penaltyOwner(task: ITask) {
  if (task.assignedTo) {
    const assignee = await Employee.findById(task.assignedTo);
    if (assignee) return assignee;
  }
  return Employee.findOne({ user: task.createdBy });
}

/**
 * Marks a task as missed and records the penalty. The claim is atomic, so a task that two
 * requests flag at the same moment is only penalised once. Returns the updated task, or null
 * if it was already missed.
 */
export async function markTaskMissed(taskId: string, reason: 'OVERDUE' | 'MANUAL') {
  const now = new Date();
  const task = await Task.findOneAndUpdate(
    { _id: taskId, missed: { $ne: true } },
    { $set: { missed: true, missedAt: now, missedReason: reason } },
    { new: true }
  );
  if (!task) return null;

  const owner = await penaltyOwner(task);
  if (owner) {
    await SDWPoints.create({
      employeeId: owner._id,
      taskId: task._id,
      reason: `Missed task: ${task.title}`,
      points: -MISSED_TASK_PENALTY,
      earnedAt: now,
      weekNumber: isoWeek(now),
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    });
    task.penaltyApplied = true;
    task.penaltyPoints = MISSED_TASK_PENALTY;
    await task.save();

    if (owner.user) {
      await createNotificationInternal({
        type: NotificationType.TASK,
        title: `Missed task: -${MISSED_TASK_PENALTY} SDW point`,
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
export async function flagOverdueTasks() {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const overdue = await Task.find({
      dueDate: { $lt: startOfToday },
      status: { $ne: TaskStatus.COMPLETED },
      missed: { $ne: true },
    }).select('_id');
    for (const t of overdue) {
      await markTaskMissed(String(t._id), 'OVERDUE');
    }
    return overdue.length;
  } catch (err) {
    console.error('[PENALTY] flagOverdueTasks error:', err);
    return 0;
  }
}
