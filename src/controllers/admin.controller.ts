import { Request, Response } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { User } from '../models/user.model';
import { Vehicle } from '../models/vehicle.model';
import { ContactMessage } from '../models/contactMessage.model';
import { Report } from '../models/report.model';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { deleteImages, optimised } from '../services/storage.service';
import { removeAdData, removeUserData } from '../services/cleanup.service';
import { Payment } from '../models/payment.model';
import { extendFeatured } from './payment.controller';
import { mailBanned, mailUnbanned, mailFeatured } from '../services/adMail.service';
import { CATEGORY_KEYS, REPORT_REASONS } from '../data/vehicleOptions';

const DAY = 24 * 60 * 60 * 1000;
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/admin/stats - the company console dashboard
export const stats = asyncHandler(async (_req: Request, res: Response) => {
  const now = new Date();
  const week = new Date(Date.now() - 7 * DAY);
  const [users, newUsers, ads, live, hidden, newAds, unread, byCategory, byDistrict, perDay] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    User.countDocuments({ role: 'user', createdAt: { $gte: week } }),
    Vehicle.countDocuments({}),
    Vehicle.countDocuments({ expiresAt: { $gt: now }, insuranceExpiry: { $gte: now } }),
    Vehicle.countDocuments({ expiresAt: { $gt: now }, insuranceExpiry: { $lt: now } }),
    Vehicle.countDocuments({ createdAt: { $gte: week } }),
    ContactMessage.countDocuments({ read: { $ne: true } }),
    Vehicle.aggregate([{ $group: { _id: '$category', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
    Vehicle.aggregate([{ $group: { _id: '$district', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 8 }]),
    Vehicle.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - 13 * DAY) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '+05:30' } }, n: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);
  const openReports = await Report.countDocuments({ status: 'open' });
  res.json({
    success: true,
    data: {
      users, newUsers, ads, live, hidden, newAds, unread, openReports,
      byCategory: byCategory.map((c) => ({ key: c._id as string, n: c.n as number })),
      byDistrict: byDistrict.map((c) => ({ district: c._id as string, n: c.n as number })),
      perDay: perDay.map((c) => ({ day: c._id as string, n: c.n as number })),
    },
  });
});

// GET /api/admin/vehicles?q=&category=&state=all|live|hidden
export const listVehicles = asyncHandler(async (req: Request, res: Response) => {
  const q = z.object({ q: z.string().trim().max(60).optional(), category: z.enum(CATEGORY_KEYS).optional().or(z.literal('').transform(() => undefined)), state: z.enum(['all', 'live', 'hidden', 'reported']).default('all').or(z.literal('').transform(() => 'all' as const)) }).parse(req.query);
  const f: Record<string, unknown> = {};
  const now = new Date();
  if (q.category) f.category = q.category;
  if (q.state === 'reported') f._id = { $in: await Report.distinct('vehicle', { status: 'open' }) };
  if (q.state === 'live') Object.assign(f, { expiresAt: { $gt: now }, insuranceExpiry: { $gte: now } });
  if (q.state === 'hidden') f.$or = [{ expiresAt: { $lte: now } }, { insuranceExpiry: { $lt: now } }];
  if (q.q) {
    const re = new RegExp(esc(q.q), 'i');
    const owners = await User.find({ $or: [{ name: re }, { email: re }, { phone: re }] }).select('_id').limit(50).lean();
    const or = [{ make: re }, { vehicleModel: re }, { city: re }, { district: re }, { contactNumber: re }, { owner: { $in: owners.map((o) => o._id) } }];
    if (f.$or) { f.$and = [{ $or: f.$or }, { $or: or }]; delete f.$or; } else f.$or = or;
  }
  const list = await Vehicle.find(f).select('-images').populate('owner', 'name email phone').sort({ createdAt: -1 }).limit(300).lean();
  const reportRows = await Report.aggregate([{ $match: { status: 'open', vehicle: { $in: list.map((v) => v._id) } } }, { $group: { _id: '$vehicle', n: { $sum: 1 } } }]);
  const reported = new Map<string, number>(reportRows.map((r) => [String(r._id), r.n as number]));
  res.json({
    success: true,
    data: list.map((v) => ({ ...v, openReports: reported.get(String(v._id)) ?? 0, cover: v.cover ? optimised(v.cover) : v.imageCount ? `/vehicles/${String(v._id)}/images/0` : undefined, expired: v.expiresAt.getTime() < now.getTime(), insuranceExpired: v.insuranceExpiry.getTime() < now.getTime(), featured: !!v.featuredUntil && v.featuredUntil.getTime() > now.getTime() })),
  });
});

export const deleteVehicle = asyncHandler(async (req: Request, res: Response) => {
  if (!Types.ObjectId.isValid(req.params.id)) throw new ApiError(404, 'Ad not found');
  const v = await Vehicle.findById(req.params.id).select('+images');
  if (!v) throw new ApiError(404, 'Ad not found');
  await deleteImages(v.images);
  await v.deleteOne();
  await removeAdData([v._id]);
  res.json({ success: true, message: 'Ad deleted' });
});

// GET /api/admin/users?q=
export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const { q } = z.object({ q: z.string().trim().max(60).optional() }).parse(req.query);
  const f: Record<string, unknown> = {};
  if (q) { const re = new RegExp(esc(q), 'i'); f.$or = [{ name: re }, { email: re }, { phone: re }]; }
  const users = await User.find(f).select('name email phone role isActive banReason bannedAt avatar createdAt').sort({ createdAt: -1 }).limit(300).lean();
  const counts = await Vehicle.aggregate([{ $match: { owner: { $in: users.map((u) => u._id) } } }, { $group: { _id: '$owner', n: { $sum: 1 } } }]);
  const map = new Map(counts.map((c) => [String(c._id), c.n as number]));
  res.json({ success: true, data: users.map((u) => ({ ...u, ads: map.get(String(u._id)) ?? 0 })) });
});

