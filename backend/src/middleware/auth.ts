import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User, IUser } from '../models/User';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
    }
  }
}

export const protect = async (req: Request, res: Response, next: NextFunction) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_jwt_key') as any;

      const user = await User.findById(decoded.id).select('-passwordHash');
      
      if (!user) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      }

      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authorized, token failed' } });
    }
  } else {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Not authorized, no token' } });
  }
};

export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'User role not authorized' } });
    }
    next();
  };
};
