import { Request, Response } from 'express';
import { Notification, NotificationType } from '../models/Notification';

// ─── Internal utility (not a route handler) ──────────────────────────────────
// Call this from other controllers to emit a notification.
export const createNotificationInternal = async (params: {
  type: NotificationType;
  title: string;
  message: string;
  targetUser?: string;
  relatedId?: string;
}) => {
  try {
    await Notification.create(params);
  } catch (err) {
    console.error('[NOTIFICATION] Failed to create notification:', err);
  }
};

// @desc    Get all notifications for the current user (or broadcast)
// @route   GET /api/notifications
// @access  Private
export const getNotifications = async (req: Request, res: Response) => {
  try {
    const query = {
      $or: [
        { targetUser: req.user!._id },
        { targetUser: { $exists: false } },
        { targetUser: null },
      ],
    };

    const [notifications, unreadCount] = await Promise.all([
      Notification.find(query).sort({ createdAt: -1 }).limit(50),
      Notification.countDocuments({ ...query, isRead: false }),
    ]);

    res.json({ success: true, data: { notifications, unreadCount } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch notifications' } });
  }
};

// @desc    Mark a single notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private
export const markAsRead = async (req: Request, res: Response) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Notification not found' } });
    }

    res.json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to mark as read' } });
  }
};

// @desc    Mark ALL notifications as read for current user
// @route   PATCH /api/notifications/read-all
// @access  Private
export const markAllRead = async (req: Request, res: Response) => {
  try {
    await Notification.updateMany(
      {
        $or: [
          { targetUser: req.user!._id },
          { targetUser: { $exists: false } },
          { targetUser: null },
        ],
        isRead: false,
      },
      { isRead: true }
    );

    res.json({ success: true, data: { message: 'All notifications marked as read' } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to mark all as read' } });
  }
};

// @desc    Delete a notification
// @route   DELETE /api/notifications/:id
// @access  Private
export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const notification = await Notification.findByIdAndDelete(req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Notification not found' } });
    }
    res.json({ success: true, data: {} });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to delete notification' } });
  }
};

// @desc    Get unread count only (for badge polling)
// @route   GET /api/notifications/unread-count
// @access  Private
export const getUnreadCount = async (req: Request, res: Response) => {
  try {
    const count = await Notification.countDocuments({
      $or: [
        { targetUser: req.user!._id },
        { targetUser: { $exists: false } },
        { targetUser: null },
      ],
      isRead: false,
    });
    res.json({ success: true, data: { count } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to get unread count' } });
  }
};
