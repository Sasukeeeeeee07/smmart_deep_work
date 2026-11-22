import express from 'express';
import { getDevice, handleHeartbeat, handleActivity, getLatestActivity, getAllDevices, assignDevice, getActivityHistory, getDeviceTasks, getDeviceStats, getDisplayConfig, updateDisplayConfig, generateDeviceKey } from '../controllers/deviceController';
import { protect, authorize } from '../middleware/auth';
import { deviceAccess } from '../middleware/deviceAuth';

const router = express.Router();

router.get('/', protect, getAllDevices);
router.patch('/:id/assign', protect, authorize('ADMIN', 'MANAGER'), assignDevice);

// Static sub-routes BEFORE /:uid wildcard
router.get('/activity/history', protect, getActivityHistory);

// Device secret key (shown once to the admin, then flashed into the device's secrets.h)
router.post('/:uid/key', protect, authorize('ADMIN'), generateDeviceKey);

// Display config routes
router.get('/:uid/display-config', deviceAccess('read'), getDisplayConfig);
router.patch('/:uid/display-config', protect, updateDisplayConfig);

// Device routes: the ESP32 (with its key) or a signed-in user — see middleware/deviceAuth
router.get('/:uid', deviceAccess('read'), getDevice);
router.get('/:uid/tasks', deviceAccess('read'), getDeviceTasks);  // ESP32 polls this for assigned tasks
router.get('/:uid/stats', deviceAccess('read'), getDeviceStats);  // ESP32 polls this for productivity stats
router.post('/:uid/heartbeat', deviceAccess('device', { allowRegister: true }), handleHeartbeat);
router.post('/:uid/activity', deviceAccess('device', { allowRegister: true }), handleActivity);
router.get('/:uid/activity/latest', deviceAccess('read'), getLatestActivity);

export default router;
