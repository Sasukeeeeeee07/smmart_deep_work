import { Request, Response } from 'express';
import { User, Role } from '../models/User';
import jwt from 'jsonwebtoken';

const generateToken = (id: string) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'super_secret_jwt_key', {
    expiresIn: '30d',
  });
};

// TEMPORARY ENDPOINT TO FIX DB
export const resetAdmin = async (req: Request, res: Response) => {
  await User.deleteMany({ email: 'admin@smmart.com' });
  await User.create({
    name: 'Super Admin',
    email: 'admin@smmart.com',
    passwordHash: 'admin123', // Mongoose pre-save hook will hash this!
    role: Role.ADMIN,
    isActive: true
  });
  res.send('Admin reset successfully! You can now login with admin@smmart.com / admin123');
};

// @desc    Auth user & get token
// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
export const loginUser = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const cleanLogin = (email || '').trim();
    if (!cleanLogin || !password) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Email and password are required' } });
    }

    const escaped = cleanLogin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const user = await User.findOne({
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
    } else {
      return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    }
  } catch (error: any) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

// @desc    Register initial admin (Setup endpoint)
// @route   POST /api/auth/register-admin
// @access  Public (Should be disabled or protected in production)
export const registerAdmin = async (req: Request, res: Response) => {
  const { name, email, password } = req.body;

  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ success: false, error: { code: 'USER_EXISTS', message: 'User already exists' } });
    }

    const user = await User.create({
      name,
      email,
      passwordHash: password, // Pre-save hook will hash this
      role: Role.ADMIN
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
    } else {
      res.status(400).json({ success: false, error: { code: 'INVALID_USER_DATA', message: 'Invalid user data' } });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};
