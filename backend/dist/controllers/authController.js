"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAdmin = exports.loginUser = exports.resetAdmin = void 0;
const User_1 = require("../models/User");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const generateToken = (id) => {
    return jsonwebtoken_1.default.sign({ id }, process.env.JWT_SECRET || 'super_secret_jwt_key', {
        expiresIn: '30d',
    });
};
// TEMPORARY ENDPOINT TO FIX DB
const resetAdmin = async (req, res) => {
    await User_1.User.deleteMany({ email: 'admin@smmart.com' });
    await User_1.User.create({
        name: 'Super Admin',
        email: 'admin@smmart.com',
        passwordHash: 'admin123', // Mongoose pre-save hook will hash this!
        role: User_1.Role.ADMIN,
        isActive: true
    });
    res.send('Admin reset successfully! You can now login with admin@smmart.com / admin123');
};
exports.resetAdmin = resetAdmin;
// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User_1.User.findOne({ email });
        if (user && (await user.matchPassword(password))) {
            if (!user.isActive) {
                return res.status(403).json({ success: false, error: { code: 'INACTIVE_USER', message: 'User account is inactive' } });
            }
            res.json({
                success: true,
                data: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    token: generateToken(user._id.toString()),
                }
            });
        }
        else {
            res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
        }
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
    }
};
exports.loginUser = loginUser;
// @desc    Register initial admin (Setup endpoint)
// @route   POST /api/auth/register-admin
// @access  Public (Should be disabled or protected in production)
const registerAdmin = async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const userExists = await User_1.User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ success: false, error: { code: 'USER_EXISTS', message: 'User already exists' } });
        }
        const user = await User_1.User.create({
            name,
            email,
            passwordHash: password, // Pre-save hook will hash this
            role: User_1.Role.ADMIN
        });
        if (user) {
            res.status(201).json({
                success: true,
                data: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    token: generateToken(user._id.toString()),
                }
            });
        }
        else {
            res.status(400).json({ success: false, error: { code: 'INVALID_USER_DATA', message: 'Invalid user data' } });
        }
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
    }
};
exports.registerAdmin = registerAdmin;
