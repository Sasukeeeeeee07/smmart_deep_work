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

export type FaceCheckResult = 'MATCH' | 'MISMATCH' | 'NO_FACE' | 'NOT_ENROLLED' | 'ERROR';

export interface IFaceVerification {
  required: boolean;                          // a session may only start after the assigned employee's face is confirmed
  verifiedAt?: Date | null;                   // last successful match; consumed when a session starts
  verifiedEmployee?: mongoose.Types.ObjectId | null;
  checkRequestedAt?: Date | null;             // the web asked to start a session; the device should take a check photo
  lastResult?: FaceCheckResult | null;
  lastCheckedAt?: Date | null;
  lastMismatchAlertAt?: Date | null;          // throttles "unrecognised person" notifications
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
  faceVerification: IFaceVerification;
  keyHash?: string | null;     // SHA-256 of the device's secret key; never returned by queries (select: false)
  keyCreatedAt?: Date | null;  // set when an admin generates a key; null = device not secured yet
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
    keyHash: { type: String, default: null, select: false },
    keyCreatedAt: { type: Date, default: null },
    faceVerification: {
      required:            { type: Boolean, default: false },
      verifiedAt:          { type: Date, default: null },
      verifiedEmployee:    { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
      checkRequestedAt:    { type: Date, default: null },
      lastResult:          { type: String, enum: ['MATCH', 'MISMATCH', 'NO_FACE', 'NOT_ENROLLED', 'ERROR', null], default: null },
      lastCheckedAt:       { type: Date, default: null },
      lastMismatchAlertAt: { type: Date, default: null },
    },
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
