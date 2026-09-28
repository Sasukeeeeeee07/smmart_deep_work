import express from 'express';
import {
  getNotifications,
  markAsRead,
  markAllRead,
  deleteNotification,
  getUnreadCount,
} from '../controllers/notificationController';
import { protect } from '../middleware/auth';

const router = express.Router();

// All routes require authentication
router.use(protect);

router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/read-all', markAllRead);
router.patch('/:id/read', markAsRead);
router.delete('/:id', deleteNotification);

export default router;
