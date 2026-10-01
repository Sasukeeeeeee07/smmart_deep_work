"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const sessionController_1 = require("../controllers/sessionController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Admin route — requires JWT
router.get('/all', auth_1.protect, (0, auth_1.authorize)('ADMIN', 'MANAGER'), sessionController_1.getAllSessions);
// ESP32 public routes
router.post('/:uid/start', sessionController_1.startSession);
router.post('/:uid/break', sessionController_1.startBreak);
router.post('/:uid/resume', sessionController_1.resumeSession);
router.post('/:uid/end', sessionController_1.endSession);
router.post('/:uid/rate', sessionController_1.rateSession);
router.get('/:uid/sdwpoints', sessionController_1.getSDWPoints);
exports.default = router;