// PATCH /api/admin/users/:id  { isActive }
export const setUserActive = asyncHandler(async (req: Request, res: Response) => {
  const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
  if (!Types.ObjectId.isValid(req.params.id)) throw new ApiError(404, 'User not found');
  const u = await User.findById(req.params.id);
  if (!u) throw new ApiError(404, 'User not found');
  if (u.role === 'admin') throw new ApiError(403, 'A company admin cannot be disabled here');
  u.isActive = isActive;
  if (!isActive) u.refreshTokens = [];
  await u.save();
  await Vehicle.updateMany({ owner: u._id }, isActive ? { $unset: { suspended: 1 } } : { $set: { suspended: true } });
  res.json({ success: true, message: isActive ? 'Account enabled' : 'Account disabled' });
});

/** delete an account with everything it owns (ads + photos, hearts, stars); returns how many ads went */
export async function purgeUser(u: InstanceType<typeof User>): Promise<number> {
  const ads = await Vehicle.find({ owner: u._id }).select('+images');
  await deleteImages(ads.flatMap((a) => a.images));
  await Vehicle.deleteMany({ owner: u._id });
  await removeAdData(ads.map((a) => a._id));
  await removeUserData(u._id);
  await u.deleteOne();
  return ads.length;
}

// DELETE /api/admin/users/:id - the user and all of their ads
export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  if (!Types.ObjectId.isValid(req.params.id)) throw new ApiError(404, 'User not found');
  const u = await User.findById(req.params.id);
  if (!u) throw new ApiError(404, 'User not found');
  if (u.role === 'admin') throw new ApiError(403, 'A company admin cannot be deleted here. Use the Admin Team page.');
  const n = await purgeUser(u);
  res.json({ success: true, message: `User deleted${n ? ` with ${n} ad(s)` : ''}` });
});

// ---------------------------------------------------------------- reports about ads
const labelOf = (key: string): string => REPORT_REASONS.find((r) => r.key === key)?.label ?? key;

