import express from 'express';
import { loginUser, registerAdmin } from '../controllers/authController';

const router = express.Router();

router.post('/login', loginUser);
router.post('/register-admin', registerAdmin);

export default router;
