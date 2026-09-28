import { Request, Response } from 'express';
import { User, Role } from '../models/User';
import jwt from 'jsonwebtoken';

const generateToken = (id: string) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'super_secret_jwt_key', {
    expiresIn: '30d',
  });
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
export const loginUser = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

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
    } else {
      res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
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
