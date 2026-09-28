import { Request, Response } from 'express';
import { User, Role } from '../models/User';

// @desc    Register a new user (Manager or Employee)
// @route   POST /api/users
// @access  Private (Admin/Manager)
export const registerUser = async (req: Request, res: Response) => {
  const { name, email, password, role } = req.body;

  try {
    // Only Admin can create Managers. Managers can only create Employees.
    const reqUserRole = (req as any).user.role;
    
    if (role === Role.ADMIN) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot create Admin users via this route' } });
    }
    
    if (role === Role.MANAGER && reqUserRole !== Role.ADMIN) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only Admins can create Managers' } });
    }

    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ success: false, error: { code: 'USER_EXISTS', message: 'User already exists' } });
    }

    const user = await User.create({
      name,
      email,
      passwordHash: password,
      role: role || Role.EMPLOYEE
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
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};

// @desc    Get all users
// @route   GET /api/users
// @access  Private (Admin/Manager)
export const getUsers = async (req: Request, res: Response) => {
  try {
    const reqUserRole = (req as any).user.role;
    let query = {};
    
    // Managers can only see Employees, Admins can see everyone
    if (reqUserRole === Role.MANAGER) {
      query = { role: Role.EMPLOYEE };
    }
    
    const users = await User.find(query).select('-passwordHash');
    res.json({ success: true, data: users });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
};
