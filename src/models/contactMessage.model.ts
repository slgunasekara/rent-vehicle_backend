import { Schema, model, Document, Types } from 'mongoose';

export interface IContactMessage extends Document {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
  // inbox state (messages saved before v16 have none of these - they count as unread / not replied)
  read: boolean;
  readAt?: Date;
  replied: boolean;
  repliedAt?: Date;
  repliedBy?: Types.ObjectId;
  replyText?: string; // set when the reply was written and emailed from the console
  createdAt: Date;
}

// kept in the database too, so a message is never lost if the email server is down
const schema = new Schema<IContactMessage>(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 50 },
    lastName: { type: String, required: true, trim: true, maxlength: 50 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 25 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    read: { type: Boolean, default: false, index: true },
    readAt: Date,
    replied: { type: Boolean, default: false },
    repliedAt: Date,
    repliedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    replyText: { type: String, maxlength: 4000 },
  },
  { timestamps: true }
);

export const ContactMessage = model<IContactMessage>('ContactMessage', schema);
