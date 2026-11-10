import crypto from 'crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Vehicle } from '../models/vehicle.model';
import { Payment, IPayment } from '../models/payment.model';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { env } from '../config/env';
import { liveFilter } from '../services/vehicleSearch.service';
import { mailFeatured, siteUrl } from '../services/adMail.service';

const DAY = 86_400_000;
const md5 = (s: string): string => crypto.createHash('md5').update(s).digest('hex').toUpperCase();
const configured = (): boolean => !!(env.payhere.merchantId && env.payhere.merchantSecret);
/** the no-money TEST payment: only while PayHere is not set up, and not in production (unless DEMO_PAYMENTS=true) */
const demoAllowed = (): boolean => !configured() && (env.nodeEnv !== 'production' || env.demoPayments);
const modeNow = (): 'payhere' | 'demo' | 'off' => (configured() ? 'payhere' : demoAllowed() ? 'demo' : 'off');
const adTitle = (v: { make: string; vehicleModel: string; year?: number }): string => `${v.make} ${v.vehicleModel}${v.year ? ' ' + v.year : ''}`;

/** make the ad a Top ad for `days` more days (added after any time it still has). Used by payments and by the company console. */
export async function extendFeatured(vehicleId: Types.ObjectId | string, days: number): Promise<Date | null> {
  const v = await Vehicle.findById(vehicleId).select('featuredUntil');
  if (!v) return null;
  const from = Math.max(Date.now(), v.featuredUntil ? v.featuredUntil.getTime() : 0);
  const until = new Date(from + days * DAY);
  await Vehicle.updateOne({ _id: v._id }, { $set: { featuredUntil: until } });
  return until;
}

/** a payment became PAID: Top ad starts, the owner gets a receipt. Safe to call twice (PayHere may notify more than once). */
async function applyPaid(paymentId: Types.ObjectId, payherePaymentId?: string): Promise<IPayment | null> {
  const p = await Payment.findOneAndUpdate({ _id: paymentId, status: { $ne: 'paid' } }, { $set: { status: 'paid', paidAt: new Date(), ...(payherePaymentId ? { payherePaymentId } : {}) } }, { new: true });
  if (!p) return null; // already paid before
  const until = await extendFeatured(p.vehicle, p.days);
  if (until && p.userEmail) void mailFeatured(p.userEmail, p.userName, { id: String(p.vehicle), title: p.adTitle, days: p.days, until, amount: p.amount, orderId: p.orderId });
  else if (!until) console.error(`[payments] order ${p.orderId} was paid but the ad no longer exists - refund needed`);
  return p;
}

// GET /api/payments/plans
export const plans = asyncHandler(async (_req: Request, res: Response) => { res.json({ success: true, data: { plans: env.featurePlans, mode: modeNow() } }); });

