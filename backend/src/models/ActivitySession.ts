import mongoose, { Document, Schema } from 'mongoose';

export interface IActivitySession extends Document {
  deviceUid: string;
  state: string; // e.g., 'MOVING', 'STATIONARY', 'NO PERSON'
  targetState: number; // 0, 1, 2, 3 from the radar
  movingDistance: number;
  stationaryDistance: number;
  timestamp: Date;
}

const ActivitySessionSchema: Schema = new Schema(
  {
    deviceUid: { type: String, required: true },
    state: { type: String, required: true },
    targetState: { type: Number, required: true },
    movingDistance: { type: Number, required: true },
    stationaryDistance: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries by device and time
ActivitySessionSchema.index({ deviceUid: 1, timestamp: -1 });

export const ActivitySession = mongoose.model<IActivitySession>('ActivitySession', ActivitySessionSchema);
