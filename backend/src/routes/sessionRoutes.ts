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
import { deviceAccess } from '../middleware/deviceAuth';
import { voiceRateLimiter } from '../middleware/rateLimiters';

const router = express.Router();

// Authenticated users route — requires JWT
router.get('/all', protect, getAllSessions);
router.get('/analytics', protect, getDashboardAnalytics);

// ESP32 and Web synchronized routes. Access (middleware/deviceAuth):
//   read  = the device (with its key) or any signed-in user
//   write = the device, an Admin/Manager, or the employee assigned to the desk
//   device = the device only (radar-driven events)
router.get( '/:uid/current',        deviceAccess('read'),   getCurrentSession);
router.post('/:uid/extend',         deviceAccess('write'),  extendSession);
router.post('/:uid/stop-sound',     deviceAccess('write'),  stopSound);
router.post('/:uid/alarm-trigger',  deviceAccess('device'), triggerAlarm);

// 48-Hour Hard Lockout & Test Controls
router.get( '/:uid/lockout-status', deviceAccess('read'), getLockoutStatus);
router.post('/:uid/test-lockout',   protect, authorize('ADMIN', 'MANAGER'), testLockout);
router.post('/:uid/unlock',         protect, authorize('ADMIN', 'MANAGER'), unlockDevice);

// Core session lifecycle
router.post('/:uid/start',         deviceAccess('write'),  startSession);
router.post('/:uid/break',         deviceAccess('device'), startBreak);
router.post('/:uid/break-counted', deviceAccess('device'), countBreak);
router.post('/:uid/resume',        deviceAccess('write'),  resumeSession);
router.post('/:uid/end',     deviceAccess('write'), endSession);
router.post('/:uid/rate',    deviceAccess('write'), rateSession);
router.post('/:uid/command', voiceRateLimiter, deviceAccess('write'), sendCommand);
router.post('/:uid/alarm',   voiceRateLimiter, deviceAccess('write'), raiseAlarm);
router.get( '/:uid/sdwpoints', deviceAccess('read'), getSDWPoints);
router.get( '/:uid/moderation-history', protect, authorize('ADMIN', 'MANAGER'), getModerationHistory);

export default router;
