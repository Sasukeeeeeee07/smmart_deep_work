"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUsers = exports.registerUser = void 0;
const User_1 = require("../models/User");
// @desc    Register a new user (Manager or Employee)
// @route   POST /api/users
// @access  Private (Admin/Manager)
const registerUser = async (req, res) => {
    const { name, email, password, role } = req.body;
    try {
        // Only Admin can create Managers. Managers can only create Employees.
        const reqUserRole = req.user.role;
        if (role === User_1.Role.ADMIN) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot create Admin users via this route' } });
        }
        if (role === User_1.Role.MANAGER && reqUserRole !== User_1.Role.ADMIN) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Admins can create Managers' } });
        }
        const userExists = await User_1.User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ success: false, error: { code: 'USER_EXISTS', message: 'User already exists' } });
        }
        const user = await User_1.User.create({
            name,
            email,
            passwordHash: password,
            role: role || User_1.Role.EMPLOYEE
        });
        res.status(201).json({
            success: true,
            data: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
    }
};
exports.registerUser = registerUser;
// @desc    Get all users
// @route   GET /api/users
// @access  Private (Admin/Manager)
const getUsers = async (req, res) => {
    try {
        const reqUserRole = req.user.role;
        let query = {};
        // Managers can only see Employees, Admins can see everyone
        if (reqUserRole === User_1.Role.MANAGER) {
            query = { role: User_1.Role.EMPLOYEE };
        }
        const users = await User_1.User.find(query).select('-passwordHash');
        res.json({ success: true, data: users });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
    }
};
exports.getUsers = getUsers;
