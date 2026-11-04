import mongoose, { Document, Schema } from 'mongoose';

/**
 * A deep-work penalty. INACTIVITY: the device stayed off for a full week, so for the next
 * `days` days each deep-work session is `sessionMinutes` long. The days start counting
 * when the device is next used (PENDING -> ACTIVE) and run out after `days` x 24 h (DONE).
 */
export interface IPenalty extends Document {
  employeeId: mongoose.Types.ObjectId;
  deviceUid: string;
  type: 'INACTIVITY';
  reason: string;
  sessionMinutes: number;
  days: number;
  status: 'PENDING' | 'ACTIVE' | 'DONE';
  triggeredAt: Date;
  activatedAt?: Date;
  expiresAt?: Date;
}

const PenaltySchema: Schema = new Schema<IPenalty>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    deviceUid: { type: String, required: true },
    type: { type: String, enum: ['INACTIVITY'], default: 'INACTIVITY' },
    reason: { type: String, default: '' },
    sessionMinutes: { type: Number, default: 180 },
    days: { type: Number, default: 2 },
    status: { type: String, enum: ['PENDING', 'ACTIVE', 'DONE'], default: 'PENDING' },
    triggeredAt: { type: Date, default: Date.now },
    activatedAt: { type: Date },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

PenaltySchema.index({ employeeId: 1, status: 1 });

export const Penalty = mongoose.model<IPenalty>('Penalty', PenaltySchema);
