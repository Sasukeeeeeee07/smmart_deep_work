"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUnreadCount = exports.deleteNotification = exports.markAllRead = exports.markAsRead = exports.getNotifications = exports.createNotificationInternal = void 0;
const Notification_1 = require("../models/Notification");
// ─── Internal utility (not a route handler) ──────────────────────────────────
// Call this from other controllers to emit a notification.
const createNotificationInternal = async (params) => {
    try {
        await Notification_1.Notification.create(params);
    }
    catch (err) {
        console.error('[NOTIFICATION] Failed to create notification:', err);
    }
};
exports.createNotificationInternal = createNotificationInternal;
// @desc    Get all notifications for the current user (or broadcast)
// @route   GET /api/notifications
// @access  Private
const getNotifications = async (req, res) => {
    try {
        const query = {
            $or: [
                { targetUser: req.user._id },
                { targetUser: { $exists: false } },
                { targetUser: null },
            ],
        };
        const [notifications, unreadCount] = await Promise.all([
            Notification_1.Notification.find(query).sort({ createdAt: -1 }).limit(50),
            Notification_1.Notification.countDocuments({ ...query, isRead: false }),
        ]);
        res.json({ success: true, data: { notifications, unreadCount } });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch notifications' } });
    }
};
exports.getNotifications = getNotifications;
// @desc    Mark a single notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private
const markAsRead = async (req, res) => {
    try {
        const notification = await Notification_1.Notification.findByIdAndUpdate(req.params.id, { isRead: true }, { new: true });
        if (!notification) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Notification not found' } });
        }
        res.json({ success: true, data: notification });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to mark as read' } });
    }
};
exports.markAsRead = markAsRead;
// @desc    Mark ALL notifications as read for current user
// @route   PATCH /api/notifications/read-all
// @access  Private
const markAllRead = async (req, res) => {
    try {
        await Notification_1.Notification.updateMany({
            $or: [
                { targetUser: req.user._id },
                { targetUser: { $exists: false } },
                { targetUser: null },
            ],
            isRead: false,
        }, { isRead: true });
        res.json({ success: true, data: { message: 'All notifications marked as read' } });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to mark all as read' } });
    }
};
exports.markAllRead = markAllRead;
// @desc    Delete a notification
// @route   DELETE /api/notifications/:id
// @access  Private
const deleteNotification = async (req, res) => {
    try {
        const notification = await Notification_1.Notification.findByIdAndDelete(req.params.id);
        if (!notification) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Notification not found' } });
        }
        res.json({ success: true, data: {} });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to delete notification' } });
    }
};
exports.deleteNotification = deleteNotification;
// @desc    Get unread count only (for badge polling)
// @route   GET /api/notifications/unread-count
// @access  Private
const getUnreadCount = async (req, res) => {
    try {
        const count = await Notification_1.Notification.countDocuments({
            $or: [
                { targetUser: req.user._id },
                { targetUser: { $exists: false } },
                { targetUser: null },
            ],
            isRead: false,
        });
        res.json({ success: true, data: { count } });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to get unread count' } });
    }
};
exports.getUnreadCount = getUnreadCount;
