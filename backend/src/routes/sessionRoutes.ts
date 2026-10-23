import express from 'express';
import {
  getAllSessions,
  getDashboardAnalytics,
  startSession,
  startBreak,
  countBreak,
  resumeSession,
  endSession,
  rateSession,
  getSDWPoints,
  sendCommand,
  raiseAlarm,
  getModerationHistory,
  getCurrentSession,
  extendSession,
  stopSound,
  triggerAlarm,
  getLockoutStatus,
  testLockout,
  unlockDevice,
} from '../controllers/sessionController';
import { protect, authorize } from '../middleware/auth';
import { voiceRateLimiter } from '../middleware/rateLimiters';

const router = express.Router();

// Authenticated users route — requires JWT
router.get('/all', protect, getAllSessions);
router.get('/analytics', protect, getDashboardAnalytics);

// ESP32 and Web synchronized routes
router.get( '/:uid/current',        getCurrentSession);
router.post('/:uid/extend',         extendSession);
router.post('/:uid/stop-sound',     stopSound);
router.post('/:uid/alarm-trigger',  triggerAlarm);

// 48-Hour Hard Lockout & Test Controls
router.get( '/:uid/lockout-status', getLockoutStatus);
router.post('/:uid/test-lockout',   testLockout);
router.post('/:uid/unlock',         unlockDevice);

// Core session lifecycle
router.post('/:uid/start',         startSession);
router.post('/:uid/break',         startBreak);
router.post('/:uid/break-counted', countBreak);
router.post('/:uid/resume',        resumeSession);
router.post('/:uid/end',     endSession);
router.post('/:uid/rate',    rateSession);
router.post('/:uid/command', voiceRateLimiter, sendCommand);
router.post('/:uid/alarm',   voiceRateLimiter, raiseAlarm);
router.get( '/:uid/sdwpoints', getSDWPoints);
router.get( '/:uid/moderation-history', protect, authorize('ADMIN', 'MANAGER'), getModerationHistory);

export default router;
