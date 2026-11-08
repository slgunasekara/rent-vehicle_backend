import { Schema, model, Document, Types } from 'mongoose';

/**
 * One row = "this visitor already opened / called this ad recently". It stops one person from raising the counters by refreshing;
 * MongoDB deletes the row by itself at `expireAt`, and then the same visitor counts again.
 */
export interface IViewLog extends Document { vehicle: Types.ObjectId; kind: 'view' | 'call'; viewer: string; expireAt: Date }
const schema = new Schema<IViewLog>({
  vehicle: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  kind: { type: String, enum: ['view', 'call'], required: true },
  viewer: { type: String, required: true }, // the user id, or a hash of ip + browser for visitors
  expireAt: { type: Date, required: true },
});
schema.index({ vehicle: 1, kind: 1, viewer: 1 }, { unique: true });
schema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
export const ViewLog = model<IViewLog>('ViewLog', schema);
