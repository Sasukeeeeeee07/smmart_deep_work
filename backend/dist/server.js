"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const db_1 = require("./config/db");
const os_1 = __importDefault(require("os"));
const User_1 = require("./models/User");
const bcrypt_1 = __importDefault(require("bcrypt"));
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
    // Seed initial admin if empty
    if ((await User_1.User.countDocuments()) === 0) {
        const salt = await bcrypt_1.default.genSalt(10);
        const passwordHash = await bcrypt_1.default.hash('admin123', salt);
        await User_1.User.create({
            name: 'Super Admin',
            email: 'admin@smmart.com',
            passwordHash,
            role: User_1.Role.ADMIN
        });
        console.log('Seeded default admin user: admin@smmart.com / admin123');
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
