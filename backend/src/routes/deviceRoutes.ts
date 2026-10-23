import express from 'express';
import { getDevice, handleHeartbeat, handleActivity, getLatestActivity, getAllDevices, assignDevice, getActivityHistory, getDeviceTasks, getDeviceStats, getDisplayConfig, updateDisplayConfig } from '../controllers/deviceController';
import { protect, authorize } from '../middleware/auth';

const router = express.Router();

router.get('/', protect, getAllDevices);
router.patch('/:id/assign', protect, authorize('ADMIN', 'MANAGER'), assignDevice);

// Static sub-routes BEFORE /:uid wildcard
router.get('/activity/history', protect, getActivityHistory);

// Display config routes
router.get('/:uid/display-config', getDisplayConfig);
router.patch('/:uid/display-config', protect, updateDisplayConfig);

// Public routes for the ESP32 (no JWT for now)
router.get('/:uid', getDevice);
router.get('/:uid/tasks', getDeviceTasks);  // ESP32 polls this for assigned tasks
router.get('/:uid/stats', getDeviceStats);  // ESP32 polls this for productivity stats
router.post('/:uid/heartbeat', handleHeartbeat);
router.post('/:uid/activity', handleActivity);
router.get('/:uid/activity/latest', getLatestActivity);

export default router;
