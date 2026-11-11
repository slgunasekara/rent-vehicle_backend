import {Schema, model} from 'mongoose';

const schema = new Schema({
    email: {type: String, required: true, unique: true, lowercase: true, trim: true},
    otpHash: {type: String, required: true},
    attempts: {type: Number, default: 0},
    lastSentAt: {type: Date, default: Date.now},
    expiresAt: {type: Date, required: true},
});
schema.index({expiresAt: 1}, {expireAfterSeconds: 0});

export const PasswordReset = model('PasswordReset', schema);
