"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const voiceService_1 = require("../services/voiceService");
const deviceAuth_1 = require("../middleware/deviceAuth");
const router = (0, express_1.Router)();
// GET /api/voice/:uid/next
// ESP32 polls this to check if there is an audio message to play (device only: it consumes the queue)
router.get('/:uid/next', (0, deviceAuth_1.deviceAccess)('device'), (req, res) => {
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
// Make the desk speak: an Admin/Manager or the desk's own employee (never anonymous)
router.post('/:uid/speak', (0, deviceAuth_1.deviceAccess)('write'), (req, res) => {
    const { text } = req.body;
    if (!text) {
        return res.status(400).json({ success: false, error: 'Text is required' });
    }
    voiceService_1.voiceService.queueMessage(req.params.uid, text);
    res.json({ success: true, message: 'Queued to speak' });
});
exports.default = router;
