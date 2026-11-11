import {Schema, model, Document} from 'mongoose';

export type Role = 'user' | 'admin';

export interface IUser extends Document {
    name: string;
    email: string;
    password?: string;
    googleId?: string;
    avatar?: string;
    role: Role;
    position?: string;
    isDefaultAdmin?: boolean;
    phone?: string;
    refreshTokens: string[];
    isActive: boolean;
    banReason?: string;
    bannedAt?: Date;
    createdAt: Date;
}

const userSchema = new Schema<IUser>(
    {
        name: {type: String, required: true, trim: true},
        email: {type: String, required: true, unique: true, lowercase: true, trim: true},
        password: {type: String, select: false},
        googleId: {type: String, index: true, sparse: true},
        avatar: String,
        role: {type: String, enum: ['user', 'admin'], default: 'user', index: true},
        position: {type: String, trim: true, maxlength: 60},
        isDefaultAdmin: {type: Boolean, default: false},
        phone: String,
        refreshTokens: {type: [String], default: [], select: false},
        isActive: {type: Boolean, default: true},
        banReason: {type: String, trim: true, maxlength: 300},
        bannedAt: Date,
    },
    {timestamps: true}
);

export const User = model<IUser>('User', userSchema);
