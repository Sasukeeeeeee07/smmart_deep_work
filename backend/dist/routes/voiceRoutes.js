"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const voiceService_1 = require("../services/voiceService");
const router = (0, express_1.Router)();
// GET /api/voice/:uid/next
// ESP32 polls this to check if there is an audio message to play
router.get('/:uid/next', (req, res) => {
    const uid = req.params.uid;
    const audioUrl = voiceService_1.voiceService.getNextMessage(uid);
    if (audioUrl) {
        res.json({ success: true, hasMessage: true, audioUrl });
    }
    else {
        res.json({ success: true, hasMessage: false });
    }
});
// POST /api/voice/:uid/speak
// Manual endpoint to test making the desk speak
router.post('/:uid/speak', (req, res) => {
    const { text } = req.body;
    if (!text) {
        return res.status(400).json({ success: false, error: 'Text is required' });
    }
    voiceService_1.voiceService.queueMessage(req.params.uid, text);
    res.json({ success: true, message: 'Queued to speak' });
});
exports.default = router;
