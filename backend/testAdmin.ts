import mongoose from 'mongoose';
import { User } from './src/models/User';

const MONGO_URI = 'mongodb+srv://technical_db_user:C0pcZuuDnq1ueZMq@cluster0.1yfpck7.mongodb.net/?appName=Cluster0';

async function test() {
  try {
    await mongoose.connect(MONGO_URI);
    const count = await User.countDocuments();
    const users = await User.find({});
    console.log(`User count: ${count}`);
    console.log(users);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

test();
