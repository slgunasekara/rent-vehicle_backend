import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Types } from 'mongoose';
import { User, IUser } from '../models/user.model';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { isDefaultAdmin } from '../utils/admin';
import { purgeUser } from './admin.controller';
import { mailAdminAdded, mailAdminPasswordReset, mailAdminRemoved } from '../services/adMail.service';

const passwordRule = z.string().min(8, 'Password must be at least 8 characters').max(100);
const nameRule = z.string().trim().min(2, 'Enter the full name').max(60);
const positionRule = z.string().trim().min(2, 'Enter the company position (for example Manager)').max(60);

/** what the console shows about one admin */
const view = (u: IUser & { createdBy?: unknown }, byName?: string) => ({
  id: String(u._id), name: u.name, position: u.position ?? '', email: u.email, phone: u.phone ?? '', isActive: u.isActive,
  isDefault: isDefaultAdmin(u), createdAt: u.createdAt, addedBy: byName ?? '',
});

async function loadAdmin(id: string): Promise<IUser> {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(404, 'Admin not found');
  const u = await User.findById(id);
  if (!u || u.role !== 'admin') throw new ApiError(404, 'Admin not found');
  return u;
}

// GET /api/admin/admins - every company admin (the default admin first)
export const listAdmins = asyncHandler(async (_req: Request, res: Response) => {
  const admins = await User.find({ role: 'admin' }).sort({ createdAt: 1 });
  const names = new Map((await User.find({ _id: { $in: admins.map((a) => a.createdBy).filter(Boolean) } }).select('name')).map((u) => [String(u._id), u.name]));
  const rows = admins.map((a) => view(a, a.createdBy ? names.get(String(a.createdBy)) : undefined));
  rows.sort((x, y) => Number(y.isDefault) - Number(x.isDefault));
  res.json({ success: true, data: rows });
});

// POST /api/admin/admins  { name, position, email, phone?, password } - any admin can add a colleague; the new admin signs in on the normal login page
export const createAdmin = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({
    name: nameRule, position: positionRule,
    email: z.string().trim().toLowerCase().email('Enter a valid e-mail address'),
    phone: z.string().trim().min(7, 'Enter a valid phone number').max(20).optional().or(z.literal('').transform(() => undefined)),
    password: passwordRule,
  }).parse(req.body);
  if (await User.exists({ email: b.email })) throw new ApiError(409, 'This e-mail address already has an account. Use a different e-mail for the new admin.');
  const u = await User.create({ name: b.name, position: b.position, email: b.email, phone: b.phone, role: 'admin', password: await bcrypt.hash(b.password, 12), createdBy: req.user!._id });
  void mailAdminAdded(u.email, u.name, b.position, req.user!.name);
  res.status(201).json({ success: true, message: `${u.name} was added as an admin. Give them the password so they can sign in.`, data: view(u, req.user!.name) });
});

// PATCH /api/admin/admins/:id  { name?, position?, password?, isActive? }
//  - the default admin can change anybody (name, position, a new password, suspend / activate) except suspending itself
//  - any other admin can only change their own name and position (the password is changed on the Account page)
//  - nobody but the default admin itself can change the default admin
export const updateAdmin = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ name: nameRule.optional(), position: positionRule.optional(), password: passwordRule.optional(), isActive: z.boolean().optional() }).parse(req.body);
  const target = await loadAdmin(req.params.id);
  const me = req.user!;
  const meDefault = isDefaultAdmin(me), targetDefault = isDefaultAdmin(target), self = String(me._id) === String(target._id);
  if (targetDefault && !self) throw new ApiError(403, 'The default admin can only be changed by the default admin');
  if (!meDefault && !self) throw new ApiError(403, 'Only the default admin can change other admins');
  if ((b.password !== undefined || b.isActive !== undefined) && !meDefault) throw new ApiError(403, 'Only the default admin can reset a password or suspend an admin');
  if (b.isActive !== undefined && (self || targetDefault)) throw new ApiError(400, 'The default admin cannot be suspended');
  if (b.password !== undefined && self) throw new ApiError(400, 'Change your own password from your Account page');

  if (b.name !== undefined) target.name = b.name;
  if (b.position !== undefined) target.position = b.position;
  if (b.isActive !== undefined) { target.isActive = b.isActive; if (!b.isActive) target.refreshTokens = []; }
  if (b.password !== undefined) { target.password = await bcrypt.hash(b.password, 12); target.refreshTokens = []; }
  await target.save();
  if (b.password !== undefined) void mailAdminPasswordReset(target.email, target.name, me.name);
  res.json({ success: true, message: b.password !== undefined ? 'Password reset. Give the new password to the admin.' : b.isActive === false ? `${target.name} is suspended` : b.isActive === true ? `${target.name} is active again` : 'Saved', data: view(target) });
});

// DELETE /api/admin/admins/:id - only the DEFAULT admin removes admins, and the default admin itself can never be removed
export const deleteAdmin = asyncHandler(async (req: Request, res: Response) => {
  const target = await loadAdmin(req.params.id);
  if (isDefaultAdmin(target)) throw new ApiError(403, 'The default admin cannot be deleted');
  if (!isDefaultAdmin(req.user)) throw new ApiError(403, 'Only the default admin can delete admins');
  void mailAdminRemoved(target.email, target.name);
  const ads = await purgeUser(target as Parameters<typeof purgeUser>[0]);
  res.json({ success: true, message: `${target.name} was removed${ads ? ` (and ${ads} ad(s))` : ''}` });
});
