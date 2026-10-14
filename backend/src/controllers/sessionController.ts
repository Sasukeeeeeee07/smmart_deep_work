import { Request, Response } from 'express';
import { Device } from '../models/Device';
import { DeepWorkSession } from '../models/DeepWorkSession';
import { SDWPoints } from '../models/SDWPoints';
import { Employee } from '../models/Employee';
import { voiceService } from '../services/voiceService';

// Helper: get ISO week number
function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// =====================================================
// GET /api/sessions/all (Admin view of all sessions)
// =====================================================
export const getAllSessions = async (req: Request, res: Response) => {
  try {
    const { uid, limit = '50', page = '1' } = req.query;
    const lim = Math.min(parseInt(limit as string, 10), 200);
    const skip = (parseInt(page as string, 10) - 1) * lim;
    const filter: Record<string, any> = {};
    if (uid) filter.deviceUid = uid as string;

    const [rawSessions, total] = await Promise.all([
      DeepWorkSession.find(filter)
        .sort({ startTime: -1 })
        .skip(skip)
        .limit(lim)
        .populate('employeeId', 'firstName lastName'),
      DeepWorkSession.countDocuments(filter),
    ]);

    const now = new Date();
    const sessions = rawSessions.map((s) => {
      const doc = s.toObject();
      if (doc.status === 'ACTIVE' || doc.status === 'BREAK' || doc.status === 'DYING') {
        const diffMs = Math.max(0, now.getTime() - new Date(doc.startTime).getTime());
        const totalMin = Math.floor(diffMs / 60000);

        // Include duration of currently open break if in BREAK/DYING status
        let openBreakMinutes = 0;
        if ((doc.status === 'BREAK' || doc.status === 'DYING') && doc.breaks && doc.breaks.length > 0) {
          const lastBreak = doc.breaks[doc.breaks.length - 1];
          if (!lastBreak.endTime) {
            openBreakMinutes = Math.floor(Math.max(0, now.getTime() - new Date(lastBreak.startTime).getTime()) / 60000);
          }
        }

        const effectiveBreakMinutes = (doc.totalBreakMinutes || 0) + openBreakMinutes;
        doc.activeMinutes = Math.max(0, totalMin - effectiveBreakMinutes);
        doc.totalBreakMinutes = effectiveBreakMinutes;
      }
      return doc;
    });

    res.json({ success: true, data: { sessions, total, page: parseInt(page as string, 10), limit: lim } });
  } catch (err) {
    console.error('[SESSIONS] getAllSessions error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch sessions' });
  }
};

// =====================================================
// POST /api/sessions/:uid/start
// ESP32 calls this when radar detects a person
// =====================================================
export const startSession = async (req: Request, res: Response) => {
  try {
    const device = await Device.findOne({ uid: req.params.uid });
    if (!device || !device.assignedTo) {
      return res.status(404).json({ success: false, error: 'Device or employee not found' });
    }

    // Close any stale ACTIVE/BREAK session for this device
    const staleSessions = await DeepWorkSession.find({
      deviceUid: req.params.uid,
      status: { $in: ['ACTIVE', 'BREAK', 'DYING'] }
    });

    const nowEnd = new Date();
    for (const stale of staleSessions) {
      stale.endTime = nowEnd;
      stale.status = 'COMPLETED';
      
      if (!stale.activeMinutes || stale.activeMinutes === 0) {
        const diffMs = nowEnd.getTime() - new Date(stale.startTime).getTime();
        const totalMin = Math.floor(diffMs / 60000);
        stale.activeMinutes = Math.max(0, totalMin - (stale.totalBreakMinutes || 0));
      }

      if (stale.activeMinutes >= 120 && stale.sdwPointsEarned === 0) {
        stale.sdwPointsEarned = 5;
        await SDWPoints.create({
          employeeId: stale.employeeId,
          sessionId:  stale._id,
          points:     5,
          earnedAt:   nowEnd,
          weekNumber: getWeekNumber(nowEnd),
          month:      nowEnd.getMonth() + 1,
          year:       nowEnd.getFullYear(),
        });
        console.log(`[SDW] +5 points earned for orphaned session ${stale._id}`);
      }
      await stale.save();
    }

    const session = await DeepWorkSession.create({
      deviceUid:   req.params.uid as string,
      employeeId:  device.assignedTo,
      startTime:   new Date(),
      status:      'ACTIVE',
    });

    console.log(`[SESSION] Started: ${session._id} for device ${req.params.uid}`);
    res.json({ success: true, data: { sessionId: session._id } });
  } catch (err) {
    console.error('[SESSION] start error:', err);
    res.status(500).json({ success: false, error: 'Failed to start session' });
  }
};

