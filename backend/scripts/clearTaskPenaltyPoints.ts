/**
 * One-off: removes the SDW penalty entries that were recorded for missed tasks
 * (SDWPoints documents with a taskId). Missed tasks no longer cost SDW points.
 *
 *   npx tsx scripts/clearTaskPenaltyPoints.ts           # dry run: only counts
 *   npx tsx scripts/clearTaskPenaltyPoints.ts --delete  # deletes them
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { SDWPoints } from '../src/models/SDWPoints';

dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/smmart deep work');
  const filter = { taskId: { $exists: true, $ne: null } };
  const docs = await SDWPoints.find(filter).select('points reason earnedAt');
  const total = docs.reduce((n, d) => n + d.points, 0);
  console.log(`Task penalty entries: ${docs.length}, total ${total} points`);
  docs.slice(0, 10).forEach(d => console.log(` ${d.points} | ${d.earnedAt.toISOString()} | ${d.reason}`));
  const otherNegative = await SDWPoints.countDocuments({ points: { $lt: 0 }, $or: [{ taskId: { $exists: false } }, { taskId: null }] });
  console.log(`Other negative entries (left alone): ${otherNegative}`);

  if (process.argv.includes('--delete')) {
    const r = await SDWPoints.deleteMany(filter);
    console.log(`Deleted ${r.deletedCount}`);
  } else {
    console.log('Dry run, nothing deleted.');
  }
  await mongoose.disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
