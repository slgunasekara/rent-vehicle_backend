import crypto from 'crypto';
import {Request, Response} from 'express';
import bcrypt from 'bcryptjs';
import {z} from 'zod';
import {OAuth2Client} from 'google-auth-library';
import {User, IUser} from '../models/user.model';
import {Vehicle} from '../models/vehicle.model';
import {PasswordReset} from '../models/passwordReset.model';
import {asyncHandler} from '../utils/asyncHandler';
import {ApiError} from '../utils/ApiError';
import {env} from '../config/env';
import {sendMail, esc} from '../services/mail.service';
import {deleteImages} from '../services/storage.service';
import {removeAdData, removeUserData} from '../services/cleanup.service';
import {signAccessToken, signRefreshToken, verifyRefresh, hashToken} from '../utils/jwt';

const googleClient = new OAuth2Client(env.googleClientId);
const MAX_SESSIONS = 5;

const userView = (u: IUser) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    position: u.position,
    avatar: u.avatar,
    phone: u.phone,
});

async function issueTokens(user: IUser) {
    const payload = {id: user.id, role: user.role};
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await User.updateOne({_id: user.id}, {
        $push: {
            refreshTokens: {
                $each: [hashToken(refreshToken)],
                $slice: -MAX_SESSIONS
            }
        }
    });
    return {accessToken, refreshToken, user: userView(user)};
}

const passwordRule = z.string().min(8, 'Password must be at least 8 characters').max(100);
const phoneRule = z.string().trim().min(7, 'Enter a valid phone number').max(20);


export const register = asyncHandler(async (req: Request, res: Response) => {
    const body = z.object({
        name: z.string().trim().min(2, 'Enter your name').max(60),
        email: z.string().trim().email(),
        phone: phoneRule,
        password: passwordRule
    }).parse(req.body);
    const email = body.email.toLowerCase();
    if (await User.findOne({email})) throw new ApiError(409, 'This email is already registered - please sign in');
    const user = await User.create({
        name: body.name,
        email,
        phone: body.phone,
        password: await bcrypt.hash(body.password, 12),
        role: env.adminEmails.includes(email) ? 'admin' : 'user',
    });
    res.status(201).json({success: true, data: await issueTokens(user)});
});

export const login = asyncHandler(async (req: Request, res: Response) => {
    const {email, password} = z.object({email: z.string().email(), password: z.string().min(1)}).parse(req.body);
    const user = await User.findOne({email: email.toLowerCase()}).select('+password');
    if (user && !user.password && user.googleId) throw new ApiError(401, 'This account was created with Google. Use "Sign in with Google".');
    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) throw new ApiError(401, 'Invalid email or password');
    if (!user.isActive) throw new ApiError(403, user.banReason ? `This account has been suspended: ${user.banReason}` : 'This account has been disabled');
    res.json({success: true, data: await issueTokens(user)});
});


export const googleAuth = asyncHandler(async (req: Request, res: Response) => {
    const {credential} = z.object({credential: z.string().min(10)}).parse(req.body);
    if (!env.googleClientId) throw new ApiError(500, 'Google sign-in is not configured on the server');
    const ticket = await googleClient.verifyIdToken({idToken: credential, audience: env.googleClientId});
    const p = ticket.getPayload();
    if (!p?.email || !p.email_verified) throw new ApiError(401, 'Google account email is not verified');
    const email = p.email.toLowerCase();
    let user = await User.findOne({email});
    if (!user) {
        user = await User.create({
            name: p.name || email.split('@')[0],
            email,
            googleId: p.sub,
            avatar: p.picture,
            role: env.adminEmails.includes(email) ? 'admin' : 'user'
        });
    } else {
        if (!user.isActive) throw new ApiError(403, user.banReason ? `This account has been suspended: ${user.banReason}` : 'This account has been disabled');
        if (!user.googleId) user.googleId = p.sub;
        if (!user.avatar && p.picture) user.avatar = p.picture;
        await user.save();
    }
    res.json({success: true, data: await issueTokens(user)});
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
    const {refreshToken} = z.object({refreshToken: z.string().min(10)}).parse(req.body);
    let payload;
    try {
        payload = verifyRefresh(refreshToken);
    } catch {
        throw new ApiError(401, 'Session expired, please log in again');
    }
    const user = await User.findById(payload.id).select('+refreshTokens');
    const hash = hashToken(refreshToken);
    if (!user || !user.isActive || !user.refreshTokens.includes(hash)) throw new ApiError(401, 'Session is no longer valid');

    const used = await User.updateOne({_id: user.id, refreshTokens: hash}, {$pull: {refreshTokens: hash}});
    if (!used.modifiedCount) throw new ApiError(401, 'Session is no longer valid');
    res.json({success: true, data: await issueTokens(user)});
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
    const {refreshToken} = (req.body ?? {}) as { refreshToken?: string };
    if (refreshToken) {
        try {
            const payload = verifyRefresh(refreshToken);
            await User.updateOne({_id: payload.id}, {$pull: {refreshTokens: hashToken(refreshToken)}});
        } catch { /* expired / invalid token - nothing to remove */
        }
    }
    res.json({success: true, message: 'Logged out'});
});

export const me = asyncHandler(async (req: Request, res: Response) => {
    res.json({success: true, data: userView(req.user!)});
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
    const body = z.object({
        name: z.string().trim().min(2).max(60).optional(),
        phone: phoneRule.optional()
    }).parse(req.body);
    const u = req.user!;
    if (body.name !== undefined) u.name = body.name;
    if (body.phone !== undefined) u.phone = body.phone;
    await u.save();
    res.json({success: true, data: userView(u)});
});