// =====================================================
// POST /api/sessions/:uid/break
// ESP32 calls this when radar loses person
// =====================================================
export const startBreak = async (req: Request, res: Response) => {
  try {
    const session = await DeepWorkSession.findOne({
      deviceUid: req.params.uid,
      status: { $in: ['ACTIVE'] },
    });

    if (!session) {
      return res.status(404).json({ success: false, error: 'No active session' });
    }

    const { activeMinutes } = req.body as { activeMinutes: number };
    session.activeMinutes = activeMinutes || session.activeMinutes;

    // RULE: More than 3 breaks in a session => SESSION BECOMES INVALID AND DIES
    if (session.breaks.length >= 3) {
      session.status = 'INVALID';
      session.invalidReason = 'Exceeded maximum 3 breaks limit in session';
      session.alarmActive = true;
      session.alarmMessage = 'SESSION INVALID: EXCEEDED 3 BREAKS';
      session.sdwPointsEarned = 0;
      session.endTime = new Date();
      session.breakCount = session.breaks.length + 1;
      session.breaks.push({ startTime: new Date(), endTime: new Date(), durationMinutes: 0 });
      session.moderationLog.push({
        type: 'ALARM',
        message: 'Session died: Exceeded 3 breaks limit',
        timestamp: new Date()
      });
      await session.save();

      console.log(`[SESSION] Invalidation: ${session._id} exceeded 3 breaks limit.`);
      return res.json({
        success: true,
        data: {
          invalid: true,
          status: 'INVALID',
          breakCount: session.breakCount,
          message: 'SESSION INVALID: EXCEEDED 3 BREAKS'
        }
      });
    }

    session.status = 'BREAK';
    session.alarmActive = true;
    session.alarmMessage = 'Away Alert: You are away from your desk!';
    session.breaks.push({ startTime: new Date() });
    session.breakCount = session.breaks.length;

    // Productivity spike check: 45+ active minutes with 0 previous breaks
    if (session.activeMinutes >= 45 && session.breakCount === 1) {
      session.productivitySpike = true;
    }

    await session.save();
    res.json({ success: true, data: { breakCount: session.breakCount, status: 'BREAK', alarmActive: true } });
  } catch (err) {
    console.error('[SESSION] break error:', err);
    res.status(500).json({ success: false, error: 'Failed to log break' });
  }
};

// =====================================================
// POST /api/sessions/:uid/resume
// ESP32 calls this when radar re-detects person
// =====================================================
export const resumeSession = async (req: Request, res: Response) => {
  try {
    const session = await DeepWorkSession.findOne({
      deviceUid: req.params.uid,
      status: 'BREAK',
    });

    if (!session) {
      return res.status(404).json({ success: false, error: 'No session in break' });
    }

    // Close the last open break record
    const lastBreak = session.breaks[session.breaks.length - 1];
    if (lastBreak && !lastBreak.endTime) {
      lastBreak.endTime = new Date();
      const breakMins = Math.round(
        (lastBreak.endTime.getTime() - lastBreak.startTime.getTime()) / 60000
      );
      lastBreak.durationMinutes = breakMins;
      session.totalBreakMinutes += breakMins;
    }

    session.status = 'ACTIVE';
    session.alarmActive = false; // Dismiss any away alert sound on resume
    session.alarmMessage = '';
    await session.save();

    res.json({ success: true, data: { totalBreakMinutes: session.totalBreakMinutes } });
  } catch (err) {
    console.error('[SESSION] resume error:', err);
    res.status(500).json({ success: false, error: 'Failed to resume session' });
  }
};

