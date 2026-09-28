import mongoose, { Document, Schema } from 'mongoose';
import { TaskStatus } from './Task';

export interface ITaskHistory extends Document {
  task: mongoose.Types.ObjectId;
  changedBy: mongoose.Types.ObjectId;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  note?: string;
}

const TaskHistorySchema: Schema = new Schema<ITaskHistory>(
  {
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fromStatus: { type: String, enum: Object.values(TaskStatus), required: true },
    toStatus: { type: String, enum: Object.values(TaskStatus), required: true },
    note: { type: String, trim: true },
  },
  { timestamps: true }
);

TaskHistorySchema.index({ task: 1, createdAt: -1 });

export const TaskHistory = mongoose.model<ITaskHistory>('TaskHistory', TaskHistorySchema);
