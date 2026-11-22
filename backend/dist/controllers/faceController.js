"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyFromDevice = exports.getDeviceFaceCheck = exports.updateDeviceFaceSettings = exports.deleteFace = exports.enrollFace = exports.getFaceStatus = exports.listFaceStatus = exports.FACE_CHECK_REQUEST_MS = exports.FACE_VERIFY_VALID_MS = void 0;
const Employee_1 = require("../models/Employee");
const Device_1 = require("../models/Device");
const FaceProfile_1 = require("../models/FaceProfile");
const User_1 = require("../models/User");
const Notification_1 = require("../models/Notification");
const notificationController_1 = require("./notificationController");
const voiceService_1 = require("../services/voiceService");
const faceService_1 = require("../services/face/faceService");
const MIN_ENROLL_PHOTOS = 3;
const MAX_ENROLL_PHOTOS = 8;
/** Enrolment photos must agree with each other at least this well to be accepted as one person. */
const ENROLL_CONSISTENCY_MAX = 0.6;
/** A successful match lets a session start within this window. */
exports.FACE_VERIFY_VALID_MS = 2 * 60 * 1000;
/** How long a web "start" waits for the device to take its check photo. */
exports.FACE_CHECK_REQUEST_MS = 30 * 1000;
/** At most one "unrecognised person" notification per device in this window. */
const MISMATCH_ALERT_COOLDOWN_MS = 10 * 60 * 1000;
const DEVICE_MESSAGES = {
    MATCH: 'Face confirmed',
    MISMATCH: 'Face not recognised',
    NO_FACE: 'No face seen - look at the camera',
    NOT_ENROLLED: 'Face ID not set up - enrol on the dashboard',
    ERROR: 'Face check failed - try again',
};
const isLeader = (req) => req.user?.role === User_1.Role.ADMIN || req.user?.role === User_1.Role.MANAGER;
/** Resolves ':employeeId' ('me' = the signed-in user's employee record) and checks the caller may act on it. */
async function resolveEmployee(req, res) {
    const param = req.params.employeeId;
    const employee = param === 'me'
        ? await Employee_1.Employee.findOne({ user: req.user._id })
        : await Employee_1.Employee.findById(param).catch(() => null);
    if (!employee) {
        res.status(404).json({ success: false, error: 'EMPLOYEE_NOT_FOUND', message: 'No employee record found.' });
        return null;
    }
    const isSelf = employee.user && String(employee.user) === String(req.user._id);
    if (!isSelf && !isLeader(req)) {
        res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'You can only manage your own Face ID.' });
        return null;
    }
    return employee;
}
/** Accepts a data URL ("data:image/jpeg;base64,...") or bare base64 and returns the JPEG bytes. */
function decodeImage(input) {
    if (typeof input !== 'string')
        return null;
    const base64 = input.startsWith('data:') ? input.slice(input.indexOf(',') + 1) : input;
    const buf = Buffer.from(base64, 'base64');
    // JPEG files start with FF D8 FF.
    if (buf.length < 100 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff)
        return null;
    return buf;
}
// GET /api/faces/status  (admin/manager) — who has Face ID set up
const listFaceStatus = async (_req, res) => {
    const profiles = await FaceProfile_1.FaceProfile.find({}, { employeeId: 1, descriptors: 1, updatedAt: 1 }).lean();
    res.json({
        success: true,
        data: profiles.map(p => ({ employeeId: p.employeeId, sampleCount: p.descriptors.length, updatedAt: p.updatedAt })),
    });
};
exports.listFaceStatus = listFaceStatus;
// GET /api/faces/:employeeId/status
const getFaceStatus = async (req, res) => {
    const employee = await resolveEmployee(req, res);
    if (!employee)
        return;
    const profile = await FaceProfile_1.FaceProfile.findOne({ employeeId: employee._id }).lean();
    res.json({
        success: true,
        data: {
            employeeId: employee._id,
            enrolled: Boolean(profile),
            sampleCount: profile?.descriptors.length || 0,
            updatedAt: profile?.updatedAt || null,
        },
    });
};
exports.getFaceStatus = getFaceStatus;
// POST /api/faces/:employeeId/enroll   body: { images: string[] (JPEG data URLs), consent: true }
const enrollFace = async (req, res) => {
    const employee = await resolveEmployee(req, res);
    if (!employee)
        return;
    const { images, consent } = req.body;
    if (consent !== true) {
        return res.status(400).json({ success: false, error: 'CONSENT_REQUIRED', message: 'Consent is required to set up Face ID.' });
    }
    if (!Array.isArray(images) || images.length < MIN_ENROLL_PHOTOS || images.length > MAX_ENROLL_PHOTOS) {
        return res.status(400).json({
            success: false, error: 'BAD_PHOTOS',
            message: `Send between ${MIN_ENROLL_PHOTOS} and ${MAX_ENROLL_PHOTOS} photos.`,
        });
    }
    const descriptors = [];
    for (let i = 0; i < images.length; i++) {
        const jpeg = decodeImage(images[i]);
        if (!jpeg) {
            return res.status(400).json({ success: false, error: 'BAD_PHOTOS', message: `Photo ${i + 1} is not a JPEG image.` });
        }
        let faces;
        try {
            ({ faces } = await (0, faceService_1.detectFaces)(jpeg));
        }
        catch (err) {
            console.error('[FACE] enrol detect error:', err);
            return res.status(503).json({ success: false, error: 'FACE_ENGINE_ERROR', message: 'Face engine is unavailable. Try again shortly.' });
        }
        if (faces.length === 0) {
            return res.status(422).json({ success: false, error: 'NO_FACE', message: `No face found in photo ${i + 1}. Face the camera in good light.` });
        }
        if (faces.length > 1) {
            return res.status(422).json({ success: false, error: 'MULTIPLE_FACES', message: `Photo ${i + 1} has more than one face. Only the employee should be in frame.` });
        }
        descriptors.push(faces[0].descriptor);
    }
    // Every photo must look like the same person as the others.
    for (let i = 0; i < descriptors.length; i++) {
        const others = descriptors.filter((_, j) => j !== i);
        const avg = others.reduce((s, d) => s + (0, faceService_1.faceDistance)(descriptors[i], d), 0) / others.length;
        if (avg > ENROLL_CONSISTENCY_MAX) {
            return res.status(422).json({
                success: false, error: 'INCONSISTENT_PHOTOS',
                message: `Photo ${i + 1} does not look like the same person as the others. Retake the photos.`,
            });
        }
    }
    await FaceProfile_1.FaceProfile.findOneAndUpdate({ employeeId: employee._id }, { employeeId: employee._id, descriptors, consentAt: new Date(), enrolledBy: req.user._id }, { upsert: true, new: true, runValidators: true });
    console.log(`[FACE] Enrolled ${descriptors.length} templates for employee ${employee._id}`);
    res.json({ success: true, data: { enrolled: true, sampleCount: descriptors.length } });
};
exports.enrollFace = enrollFace;
// DELETE /api/faces/:employeeId
const deleteFace = async (req, res) => {
    const employee = await resolveEmployee(req, res);
    if (!employee)
        return;
    await FaceProfile_1.FaceProfile.deleteOne({ employeeId: employee._id });
    console.log(`[FACE] Deleted Face ID for employee ${employee._id}`);
    res.json({ success: true, data: { enrolled: false } });
};
exports.deleteFace = deleteFace;
// PATCH /api/faces/device/:uid/settings   body: { required: boolean }  (admin/manager)
const updateDeviceFaceSettings = async (req, res) => {
    const { required } = req.body;
    if (typeof required !== 'boolean') {
        return res.status(400).json({ success: false, error: 'BAD_REQUEST', message: '"required" must be true or false.' });
    }
    const device = await Device_1.Device.findOneAndUpdate({ uid: req.params.uid }, { $set: { 'faceVerification.required': required, 'faceVerification.verifiedAt': null, 'faceVerification.checkRequestedAt': null } }, { new: true });
    if (!device)
        return res.status(404).json({ success: false, error: 'DEVICE_NOT_FOUND', message: 'Device not found.' });
    res.json({ success: true, data: { required: device.faceVerification.required } });
};
exports.updateDeviceFaceSettings = updateDeviceFaceSettings;
// GET /api/faces/device/:uid/check   — the web polls this while waiting for the device's check photo
const getDeviceFaceCheck = async (req, res) => {
    const device = await Device_1.Device.findOne({ uid: req.params.uid }).lean();
    if (!device)
        return res.status(404).json({ success: false, error: 'DEVICE_NOT_FOUND', message: 'Device not found.' });
    const fv = device.faceVerification || {};
    res.json({
        success: true,
        data: {
            required: Boolean(fv.required),
            checkRequestedAt: fv.checkRequestedAt || null,
            lastResult: fv.lastResult || null,
            lastCheckedAt: fv.lastCheckedAt || null,
            message: fv.lastResult ? DEVICE_MESSAGES[fv.lastResult] : null,
        },
    });
};
exports.getDeviceFaceCheck = getDeviceFaceCheck;
// POST /api/faces/device/:uid/verify   body: raw JPEG (Content-Type: image/jpeg) — called by the ESP32
const verifyFromDevice = async (req, res) => {
    const device = await Device_1.Device.findOne({ uid: req.params.uid });
    if (!device || !device.assignedTo) {
        return res.status(404).json({ success: false, error: 'DEVICE_NOT_FOUND', message: 'Device or assigned employee not found.' });
    }
    const record = async (result, distance) => {
        const now = new Date();
        device.faceVerification.lastResult = result;
        device.faceVerification.lastCheckedAt = now;
        if (result === 'MATCH') {
            device.faceVerification.verifiedAt = now;
            device.faceVerification.verifiedEmployee = device.assignedTo;
        }
        await device.save();
        console.log(`[FACE] ${device.uid}: ${result}${distance !== undefined ? ` (distance ${distance.toFixed(3)})` : ''}`);
        res.json({
            success: true,
            data: { result, message: DEVICE_MESSAGES[result], distance: distance !== undefined ? Number(distance.toFixed(3)) : null },
        });
    };
    const jpeg = Buffer.isBuffer(req.body) ? req.body : null;
    if (!jpeg || jpeg.length < 100 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
        return res.status(400).json({ success: false, error: 'BAD_IMAGE', message: 'Send a JPEG with Content-Type: image/jpeg.' });
    }
    const profile = await FaceProfile_1.FaceProfile.findOne({ employeeId: device.assignedTo }).lean();
    if (!profile)
        return record('NOT_ENROLLED');
    let faces;
    try {
        ({ faces } = await (0, faceService_1.detectFaces)(jpeg));
    }
    catch (err) {
        console.error('[FACE] verify detect error:', err);
        return record('ERROR');
    }
    if (faces.length === 0)
        return record('NO_FACE');
    // Someone walking past in the background must not block the employee: the closest face decides.
    const distance = Math.min(...faces.map(f => (0, faceService_1.bestDistance)(f.descriptor, profile.descriptors)));
    if (distance <= faceService_1.MATCH_THRESHOLD)
        return record('MATCH', distance);
    // Unrecognised person: tell the employee and leadership (throttled), and say it out loud.
    const now = Date.now();
    const lastAlert = device.faceVerification.lastMismatchAlertAt?.getTime() || 0;
    if (now - lastAlert > MISMATCH_ALERT_COOLDOWN_MS) {
        device.faceVerification.lastMismatchAlertAt = new Date(now);
        const owner = await Employee_1.Employee.findById(device.assignedTo).lean();
        const name = owner ? `${owner.firstName} ${owner.lastName}` : 'the assigned employee';
        const message = `Someone who is not ${name} tried to start a Deep Work session on ${device.name}. The session was blocked.`;
        await (0, notificationController_1.createNotificationInternal)({ type: Notification_1.NotificationType.DEVICE, title: 'Unrecognised person at desk', message, relatedId: device.uid });
        if (owner?.user) {
            await (0, notificationController_1.createNotificationInternal)({
                type: Notification_1.NotificationType.DEVICE, title: 'Unrecognised person at your desk', message, targetUser: String(owner.user), relatedId: device.uid,
            });
        }
        voiceService_1.voiceService.queueMessage(device.uid, 'Face not recognised. Only the assigned person can start a session on this desk.');
    }
    return record('MISMATCH', distance);
};
exports.verifyFromDevice = verifyFromDevice;