// =====================================================
// POST /api/sessions/:uid/end
// ESP32 calls this to end a session (dying or completed)
// =====================================================
export const endSession = async (req: Request, res: Response) => {
  try {
    const { activeMinutes, selfRating } = req.body as { activeMinutes: number; selfRating?: number };

    const session = await DeepWorkSession.findOne({
      deviceUid: req.params.uid,
      status: { $in: ['ACTIVE', 'BREAK', 'DYING', 'INVALID'] },
    }).sort({ startTime: -1 });

    if (!session) {
      return res.status(404).json({ success: false, error: 'No session to end' });
    }

    session.endTime       = new Date();
    session.activeMinutes = activeMinutes || session.activeMinutes;
    if (session.status !== 'INVALID') {
      session.status = 'COMPLETED';
    }
    if (selfRating && selfRating >= 1 && selfRating <= 5) {
      session.selfRating = selfRating;
    }

    // Award SDW points if active time >= target duration (default 120 minutes)
    const targetMin = session.targetDurationMinutes || 120;
    let pointsEarned = 0;
    if (session.activeMinutes >= targetMin && session.status === 'COMPLETED') {
      session.sdwPointsEarned = 5;
      pointsEarned = 5;

      const now = new Date();
      await SDWPoints.create({
        employeeId: session.employeeId,
        sessionId:  session._id,
        points:     5,
        earnedAt:   now,
        weekNumber: getWeekNumber(now),
        month:      now.getMonth() + 1,
        year:       now.getFullYear(),
      });

      console.log(`[SDW] +5 points earned for employee ${session.employeeId}`);
    }

    await session.save();
    
    // Voice feedback
    if (pointsEarned > 0) {
      voiceService.queueMessage(req.params.uid as string, `Incredible work! You completed your ${targetMin} minute deep work session and earned 5 points.`);
    } else {
      voiceService.queueMessage(req.params.uid as string, `Session ended. You worked for ${session.activeMinutes} minutes.`);
    }

    res.json({ success: true, data: { pointsEarned, activeMinutes: session.activeMinutes } });
  } catch (err) {
    console.error('[SESSION] end error:', err);
    res.status(500).json({ success: false, error: 'Failed to end session' });
  }
};

// =====================================================
// POST /api/sessions/:uid/extend
// Extends target duration (+15m, +30m, +45m, +60m)
// =====================================================
export const extendSession = async (req: Request, res: Response) => {
  try {
    const { extensionMinutes = 15 } = req.body as { extensionMinutes: number };
    const mins = Number(extensionMinutes) || 15;

    const session = await DeepWorkSession.findOne({
      deviceUid: req.params.uid,
      status: { $in: ['ACTIVE', 'BREAK'] },
    }).sort({ startTime: -1 });

    if (!session) {
      return res.status(404).json({ success: false, error: 'No active session to extend' });
    }

    session.targetDurationMinutes = (session.targetDurationMinutes || 120) + mins;
    session.extensionMinutes = (session.extensionMinutes || 0) + mins;
    session.moderationLog.push({
      type: 'COMMAND',
      message: `Session extended by +${mins} minutes`,
      timestamp: new Date(),
    });

    await session.save();
    console.log(`[SESSION] Extended: ${session._id} by +${mins}m (New target: ${session.targetDurationMinutes}m)`);

    res.json({
      success: true,
      data: {
        targetDurationMinutes: session.targetDurationMinutes,
        extensionMinutes: session.extensionMinutes,
      }
    });
  } catch (err) {
    console.error('[SESSION] extend error:', err);
    res.status(500).json({ success: false, error: 'Failed to extend session' });
  }
};

// =====================================================
// POST /api/sessions/:uid/stop-sound
// Stop sound / dismiss active alarm from device or web
// =====================================================
export const stopSound = async (req: Request, res: Response) => {
  try {
    const session = await DeepWorkSession.findOne({
      deviceUid: req.params.uid,
      status: { $in: ['ACTIVE', 'BREAK', 'DYING', 'INVALID'] },
    }).sort({ startTime: -1 });

    if (session) {
      session.alarmActive = false;
      session.alarmMessage = '';
      await session.save();
    }

    res.json({ success: true, message: 'Sound stopped and alarm dismissed' });
  } catch (err) {
    console.error('[SESSION] stop-sound error:', err);
    res.status(500).json({ success: false, error: 'Failed to stop sound' });
  }
};

