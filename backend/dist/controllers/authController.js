"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAdmin = exports.loginUser = exports.MIN_PASSWORD_LENGTH = void 0;
const User_1 = require("../models/User");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwt_1 = require("../config/jwt");
exports.MIN_PASSWORD_LENGTH = 8;
const generateToken = (id) => {
    return jsonwebtoken_1.default.sign({ id }, jwt_1.JWT_SECRET, {
        expiresIn: '30d',
    });
};
// @desc    Auth user & get token
// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
    const { email, password } = req.body;
    try {
        const cleanLogin = (email || '').trim();
        if (!cleanLogin || !password) {
            return res.status(400).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Email and password are required' } });
        }
        const escaped = cleanLogin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const user = await User_1.User.findOne({
            $or: [
                { email: { $regex: new RegExp(`^${escaped}$`, 'i') } },
                { name: { $regex: new RegExp(`^${escaped}$`, 'i') } }
            ]
        });
        if (user && (await user.matchPassword(password))) {
            if (!user.isActive) {
                return res.status(403).json({ success: false, error: { code: 'INACTIVE_USER', message: 'User account is inactive' } });
            }
            return res.json({
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
            return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
        }
    }
    catch (error) {
        return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
    }
};
exports.loginUser = loginUser;
// @desc    Create the first admin on a brand-new database (one-time setup)
// @route   POST /api/auth/register-admin
// @access  Public only while no users exist; refused afterwards (admins add people from the Team page)
const registerAdmin = async (req, res) => {
    const { name, email, password } = req.body;
    try {
        if ((await User_1.User.estimatedDocumentCount()) > 0) {
            return res.status(403).json({
                success: false,
                error: { code: 'SETUP_CLOSED', message: 'Setup is already done. Ask an admin to add you from the Team page.' },
            });
        }
        if (typeof password !== 'string' || password.length < exports.MIN_PASSWORD_LENGTH) {
            return res.status(400).json({
                success: false,
                error: { code: 'WEAK_PASSWORD', message: `Password must be at least ${exports.MIN_PASSWORD_LENGTH} characters.` },
            });
        }
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
