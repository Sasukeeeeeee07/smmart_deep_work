import app from './app';
import { connectDB } from './config/db';
import os from 'os';
import { User, Role } from './models/User';
import { MIN_PASSWORD_LENGTH } from './controllers/authController';
import { startCronJobs } from './services/cronService';

const PORT = process.env.PORT || 3000;

// Helper to get the LAN IP for ESP32 to connect to
const getLanIP = (): string => {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const alias of iface || []) {
      if (alias.family === 'IPv4' && !alias.internal) return alias.address;
    }
  }
  return '127.0.0.1';
};

const startServer = async () => {
  // Connect to database
  await connectDB();
  
  // Start background cron jobs
  startCronJobs();
  
  // First admin on an empty database: only from environment variables, never a built-in password.
  if ((await User.countDocuments().catch(() => -1)) === 0) {
    const email = process.env.ADMIN_EMAIL?.trim();
    const password = process.env.ADMIN_PASSWORD || '';
    if (email && password.length >= MIN_PASSWORD_LENGTH) {
      // The User pre-save hook hashes passwordHash.
      await User.create({ name: 'Admin', email: email.toLowerCase(), passwordHash: password, role: Role.ADMIN });
      console.log(`Created first admin user: ${email}`);
    } else {
      console.warn(
        'No users yet. Set ADMIN_EMAIL and ADMIN_PASSWORD (8+ characters) and restart, ' +
        'or create the first admin once with POST /api/auth/register-admin.'
      );
    }
  }

  // Listen on 0.0.0.0 so ESP32 and other LAN devices can reach us
  app.listen(Number(PORT), '0.0.0.0', () => {
    const lanIP = getLanIP();
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`   Local:   http://localhost:${PORT}/api/health`);
    console.log(`   Network: http://${lanIP}:${PORT}/api/health`);
    console.log(`\n📡 ESP32 backend URL → http://${lanIP}:${PORT}\n`);
  });
};

startServer();

