import { Vehicle } from '../models/vehicle.model';
import { deleteImages } from './storage.service';
import { removeAdData } from './cleanup.service';
import { mailAdExpired, mailInsuranceExpired } from './adMail.service';

/**
 * Ads live for 60 days. This removes the ones that ran out (their photos too, so the free Cloudinary storage never fills up).
 * It runs when the server starts and every hour; on Vercel an outside timer calls GET /api/cron/run instead.
 * The public search ALSO hides expired ads by itself, so an ad never shows after its 60 days even if this job is late.
 */
type Owner = { name: string; email: string } | null;
const titleOf = (v: { make: string; vehicleModel: string; year?: number }): string => `${v.make} ${v.vehicleModel}${v.year ? ' ' + v.year : ''}`;

/** ads whose insurance date passed are hidden by the search; the owner is told ONCE (until the date is changed) */
async function notifyInsuranceExpired(): Promise<void> {
  const now = new Date();
  const ads = await Vehicle.find({ insuranceExpiry: { $lt: now }, expiresAt: { $gt: now }, insuranceMailed: { $ne: true } }).select('-images').populate('owner', 'name email').limit(200);
  if (!ads.length) return;
  await Vehicle.updateMany({ _id: { $in: ads.map((a) => a._id) } }, { $set: { insuranceMailed: true } }); // marked first, so a slow mail server never causes repeats
  for (const ad of ads) {
    const o = ad.owner as unknown as Owner;
    if (o?.email) void mailInsuranceExpired(o.email, o.name, { id: String(ad._id), title: titleOf(ad), insuranceExpiry: ad.insuranceExpiry });
  }
}

export async function purgeExpired(): Promise<{ removed: number }> {
  await notifyInsuranceExpired().catch((e) => console.error('[expiry] insurance notice failed', e));
  const old = await Vehicle.find({ expiresAt: { $lt: new Date() } }).select('+images').populate('owner', 'name email').limit(200);
  if (!old.length) return { removed: 0 };
  await deleteImages(old.flatMap((v) => v.images));
  await Vehicle.deleteMany({ _id: { $in: old.map((v) => v._id) } });
  await removeAdData(old.map((v) => v._id));
  // "your ad has expired" e-mail to each owner (after the delete, so a failed mail can never bring the ad back or send twice)
  for (const ad of old) {
    const o = ad.owner as unknown as Owner;
    if (o?.email) void mailAdExpired(o.email, o.name, { title: titleOf(ad), city: ad.city, expiresAt: ad.expiresAt });
  }
  return { removed: old.length };
}

export function startExpiryJob(): void {
  const run = () => purgeExpired().then((r) => { if (r.removed) console.log(`[expiry] removed ${r.removed} expired ad(s)`); }).catch((e) => console.error('[expiry] failed', e));
  void run();
  setInterval(run, 60 * 60 * 1000).unref();
}
