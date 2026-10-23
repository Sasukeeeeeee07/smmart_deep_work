import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import authRoutes from './routes/authRoutes';
import employeeRoutes from './routes/employeeRoutes';
import deviceRoutes from './routes/deviceRoutes';
import taskRoutes from './routes/taskRoutes';
import notificationRoutes from './routes/notificationRoutes';
import sessionRoutes from './routes/sessionRoutes';
import userRoutes from './routes/userRoutes';
import voiceRoutes from './routes/voiceRoutes';
import { globalApiLimiter, authRateLimiter, voiceRateLimiter } from './middleware/rateLimiters';

const app = express();

// Set trust proxy so rate limiters and loggers read the actual client IP when behind Render/Cloudflare
app.set('trust proxy', 1);

// HTTP Security Headers (prevents XSS, Clickjacking, MIME-sniffing, etc.)
app.use(
  helmet({
    contentSecurityPolicy: false, // Keep false to allow external TTS audio streaming
    crossOriginEmbedderPolicy: false,
  })
);

// CORS Policy
app.use(cors());

// Strict body size limit to prevent memory exhaustion / DoS attacks
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Global DDoS and Bot protection limiter across all API endpoints
app.use('/api', globalApiLimiter);

// Routes with specialized protection
app.use('/api/auth', authRateLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/voice', voiceRateLimiter, voiceRoutes);

// API Health Check
app.get('/api/health', (req: Request, res: Response) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
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

export default app;
