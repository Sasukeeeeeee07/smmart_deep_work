import app from './app';
import { connectDB } from './config/db';
import os from 'os';
import { User, Role } from './models/User';
import bcrypt from 'bcrypt';
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
  
  // Seed initial admin if empty
  if ((await User.countDocuments()) === 0) {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('admin123', salt);
    await User.create({
      name: 'Super Admin',
      email: 'admin@smmart.com',
      passwordHash,
      role: Role.ADMIN
    });
    console.log('Seeded default admin user: admin@smmart.com / admin123');
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

