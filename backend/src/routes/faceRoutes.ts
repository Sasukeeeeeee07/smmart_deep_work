import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  listFaceStatus,
  getFaceStatus,
  enrollFace,
  deleteFace,
  updateDeviceFaceSettings,
  getDeviceFaceCheck,
  verifyFromDevice,
} from '../controllers/faceController';
import { protect, authorize } from '../middleware/auth';
import { deviceAccess } from '../middleware/deviceAuth';

const router = express.Router();

const limited = (max: number, windowMs: number, message: string) =>
  rateLimit({
    windowMs, max, standardHeaders: true, legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ success: false, error: 'TOO_MANY_REQUESTS', message }),
  });

const enrollLimiter = limited(10, 10 * 60 * 1000, 'Too many Face ID attempts. Wait a few minutes and try again.');
const verifyLimiter = limited(20, 60 * 1000, 'Too many face checks. Wait a moment.');

// Face photos are larger than the app-wide 100 kb JSON limit, so this router parses its own bodies.
const enrollBody = express.json({ limit: '4mb' });
const jsonBody = express.json({ limit: '10kb' });
const jpegBody = express.raw({ type: 'image/jpeg', limit: '300kb' });

// ESP32 only: the device's key (or a keyless device during rollout). Users cannot submit photos here.
router.post('/device/:uid/verify', verifyLimiter, deviceAccess('device'), jpegBody, verifyFromDevice);

// Dashboard
router.get('/device/:uid/check', protect, getDeviceFaceCheck);
router.patch('/device/:uid/settings', protect, authorize('ADMIN', 'MANAGER'), jsonBody, updateDeviceFaceSettings);
router.get('/status', protect, authorize('ADMIN', 'MANAGER'), listFaceStatus);   // must stay above '/:employeeId'
router.get('/:employeeId/status', protect, getFaceStatus);
router.post('/:employeeId/enroll', protect, enrollLimiter, enrollBody, enrollFace);
router.delete('/:employeeId', protect, deleteFace);

export default router;