// GET /api/admin/reports?status=open|resolved|dismissed|all
export const listReports = asyncHandler(async (req: Request, res: Response) => {
  const { status } = z.object({ status: z.enum(['open', 'resolved', 'dismissed', 'all']).default('open').or(z.literal('').transform(() => 'open' as const)) }).parse(req.query);
  const [rows, counts] = await Promise.all([
    Report.find(status === 'all' ? {} : { status })
      .sort({ createdAt: -1 }).limit(300)
      .populate('vehicle', 'make vehicleModel year category city district contactNumber cover imageCount expiresAt').lean(),
    Report.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  const count = (s: string): number => (counts.find((c) => c._id === s)?.n as number | undefined) ?? 0;
  res.json({
    success: true,
    data: {
      counts: { open: count('open'), resolved: count('resolved'), dismissed: count('dismissed') },
      items: rows.map((r) => {
        const v = r.vehicle as unknown as { _id: Types.ObjectId; make: string; vehicleModel: string; year?: number; category: string; city: string; district: string; contactNumber: string; cover?: string; imageCount: number } | null;
        return {
          id: String(r._id), status: r.status, reason: r.reason, reasonLabel: labelOf(r.reason), message: r.message, adminNote: r.adminNote, createdAt: r.createdAt, resolvedAt: r.resolvedAt,
          adTitle: r.adTitle, adCity: r.adCity, reporterName: r.reporterName, reporterEmail: r.reporterEmail,
          ad: v ? { id: String(v._id), title: `${v.make} ${v.vehicleModel}${v.year ? ' ' + v.year : ''}`, category: v.category, city: v.city, district: v.district, contactNumber: v.contactNumber, cover: v.cover ? optimised(v.cover) : v.imageCount ? `/vehicles/${String(v._id)}/images/0` : undefined } : null,
        };
      }),
    },
  });
});

// PATCH /api/admin/reports/:id  { status, adminNote? }
export const updateReport = asyncHandler(async (req: Request, res: Response) => {
  const body = z.object({ status: z.enum(['open', 'resolved', 'dismissed']), adminNote: z.string().trim().max(500).optional() }).parse(req.body);
  if (!Types.ObjectId.isValid(req.params.id)) throw new ApiError(404, 'Report not found');
  const r = await Report.findById(req.params.id);
  if (!r) throw new ApiError(404, 'Report not found');
  r.status = body.status;
  if (body.adminNote !== undefined) r.adminNote = body.adminNote || undefined;
  r.resolvedAt = body.status === 'open' ? undefined : new Date();
  await r.save();
  res.json({ success: true, message: body.status === 'open' ? 'Report re-opened' : body.status === 'resolved' ? 'Marked as resolved' : 'Report dismissed' });
});

// DELETE /api/admin/reports/:id
export const deleteReport = asyncHandler(async (req: Request, res: Response) => {
  if (!Types.ObjectId.isValid(req.params.id)) throw new ApiError(404, 'Report not found');
  const r = await Report.findByIdAndDelete(req.params.id);
  if (!r) throw new ApiError(404, 'Report not found');
  res.json({ success: true, message: 'Report deleted' });
});

// GET /api/admin/reports/open-count - the red number on the sidebar
export const openReportCount = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: { open: await Report.countDocuments({ status: 'open' }) } });
});

// ---------------------------------------------------------------- ban / unban
// PATCH /api/admin/users/:id/ban  { reason } - the account cannot sign in, the sessions end, the ads are hidden, the user gets an e-mail
export const banUser = asyncHandler(async (req: Request, res: Response) => {
  const { reason } = z.object({ reason: z.string().trim().min(3, 'Write the reason (the user will see it)').max(300) }).parse(req.body);
  if (!Types.ObjectId.isValid(req.params.id)) throw new ApiError(404, 'User not found');
  const u = await User.findById(req.params.id);
  if (!u) throw new ApiError(404, 'User not found');
  if (u.role === 'admin') throw new ApiError(403, 'A company admin cannot be banned here');
  u.isActive = false; u.banReason = reason; u.bannedAt = new Date(); u.refreshTokens = [];
  await u.save();
  const hidden = await Vehicle.updateMany({ owner: u._id }, { $set: { suspended: true } });
  void mailBanned(u.email, u.name, reason);
  res.json({ success: true, message: `${u.name} is banned. ${hidden.modifiedCount} ad(s) hidden.` });
});

