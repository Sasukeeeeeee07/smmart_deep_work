import express from 'express';
import {
  getTasks,
  getTask,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  getMissedTasks,
  addMissedTask,
} from '../controllers/taskController';
import { protect, authorize } from '../middleware/auth';

const router = express.Router();

// All task routes require authentication
router.use(protect);

// Routes accessible by all authenticated users (to read tasks)
router.get('/', getTasks);
router.get('/missed', getMissedTasks);   // must stay above '/:id'
router.post('/missed', addMissedTask);
router.get('/:id', getTask);
router.patch('/:id/status', updateTaskStatus);

// Admin/Manager only for create, edit, delete
router.post('/', authorize('ADMIN', 'MANAGER'), createTask);
router.put('/:id', authorize('ADMIN', 'MANAGER'), updateTask);
router.delete('/:id', authorize('ADMIN', 'MANAGER'), deleteTask);

export default router;
