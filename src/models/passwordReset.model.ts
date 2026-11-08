import { Schema, model } from 'mongoose';

// One document per email that asked for a password reset. The OTP itself is never stored - only its hash.
const schema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  otpHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  lastSentAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});
// MongoDB removes the document by itself once it has expired
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordReset = model('PasswordReset', schema);
