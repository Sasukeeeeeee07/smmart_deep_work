import mongoose, { Document, Schema } from 'mongoose';

export interface IBreakRecord {
  startTime: Date;
  endTime?: Date;
  durationMinutes?: number;
}

export interface IDeepWorkSession extends Document {
  deviceUid: string;
  employeeId: mongoose.Types.ObjectId;
  startTime: Date;
  endTime?: Date;
  activeMinutes: number;       // accumulated active time (excludes breaks)
  breaks: IBreakRecord[];
  breakCount: number;
  totalBreakMinutes: number;
  status: 'ACTIVE' | 'BREAK' | 'DYING' | 'COMPLETED';
  selfRating: number;          // 0 = unrated, 1-5
  sdwPointsEarned: number;     // 5 if 2hr+ session, else 0
  productivitySpike: boolean;  // true if 45+ min with < 2 breaks
}

const BreakRecordSchema = new Schema<IBreakRecord>({
  startTime: { type: Date, required: true },
  endTime: { type: Date },
  durationMinutes: { type: Number },
});

const DeepWorkSessionSchema: Schema = new Schema<IDeepWorkSession>(
  {
    deviceUid:          { type: String, required: true },
    employeeId:         { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    startTime:          { type: Date, required: true, default: Date.now },
    endTime:            { type: Date },
    activeMinutes:      { type: Number, default: 0 },
    breaks:             { type: [BreakRecordSchema], default: [] },
    breakCount:         { type: Number, default: 0 },
    totalBreakMinutes:  { type: Number, default: 0 },
    status:             { type: String, enum: ['ACTIVE', 'BREAK', 'DYING', 'COMPLETED'], default: 'ACTIVE' },
    selfRating:         { type: Number, default: 0, min: 0, max: 5 },
    sdwPointsEarned:    { type: Number, default: 0 },
    productivitySpike:  { type: Boolean, default: false },
  },
  { timestamps: true }
);

DeepWorkSessionSchema.index({ deviceUid: 1, status: 1 });
DeepWorkSessionSchema.index({ employeeId: 1, startTime: -1 });

export const DeepWorkSession = mongoose.model<IDeepWorkSession>('DeepWorkSession', DeepWorkSessionSchema);
