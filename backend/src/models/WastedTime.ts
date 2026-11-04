import mongoose, { Document, Schema } from 'mongoose';

/** Time a user says they wasted on a day (typed into the Dashboard's time-currency card). One row per user per day. */
export interface IWastedTime extends Document {
  user: mongoose.Types.ObjectId;
  date: string;      // YYYY-MM-DD, the day the time was wasted
  minutes: number;
}

const WastedTimeSchema: Schema = new Schema<IWastedTime>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    minutes: { type: Number, required: true, min: 0, max: 24 * 60 },
  },
  { timestamps: true }
);

WastedTimeSchema.index({ user: 1, date: 1 }, { unique: true });

export const WastedTime = mongoose.model<IWastedTime>('WastedTime', WastedTimeSchema);
