import { Schema, model, Document, Types } from 'mongoose';
import { REPORT_REASON_KEYS, ReportReason } from '../data/vehicleOptions';

export type ReportStatus = 'open' | 'resolved' | 'dismissed';

/** a user's report about an ad. The ad / reporter details are copied in, so the report is still readable after the ad is gone. */
export interface IReport extends Document {
  vehicle: Types.ObjectId;
  reporter: Types.ObjectId;
  reason: ReportReason;
  message: string;
  status: ReportStatus;
  adminNote?: string;
  resolvedAt?: Date;
  adTitle: string;
  adCity: string;
  reporterName: string;
  reporterEmail: string;
  createdAt: Date;
}
const schema = new Schema<IReport>(
  {
    vehicle: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reason: { type: String, enum: REPORT_REASON_KEYS, required: true },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    status: { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open', index: true },
    adminNote: { type: String, trim: true, maxlength: 500 },
    resolvedAt: Date,
    adTitle: { type: String, default: '' },
    adCity: { type: String, default: '' },
    reporterName: { type: String, default: '' },
    reporterEmail: { type: String, default: '' },
  },
  { timestamps: true }
);
export const Report = model<IReport>('Report', schema);
