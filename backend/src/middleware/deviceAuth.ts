import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { Device } from '../models/Device';
import { Employee } from '../models/Employee';
import { Role } from '../models/User';
import { userFromRequest } from './auth';

declare global {
  namespace Express {
    interface Request {
      /** Set when the caller is the device itself: 'key' = proved with its key, 'legacy' = keyless device (rollout mode). */
      deviceAuth?: 'key' | 'legacy';
    }
  }
}

/**
 * When true, devices without a key are refused. Leave it off while devices are being re-flashed
 * with their keys, then turn it on so a desk can only be reached with its key or a signed-in user.
 */
const requireKeys = () => process.env.REQUIRE_DEVICE_KEYS === 'true';

export const hashDeviceKey = (key: string) => crypto.createHash('sha256').update(key).digest('hex');

function sameHash(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * - 'device': only the device itself (radar events, heartbeats, face photos, voice polling)
 * - 'read':   the device, or any signed-in user
 * - 'write':  the device, or an Admin/Manager, or the employee assigned to this desk
 */
type Access = 'device' | 'read' | 'write';

interface Options {
  /** Allow an unknown uid through so the device can register itself (heartbeat/activity only). */
  allowRegister?: boolean;
}

const deny = (res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ success: false, error: code, message });

export const deviceAccess = (access: Access, options: Options = {}) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.params.uid as string;
      const device = await Device.findOne({ uid }).select('+keyHash');
      const presentedKey = req.header('x-device-key');

      // 1. The device, proving itself with its key.
      if (presentedKey) {
        if (device?.keyHash && sameHash(hashDeviceKey(presentedKey), device.keyHash)) {
          req.deviceAuth = 'key';
          return next();
        }
        return deny(res, 401, 'INVALID_DEVICE_KEY', 'Device key is not valid for this device.');
      }

      // 2. A signed-in user (the dashboard).
      if (access !== 'device' && req.headers.authorization) {
        const user = await userFromRequest(req);
        if (!user) return deny(res, 401, 'UNAUTHORIZED', 'Sign in again.');
        req.user = user;
        if (access === 'read' || user.role === Role.ADMIN || user.role === Role.MANAGER) return next();
        // 'write' by an employee: only on their own desk.
        const owner = device?.assignedTo ? await Employee.findById(device.assignedTo, { user: 1 }).lean() : null;
        if (owner?.user && String(owner.user) === String(user._id)) return next();
        return deny(res, 403, 'FORBIDDEN', 'You can only control the desk assigned to you.');
      }

      // 3. A brand-new device registering itself. It gets nothing else until an admin gives it a key.
      if (!device && options.allowRegister) {
        req.deviceAuth = 'legacy';
        return next();
      }

      // 4. Rollout mode: a device that has no key yet keeps working as before.
      if (device && !device.keyHash && !requireKeys()) {
        req.deviceAuth = 'legacy';
        return next();
      }

      return deny(res, 401, 'DEVICE_AUTH_REQUIRED', 'This endpoint needs the device key or a signed-in user.');
    } catch (err) {
      console.error('[DEVICE AUTH] error:', err);
      return deny(res, 500, 'SERVER_ERROR', 'Could not check access.');
    }
  };
