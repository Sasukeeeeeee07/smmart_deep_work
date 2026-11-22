"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const deviceController_1 = require("../controllers/deviceController");
const auth_1 = require("../middleware/auth");
const deviceAuth_1 = require("../middleware/deviceAuth");
const router = express_1.default.Router();
router.get('/', auth_1.protect, deviceController_1.getAllDevices);
router.patch('/:id/assign', auth_1.protect, (0, auth_1.authorize)('ADMIN', 'MANAGER'), deviceController_1.assignDevice);
// Static sub-routes BEFORE /:uid wildcard
router.get('/activity/history', auth_1.protect, deviceController_1.getActivityHistory);
// Device secret key (shown once to the admin, then flashed into the device's secrets.h)
router.post('/:uid/key', auth_1.protect, (0, auth_1.authorize)('ADMIN'), deviceController_1.generateDeviceKey);
// Display config routes
router.get('/:uid/display-config', (0, deviceAuth_1.deviceAccess)('read'), deviceController_1.getDisplayConfig);
router.patch('/:uid/display-config', auth_1.protect, deviceController_1.updateDisplayConfig);
// Device routes: the ESP32 (with its key) or a signed-in user — see middleware/deviceAuth
router.get('/:uid', (0, deviceAuth_1.deviceAccess)('read'), deviceController_1.getDevice);
router.get('/:uid/tasks', (0, deviceAuth_1.deviceAccess)('read'), deviceController_1.getDeviceTasks); // ESP32 polls this for assigned tasks
router.get('/:uid/stats', (0, deviceAuth_1.deviceAccess)('read'), deviceController_1.getDeviceStats); // ESP32 polls this for productivity stats
router.post('/:uid/heartbeat', (0, deviceAuth_1.deviceAccess)('device', { allowRegister: true }), deviceController_1.handleHeartbeat);
router.post('/:uid/activity', (0, deviceAuth_1.deviceAccess)('device', { allowRegister: true }), deviceController_1.handleActivity);
router.get('/:uid/activity/latest', (0, deviceAuth_1.deviceAccess)('read'), deviceController_1.getLatestActivity);
exports.default = router;
