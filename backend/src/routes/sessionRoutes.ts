import express from 'express';
import {
  getAllSessions,
  startSession,
  startBreak,
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
} from '../controllers/sessionController';
import { protect, authorize } from '../middleware/auth';

const router = express.Router();

// Admin route — requires JWT
router.get('/all', protect, authorize('ADMIN', 'MANAGER'), getAllSessions);

// ESP32 and Web synchronized routes
router.get( '/:uid/current',       getCurrentSession);
router.post('/:uid/extend',        extendSession);
router.post('/:uid/stop-sound',    stopSound);
router.post('/:uid/alarm-trigger', triggerAlarm);

// Core session lifecycle
router.post('/:uid/start',   startSession);
router.post('/:uid/break',   startBreak);
router.post('/:uid/resume',  resumeSession);
router.post('/:uid/end',     endSession);
router.post('/:uid/rate',    rateSession);
router.post('/:uid/command', sendCommand);
router.post('/:uid/alarm',   raiseAlarm);
router.get( '/:uid/sdwpoints', getSDWPoints);
router.get( '/:uid/moderation-history', protect, authorize('ADMIN', 'MANAGER'), getModerationHistory);

export default router;
