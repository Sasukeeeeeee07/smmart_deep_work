import express from 'express';
import { registerUser, getUsers } from '../controllers/userController';
import { protect, authorize } from '../middleware/auth';

const router = express.Router();

router.route('/')
  .post(protect, authorize('ADMIN', 'MANAGER'), registerUser)
  .get(protect, authorize('ADMIN', 'MANAGER'), getUsers);

export default router;
