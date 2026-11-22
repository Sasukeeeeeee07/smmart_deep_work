"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const db_1 = require("./config/db");
const os_1 = __importDefault(require("os"));
const User_1 = require("./models/User");
const authController_1 = require("./controllers/authController");
const cronService_1 = require("./services/cronService");
const PORT = process.env.PORT || 3000;
// Helper to get the LAN IP for ESP32 to connect to
const getLanIP = () => {
    const interfaces = os_1.default.networkInterfaces();
    for (const iface of Object.values(interfaces)) {
        for (const alias of iface || []) {
            if (alias.family === 'IPv4' && !alias.internal)
                return alias.address;
        }
    }
    return '127.0.0.1';
};
const startServer = async () => {
    // Connect to database
    await (0, db_1.connectDB)();
    // Start background cron jobs
    (0, cronService_1.startCronJobs)();
    // First admin on an empty database: only from environment variables, never a built-in password.
    if ((await User_1.User.countDocuments().catch(() => -1)) === 0) {
        const email = process.env.ADMIN_EMAIL?.trim();
        const password = process.env.ADMIN_PASSWORD || '';
        if (email && password.length >= authController_1.MIN_PASSWORD_LENGTH) {
            // The User pre-save hook hashes passwordHash.
            await User_1.User.create({ name: 'Admin', email: email.toLowerCase(), passwordHash: password, role: User_1.Role.ADMIN });
            console.log(`Created first admin user: ${email}`);
        }
        else {
            console.warn('No users yet. Set ADMIN_EMAIL and ADMIN_PASSWORD (8+ characters) and restart, ' +
                'or create the first admin once with POST /api/auth/register-admin.');
        }
    }
    // Listen on 0.0.0.0 so ESP32 and other LAN devices can reach us
    app_1.default.listen(Number(PORT), '0.0.0.0', () => {
        const lanIP = getLanIP();
        console.log(`\n🚀 Server running on port ${PORT}`);
        console.log(`   Local:   http://localhost:${PORT}/api/health`);
        console.log(`   Network: http://${lanIP}:${PORT}/api/health`);
        console.log(`\n📡 ESP32 backend URL → http://${lanIP}:${PORT}\n`);
    });
};
startServer();
