"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteEmployee = exports.updateEmployee = exports.createEmployee = exports.getEmployees = void 0;
const Employee_1 = require("../models/Employee");
const User_1 = require("../models/User");
// @desc    Get all employees
// @route   GET /api/employees
// @access  Private (Admin/Manager)
const getEmployees = async (req, res) => {
    try {
        const employees = await Employee_1.Employee.find().populate('user', 'name email role');
        res.json({ success: true, data: employees });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch employees' } });
    }
};
exports.getEmployees = getEmployees;
// @desc    Create a new employee
// @route   POST /api/employees
// @access  Private (Admin/Manager)
const createEmployee = async (req, res) => {
    try {
        const { firstName, lastName, email, department, position, status, password, role } = req.body;
        // Check if employee or user already exists
        const employeeExists = await Employee_1.Employee.findOne({ email });
        const userExists = await User_1.User.findOne({ email });
        if (employeeExists || userExists) {
            return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Employee or User already exists with this email' } });
        }
        // Create the User first
        const user = await User_1.User.create({
            name: `${firstName} ${lastName}`,
            email,
            passwordHash: password || 'defaultpassword123', // require password from frontend
            role: role || User_1.Role.EMPLOYEE,
        });
        // Create Employee linked to User
        const employee = await Employee_1.Employee.create({
            firstName,
            lastName,
            email,
            department,
            position,
            status: status || 'Active',
            user: user._id,
        });
        res.status(201).json({ success: true, data: employee });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to create employee and user' } });
    }
};
exports.createEmployee = createEmployee;
// @desc    Update employee
// @route   PUT /api/employees/:id
// @access  Private (Admin/Manager)
const updateEmployee = async (req, res) => {
    try {
        const employee = await Employee_1.Employee.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true,
        });
        if (!employee) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employee not found' } });
        }
        res.json({ success: true, data: employee });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to update employee' } });
    }
};
exports.updateEmployee = updateEmployee;
// @desc    Delete employee
// @route   DELETE /api/employees/:id
// @access  Private (Admin/Manager)
const deleteEmployee = async (req, res) => {
    try {
        const employee = await Employee_1.Employee.findByIdAndDelete(req.params.id);
        if (!employee) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employee not found' } });
        }
        res.json({ success: true, data: {} });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to delete employee' } });
    }
};
exports.deleteEmployee = deleteEmployee;
