"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deviceAccess = exports.hashDeviceKey = void 0;
const crypto_1 = __importDefault(require("crypto"));
const Device_1 = require("../models/Device");
const Employee_1 = require("../models/Employee");
const User_1 = require("../models/User");
const auth_1 = require("./auth");
/**
 * When true, devices without a key are refused. Leave it off while devices are being re-flashed
 * with their keys, then turn it on so a desk can only be reached with its key or a signed-in user.
 */
const requireKeys = () => process.env.REQUIRE_DEVICE_KEYS === 'true';
const hashDeviceKey = (key) => crypto_1.default.createHash('sha256').update(key).digest('hex');
exports.hashDeviceKey = hashDeviceKey;
function sameHash(a, b) {
    const ab = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    return ab.length === bb.length && crypto_1.default.timingSafeEqual(ab, bb);
}
const deny = (res, status, code, message) => res.status(status).json({ success: false, error: code, message });
const deviceAccess = (access, options = {}) => async (req, res, next) => {
    try {
        const uid = req.params.uid;
        const device = await Device_1.Device.findOne({ uid }).select('+keyHash');
        const presentedKey = req.header('x-device-key');
        // 1. The device, proving itself with its key.
        if (presentedKey) {
            if (device?.keyHash && sameHash((0, exports.hashDeviceKey)(presentedKey), device.keyHash)) {
                req.deviceAuth = 'key';
                return next();
            }
            return deny(res, 401, 'INVALID_DEVICE_KEY', 'Device key is not valid for this device.');
        }
        // 2. A signed-in user (the dashboard).
        if (access !== 'device' && req.headers.authorization) {
            const user = await (0, auth_1.userFromRequest)(req);
            if (!user)
                return deny(res, 401, 'UNAUTHORIZED', 'Sign in again.');
            req.user = user;
            if (access === 'read' || user.role === User_1.Role.ADMIN || user.role === User_1.Role.MANAGER)
                return next();
            // 'write' by an employee: only on their own desk.
            const owner = device?.assignedTo ? await Employee_1.Employee.findById(device.assignedTo, { user: 1 }).lean() : null;
            if (owner?.user && String(owner.user) === String(user._id))
                return next();
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
    }
    catch (err) {
        console.error('[DEVICE AUTH] error:', err);
        return deny(res, 500, 'SERVER_ERROR', 'Could not check access.');
    }
};
exports.deviceAccess = deviceAccess;
