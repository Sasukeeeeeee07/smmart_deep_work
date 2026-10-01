"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const taskController_1 = require("../controllers/taskController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// All task routes require authentication
router.use(auth_1.protect);
// Routes accessible by all authenticated users (to read tasks)
router.get('/', taskController_1.getTasks);
router.get('/:id', taskController_1.getTask);
router.patch('/:id/status', taskController_1.updateTaskStatus);
// Admin/Manager only for create, edit, delete
router.post('/', (0, auth_1.authorize)('ADMIN', 'MANAGER'), taskController_1.createTask);
router.put('/:id', (0, auth_1.authorize)('ADMIN', 'MANAGER'), taskController_1.updateTask);
router.delete('/:id', (0, auth_1.authorize)('ADMIN', 'MANAGER'), taskController_1.deleteTask);
exports.default = router;
