import express from 'express';
import {
  getAllSessions,
  startSession,
  startBreak,
  resumeSession,
  endSession,
  rateSession,
  getSDWPoints,
} from '../controllers/sessionController';
import { protect, authorize } from '../middleware/auth';

const router = express.Router();

// Admin route — requires JWT
router.get('/all', protect, authorize('ADMIN', 'MANAGER'), getAllSessions);

// ESP32 public routes
router.post('/:uid/start',  startSession);
router.post('/:uid/break',  startBreak);
router.post('/:uid/resume', resumeSession);
router.post('/:uid/end',    endSession);
router.post('/:uid/rate',   rateSession);
router.get( '/:uid/sdwpoints', getSDWPoints);

export default router;
