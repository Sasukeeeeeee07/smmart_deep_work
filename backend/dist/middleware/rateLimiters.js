"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalApiLimiter = exports.voiceRateLimiter = exports.authRateLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
/**
 * Strict limiter for authentication endpoints (Login & Admin Setup)
 * Blocks brute-force credential stuffing and dictionary attacks.
 * Limit: 10 failed/success attempts per 15 minutes per IP.
 */
exports.authRateLimiter = (0, express_rate_limit_1.default)({
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
    handler: (_req, res) => {
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
exports.voiceRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 minute
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
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
exports.globalApiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 minute
    max: 150,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Never throttle health check or status ping
        return req.path === '/api/health' || req.path === '/health';
    },
    handler: (_req, res) => {
        res.status(429).json({
            success: false,
            error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Too many API requests from this source. Please slow down.',
            },
        });
    },
});
