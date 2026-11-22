"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteEmployee = exports.updateEmployee = exports.createEmployee = exports.getEmployees = void 0;
const Employee_1 = require("../models/Employee");
const User_1 = require("../models/User");
const authController_1 = require("./authController");
const ELEVATED_ROLES = [User_1.Role.ADMIN, User_1.Role.MANAGER];
/**
 * Only an Admin may create, promote to, or change Admin/Manager accounts. Without this a
 * Manager could create an Admin login (or reset an Admin's password) and take over.
 */
function needsAdmin(req, targetRole, currentRole) {
    if (req.user?.role === User_1.Role.ADMIN)
        return false;
    return Boolean((targetRole && ELEVATED_ROLES.includes(targetRole)) || (currentRole && ELEVATED_ROLES.includes(currentRole)));
}
const forbidden = (res) => res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only an Admin can create or change Admin and Manager accounts.' } });
const weakPassword = (res) => res.status(400).json({ success: false, error: { code: 'WEAK_PASSWORD', message: `Password must be at least ${authController_1.MIN_PASSWORD_LENGTH} characters.` } });
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
        if (needsAdmin(req, role))
            return forbidden(res);
        if (typeof password !== 'string' || password.length < authController_1.MIN_PASSWORD_LENGTH)
            return weakPassword(res);
        // Check if employee or user already exists
        const employeeExists = await Employee_1.Employee.findOne({ email });
        const userExists = await User_1.User.findOne({ email });
        if (employeeExists || userExists) {
            return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Employee or User already exists with this email' } });
        }
        // Create the User first - let User.pre('save') hook hash it consistently
        const user = await User_1.User.create({
            name: `${firstName} ${lastName}`.trim(),
            email: email.trim().toLowerCase(),
            passwordHash: password,
            role: role || User_1.Role.EMPLOYEE,
            isActive: true,
        });
        // Create Employee linked to User
        const employee = await Employee_1.Employee.create({
            firstName,
            lastName,
            email,
            department,
            position,
            status: status || 'ACTIVE',
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
        const { firstName, lastName, email, department, position, status, password, role } = req.body;
        const employee = await Employee_1.Employee.findById(req.params.id);
        if (!employee) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employee not found' } });
        }
        // Check permissions and the new password before changing anything.
        const linkedUser = employee.user
            ? await User_1.User.findById(employee.user)
            : await User_1.User.findOne({ email: employee.email });
        if (needsAdmin(req, role, linkedUser?.role))
            return forbidden(res);
        if (password && (typeof password !== 'string' || password.length < authController_1.MIN_PASSWORD_LENGTH))
            return weakPassword(res);
        if (firstName)
            employee.firstName = firstName;
        if (lastName)
            employee.lastName = lastName;
        if (email)
            employee.email = email;
        if (department)
            employee.department = department;
        if (position)
            employee.position = position;
        if (status)
            employee.status = status;
        await employee.save();
        // Find linked or matching user
        let user = null;
        if (employee.user) {
            user = await User_1.User.findById(employee.user);
        }
        if (!user && employee.email) {
            user = await User_1.User.findOne({ email: employee.email });
        }
        if (user) {
            if (firstName || lastName) {
                user.name = `${employee.firstName} ${employee.lastName}`;
            }
            if (email)
                user.email = email;
            if (password) {
                user.passwordHash = password;
            }
            if (role)
                user.role = role;
            await user.save();
            if (!employee.user || employee.user.toString() !== user._id.toString()) {
                employee.user = user._id;
                await employee.save();
            }
        }
        else if (password) {
            // Create a login for this employee only when a password was given (never a default one)
            const newUser = await User_1.User.create({
                name: `${employee.firstName} ${employee.lastName}`,
                email: employee.email,
                passwordHash: password,
                role: role || User_1.Role.EMPLOYEE,
                isActive: true,
            });
            employee.user = newUser._id;
            await employee.save();
        }
        const populated = await Employee_1.Employee.findById(employee._id).populate('user', 'name email role');
        res.json({ success: true, data: populated });
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
        const existing = await Employee_1.Employee.findById(req.params.id);
        if (!existing) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employee not found' } });
        }
        const linkedUser = existing.user ? await User_1.User.findById(existing.user) : null;
        if (needsAdmin(req, undefined, linkedUser?.role))
            return forbidden(res);
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