// POST /api/payments/featured  { vehicleId, days } -> the PayHere form to submit, or { mode: 'demo' }
export const startFeatured = asyncHandler(async (req: Request, res: Response) => {
  const { vehicleId, days } = z.object({ vehicleId: z.string(), days: z.coerce.number() }).parse(req.body);
  const plan = env.featurePlans.find((p) => p.days === days);
  if (!plan) throw new ApiError(400, 'Choose one of the Top ad plans');
  if (modeNow() === 'off') throw new ApiError(503, 'Online payment is not set up yet. Please contact us to make your ad a Top ad.');
  if (!Types.ObjectId.isValid(vehicleId)) throw new ApiError(404, 'Ad not found');
  const ad = await Vehicle.findOne({ _id: vehicleId, owner: req.user!.id, ...liveFilter() }).select('-images');
  if (!ad) throw new ApiError(404, 'Ad not found (only your own ads that are online can be made a Top ad)');

  const orderId = `VB${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const user = req.user!;
  await Payment.create({ orderId, user: user._id, vehicle: ad._id, days: plan.days, amount: plan.price, method: configured() ? 'payhere' : 'demo', adTitle: adTitle(ad), userName: user.name, userEmail: user.email });

  if (!configured()) { res.json({ success: true, data: { mode: 'demo', orderId, amount: plan.price, days: plan.days } }); return; }
  const amount = plan.price.toFixed(2);
  const apiBase = env.publicApiUrl || `${req.protocol}://${req.get('host')}`;
  const [first, ...rest] = user.name.trim().split(/\s+/);
  res.json({
    success: true,
    data: {
      mode: 'payhere', orderId,
      action: env.payhere.sandbox ? 'https://sandbox.payhere.lk/pay/checkout' : 'https://www.payhere.lk/pay/checkout',
      fields: {
        merchant_id: env.payhere.merchantId,
        return_url: `${siteUrl()}/my-ads?boost=success&order=${orderId}`,
        cancel_url: `${siteUrl()}/my-ads?boost=cancelled`,
        notify_url: `${apiBase}/api/payments/payhere/notify`,
        order_id: orderId, items: `Top ad - ${adTitle(ad)} (${plan.days} days)`, currency: 'LKR', amount,
        first_name: first || 'Customer', last_name: rest.join(' ') || '-', email: user.email, phone: user.phone || '0000000000', address: '-', city: ad.city, country: 'Sri Lanka',
        hash: md5(`${env.payhere.merchantId}${orderId}${amount}LKR${md5(env.payhere.merchantSecret)}`),
      },
    },
  });
});

// POST /api/payments/payhere/notify - PayHere tells us (server to server) what happened; the signature proves it really is PayHere
export const payhereNotify = asyncHandler(async (req: Request, res: Response) => {
  if (!configured()) throw new ApiError(404, 'Not found');
  const b = req.body as Record<string, string>;
  const mine = md5(`${b.merchant_id}${b.order_id}${b.payhere_amount}${b.payhere_currency}${b.status_code}${md5(env.payhere.merchantSecret)}`);
  if (!b.md5sig || b.merchant_id !== env.payhere.merchantId || mine !== String(b.md5sig).toUpperCase()) throw new ApiError(400, 'Bad signature');
  const p = await Payment.findOne({ orderId: b.order_id });
  if (!p) throw new ApiError(404, 'Unknown order');
  if (Math.abs(Number(b.payhere_amount) - p.amount) > 0.001 || b.payhere_currency !== 'LKR') throw new ApiError(400, 'Amount does not match the order');
  if (b.status_code === '2') await applyPaid(p._id, b.payment_id);
  else if (b.status_code === '-1') await Payment.updateOne({ _id: p._id, status: 'pending' }, { $set: { status: 'cancelled' } });
  else if (b.status_code === '-2' || b.status_code === '-3') await Payment.updateOne({ _id: p._id, status: { $ne: 'paid' } }, { $set: { status: 'failed' } });
  res.status(200).send('OK');
});

// POST /api/payments/demo/confirm  { orderId } - TEST mode only: pretend the payment went through (no money moves)
export const demoConfirm = asyncHandler(async (req: Request, res: Response) => {
  if (!demoAllowed()) throw new ApiError(403, 'Test payments are switched off');
  const { orderId } = z.object({ orderId: z.string() }).parse(req.body);
  const p = await Payment.findOne({ orderId, user: req.user!._id, method: 'demo' });
  if (!p) throw new ApiError(404, 'Order not found');
  await applyPaid(p._id);
  res.json({ success: true, message: 'Test payment done. The ad is a Top ad now.' });
});

// GET /api/payments/status/:orderId - the page after PayHere asks this (the notification can arrive a few seconds later)
export const paymentStatus = asyncHandler(async (req: Request, res: Response) => {
  const p = await Payment.findOne({ orderId: req.params.orderId, user: req.user!._id });
  if (!p) throw new ApiError(404, 'Order not found');
  const v = await Vehicle.findById(p.vehicle).select('featuredUntil');
  res.json({ success: true, data: { status: p.status, days: p.days, amount: p.amount, adTitle: p.adTitle, featuredUntil: v?.featuredUntil } });
});

export { applyPaid };