// =====================================================
// POST /api/sessions/:uid/alarm-trigger
// Device or backend signals an active alarm/sound state
// =====================================================
export const triggerAlarm = async (req: Request, res: Response) => {
  try {
    const { message, isInvalid } = req.body as { message: string; isInvalid?: boolean };

    const session = await DeepWorkSession.findOne({
      deviceUid: req.params.uid,
      status: { $in: ['ACTIVE', 'BREAK', 'DYING', 'INVALID'] },
    }).sort({ startTime: -1 });

    if (session) {
      session.alarmActive = true;
      session.alarmMessage = message || 'Alert triggered';
      if (isInvalid) {
        session.status = 'INVALID';
        session.invalidReason = message;
        session.sdwPointsEarned = 0;
        session.endTime = new Date();
      }
      session.moderationLog.push({
        type: 'ALARM',
        message: message || 'Alarm sound started',
        timestamp: new Date(),
      });
      await session.save();
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[SESSION] triggerAlarm error:', err);
    res.status(500).json({ success: false, error: 'Failed to trigger alarm' });
  }
};

// =====================================================
// GET /api/sessions/:uid/current
// Fetch active/latest session state for ESP32 and Web sync
// =====================================================
export const getCurrentSession = async (req: Request, res: Response) => {
  try {
    const session = await DeepWorkSession.findOne({
      deviceUid: req.params.uid,
      status: { $in: ['ACTIVE', 'BREAK', 'DYING', 'COMPLETED', 'INVALID'] }
    }).sort({ startTime: -1 });

    if (!session) {
      return res.json({ success: true, data: null });
    }

    const now = Date.now();
    let liveActiveMinutes = session.activeMinutes || 0;
    let liveTotalBreakMinutes = session.totalBreakMinutes || 0;

    if (session.status === 'ACTIVE' || session.status === 'BREAK' || session.status === 'DYING') {
      const diffMs = Math.max(0, now - new Date(session.startTime).getTime());
      const totalMin = Math.floor(diffMs / 60000);

      let openBreakMinutes = 0;
      if ((session.status === 'BREAK' || session.status === 'DYING') && session.breaks && session.breaks.length > 0) {
        const lastBreak = session.breaks[session.breaks.length - 1];
        if (!lastBreak.endTime) {
          openBreakMinutes = Math.floor(Math.max(0, now - new Date(lastBreak.startTime).getTime()) / 60000);
        }
      }

      liveTotalBreakMinutes = (session.totalBreakMinutes || 0) + openBreakMinutes;
      liveActiveMinutes = Math.max(0, totalMin - liveTotalBreakMinutes);
    }

    const targetMin = session.targetDurationMinutes || 120;
    const remainingSeconds = Math.max(0, (targetMin * 60) - (liveActiveMinutes * 60));

    res.json({
      success: true,
      data: {
        ...session.toObject(),
        activeMinutes: liveActiveMinutes,
        totalBreakMinutes: liveTotalBreakMinutes,
        targetDurationMinutes: targetMin,
        remainingSeconds,
      }
    });
  } catch (err) {
    console.error('[SESSION] current error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch current session' });
  }
};

// =====================================================
// POST /api/sessions/:uid/rate
// ESP32 or Web calls this when user taps a self-rating star (1-5)
// =====================================================
export const rateSession = async (req: Request, res: Response) => {
  try {
    const { rating } = req.body as { rating: number };
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, error: 'Rating must be 1-5' });
    }

    const session = await DeepWorkSession.findOne({
      deviceUid: req.params.uid,
      status: { $in: ['ACTIVE', 'BREAK', 'COMPLETED', 'INVALID'] },
    }).sort({ startTime: -1 });

    if (!session) {
      return res.status(404).json({ success: false, error: 'No session found' });
    }

    session.selfRating = rating;
    await session.save();
    console.log(`[SESSION] Rated ${rating} stars for session ${session._id}`);
    res.json({ success: true, data: { selfRating: rating } });
  } catch (err) {
    console.error('[SESSION] rate error:', err);
    res.status(500).json({ success: false, error: 'Failed to rate session' });
  }
};

