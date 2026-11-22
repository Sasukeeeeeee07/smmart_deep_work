"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const employeeRoutes_1 = __importDefault(require("./routes/employeeRoutes"));
const deviceRoutes_1 = __importDefault(require("./routes/deviceRoutes"));
const taskRoutes_1 = __importDefault(require("./routes/taskRoutes"));
const notificationRoutes_1 = __importDefault(require("./routes/notificationRoutes"));
const sessionRoutes_1 = __importDefault(require("./routes/sessionRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const penaltyRoutes_1 = __importDefault(require("./routes/penaltyRoutes"));
const voiceRoutes_1 = __importDefault(require("./routes/voiceRoutes"));
const faceRoutes_1 = __importDefault(require("./routes/faceRoutes"));
const rateLimiters_1 = require("./middleware/rateLimiters");
const app = (0, express_1.default)();
// Set trust proxy so rate limiters and loggers read the actual client IP when behind Render/Cloudflare
app.set('trust proxy', 1);
// HTTP Security Headers (prevents XSS, Clickjacking, MIME-sniffing, etc.)
app.use((0, helmet_1.default)({
    contentSecurityPolicy: false, // Keep false to allow external TTS audio streaming
    crossOriginEmbedderPolicy: false,
}));
// CORS Policy
app.use((0, cors_1.default)());
// Strict body size limit to prevent memory exhaustion / DoS attacks.
// Face routes carry photos and set their own (still bounded) limits in faceRoutes.
const jsonParser = express_1.default.json({ limit: '100kb' });
const formParser = express_1.default.urlencoded({ extended: true, limit: '100kb' });
app.use((req, res, next) => (req.path.startsWith('/api/faces') ? next() : jsonParser(req, res, next)));
app.use((req, res, next) => (req.path.startsWith('/api/faces') ? next() : formParser(req, res, next)));
// Global DDoS and Bot protection limiter across all API endpoints
app.use('/api', rateLimiters_1.globalApiLimiter);
// Routes with specialized protection
app.use('/api/auth', rateLimiters_1.authRateLimiter, authRoutes_1.default);
app.use('/api/users', userRoutes_1.default);
app.use('/api/employees', employeeRoutes_1.default);
app.use('/api/devices', deviceRoutes_1.default);
app.use('/api/tasks', taskRoutes_1.default);
app.use('/api/notifications', notificationRoutes_1.default);
app.use('/api/sessions', sessionRoutes_1.default);
app.use('/api/penalties', penaltyRoutes_1.default);
app.use('/api/voice', rateLimiters_1.voiceRateLimiter, voiceRoutes_1.default);
app.use('/api/faces', faceRoutes_1.default);
// API Health Check
app.get('/api/health', (req, res) => {
    const dbStatus = mongoose_1.default.connection.readyState === 1 ? 'connected' : 'disconnected';
    res.json({
        success: true,
        data: {
            status: 'UP',
            database: dbStatus,
            timestamp: new Date().toISOString()
        }
    });
});
// Handle 404
app.use((req, res) => {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
});
exports.default = app;
