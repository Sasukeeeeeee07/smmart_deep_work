import mongoose, { Document, Schema } from 'mongoose';

export interface IDevice extends Document {
  uid: string;
  name: string;
  status: 'ONLINE' | 'OFFLINE';
  lastHeartbeat: Date;
  assignedTo?: mongoose.Types.ObjectId;
}

const DeviceSchema: Schema = new Schema(
  {
    uid: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    status: { type: String, enum: ['ONLINE', 'OFFLINE'], default: 'OFFLINE' },
    lastHeartbeat: { type: Date, default: Date.now },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'Employee' },
  },
  {
    timestamps: true,
  }
);

export const Device = mongoose.model<IDevice>('Device', DeviceSchema);
