"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const sessionController_1 = require("../controllers/sessionController");
const auth_1 = require("../middleware/auth");
const deviceAuth_1 = require("../middleware/deviceAuth");
const rateLimiters_1 = require("../middleware/rateLimiters");
const router = express_1.default.Router();
// Authenticated users route — requires JWT
router.get('/all', auth_1.protect, sessionController_1.getAllSessions);
router.get('/analytics', auth_1.protect, sessionController_1.getDashboardAnalytics);
// ESP32 and Web synchronized routes. Access (middleware/deviceAuth):
//   read  = the device (with its key) or any signed-in user
//   write = the device, an Admin/Manager, or the employee assigned to the desk
//   device = the device only (radar-driven events)
router.get('/:uid/current', (0, deviceAuth_1.deviceAccess)('read'), sessionController_1.getCurrentSession);
router.post('/:uid/extend', (0, deviceAuth_1.deviceAccess)('write'), sessionController_1.extendSession);
router.post('/:uid/stop-sound', (0, deviceAuth_1.deviceAccess)('write'), sessionController_1.stopSound);
router.post('/:uid/alarm-trigger', (0, deviceAuth_1.deviceAccess)('device'), sessionController_1.triggerAlarm);
// 48-Hour Hard Lockout & Test Controls
router.get('/:uid/lockout-status', (0, deviceAuth_1.deviceAccess)('read'), sessionController_1.getLockoutStatus);
router.post('/:uid/test-lockout', auth_1.protect, (0, auth_1.authorize)('ADMIN', 'MANAGER'), sessionController_1.testLockout);
router.post('/:uid/unlock', auth_1.protect, (0, auth_1.authorize)('ADMIN', 'MANAGER'), sessionController_1.unlockDevice);
// Core session lifecycle
router.post('/:uid/start', (0, deviceAuth_1.deviceAccess)('write'), sessionController_1.startSession);
router.post('/:uid/break', (0, deviceAuth_1.deviceAccess)('device'), sessionController_1.startBreak);
router.post('/:uid/break-counted', (0, deviceAuth_1.deviceAccess)('device'), sessionController_1.countBreak);
router.post('/:uid/resume', (0, deviceAuth_1.deviceAccess)('write'), sessionController_1.resumeSession);
router.post('/:uid/end', (0, deviceAuth_1.deviceAccess)('write'), sessionController_1.endSession);
router.post('/:uid/rate', (0, deviceAuth_1.deviceAccess)('write'), sessionController_1.rateSession);
router.post('/:uid/command', rateLimiters_1.voiceRateLimiter, (0, deviceAuth_1.deviceAccess)('write'), sessionController_1.sendCommand);
router.post('/:uid/alarm', rateLimiters_1.voiceRateLimiter, (0, deviceAuth_1.deviceAccess)('write'), sessionController_1.raiseAlarm);
router.get('/:uid/sdwpoints', (0, deviceAuth_1.deviceAccess)('read'), sessionController_1.getSDWPoints);
router.get('/:uid/moderation-history', auth_1.protect, (0, auth_1.authorize)('ADMIN', 'MANAGER'), sessionController_1.getModerationHistory);
exports.default = router;
