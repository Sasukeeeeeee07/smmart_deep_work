"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.voiceService = void 0;
const googleTTS = __importStar(require("google-tts-api"));
// In-memory queue: deviceUid -> array of audio URLs
const audioQueues = {};
exports.voiceService = {
    /**
     * Generates TTS URL and queues it for the device
     */
    queueMessage: (uid, text) => {
        try {
            // Generate a TTS URL using Google's free TTS API
            const url = googleTTS.getAudioUrl(text, {
                lang: 'en',
                slow: false,
                host: 'https://translate.google.com',
            });
            if (!audioQueues[uid]) {
                audioQueues[uid] = [];
            }
            audioQueues[uid].push(url);
            console.log(`[VOICE] Queued message for ${uid}: "${text}"`);
        }
        catch (error) {
            console.error('[VOICE] Error generating TTS:', error);
        }
    },
    /**
     * Gets the next pending audio URL for the device and removes it from the queue
     */
    getNextMessage: (uid) => {
        if (!audioQueues[uid] || audioQueues[uid].length === 0) {
            return null;
        }
        return audioQueues[uid].shift() || null;
    }
};
