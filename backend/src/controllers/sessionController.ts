import { Request, Response } from 'express';
import { Device } from '../models/Device';
import { DeepWorkSession } from '../models/DeepWorkSession';
import { SDWPoints } from '../models/SDWPoints';
import { Employee } from '../models/Employee';
import { voiceService } from '../services/voiceService';
import { syncOfflineDevicesAndSessions } from '../services/cronService';

// Helper: get ISO week number
function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// Helper: handles invalid session count and triggers 48-hour lockout if >= 10 invalid sessions
async function handleSessionInvalidation(deviceUid: string) {
  try {
    const device = await Device.findOne({ uid: deviceUid });
    if (device) {
      device.invalidSessionCount = (device.invalidSessionCount || 0) + 1;
      if (device.invalidSessionCount >= 10) {
        device.isLockedOut = true;
        device.lockoutUntil = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
        device.lockoutReason = `Exceeded 10 invalid sessions (${device.invalidSessionCount}). 48-hour penalty lockout.`;
        device.adminUnlocked = false;
        console.log(`[LOCKOUT] Device ${device.uid} locked out for 48h! Total invalid sessions: ${device.invalidSessionCount}`);
      }
      await device.save();
      return {
        isLockedOut: device.isLockedOut,
        lockoutUntil: device.lockoutUntil,
        invalidSessionCount: device.invalidSessionCount,
      };
    }
  } catch (err) {
    console.error('[LOCKOUT] handleSessionInvalidation error:', err);
  }
  return null;
}