// =====================================================
// GET /api/sessions/:uid/sdwpoints
// ESP32 fetches weekly + monthly SDW points for settings page
// =====================================================
export const getSDWPoints = async (req: Request, res: Response) => {
  try {
    const device = await Device.findOne({ uid: req.params.uid });
    if (!device || !device.assignedTo) {
      return res.json({ success: true, data: { weekly: 0, monthly: 0 } });
    }

    const now    = new Date();
    const week   = getWeekNumber(now);
    const month  = now.getMonth() + 1;
    const year   = now.getFullYear();

    const [weeklyResult, monthlyResult] = await Promise.all([
      SDWPoints.aggregate([
        { $match: { employeeId: device.assignedTo, year, weekNumber: week } },
        { $group: { _id: null, total: { $sum: '$points' } } },
      ]),
      SDWPoints.aggregate([
        { $match: { employeeId: device.assignedTo, year, month } },
        { $group: { _id: null, total: { $sum: '$points' } } },
      ]),
    ]);

    const weekly  = weeklyResult[0]?.total  || 0;
    const monthly = monthlyResult[0]?.total || 0;

    res.json({ success: true, data: { weekly, monthly } });
  } catch (err) {
    console.error('[SDW] points error:', err);
    res.status(500).json({ success: false, error: 'Failed to get SDW points' });
  }
};

export const sendCommand = async (req: Request, res: Response) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ success: false, error: 'command is required' });

  // Queue voice message on ESP32
  voiceService.queueMessage(req.params.uid as string, command);

  // Log to the active session so history is kept
  try {
    const session = await DeepWorkSession.findOne({
      deviceUid: req.params.uid,
      status: { $in: ['ACTIVE', 'BREAK', 'DYING'] },
    }).sort({ startTime: -1 });

    if (session) {
      session.moderationLog.push({ type: 'COMMAND', message: command, timestamp: new Date() });
      await session.save();
    }
  } catch (err) {
    console.error('[MOD] command log error:', err);
  }

  res.json({ success: true });
};

export const raiseAlarm = async (req: Request, res: Response) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ success: false, error: 'message is required' });

  // Queue voice message on ESP32
  voiceService.queueMessage(req.params.uid as string, message);

  // Log to the active session
  try {
    const session = await DeepWorkSession.findOne({
      deviceUid: req.params.uid,
      status: { $in: ['ACTIVE', 'BREAK', 'DYING'] },
    }).sort({ startTime: -1 });

    if (session) {
      session.moderationLog.push({ type: 'ALARM', message, timestamp: new Date() });
      await session.save();
    }
  } catch (err) {
    console.error('[MOD] alarm log error:', err);
  }

  res.json({ success: true });
};

// =====================================================
// GET /api/sessions/:uid/moderation-history?date=YYYY-MM-DD
// Returns all moderation actions for a device on a given date
// =====================================================
export const getModerationHistory = async (req: Request, res: Response) => {
  try {
    const { date } = req.query as { date?: string };

    // Build date range — default to today
    const targetDate = date ? new Date(date) : new Date();
    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);

    const sessions = await DeepWorkSession.find({
      deviceUid: req.params.uid,
      startTime: { $gte: start, $lte: end },
    }).select('startTime endTime status moderationLog employeeId')
      .populate('employeeId', 'firstName lastName')
      .sort({ startTime: -1 });

    // Flatten all moderation log entries across sessions for that day
    const history = sessions.flatMap(s =>
      s.moderationLog.map(log => ({
        sessionId:  (s._id as any).toString(),
        sessionStart: s.startTime,
        sessionStatus: s.status,
        employee: s.employeeId,
        type:      log.type,
        message:   log.message,
        timestamp: log.timestamp,
      }))
    ).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({
      success: true,
      data: {
        date: start.toISOString().split('T')[0],
        totalActions: history.length,
        commands: history.filter(h => h.type === 'COMMAND').length,
        alarms:   history.filter(h => h.type === 'ALARM').length,
        history,
      },
    });
  } catch (err) {
    console.error('[MOD] history error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch moderation history' });
  }
};
