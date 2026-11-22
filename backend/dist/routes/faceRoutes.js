"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const faceController_1 = require("../controllers/faceController");
const auth_1 = require("../middleware/auth");
const deviceAuth_1 = require("../middleware/deviceAuth");
const router = express_1.default.Router();
const limited = (max, windowMs, message) => (0, express_rate_limit_1.default)({
    windowMs, max, standardHeaders: true, legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ success: false, error: 'TOO_MANY_REQUESTS', message }),
});
const enrollLimiter = limited(10, 10 * 60 * 1000, 'Too many Face ID attempts. Wait a few minutes and try again.');
const verifyLimiter = limited(20, 60 * 1000, 'Too many face checks. Wait a moment.');
// Face photos are larger than the app-wide 100 kb JSON limit, so this router parses its own bodies.
const enrollBody = express_1.default.json({ limit: '4mb' });
const jsonBody = express_1.default.json({ limit: '10kb' });
const jpegBody = express_1.default.raw({ type: 'image/jpeg', limit: '300kb' });
// ESP32 only: the device's key (or a keyless device during rollout). Users cannot submit photos here.
router.post('/device/:uid/verify', verifyLimiter, (0, deviceAuth_1.deviceAccess)('device'), jpegBody, faceController_1.verifyFromDevice);
// Dashboard
router.get('/device/:uid/check', auth_1.protect, faceController_1.getDeviceFaceCheck);
router.patch('/device/:uid/settings', auth_1.protect, (0, auth_1.authorize)('ADMIN', 'MANAGER'), jsonBody, faceController_1.updateDeviceFaceSettings);
router.get('/status', auth_1.protect, (0, auth_1.authorize)('ADMIN', 'MANAGER'), faceController_1.listFaceStatus); // must stay above '/:employeeId'
router.get('/:employeeId/status', auth_1.protect, faceController_1.getFaceStatus);
router.post('/:employeeId/enroll', auth_1.protect, enrollLimiter, enrollBody, faceController_1.enrollFace);
router.delete('/:employeeId', auth_1.protect, faceController_1.deleteFace);
exports.default = router;
