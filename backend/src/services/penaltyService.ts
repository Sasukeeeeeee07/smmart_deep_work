import { Task, TaskStatus, ITask } from '../models/Task';
import { Employee } from '../models/Employee';
import { Device } from '../models/Device';
import { Penalty } from '../models/Penalty';
import { DeepWorkSession } from '../models/DeepWorkSession';
import { voiceService } from './voiceService';
import { SDWPoints } from '../models/SDWPoints';
import { NotificationType } from '../models/Notification';
import { createNotificationInternal } from '../controllers/notificationController';

/** SDW points taken off for every task that was not done. */
export const MISSED_TASK_PENALTY = 1;
/** Money side of a missed task: it costs this many hours of the user's time value. */
export const MISSED_TASK_PENALTY_HOURS = 1;

/** A device that stays off this long earns an inactivity penalty. */
export const INACTIVITY_DAYS = 7;
export const INACTIVITY_SESSION_MINUTES = 180;   // 3 hours
export const INACTIVITY_PENALTY_DAYS = 2;
export const DEFAULT_SESSION_MINUTES = 120;
/** Users are warned this long before a task deadline. */
export const DEADLINE_ALERT_MINUTES = 30;

/** When a task is due: its date and time, or the end of that day if no time was set. */
export function deadlineOf(task: Pick<ITask, 'dueDate' | 'dueHasTime'>): Date | null {
  if (!task.dueDate) return null;
  const d = new Date(task.dueDate);
  if (task.dueHasTime) return d;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999);
}

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
          ? `"${task.title}" reached its deadline without being completed.`
          : `You logged "${task.title}" as not done.`,
        targetUser: String(owner.user),
        relatedId: String(task._id),
      });
    }
  }
  return task;
}

/** Flags every task whose deadline has passed and that is still not completed. */
export async function flagOverdueTasks() {
  try {
    const now = new Date();
    // A date-only deadline ends at the close of its day, so look a day ahead and check each one exactly.
    const candidates = await Task.find({
      dueDate: { $lt: new Date(now.getTime() + 36 * 60 * 60 * 1000) },
      status: { $ne: TaskStatus.COMPLETED },
      missed: { $ne: true },
    }).select('_id dueDate dueHasTime');
    let flagged = 0;
    for (const t of candidates) {
      const dl = deadlineOf(t);
      if (dl && dl <= now) {
        await markTaskMissed(String(t._id), 'OVERDUE');
        flagged++;
      }
    }
    return flagged;
  } catch (err) {
    console.error('[PENALTY] flagOverdueTasks error:', err);
    return 0;
  }
}

/** Raises the "due in 30 minutes" alert once per task (only for deadlines that have a time). */
export async function alertUpcomingDeadlines() {
  try {
    const now = new Date();
    const soon = new Date(now.getTime() + DEADLINE_ALERT_MINUTES * 60 * 1000);
    const due = await Task.find({
      dueHasTime: true,
      dueDate: { $gt: now, $lte: soon },
      status: { $ne: TaskStatus.COMPLETED },
      missed: { $ne: true },
      deadlineAlertSent: { $ne: true },
    });
    for (const t of due) {
      // Claim the alert so two runs never send it twice
      const claimed = await Task.findOneAndUpdate(
        { _id: t._id, deadlineAlertSent: { $ne: true } },
        { $set: { deadlineAlertSent: true } },
        { new: true }
      );
      if (!claimed) continue;

      const owner = await penaltyOwner(claimed);
      const targetUser = owner?.user ? String(owner.user) : String(claimed.createdBy);
      const mins = Math.max(1, Math.round((new Date(claimed.dueDate!).getTime() - now.getTime()) / 60000));
      await createNotificationInternal({
        type: NotificationType.TASK,
        title: `Due in ${mins} min: ${claimed.title}`,
        message: `"${claimed.title}" reaches its deadline at ${new Date(claimed.dueDate!).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}. If it is not done by then it moves to "Tasks I did not do" and costs ${MISSED_TASK_PENALTY} SDW point.`,
        targetUser,
        relatedId: String(claimed._id),
      });

      if (owner) {
        const session = await DeepWorkSession.findOne({ employeeId: owner._id, status: 'ACTIVE' });
        if (session) {
          voiceService.queueMessage(session.deviceUid, `Heads up: the task "${claimed.title}" is due in ${mins} minutes.`);
        }
      }
    }
    return due.length;
  } catch (err) {
    console.error('[PENALTY] alertUpcomingDeadlines error:', err);
    return 0;
  }
}

