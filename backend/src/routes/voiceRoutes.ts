import { Router, Request, Response } from 'express';
import { voiceService } from '../services/voiceService';
import { deviceAccess } from '../middleware/deviceAuth';

const router = Router();

// GET /api/voice/:uid/next
// ESP32 polls this to check if there is an audio message to play (device only: it consumes the queue)
router.get('/:uid/next', deviceAccess('device'), (req: Request, res: Response) => {
  const uid = req.params.uid as string;
  const audioUrl = voiceService.getNextMessage(uid);
  
  if (audioUrl) {
    res.json({ success: true, hasMessage: true, audioUrl });
  } else {
    res.json({ success: true, hasMessage: false });
  }
});

// POST /api/voice/:uid/speak
// Make the desk speak: an Admin/Manager or the desk's own employee (never anonymous)
router.post('/:uid/speak', deviceAccess('write'), (req: Request, res: Response) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ success: false, error: 'Text is required' });
  }
  
  voiceService.queueMessage(req.params.uid as string, text);
  res.json({ success: true, message: 'Queued to speak' });
});

export default router;
