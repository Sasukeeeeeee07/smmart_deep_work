import { Router, Request, Response } from 'express';
import { voiceService } from '../services/voiceService';

const router = Router();

// GET /api/voice/:uid/next
// ESP32 polls this to check if there is an audio message to play
router.get('/:uid/next', (req: Request, res: Response) => {
  const uid = req.params.uid;
  const audioUrl = voiceService.getNextMessage(uid);
  
  if (audioUrl) {
    res.json({ success: true, hasMessage: true, audioUrl });
  } else {
    res.json({ success: true, hasMessage: false });
  }
});

// POST /api/voice/:uid/speak
// Manual endpoint to test making the desk speak
router.post('/:uid/speak', (req: Request, res: Response) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ success: false, error: 'Text is required' });
  }
  
  voiceService.queueMessage(req.params.uid, text);
  res.json({ success: true, message: 'Queued to speak' });
});

export default router;
