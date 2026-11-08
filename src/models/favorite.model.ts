import { Schema, model, Document, Types } from 'mongoose';

/** an ad a signed-in user saved with the heart button */
export interface IFavorite extends Document { user: Types.ObjectId; vehicle: Types.ObjectId; createdAt: Date }
const schema = new Schema<IFavorite>(
  { user: { type: Schema.Types.ObjectId, ref: 'User', required: true }, vehicle: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true } },
  { timestamps: { createdAt: true, updatedAt: false } }
);
schema.index({ user: 1, vehicle: 1 }, { unique: true });
export const Favorite = model<IFavorite>('Favorite', schema);