/**
 * A device that has been off for INACTIVITY_DAYS in a row earns an inactivity penalty: the next
 * INACTIVITY_PENALTY_DAYS days of use have 3-hour deep-work sessions. One penalty per gap.
 */
export async function checkInactiveDevices() {
  try {
    const cutoff = new Date(Date.now() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000);
    const idle = await Device.find({ assignedTo: { $exists: true, $ne: null }, lastHeartbeat: { $lt: cutoff } });
    for (const dev of idle) {
      const gapId = dev.lastHeartbeat ? new Date(dev.lastHeartbeat) : null;
      if (!gapId) continue;
      if (dev.inactivityPenaltyFor && new Date(dev.inactivityPenaltyFor).getTime() === gapId.getTime()) continue;

      // Claim this gap atomically
      const claimed = await Device.findOneAndUpdate(
        { _id: dev._id, inactivityPenaltyFor: { $ne: gapId } },
        { $set: { inactivityPenaltyFor: gapId, status: 'OFFLINE' } },
        { new: true }
      );
      if (!claimed) continue;

      const daysOff = Math.floor((Date.now() - gapId.getTime()) / 86400000);
      await Penalty.create({
        employeeId: dev.assignedTo,
        deviceUid: dev.uid,
        type: 'INACTIVITY',
        reason: `${dev.name || dev.uid} was off for ${daysOff} days in a row`,
        sessionMinutes: INACTIVITY_SESSION_MINUTES,
        days: INACTIVITY_PENALTY_DAYS,
        status: 'PENDING',
        triggeredAt: new Date(),
      });

      const emp = await Employee.findById(dev.assignedTo);
      const text = `${dev.name || dev.uid} was off for ${daysOff} days in a row. For ${INACTIVITY_PENALTY_DAYS} days after you switch it back on, every deep work session is ${INACTIVITY_SESSION_MINUTES / 60} hours long.`;
      if (emp?.user) {
        await createNotificationInternal({
          type: NotificationType.DEVICE,
          title: 'Inactivity penalty: 3-hour sessions',
          message: text,
          targetUser: String(emp.user),
          relatedId: dev.uid,
        });
      }
      await createNotificationInternal({
        type: NotificationType.DEVICE,
        title: 'Inactivity penalty issued',
        message: `${emp ? `${emp.firstName} ${emp.lastName}: ` : ''}${text}`,
        relatedId: dev.uid,
      });
      console.log(`[PENALTY] Inactivity penalty issued for device ${dev.uid} (${daysOff} days off)`);
    }
  } catch (err) {
    console.error('[PENALTY] checkInactiveDevices error:', err);
  }
}

/**
 * Length of the next deep-work session for an employee. An inactivity penalty starts counting
 * its days at the first session after it was issued, and sessions are 3 hours until they run out.
 */
export async function sessionTargetMinutes(employeeId: any): Promise<number> {
  try {
    const now = new Date();
    let target = DEFAULT_SESSION_MINUTES;
    const open = await Penalty.find({ employeeId, status: { $in: ['PENDING', 'ACTIVE'] } });
    for (const p of open) {
      if (p.status === 'PENDING') {
        p.status = 'ACTIVE';
        p.activatedAt = now;
        p.expiresAt = new Date(now.getTime() + p.days * 24 * 60 * 60 * 1000);
        await p.save();
      } else if (p.expiresAt && p.expiresAt <= now) {
        p.status = 'DONE';
        await p.save();
        continue;
      }
      target = Math.max(target, p.sessionMinutes);
    }
    return target;
  } catch (err) {
    console.error('[PENALTY] sessionTargetMinutes error:', err);
    return DEFAULT_SESSION_MINUTES;
  }
}
