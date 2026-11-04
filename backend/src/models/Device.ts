import mongoose, { Document, Schema } from 'mongoose';

export interface IDisplayConfig {
  breakDisplayMode: 'SESSION' | 'DAILY';
  showSessionTimer: boolean;
  showBreaks: boolean;
  showProdScore: boolean;
  showProdSpike: boolean;
  showSelfRating: boolean;
  showModerator: boolean;
}

export interface IDevice extends Document {
  uid: string;
  name: string;
  status: 'ONLINE' | 'OFFLINE';
  lastHeartbeat: Date;
  assignedTo?: mongoose.Types.ObjectId;
  displayConfig: IDisplayConfig;
  invalidSessionCount: number;
  isLockedOut: boolean;
  lockoutUntil?: Date | null;
  lockoutReason?: string;
  adminUnlocked?: boolean;
  inactivityPenaltyFor?: Date | null; // the lastHeartbeat value an inactivity penalty was already given for
}

const DeviceSchema: Schema = new Schema(
  {
    uid: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    status: { type: String, enum: ['ONLINE', 'OFFLINE'], default: 'OFFLINE' },
    lastHeartbeat: { type: Date, default: Date.now },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'Employee' },
    invalidSessionCount: { type: Number, default: 0 },
    isLockedOut: { type: Boolean, default: false },
    lockoutUntil: { type: Date, default: null },
    lockoutReason: { type: String, default: '' },
    adminUnlocked: { type: Boolean, default: false },
    inactivityPenaltyFor: { type: Date, default: null },
    displayConfig: {
      breakDisplayMode: { type: String, enum: ['SESSION', 'DAILY'], default: 'SESSION' },
      showSessionTimer: { type: Boolean, default: true },
      showBreaks:       { type: Boolean, default: true },
      showProdScore:    { type: Boolean, default: true },
      showProdSpike:    { type: Boolean, default: true },
      showSelfRating:   { type: Boolean, default: true },
      showModerator:    { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
  }
);

export const Device = mongoose.model<IDevice>('Device', DeviceSchema);
