"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const penaltyController_1 = require("../controllers/penaltyController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
router.use(auth_1.protect);
router.get('/summary', penaltyController_1.getPenaltySummary);
router.get('/wasted', penaltyController_1.getWastedTime);
router.post('/wasted/import', penaltyController_1.importWastedTime); // must stay above '/wasted/:date'
router.put('/wasted/:date', penaltyController_1.setWastedTime);
exports.default = router;
