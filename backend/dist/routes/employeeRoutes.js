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
router.route('/')
    .get(employeeController_1.getEmployees)
    .post((0, auth_1.authorize)('ADMIN', 'MANAGER'), employeeController_1.createEmployee);
router.route('/:id')
    .put((0, auth_1.authorize)('ADMIN', 'MANAGER'), employeeController_1.updateEmployee)
    .delete((0, auth_1.authorize)('ADMIN', 'MANAGER'), employeeController_1.deleteEmployee);
exports.default = router;