// PATCH /api/admin/users/:id/unban
export const unbanUser = asyncHandler(async (req: Request, res: Response) => {
  if (!Types.ObjectId.isValid(req.params.id)) throw new ApiError(404, 'User not found');
  const u = await User.findById(req.params.id);
  if (!u) throw new ApiError(404, 'User not found');
  u.isActive = true; u.banReason = undefined; u.bannedAt = undefined;
  await u.save();
  await Vehicle.updateMany({ owner: u._id }, { $unset: { suspended: 1 } });
  void mailUnbanned(u.email, u.name);
  res.json({ success: true, message: `${u.name} can sign in again and the ads are visible.` });
});

// ---------------------------------------------------------------- Top ads and payments
// PUT /api/admin/vehicles/:id/featured  { days } - give a Top ad for free (0 = take the Top ad away)
export const setFeatured = asyncHandler(async (req: Request, res: Response) => {
  const { days } = z.object({ days: z.coerce.number().int().min(0).max(365) }).parse(req.body);
  if (!Types.ObjectId.isValid(req.params.id)) throw new ApiError(404, 'Ad not found');
  const v = await Vehicle.findById(req.params.id).select('-images').populate<{ owner: { _id: Types.ObjectId; name: string; email: string } }>('owner', 'name email');
  if (!v) throw new ApiError(404, 'Ad not found');
  if (days === 0) { await Vehicle.updateOne({ _id: v._id }, { $unset: { featuredUntil: 1 } }); res.json({ success: true, message: 'Top ad removed' }); return; }
  const until = await extendFeatured(v._id, days);
  const title = `${v.make} ${v.vehicleModel}${v.year ? ' ' + v.year : ''}`;
  const orderId = `VB-FREE-${Date.now().toString(36).toUpperCase()}`;
  await Payment.create({ orderId, user: v.owner._id, vehicle: v._id, days, amount: 0, status: 'paid', method: 'admin', paidAt: new Date(), adTitle: title, userName: v.owner.name, userEmail: v.owner.email });
  if (until) void mailFeatured(v.owner.email, v.owner.name, { id: String(v._id), title, days, until, amount: 0, orderId });
  res.json({ success: true, message: `Top ad for ${days} day(s), until ${until?.toLocaleDateString('en-GB')}` });
});

// GET /api/admin/payments?status=all|paid|pending|failed|cancelled
export const listPayments = asyncHandler(async (req: Request, res: Response) => {
  const { status } = z.object({ status: z.enum(['all', 'paid', 'pending', 'failed', 'cancelled']).default('all').or(z.literal('').transform(() => 'all' as const)) }).parse(req.query);
  const rows = await Payment.find(status === 'all' ? {} : { status }).sort({ createdAt: -1 }).limit(300).lean();
  const paid = await Payment.aggregate([{ $match: { status: 'paid', method: { $ne: 'admin' } } }, { $group: { _id: null, total: { $sum: '$amount' }, n: { $sum: 1 } } }]);
  res.json({ success: true, data: { totals: { revenue: paid[0]?.total ?? 0, paidCount: paid[0]?.n ?? 0 }, items: rows.map((p) => ({ id: String(p._id), orderId: p.orderId, status: p.status, method: p.method, days: p.days, amount: p.amount, adTitle: p.adTitle, adId: String(p.vehicle), userName: p.userName, userEmail: p.userEmail, createdAt: p.createdAt, paidAt: p.paidAt })) } });
});
