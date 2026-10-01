import * as googleTTS from 'google-tts-api';

// In-memory queue: deviceUid -> array of audio URLs
const audioQueues: Record<string, string[]> = {};

export const voiceService = {
  /**
   * Generates TTS URL and queues it for the device
   */
  queueMessage: (uid: string, text: string) => {
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
    } catch (error) {
      console.error('[VOICE] Error generating TTS:', error);
    }
  },

  /**
   * Gets the next pending audio URL for the device and removes it from the queue
   */
  getNextMessage: (uid: string): string | null => {
    if (!audioQueues[uid] || audioQueues[uid].length === 0) {
      return null;
    }
    return audioQueues[uid].shift() || null;
  }
};
