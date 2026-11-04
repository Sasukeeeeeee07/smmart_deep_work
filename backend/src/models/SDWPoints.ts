import mongoose, { Document, Schema } from 'mongoose';

export interface ISDWPoints extends Document {
  employeeId: mongoose.Types.ObjectId;
  sessionId?: mongoose.Types.ObjectId;   // absent for penalties that are not tied to a session
  taskId?:    mongoose.Types.ObjectId;   // set when the entry is a missed-task penalty
  reason?:    string;
  points:     number;   // 5 per qualifying session; negative for penalties
  earnedAt:   Date;
  weekNumber: number;   // ISO week number
  month:      number;   // 1–12
  year:       number;
}

const SDWPointsSchema: Schema = new Schema<ISDWPoints>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    sessionId:  { type: Schema.Types.ObjectId, ref: 'DeepWorkSession' },
    taskId:     { type: Schema.Types.ObjectId, ref: 'Task' },
    reason:     { type: String },
    points:     { type: Number, required: true, default: 5 },
    earnedAt:   { type: Date, default: Date.now },
    weekNumber: { type: Number, required: true },
    month:      { type: Number, required: true },
    year:       { type: Number, required: true },
  },
  { timestamps: true }
);

SDWPointsSchema.index({ employeeId: 1, year: 1, month: 1 });
SDWPointsSchema.index({ employeeId: 1, year: 1, weekNumber: 1 });

export const SDWPoints = mongoose.model<ISDWPoints>('SDWPoints', SDWPointsSchema);
