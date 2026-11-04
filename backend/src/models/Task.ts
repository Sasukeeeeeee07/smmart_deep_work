import mongoose, { Document, Schema } from 'mongoose';

export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export interface ITask extends Document {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedTo?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  dueDate?: Date;
  dueHasTime?: boolean;          // true when dueDate carries a time of day; otherwise the deadline is the end of that day
  deadlineAlertSent?: boolean;   // the 30-minutes-before alert has been raised
  missed: boolean;               // not done: overdue, or added by the user as "not done"
  missedAt?: Date;
  missedReason?: 'OVERDUE' | 'MANUAL';
  penaltyApplied: boolean;       // an SDW penalty was recorded for this miss
  penaltyPoints: number;
}

const TaskSchema: Schema = new Schema<ITask>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: {
      type: String,
      enum: Object.values(TaskStatus),
      default: TaskStatus.TODO,
    },
    priority: {
      type: String,
      enum: Object.values(TaskPriority),
      default: TaskPriority.MEDIUM,
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'Employee' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    dueDate: { type: Date },
    dueHasTime: { type: Boolean, default: false },
    deadlineAlertSent: { type: Boolean, default: false },
    missed: { type: Boolean, default: false },
    missedAt: { type: Date },
    missedReason: { type: String, enum: ['OVERDUE', 'MANUAL'] },
    penaltyApplied: { type: Boolean, default: false },
    penaltyPoints: { type: Number, default: 0 },
  },
  { timestamps: true }
);

TaskSchema.index({ status: 1, priority: -1 });
TaskSchema.index({ assignedTo: 1 });
TaskSchema.index({ missed: 1, createdBy: 1 });

export const Task = mongoose.model<ITask>('Task', TaskSchema);
