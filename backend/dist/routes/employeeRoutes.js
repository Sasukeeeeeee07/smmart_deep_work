"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const employeeController_1 = require("../controllers/employeeController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Apply auth middleware to all employee routes
router.use(auth_1.protect);
router.use((0, auth_1.authorize)('ADMIN', 'MANAGER'));
router.route('/')
    .get(employeeController_1.getEmployees)
    .post(employeeController_1.createEmployee);
router.route('/:id')
    .put(employeeController_1.updateEmployee)
    .delete(employeeController_1.deleteEmployee);
exports.default = router;
