"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const deviceController_1 = require("../controllers/deviceController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
router.get('/', auth_1.protect, (0, auth_1.authorize)('ADMIN', 'MANAGER'), deviceController_1.getAllDevices);
router.patch('/:id/assign', auth_1.protect, (0, auth_1.authorize)('ADMIN', 'MANAGER'), deviceController_1.assignDevice);
// Static sub-routes BEFORE /:uid wildcard
router.get('/activity/history', auth_1.protect, deviceController_1.getActivityHistory);
// Public routes for the ESP32 (no JWT for now)
router.get('/:uid', deviceController_1.getDevice);
router.get('/:uid/tasks', deviceController_1.getDeviceTasks); // ESP32 polls this for assigned tasks
router.get('/:uid/stats', deviceController_1.getDeviceStats); // ESP32 polls this for productivity stats
router.post('/:uid/heartbeat', deviceController_1.handleHeartbeat);
router.post('/:uid/activity', deviceController_1.handleActivity);
router.get('/:uid/activity/latest', deviceController_1.getLatestActivity);
exports.default = router;
