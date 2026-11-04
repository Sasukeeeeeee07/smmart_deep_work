import express from 'express';
import { getPenaltySummary } from '../controllers/penaltyController';
import { protect } from '../middleware/auth';

const router = express.Router();
router.use(protect);
router.get('/summary', getPenaltySummary);

export default router;
