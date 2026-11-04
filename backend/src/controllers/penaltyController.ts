import { Request, Response } from 'express';
import { Employee } from '../models/Employee';
import { DeepWorkSession } from '../models/DeepWorkSession';
import { Task } from '../models/Task';
import { Penalty } from '../models/Penalty';
import { WastedTime } from '../models/WastedTime';
import {
  flagOverdueTasks,
  MISSED_TASK_PENALTY_HOURS,
  INACTIVITY_DAYS,
  INACTIVITY_SESSION_MINUTES,
  INACTIVITY_PENALTY_DAYS,
} from '../services/penaltyService';

type Range = 'week' | 'month' | 'all';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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

    // Time wasted inside deep work sessions: the breaks (the hours typed on the Dashboard are added on the page)
    const sessionFilter: Record<string, any> = { employeeId: { $in: empIds } };
    if (from) sessionFilter.startTime = { $gte: from };
    const sessions = await DeepWorkSession.find(sessionFilter).select('totalBreakMinutes');
    const breakMinutes = sessions.reduce((sum, s) => sum + (s.totalBreakMinutes || 0), 0);

    // Hours the user typed on the Dashboard card
    const wastedFilter: Record<string, any> = { user: req.user!._id };
    if (from) wastedFilter.date = { $gte: ymd(from) };
    const manual = await WastedTime.find(wastedFilter).select('minutes');
    const manualMinutes = manual.reduce((sum, w) => sum + (w.minutes || 0), 0);

    // Tasks that were not done
    const taskFilter: Record<string, any> = {
      missed: true,
      $or: [{ createdBy: req.user!._id }, { assignedTo: { $in: empIds } }],
    };
    if (from) taskFilter.missedAt = { $gte: from };
    const missedTasks = await Task.find(taskFilter).sort({ missedAt: -1 }).select('title missedAt missedReason dueDate status');

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
          missedTaskHours: MISSED_TASK_PENALTY_HOURS,
        },
        wasted: { breakMinutes, manualMinutes },
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

// @desc    Hours the user typed as wasted, between two days (inclusive)
// @route   GET /api/penalties/wasted?from=YYYY-MM-DD&to=YYYY-MM-DD
// @access  Private
export const getWastedTime = async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const filter: Record<string, any> = { user: req.user!._id };
    const range: Record<string, string> = {};
    if (from && DATE_RE.test(from)) range.$gte = from;
    if (to && DATE_RE.test(to)) range.$lte = to;
    if (Object.keys(range).length) filter.date = range;
    const entries = await WastedTime.find(filter).sort({ date: -1 }).limit(400).select('date minutes -_id');
    res.json({ success: true, data: entries });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to load wasted time' } });
  }
};

// @desc    Save the minutes wasted on one day. 0 removes the entry.
// @route   PUT /api/penalties/wasted/:date   body { minutes }
// @access  Private
export const setWastedTime = async (req: Request, res: Response) => {
  try {
    const date = String(req.params.date);
    const minutes = Math.round(Number(req.body.minutes));
    if (!DATE_RE.test(date) || !Number.isFinite(minutes) || minutes < 0 || minutes > 24 * 60) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'A valid day and 0 to 1440 minutes are required' } });
    }
    if (minutes === 0) {
      await WastedTime.deleteOne({ user: req.user!._id, date });
    } else {
      await WastedTime.findOneAndUpdate({ user: req.user!._id, date }, { $set: { minutes } }, { upsert: true });
    }
    res.json({ success: true, data: { date, minutes } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to save wasted time' } });
  }
};

// @desc    One-time import of entries that were only saved in the browser. Days that already have an entry are kept.
// @route   POST /api/penalties/wasted/import   body { entries: [{ date, minutes }] }
// @access  Private
export const importWastedTime = async (req: Request, res: Response) => {
  try {
    const entries = (Array.isArray(req.body.entries) ? req.body.entries : []).slice(0, 400)
      .map((e: any) => ({ date: String(e?.date), minutes: Math.round(Number(e?.minutes)) }))
      .filter((e: { date: string; minutes: number }) => DATE_RE.test(e.date) && Number.isFinite(e.minutes) && e.minutes > 0 && e.minutes <= 24 * 60);
    if (entries.length) {
      await WastedTime.bulkWrite(entries.map((e: { date: string; minutes: number }) => ({
        updateOne: {
          filter: { user: req.user!._id, date: e.date },
          update: { $setOnInsert: { minutes: e.minutes } },
          upsert: true,
        },
      })));
    }
    res.json({ success: true, data: { received: entries.length } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to import wasted time' } });
  }
};