// Forgot password (e-mail code) and change password
const OTP_MINUTES = 10;
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_TRIES = 5;
const hashOtp = (email: string, otp: string): string => crypto.createHmac('sha256', env.jwtAccessSecret).update(`${email}:${otp}`).digest('hex');

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
    const {email: raw} = z.object({email: z.string().email()}).parse(req.body);
    const email = raw.toLowerCase();
    const generic = {
        success: true,
        message: `If ${email} is registered, a 6-digit code was sent to it. It is valid for ${OTP_MINUTES} minutes.`,
        resendIn: OTP_RESEND_SECONDS
    };
    const user = await User.findOne({email});
    if (!user || !user.isActive) {
        res.json(generic);
        return;
    }
    const existing = await PasswordReset.findOne({email});
    if (existing && Date.now() - existing.lastSentAt.getTime() < OTP_RESEND_SECONDS * 1000) {
        res.json({
            ...generic,
            resendIn: Math.max(1, Math.ceil(OTP_RESEND_SECONDS - (Date.now() - existing.lastSentAt.getTime()) / 1000))
        });
        return;
    }
    const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await PasswordReset.findOneAndUpdate(
        {email},
        {
            email,
            otpHash: hashOtp(email, otp),
            attempts: 0,
            lastSentAt: new Date(),
            expiresAt: new Date(Date.now() + OTP_MINUTES * 60 * 1000)
        },
        {upsert: true, new: true, setDefaultsOnInsert: true}
    );
    void sendMail(email, `${otp} is your Vehicle Buddy password reset code`, 'Reset your password',
        `<p>Hi ${esc(user.name)},</p><p>Use this code to reset your Vehicle Buddy password:</p>
     <p style="font-size:32px;font-weight:800;letter-spacing:8px;color:#0c4f9e;background:#f3f7fd;border-radius:12px;padding:14px 18px;display:inline-block">${otp}</p>
     <p>The code is valid for ${OTP_MINUTES} minutes. If you did not ask for this, ignore this email - your password stays the same.</p>`);
    res.json(generic);
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
    const body = z.object({
        email: z.string().email(),
        otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
        newPassword: passwordRule,
        confirmPassword: z.string()
    }).parse(req.body);
    if (body.newPassword !== body.confirmPassword) throw new ApiError(400, 'The two passwords do not match');
    const email = body.email.toLowerCase();
    const reset = await PasswordReset.findOne({email});
    if (!reset || reset.expiresAt.getTime() < Date.now()) throw new ApiError(400, 'This code has expired. Ask for a new one.');
    if (reset.attempts >= OTP_MAX_TRIES) {
        await reset.deleteOne();
        throw new ApiError(400, 'Too many wrong codes. Ask for a new one.');
    }
    const given = Buffer.from(hashOtp(email, body.otp));
    const real = Buffer.from(reset.otpHash);
    if (given.length !== real.length || !crypto.timingSafeEqual(given, real)) {
        reset.attempts += 1;
        await reset.save();
        throw new ApiError(400, `Wrong code. ${Math.max(0, OTP_MAX_TRIES - reset.attempts)} tries left.`);
    }
    const user = await User.findOne({email});
    if (!user || !user.isActive) throw new ApiError(400, 'This account is not available');
    user.password = await bcrypt.hash(body.newPassword, 12);
    user.refreshTokens = []; // every device has to sign in again
    await user.save();
    await reset.deleteOne();
    res.json({success: true, message: 'Password changed. You can sign in with the new password now.'});
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
    const body = z.object({
        currentPassword: z.string().min(1, 'Enter your current password'),
        newPassword: passwordRule,
        confirmPassword: z.string()
    }).parse(req.body);
    if (body.newPassword !== body.confirmPassword) throw new ApiError(400, 'The two new passwords do not match');
    const user = await User.findById(req.user!.id).select('+password');
    if (!user) throw new ApiError(404, 'User not found');
    if (!user.password) throw new ApiError(400, 'This account has no password yet (it was created with Google). Use "Forgot password" on the sign-in page to set one.');
    if (!(await bcrypt.compare(body.currentPassword, user.password))) throw new ApiError(400, 'Your current password is not correct');
    if (body.currentPassword === body.newPassword) throw new ApiError(400, 'The new password must be different from the current one');
    user.password = await bcrypt.hash(body.newPassword, 12);
    user.refreshTokens = [];
    await user.save();
    res.json({success: true, message: 'Password changed', data: await issueTokens(user)});
});

export const deleteMe = asyncHandler(async (req: Request, res: Response) => {
    const {password} = z.object({password: z.string().optional()}).parse(req.body ?? {});
    const u = await User.findById(req.user!.id).select('+password');
    if (!u) throw new ApiError(404, 'User not found');
    if (u.role === 'admin') throw new ApiError(403, 'Company admin accounts cannot be deleted here');
    if (u.password && !(password && (await bcrypt.compare(password, u.password)))) throw new ApiError(400, 'Your password is not correct');
    const ads = await Vehicle.find({owner: u._id}).select('+images');
    await deleteImages(ads.flatMap((a) => a.images));
    await Vehicle.deleteMany({owner: u._id});
    await removeAdData(ads.map((a) => a._id));
    await removeUserData(u._id);
    await u.deleteOne();
    res.json({success: true, message: 'Your account and all your ads were deleted'});
});
