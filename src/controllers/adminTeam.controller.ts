import {Request, Response} from 'express';
import {z} from 'zod';
import bcrypt from 'bcryptjs';
import {Types} from 'mongoose';
import {User, IUser} from '../models/user.model';
import {asyncHandler} from '../utils/asyncHandler';
import {ApiError} from '../utils/ApiError';
import {env} from '../config/env';
import {removeUserData} from '../services/cleanup.service';


async function defaultAdminId(): Promise<string | null> {
    const marked = await User.findOne({role: 'admin', isDefaultAdmin: true}).select('_id').lean();
    if (marked) return String(marked._id);
    const first = env.adminEmails[0] ? await User.findOne({
        role: 'admin',
        email: env.adminEmails[0]
    }).select('_id') : null;
    const pick = first ?? (await User.findOne({role: 'admin'}).sort({createdAt: 1}).select('_id'));
    if (!pick) return null;
    await User.updateOne({_id: pick._id}, {$set: {isDefaultAdmin: true}});
    return String(pick._id);
}

const isDefault = async (u: IUser | { _id: unknown }): Promise<boolean> => String(u._id) === (await defaultAdminId());
const view = (u: {
    _id: unknown;
    name: string;
    email: string;
    position?: string;
    isActive?: boolean;
    createdAt?: Date
}, def: string | null) => ({
    id: String(u._id),
    name: u.name,
    email: u.email,
    position: u.position ?? '',
    isDefault: String(u._id) === def,
    createdAt: u.createdAt,
});


export const listAdmins = asyncHandler(async (req: Request, res: Response) => {
    const def = await defaultAdminId();
    const rows = await User.find({role: 'admin'}).select('name email position createdAt').sort({createdAt: 1}).lean();
    const items = rows.map((u) => view(u, def)).sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    res.json({success: true, data: {canManage: String(req.user!._id) === def, items}});
});


export const addAdmin = asyncHandler(async (req: Request, res: Response) => {
    if (!(await isDefault(req.user!))) throw new ApiError(403, 'Only the default admin can add admins');
    const body = z.object({
        name: z.string().trim().min(2, 'Enter the name').max(60),
        position: z.string().trim().min(2, 'Enter the company position').max(60),
        email: z.string().trim().email('Enter a valid email address'),
        password: z.string().min(8, 'Password must be at least 8 characters').max(100),
    }).parse(req.body);
    const email = body.email.toLowerCase();
    if (await User.findOne({email})) throw new ApiError(409, 'This email is already registered. Use a different email for the new admin.');
    const u = await User.create({
        name: body.name,
        position: body.position,
        email,
        role: 'admin',
        password: await bcrypt.hash(body.password, 12)
    });
    res.status(201).json({
        success: true,
        message: `${u.name} can now sign in as an admin with ${u.email}`,
        data: view(u, await defaultAdminId())
    });
});


export const removeAdmin = asyncHandler(async (req: Request, res: Response) => {
    const def = await defaultAdminId();
    if (String(req.user!._id) !== def) throw new ApiError(403, 'Only the default admin can remove admins');
    if (!Types.ObjectId.isValid(req.params.id)) throw new ApiError(404, 'Admin not found');
    const u = await User.findOne({_id: req.params.id, role: 'admin'});
    if (!u) throw new ApiError(404, 'Admin not found');
    if (String(u._id) === def) throw new ApiError(403, 'The default admin cannot be deleted');
    await removeUserData(u._id);
    await u.deleteOne();
    res.json({success: true, message: `${u.name} was removed. This login no longer works.`});
});
