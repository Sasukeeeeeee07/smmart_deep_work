import mongoose, { Document, Schema } from 'mongoose';

export enum NotificationType {
  TASK = 'TASK',
  DEVICE = 'DEVICE',
  SYSTEM = 'SYSTEM',
}

export interface INotification extends Document {
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  targetUser?: mongoose.Types.ObjectId; // null = broadcast to all admins
  relatedId?: string; // ID of the related entity (task._id, device.uid, etc.)
}

const NotificationSchema: Schema = new Schema<INotification>(
  {
    type: {
      type: String,
      enum: Object.values(NotificationType),
      required: true,
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    isRead: { type: Boolean, default: false },
    targetUser: { type: Schema.Types.ObjectId, ref: 'User' },
    relatedId: { type: String },
  },
  { timestamps: true }
);

NotificationSchema.index({ isRead: 1, createdAt: -1 });
NotificationSchema.index({ targetUser: 1, isRead: 1 });

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);
