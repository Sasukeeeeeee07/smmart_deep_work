/**
 * Creates the first admin user.
 *
 *   MONGODB_URI=... ADMIN_EMAIL=you@company.com ADMIN_PASSWORD='a long password' npm run seed
 *
 * Values can also come from backend/.env. Nothing secret is stored in this file.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User, Role } from '../src/models/User';

dotenv.config();

async function seed() {
  const uri = process.env.MONGODB_URI;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';

  if (!uri) throw new Error('Set MONGODB_URI (in the environment or backend/.env).');
  if (!email || password.length < 8) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (8+ characters).');

  await mongoose.connect(uri);
  try {
    if (await User.findOne({ email })) {
      console.log(`A user with ${email} already exists. Nothing changed.`);
      return;
    }
    // The User pre-save hook hashes passwordHash.
    await User.create({ name: 'Admin', email, passwordHash: password, role: Role.ADMIN });
    console.log(`Admin created: ${email}`);
  } finally {
    await mongoose.disconnect();
  }
}

seed().catch(err => {
  console.error('Seeding failed:', err.message);
  process.exit(1);
});
