import mongoose, { Document, Schema } from 'mongoose';

export interface IEmployee extends Document {
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  position: string;
  status: 'ACTIVE' | 'INACTIVE';
  user?: mongoose.Types.ObjectId; // Optional link to a login account
}

const EmployeeSchema: Schema = new Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    department: { type: String, required: true },
    position: { type: String, required: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
  }
);

export const Employee = mongoose.model<IEmployee>('Employee', EmployeeSchema);
