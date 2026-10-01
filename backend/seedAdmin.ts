import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const MONGO_URI = 'mongodb+srv://technical_db_user:C0pcZuuDnq1ueZMq@cluster0.1yfpck7.mongodb.net/?appName=Cluster0';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['ADMIN', 'MANAGER', 'EMPLOYEE'], default: 'EMPLOYEE' }
});

const User = mongoose.model('User', userSchema);

async function seed() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to Atlas DB');

    const exists = await User.findOne({ email: 'admin@smmart.com' });
    if (exists) {
      console.log('Admin already exists!');
      process.exit(0);
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('admin123', salt);

    await User.create({
      name: 'Super Admin',
      email: 'admin@smmart.com',
      passwordHash,
      role: 'ADMIN'
    });

    console.log('Admin created successfully! Email: admin@smmart.com | Password: admin123');
  } catch (error) {
    console.error('Error seeding admin:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seed();
