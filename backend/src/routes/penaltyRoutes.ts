import express from 'express';
import { getPenaltySummary, getWastedTime, setWastedTime, importWastedTime } from '../controllers/penaltyController';
import { protect } from '../middleware/auth';

const router = express.Router();
router.use(protect);
router.get('/summary', getPenaltySummary);
router.get('/wasted', getWastedTime);
router.post('/wasted/import', importWastedTime);   // must stay above '/wasted/:date'
router.put('/wasted/:date', setWastedTime);

export default router;
