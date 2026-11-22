import mongoose, { Document, Schema } from 'mongoose';

/**
 * An employee's enrolled face, used to check that the person at a DeepWork device is the
 * person it is assigned to. Only numeric face templates are kept (128 numbers per photo,
 * produced by the face-recognition model); the photos themselves are never stored.
 */
export interface IFaceProfile extends Document {
  employeeId: mongoose.Types.ObjectId;
  descriptors: number[][];
  consentAt: Date;
  enrolledBy: mongoose.Types.ObjectId;   // the user who ran the enrolment (the employee, or an admin/manager with them)
  createdAt: Date;
  updatedAt: Date;
}

const FaceProfileSchema: Schema = new Schema<IFaceProfile>(
  {
    employeeId:  { type: Schema.Types.ObjectId, ref: 'Employee', required: true, unique: true },
    descriptors: {
      type: [[Number]],
      required: true,
      validate: {
        validator: (v: number[][]) => v.length > 0 && v.every(d => d.length === 128),
        message: 'Each face template must have 128 values',
      },
    },
    consentAt:   { type: Date, required: true },
    enrolledBy:  { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export const FaceProfile = mongoose.model<IFaceProfile>('FaceProfile', FaceProfileSchema);
