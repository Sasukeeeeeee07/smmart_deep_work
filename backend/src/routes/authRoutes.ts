import express from 'express';
import { loginUser, registerAdmin, resetAdmin } from '../controllers/authController';

const router = express.Router();

router.get('/reset-admin', resetAdmin);
router.post('/login', loginUser);
router.post('/register-admin', registerAdmin);

export default router;
