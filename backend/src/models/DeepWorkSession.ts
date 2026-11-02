import mongoose, { Document, Schema } from 'mongoose';

export interface IBreakRecord {
  startTime: Date;
  endTime?: Date;
  durationMinutes?: number;
}

export interface IModerationLog {
  type: 'COMMAND' | 'ALARM';
  message: string;
  timestamp: Date;
}

export interface IDeepWorkSession extends Document {
  deviceUid: string;
  employeeId: mongoose.Types.ObjectId;
  startTime: Date;
  endTime?: Date;
  targetDurationMinutes: number; // default 120 (2 hrs), can be extended
  extensionMinutes: number;      // total extended minutes
  activeMinutes: number;         // accumulated active time (excludes breaks)
  breaks: IBreakRecord[];
  breakCount: number;
  awayAlertCount: number;        // 30s away alerts raised in this session (each costs 1 SDW point)
  totalBreakMinutes: number;
  status: 'ACTIVE' | 'BREAK' | 'DYING' | 'COMPLETED' | 'INVALID';
  lastResumedAt?: Date;
  alarmActive: boolean;          // true when away/invalid alarm is sounding
  alarmMessage: string;          // alert text to show
  invalidReason?: string;        // e.g. "Exceeded 3 breaks limit"
  selfRating: number;            // 0 = unrated, 1-5
  sdwPointsEarned: number;       // 5 if target reached, else 0
  productivitySpike: boolean;    // true if 45+ min with < 2 breaks
  moderationLog: IModerationLog[];
}

const BreakRecordSchema = new Schema<IBreakRecord>({
  startTime: { type: Date, required: true },
  endTime: { type: Date },
  durationMinutes: { type: Number },
});

const ModerationLogSchema = new Schema<IModerationLog>({
  type:      { type: String, enum: ['COMMAND', 'ALARM'], required: true },
  message:   { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const DeepWorkSessionSchema: Schema = new Schema<IDeepWorkSession>(
  {
    deviceUid:             { type: String, required: true },
    employeeId:            { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    startTime:             { type: Date, required: true, default: Date.now },
    endTime:               { type: Date },
    targetDurationMinutes: { type: Number, default: 120 },
    extensionMinutes:      { type: Number, default: 0 },
    activeMinutes:         { type: Number, default: 0 },
    breaks:                { type: [BreakRecordSchema], default: [] },
    breakCount:            { type: Number, default: 0 },
    awayAlertCount:        { type: Number, default: 0 },
    totalBreakMinutes:     { type: Number, default: 0 },
    status:                { type: String, enum: ['ACTIVE', 'BREAK', 'DYING', 'COMPLETED', 'INVALID'], default: 'ACTIVE' },
    lastResumedAt:         { type: Date },
    alarmActive:           { type: Boolean, default: false },
    alarmMessage:          { type: String, default: '' },
    invalidReason:         { type: String, default: '' },
    selfRating:            { type: Number, default: 0, min: 0, max: 5 },
    sdwPointsEarned:       { type: Number, default: 0 },
    productivitySpike:     { type: Boolean, default: false },
    moderationLog:         { type: [ModerationLogSchema], default: [] },
  },
  { timestamps: true }
);

DeepWorkSessionSchema.index({ deviceUid: 1, status: 1 });
DeepWorkSessionSchema.index({ employeeId: 1, startTime: -1 });

export const DeepWorkSession = mongoose.model<IDeepWorkSession>('DeepWorkSession', DeepWorkSessionSchema);
