import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Strict limiter for authentication endpoints (Login & Admin Setup)
 * Blocks brute-force credential stuffing and dictionary attacks.
 * Limit: 10 failed/success attempts per 15 minutes per IP.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 attempts per window
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many authentication attempts from this IP. Please try again after 15 minutes.',
    },
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Security Alert: Too many login attempts. Please wait 15 minutes before trying again.',
      },
    });
  },
});

/**
 * Rate limiter for voice commands and acoustic speaker playback.
 * Protects Google TTS API limits and prevents desk speaker audio flooding.
 * Limit: 15 voice commands per minute per IP.
 */
export const voiceRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'VOICE_RATE_LIMIT_EXCEEDED',
        message: 'Too many voice commands issued in a short period. Please wait a moment.',
      },
    });
  },
});

/**
 * Global API rate limiter for general endpoints.
 * Protects against DDoS attacks, automated scrapers, and bot storms.
 * Allows plenty of headroom for normal web client polling (2s intervals) and ESP32 telemetry.
 * Limit: 150 requests per minute per IP.
 */
export const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => {
    // Never throttle health check or status ping
    return req.path === '/api/health' || req.path === '/health';
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many API requests from this source. Please slow down.',
      },
    });
  },
});
