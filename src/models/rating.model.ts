import { Schema, model, Document, Types } from 'mongoose';

/** one star rating (1-5) of one ad by one signed-in user; changing your mind just updates it */
export interface IRating extends Document { vehicle: Types.ObjectId; user: Types.ObjectId; stars: number; comment?: string; reply?: { text: string; at: Date } }
const schema = new Schema<IRating>(
  { vehicle: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true }, user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true }, stars: { type: Number, required: true, min: 1, max: 5 }, comment: { type: String, trim: true, maxlength: 500 }, reply: { text: { type: String, trim: true, maxlength: 500 }, at: Date } },
  { timestamps: true }
);
schema.index({ vehicle: 1, user: 1 }, { unique: true });
export const Rating = model<IRating>('Rating', schema);
