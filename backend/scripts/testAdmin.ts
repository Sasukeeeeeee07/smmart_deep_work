/**
 * Lists the users in the database (name, email, role) to check the connection.
 *
 *   MONGODB_URI=... npx tsx scripts/testAdmin.ts
 *
 * Password hashes are never printed.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../src/models/User';

dotenv.config();

async function test() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Set MONGODB_URI (in the environment or backend/.env).');
  await mongoose.connect(uri);
  try {
    const users = await User.find({}, { name: 1, email: 1, role: 1, isActive: 1 }).lean();
    console.log(`User count: ${users.length}`);
    for (const u of users) console.log(`- ${u.email}  ${u.role}${u.isActive === false ? '  (inactive)' : ''}`);
  } finally {
    await mongoose.disconnect();
  }
}

test().catch(err => {
  console.error(err.message);
  process.exit(1);
});
