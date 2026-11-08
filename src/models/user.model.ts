import { Schema, model, Document, Types } from 'mongoose';

/** everybody who registers is a plain "user": they can look for vehicles AND post their own vehicle ads. "admin" is the company console. */
export type Role = 'user' | 'admin';

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  googleId?: string;
  avatar?: string;
  role: Role;
  phone?: string;
  refreshTokens: string[];
  isActive: boolean;
  position?: string; // company position (admins): Manager, Support officer ...
  createdBy?: Types.ObjectId; // the admin who added this admin account
  banReason?: string; // set when the company bans the account
  bannedAt?: Date;
  createdAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, select: false },
    googleId: { type: String, index: true, sparse: true },
    avatar: String,
    role: { type: String, enum: ['user', 'admin'], default: 'user', index: true },
    phone: String,
    refreshTokens: { type: [String], default: [], select: false },
    isActive: { type: Boolean, default: true },
    position: { type: String, trim: true, maxlength: 60 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    banReason: { type: String, trim: true, maxlength: 300 },
    bannedAt: Date,
  },
  { timestamps: true }
);

export const User = model<IUser>('User', userSchema);
