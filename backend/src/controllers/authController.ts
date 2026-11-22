import { Request, Response } from 'express';
import { User, Role } from '../models/User';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/jwt';

export const MIN_PASSWORD_LENGTH = 8;

const generateToken = (id: string) => {
  return jwt.sign({ id }, JWT_SECRET, {
    expiresIn: '30d',
  });
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

// @desc    Create the first admin on a brand-new database (one-time setup)
// @route   POST /api/auth/register-admin
// @access  Public only while no users exist; refused afterwards (admins add people from the Team page)
export const registerAdmin = async (req: Request, res: Response) => {
  const { name, email, password } = req.body;

  try {
    if ((await User.estimatedDocumentCount()) > 0) {
      return res.status(403).json({
        success: false,
        error: { code: 'SETUP_CLOSED', message: 'Setup is already done. Ask an admin to add you from the Team page.' },
      });
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        success: false,
        error: { code: 'WEAK_PASSWORD', message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      });
    }

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
