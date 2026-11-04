import { Request, Response } from 'express';
import { Employee } from '../models/Employee';
import { DeepWorkSession } from '../models/DeepWorkSession';
import { Task } from '../models/Task';
import { Penalty } from '../models/Penalty';
import {
  flagOverdueTasks,
  MISSED_TASK_PENALTY,
  MISSED_TASK_PENALTY_HOURS,
  INACTIVITY_DAYS,
  INACTIVITY_SESSION_MINUTES,
  INACTIVITY_PENALTY_DAYS,
} from '../services/penaltyService';

type Range = 'week' | 'month' | 'all';

function rangeStart(range: Range): Date | null {
  const now = new Date();
  if (range === 'week') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
    return d;
  }
  if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
}

// @desc    Everything the Penalty page shows: wasted hours, missed-task and deep-work penalties
// @route   GET /api/penalties/summary?range=week|month|all
// @access  Private
export const getPenaltySummary = async (req: Request, res: Response) => {
  try {
    const range: Range = req.query.range === 'week' || req.query.range === 'all' ? (req.query.range as Range) : 'month';
    const from = rangeStart(range);

    await flagOverdueTasks();

    const emps = await Employee.find({ $or: [{ user: req.user!._id }, { email: req.user!.email }] }).select('_id');
    const empIds = emps.map(e => e._id);

    // Time wasted: break time inside sessions, plus the time of sessions that were thrown out as invalid
    const sessionFilter: Record<string, any> = { employeeId: { $in: empIds } };
    if (from) sessionFilter.startTime = { $gte: from };
    const sessions = await DeepWorkSession.find(sessionFilter).select('totalBreakMinutes activeMinutes status');
    let breakMinutes = 0, invalidMinutes = 0, invalidSessions = 0;
    for (const s of sessions) {
      breakMinutes += s.totalBreakMinutes || 0;
      if (s.status === 'INVALID') { invalidMinutes += s.activeMinutes || 0; invalidSessions++; }
    }

    // Tasks that were not done
    const taskFilter: Record<string, any> = {
      missed: true,
      $or: [{ createdBy: req.user!._id }, { assignedTo: { $in: empIds } }],
    };
    if (from) taskFilter.missedAt = { $gte: from };
    const missedTasks = await Task.find(taskFilter).sort({ missedAt: -1 }).select('title missedAt missedReason dueDate penaltyPoints status');

    // Inactivity (deep work) penalties
    const penaltyFilter: Record<string, any> = { employeeId: { $in: empIds } };
    if (from) penaltyFilter.triggeredAt = { $gte: from };
    const inactivity = await Penalty.find(penaltyFilter).sort({ triggeredAt: -1 });
    const running = await Penalty.findOne({ employeeId: { $in: empIds }, status: { $in: ['PENDING', 'ACTIVE'] } }).sort({ triggeredAt: -1 });

    res.json({
      success: true,
      data: {
        range,
        rules: {
          inactivityDays: INACTIVITY_DAYS,
          penaltySessionHours: INACTIVITY_SESSION_MINUTES / 60,
          penaltyDays: INACTIVITY_PENALTY_DAYS,
          missedTaskPoints: MISSED_TASK_PENALTY,
          missedTaskHours: MISSED_TASK_PENALTY_HOURS,
        },
        wasted: {
          breakMinutes,
          invalidMinutes,
          invalidSessions,
          totalMinutes: breakMinutes + invalidMinutes,
        },
        tasks: {
          count: missedTasks.length,
          hours: missedTasks.length * MISSED_TASK_PENALTY_HOURS,
          items: missedTasks.slice(0, 20),
        },
        deepWork: {
          count: inactivity.length,
          currentHours: running ? running.sessionMinutes / 60 : 0,
          days: running ? running.days : INACTIVITY_PENALTY_DAYS,
          status: running ? running.status : null,
          expiresAt: running?.expiresAt || null,
          reason: running?.reason || null,
          history: inactivity.slice(0, 10),
        },
      },
    });
  } catch (error) {
    console.error('[PENALTY] summary error:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to load penalties' } });
  }
};