// =====================================================
// GET /api/sessions/all (Admin view of all sessions)
// =====================================================
export const getAllSessions = async (req: Request, res: Response) => {
  try {
    // Reconcile offline devices and auto-complete orphaned sessions
    await syncOfflineDevicesAndSessions();

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

    // HARD LOCKOUT ENFORCEMENT: If device is locked out, refuse to start session!
    if (device.lockoutUntil && new Date(device.lockoutUntil) > new Date()) {
      const remainingSeconds = Math.max(0, Math.round((new Date(device.lockoutUntil).getTime() - Date.now()) / 1000));
      return res.status(403).json({
        success: false,
        error: 'DEVICE_LOCKED_OUT',
        message: 'System locked out for 48 hours due to exceeding 10 invalid sessions.',
        data: {
          lockedOut: true,
          remainingSeconds,
          lockoutUntil: device.lockoutUntil,
          invalidSessionCount: device.invalidSessionCount || 10,
          reason: device.lockoutReason || 'Exceeded 10 invalid sessions'
        }
      });
    } else if (device.isLockedOut) {
      // Penalty lockout expired! Automatically restore device
      device.isLockedOut = false;
      device.lockoutUntil = null;
      device.invalidSessionCount = 0;
      await device.save();
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

    session.status = 'BREAK';
    session.alarmActive = true;
    session.alarmMessage = 'Away Alert: You are away from your desk!';
    session.breaks.push({ startTime: new Date() });
    // Note: breakCount is NOT incremented yet! Only absences crossing 5 minutes count as a break.

    await session.save();
    res.json({ success: true, data: { breakCount: session.breakCount, status: 'BREAK', alarmActive: true } });
  } catch (err) {
    console.error('[SESSION] break error:', err);
    res.status(500).json({ success: false, error: 'Failed to log break' });
  }
};

// =====================================================
// POST /api/sessions/:uid/break-counted
// Called when an absence crosses 5 minutes to officially count as a break
// =====================================================
export const countBreak = async (req: Request, res: Response) => {
  try {
    const session = await DeepWorkSession.findOne({
      deviceUid: req.params.uid,
      status: 'BREAK',
    });

    if (!session) {
      return res.status(404).json({ success: false, error: 'No session in break' });
    }

    session.breakCount = (session.breakCount || 0) + 1;

    // RULE: More than 3 breaks (5+ mins each) => SESSION BECOMES INVALID AND DIES
    if (session.breakCount > 3) {
      session.status = 'INVALID';
      session.invalidReason = 'Exceeded maximum 3 breaks (5m+ each) limit in session';
      session.alarmActive = true;
      session.alarmMessage = 'SESSION INVALID: EXCEEDED 3 BREAKS';
      session.sdwPointsEarned = 0;
      session.endTime = new Date();
      session.moderationLog.push({
        type: 'ALARM',
        message: 'Session died: Exceeded 3 breaks limit (5m+ each)',
        timestamp: new Date()
      });
      await session.save();

      const lockRes = await handleSessionInvalidation(session.deviceUid);

      console.log(`[SESSION] Invalidation: ${session._id} exceeded 3 breaks limit (5m+ each). Lockout status: ${lockRes?.isLockedOut}`);
      return res.json({
        success: true,
        data: {
          invalid: true,
          status: 'INVALID',
          breakCount: session.breakCount,
          message: 'SESSION INVALID: EXCEEDED 3 BREAKS',
          lockedOut: lockRes?.isLockedOut || false,
          remainingSeconds: lockRes?.isLockedOut ? 48 * 3600 : 0,
          invalidSessionCount: lockRes?.invalidSessionCount || 0
        }
      });
    }

    // Productivity spike check: 45+ active minutes with 1 break
    if (session.activeMinutes >= 45 && session.breakCount === 1) {
      session.productivitySpike = true;
    }

    await session.save();
    res.json({ success: true, data: { breakCount: session.breakCount, status: 'BREAK' } });
  } catch (err) {
    console.error('[SESSION] break-counted error:', err);
    res.status(500).json({ success: false, error: 'Failed to count break' });
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

    const { isCountedBreak } = req.body as { isCountedBreak?: boolean };

    // Close the last open break record
    const lastBreak = session.breaks[session.breaks.length - 1];
    if (lastBreak && !lastBreak.endTime) {
      lastBreak.endTime = new Date();
      const breakMins = Math.round(
        (lastBreak.endTime.getTime() - lastBreak.startTime.getTime()) / 60000
      );
      lastBreak.durationMinutes = breakMins;

      // RULE: Only count as a break if duration >= 5 minutes
      const counted = isCountedBreak !== undefined ? isCountedBreak : (breakMins >= 5);
      if (counted) {
        if (session.breakCount < session.breaks.length) {
          session.breakCount = (session.breakCount || 0) + 1;
        }
        session.totalBreakMinutes += breakMins;
      } else {
        // Under 5 minutes: Remove from breaks list so it does not count as a break
        session.breaks.pop();
      }
    }

    session.status = 'ACTIVE';
    session.alarmActive = false; // Dismiss any away alert sound on resume
    session.alarmMessage = '';
    await session.save();

    res.json({ success: true, data: { breakCount: session.breakCount, totalBreakMinutes: session.totalBreakMinutes } });
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
    const { activeMinutes, selfRating, sessionId } = req.body as { activeMinutes?: number; selfRating?: number; sessionId?: string };

    let session = null;
    if (sessionId) {
      session = await DeepWorkSession.findById(sessionId);
    }
    if (!session) {
      session = await DeepWorkSession.findOne({
        deviceUid: req.params.uid,
        status: { $in: ['ACTIVE', 'BREAK', 'DYING', 'INVALID'] },
      }).sort({ startTime: -1 });
    }

    if (!session) {
      return res.status(404).json({ success: false, error: 'No session to end' });
    }

    const now = new Date();
    session.endTime = now;
    if (activeMinutes !== undefined && activeMinutes !== null) {
      session.activeMinutes = activeMinutes;
    } else if (!session.activeMinutes || session.activeMinutes === 0) {
      const diffMs = Math.max(0, now.getTime() - new Date(session.startTime).getTime());
      const totalMin = Math.floor(diffMs / 60000);
      session.activeMinutes = Math.max(0, totalMin - (session.totalBreakMinutes || 0));
    }

    if (session.status !== 'INVALID') {
      session.status = 'COMPLETED';
    }
    session.alarmActive = false;
    session.alarmMessage = '';

    if (selfRating && selfRating >= 1 && selfRating <= 5) {
      session.selfRating = selfRating;
    }

    // Award SDW points if active time >= target duration (default 120 minutes)
    const targetMin = session.targetDurationMinutes || 120;
    let pointsEarned = 0;
    if (session.activeMinutes >= targetMin && session.status === 'COMPLETED') {
      session.sdwPointsEarned = 5;
      pointsEarned = 5;

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
    const { sessionId } = req.body as { sessionId?: string };

    if (sessionId) {
      await DeepWorkSession.findByIdAndUpdate(sessionId, {
        alarmActive: false,
        alarmMessage: '',
      });
    }

    // Dismiss any active alarm on all sessions for this device
    await DeepWorkSession.updateMany(
      { deviceUid: req.params.uid, alarmActive: true },
      { alarmActive: false, alarmMessage: '' }
    );

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

      if (isInvalid) {
        await handleSessionInvalidation(req.params.uid as string);
      }
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
    // Check device lockout state
    const device = await Device.findOne({ uid: req.params.uid });
    let lockoutData = {
      lockedOut: false,
      remainingSeconds: 0,
      lockoutUntil: null as Date | null,
      invalidSessionCount: device?.invalidSessionCount || 0,
      reason: '',
      adminUnlocked: device?.adminUnlocked || false,
    };

    if (device) {
      if (device.lockoutUntil && new Date(device.lockoutUntil) > new Date()) {
        lockoutData.lockedOut = true;
        lockoutData.remainingSeconds = Math.max(0, Math.round((new Date(device.lockoutUntil).getTime() - Date.now()) / 1000));
        lockoutData.lockoutUntil = device.lockoutUntil;
        lockoutData.reason = device.lockoutReason || 'Exceeded 10 invalid sessions';
        lockoutData.adminUnlocked = false;
      } else if (device.isLockedOut) {
        device.isLockedOut = false;
        device.lockoutUntil = null;
        device.invalidSessionCount = 0;
        device.adminUnlocked = true;
        lockoutData.adminUnlocked = true;
        await device.save();
      }
    }

    const session = await DeepWorkSession.findOne({
      deviceUid: req.params.uid,
      status: { $in: ['ACTIVE', 'BREAK', 'DYING', 'COMPLETED', 'INVALID'] }
    }).sort({ startTime: -1 });

    if (!session) {
      return res.json({ success: true, data: null, lockout: lockoutData });
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
      },
      lockout: lockoutData
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

// =====================================================
// GET /api/sessions/:uid/lockout-status
// Returns current 48-hour lockout state
// =====================================================
export const getLockoutStatus = async (req: Request, res: Response) => {
  try {
    const device = await Device.findOne({ uid: req.params.uid });
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    let isLocked = false;
    let remainingSeconds = 0;
    if (device.lockoutUntil && new Date(device.lockoutUntil) > new Date()) {
      isLocked = true;
      remainingSeconds = Math.max(0, Math.round((new Date(device.lockoutUntil).getTime() - Date.now()) / 1000));
    } else if (device.isLockedOut) {
      device.isLockedOut = false;
      device.lockoutUntil = null;
      device.invalidSessionCount = 0;
      device.adminUnlocked = true;
      await device.save();
    }

    res.json({
      success: true,
      data: {
        isLockedOut: isLocked,
        remainingSeconds,
        lockoutUntil: device.lockoutUntil,
        invalidSessionCount: device.invalidSessionCount || 0,
        lockoutReason: device.lockoutReason || ''
      }
    });
  } catch (err) {
    console.error('[LOCKOUT] getLockoutStatus error:', err);
    res.status(500).json({ success: false, error: 'Failed to get lockout status' });
  }
};

// =====================================================
// POST /api/sessions/:uid/test-lockout
// For instant testing: triggers lockout without waiting for 10 sessions or 48 hours
// =====================================================
export const testLockout = async (req: Request, res: Response) => {
  try {
    const { seconds = 120, invalidCount = 10, reason } = req.body as { seconds?: number; invalidCount?: number; reason?: string };
    const device = await Device.findOne({ uid: req.params.uid });
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    const durationSec = Number(seconds) || 120;
    device.isLockedOut = true;
    device.lockoutUntil = new Date(Date.now() + durationSec * 1000);
    device.invalidSessionCount = invalidCount || 10;
    device.lockoutReason = reason || `TEST LOCKOUT: ${durationSec}s penalty lock`;
    device.adminUnlocked = false;
    await device.save();

    console.log(`[TEST LOCKOUT] Device ${device.uid} locked for ${durationSec}s for testing.`);
    res.json({
      success: true,
      data: {
        isLockedOut: true,
        remainingSeconds: durationSec,
        lockoutUntil: device.lockoutUntil,
        invalidSessionCount: device.invalidSessionCount,
        reason: device.lockoutReason
      }
    });
  } catch (err) {
    console.error('[LOCKOUT] testLockout error:', err);
    res.status(500).json({ success: false, error: 'Failed to trigger test lockout' });
  }
};

// =====================================================
// POST /api/sessions/:uid/unlock
// Admin unlock: immediately clears lockout and invalid session count
// =====================================================
export const unlockDevice = async (req: Request, res: Response) => {
  try {
    const device = await Device.findOne({ uid: req.params.uid });
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    device.isLockedOut = false;
    device.lockoutUntil = null;
    device.invalidSessionCount = 0;
    device.lockoutReason = '';
    device.adminUnlocked = true;
    await device.save();

    // Silence any active alarm
    const session = await DeepWorkSession.findOne({
      deviceUid: req.params.uid,
      status: { $in: ['ACTIVE', 'BREAK', 'DYING', 'INVALID'] }
    }).sort({ startTime: -1 });

    if (session) {
      session.alarmActive = false;
      session.alarmMessage = '';
      if (session.status === 'INVALID') {
        session.status = 'COMPLETED';
      }
      await session.save();
    }

    console.log(`[LOCKOUT] Device ${device.uid} unlocked by Admin!`);
    res.json({
      success: true,
      data: {
        isLockedOut: false,
        message: 'Device unlocked successfully'
      }
    });
  } catch (err) {
    console.error('[LOCKOUT] unlockDevice error:', err);
    res.status(500).json({ success: false, error: 'Failed to unlock device' });
  }
};

// =====================================================
// GET /api/sessions/analytics
// Returns aggregated real weekly, monthly, and overall stats for dashboard charts
// =====================================================
export const getDashboardAnalytics = async (req: Request, res: Response) => {
  try {
    await syncOfflineDevicesAndSessions();

    const { uid } = req.query;
    const filter: Record<string, any> = {};
    if (uid) filter.deviceUid = uid as string;

    const rawSessions = await DeepWorkSession.find(filter).sort({ startTime: -1 }).limit(1000);
    const now = new Date();

    // Map sessions to adjust open active/break sessions
    const sessions = rawSessions.map((s) => {
      const doc = s.toObject();
      if (doc.status === 'ACTIVE' || doc.status === 'BREAK' || doc.status === 'DYING') {
        const diffMs = Math.max(0, now.getTime() - new Date(doc.startTime).getTime());
        const totalMin = Math.floor(diffMs / 60000);

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

    // 1. Weekly Data (Last 7 Days)
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weeklyData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayName = dayNames[d.getDay()];

      const daySessions = sessions.filter(s => {
        const sDate = new Date(s.startTime).toISOString().slice(0, 10);
        return sDate === dateStr;
      });

      const focus = daySessions.reduce((acc, s) => acc + (s.activeMinutes || 0), 0);
      const breaks = daySessions.reduce((acc, s) => acc + (s.totalBreakMinutes || 0), 0);

      weeklyData.push({
        name: i === 0 ? 'Today' : dayName,
        day: dayName,
        date: dateStr,
        focus,
        breaks,
        sessions: daySessions.length
      });
    }

    // 2. Active Days (Dates with recorded sessions for extended graph viewing)
    const activeDatesMap: Record<string, { date: string; day: string; focus: number; breaks: number; sessions: number }> = {};
    sessions.forEach(s => {
      const dateStr = new Date(s.startTime).toISOString().slice(0, 10);
      const d = new Date(s.startTime);
      const dayName = dayNames[d.getDay()];
      if (!activeDatesMap[dateStr]) {
        activeDatesMap[dateStr] = { date: dateStr, day: dayName, focus: 0, breaks: 0, sessions: 0 };
      }
      activeDatesMap[dateStr].focus += (s.activeMinutes || 0);
      activeDatesMap[dateStr].breaks += (s.totalBreakMinutes || 0);
      activeDatesMap[dateStr].sessions += 1;
    });
    const activeDaysData = Object.values(activeDatesMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14)
      .map(d => ({
        name: d.date.slice(5),
        day: d.day,
        date: d.date,
        focus: d.focus,
        breaks: d.breaks,
        sessions: d.sessions
      }));

    // 3. Monthly Data (Last 4 Weeks)
    const monthlyData = [];
    for (let w = 3; w >= 0; w--) {
      const start = new Date(now);
      start.setDate(start.getDate() - ((w + 1) * 7) + 1);
      start.setHours(0, 0, 0, 0);

      const end = new Date(now);
      end.setDate(end.getDate() - (w * 7));
      end.setHours(23, 59, 59, 999);

      const weekSessions = sessions.filter(s => {
        const t = new Date(s.startTime).getTime();
        return t >= start.getTime() && t <= end.getTime();
      });

      const focus = weekSessions.reduce((acc, s) => acc + (s.activeMinutes || 0), 0);
      const breaks = weekSessions.reduce((acc, s) => acc + (s.totalBreakMinutes || 0), 0);
      const total = focus + breaks;
      const productivity = total > 0 ? Math.round((focus / total) * 100) : 0;

      monthlyData.push({
        name: `Week ${4 - w}`,
        focus,
        breaks,
        productivity,
        sessions: weekSessions.length
      });
    }

    // 4. Totals and Monthly Score
    const totalFocusMinutes = sessions.reduce((acc, s) => acc + (s.activeMinutes || 0), 0);
    const totalBreakMinutes = sessions.reduce((acc, s) => acc + (s.totalBreakMinutes || 0), 0);
    const totalSessionsCount = sessions.length;
    const completedSessionsCount = sessions.filter(s => s.status === 'COMPLETED').length;

    const monthStart = new Date(now);
    monthStart.setDate(monthStart.getDate() - 30);
    const monthlySessions = sessions.filter(s => new Date(s.startTime).getTime() >= monthStart.getTime());
    const mFocus = monthlySessions.reduce((acc, s) => acc + (s.activeMinutes || 0), 0);
    const mBreaks = monthlySessions.reduce((acc, s) => acc + (s.totalBreakMinutes || 0), 0);
    const averageMonthlyScore = (mFocus + mBreaks) > 0 ? parseFloat(((mFocus / (mFocus + mBreaks)) * 100).toFixed(1)) : 0;

    res.json({
      success: true,
      data: {
        weeklyData,
        activeDaysData,
        monthlyData,
        averageMonthlyScore,
        summary: {
          totalFocusMinutes,
          totalBreakMinutes,
          totalSessionsCount,
          completedSessionsCount,
        }
      }
    });
  } catch (err) {
    console.error('[ANALYTICS] getDashboardAnalytics error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate analytics' });
  }
};
