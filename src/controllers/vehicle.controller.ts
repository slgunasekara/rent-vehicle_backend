import { Request, Response } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Vehicle } from '../models/vehicle.model';
import { User } from '../models/user.model';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { hostImages, isCloudUrl, optimised, deleteImages } from '../services/storage.service';
import { card, exactRe, liveFilter, photoUrls, regexEsc, runSearch, wordRe } from '../services/vehicleSearch.service';
import { removeAdData } from '../services/cleanup.service';
import { mailAdLive } from '../services/adMail.service';
import { checkTexts } from '../utils/moderation';
import { Favorite } from '../models/favorite.model';
import { isValidLocation, districtNames } from '../data/locations';
import { CATEGORY_KEYS, FUEL_KEYS, DRIVER_KEYS, CONDITION_KEYS, PRICE_TYPE_KEYS, AD_DAYS, MAX_PHOTOS, MAKES } from '../data/vehicleOptions';

const DAY = 24 * 60 * 60 * 1000;
const MAX_ADS_PER_USER = 50;
const PAGE_SIZE = 20;

/** the insurance is valid through the END of the given day (Sri Lanka time) */
const endOfDay = (ymd: string): Date => new Date(`${ymd}T23:59:59.999+05:30`);

// the form sends numbers as text ("18000"), so numeric strings are converted first; empty = not given
const toNum = (v: unknown): unknown => (v === '' || v === null || v === undefined ? undefined : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v);
const money = z.preprocess(toNum, z.number({ invalid_type_error: 'Enter a valid price' }).min(1, 'Enter a price above 0').max(100_000_000).optional());
const optInt = (min: number, max: number) => z.preprocess(toNum, z.number({ invalid_type_error: 'Enter a valid number' }).int().min(min).max(max).optional());

const adSchema = z.object({
  category: z.enum(CATEGORY_KEYS),
  make: z.string().trim().min(2, 'Choose the make').max(40).refine((m) => MAKES.includes(m), 'Choose the make from the list'),
  vehicleModel: z.string().trim().min(1, 'Enter the model').max(60),
  year: optInt(1900, new Date().getFullYear() + 1),
  fuel: z.enum(FUEL_KEYS),
  driver: z.enum(DRIVER_KEYS),
  condition: z.enum(CONDITION_KEYS),
  seats: optInt(1, 100),
  // optional: how many km it runs on 1 litre (one decimal at most)
  kmPerLitre: z.preprocess(toNum, z.number({ invalid_type_error: 'Enter the km per litre as a number' }).min(0.5, 'Fuel economy must be at least 0.5 km per litre').max(200, 'Fuel economy looks too high - km per litre, please check').optional()).transform((n) => (n === undefined ? undefined : Math.round(n * 10) / 10)),
  district: z.enum(districtNames as [string, ...string[]]),
  city: z.string().trim().min(2).max(60),
  priceType: z.enum(PRICE_TYPE_KEYS),
  pricePerKm: money,
  pricePerDay: money,
  pricePerMonth: money,
  contactNumber: z.string().trim().min(7, 'Enter a phone number').max(20),
  description: z.string().trim().max(1000).optional(),
  insuranceExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the insurance expiry date'),
  images: z.array(z.string().max(2_500_000).refine((v) => /^data:image\/(jpeg|png|webp);base64,/.test(v) || isCloudUrl(v), 'Each image must be a photo')).min(1, 'Add at least 1 photo').max(MAX_PHOTOS, `You can add up to ${MAX_PHOTOS} photos`),
});

/** checks that depend on more than one field, and drops the prices the chosen price type does not use */
function finish(b: z.infer<typeof adSchema>) {
  if (!isValidLocation(b.district, b.city)) throw new ApiError(400, 'Choose a city from the list');
  const exp = endOfDay(b.insuranceExpiry);
  if (Number.isNaN(exp.getTime())) throw new ApiError(400, 'The insurance expiry date is not valid');
  if (exp.getTime() < Date.now()) throw new ApiError(400, 'The insurance has already expired - a vehicle with expired insurance cannot be advertised');
  const need = (ok: unknown, msg: string) => { if (!ok) throw new ApiError(400, msg); };
  const t = b.priceType;
  if (t === 'per_km' || t === 'km_and_day') need(b.pricePerKm, 'Enter the price per km');
  if (t === 'per_day' || t === 'km_and_day') need(b.pricePerDay, 'Enter the price per day');
  if (t === 'per_month') need(b.pricePerMonth, 'Enter the price per month');
  return {
    ...b,
    kmPerLitre: b.fuel === 'electric' ? undefined : b.kmPerLitre, // km per litre means nothing for an electric vehicle
    insuranceExpiry: exp,
    pricePerKm: t === 'per_km' || t === 'km_and_day' ? b.pricePerKm : undefined,
    pricePerDay: t === 'per_day' || t === 'km_and_day' ? b.pricePerDay : undefined,
    pricePerMonth: t === 'per_month' ? b.pricePerMonth : undefined,
  };
}

const totalBytes = (imgs: string[]): number => imgs.reduce((n, i) => n + i.length, 0);

/** a Cloudinary URL sent by the browser must already belong to THIS ad - otherwise someone could attach another owner's photo and delete it later by deleting their own ad */
const onlyOwnCloudUrls = (sent: string[], own: string[]): void => {
  if (sent.some((u) => isCloudUrl(u) && !own.includes(u))) throw new ApiError(400, 'One of the photos is not valid. Remove it and upload it again.');
};

// ---------------------------------------------------------------------------------------------
// Public search
// ---------------------------------------------------------------------------------------------
const searchQuery = z.object({
  category: z.enum(CATEGORY_KEYS).optional().or(z.literal('').transform(() => undefined)),
  make: z.string().trim().max(40).optional(),
  model: z.string().trim().max(60).optional(),
  fuel: z.enum(FUEL_KEYS).optional().or(z.literal('').transform(() => undefined)),
  driver: z.enum(['with', 'without']).optional().or(z.literal('').transform(() => undefined)),
  condition: z.enum(CONDITION_KEYS).optional().or(z.literal('').transform(() => undefined)),
  district: z.string().trim().max(40).optional(),
  city: z.string().trim().max(60).optional(),
  q: z.string().trim().max(60).optional(),
  payment: z.enum(['daily', 'monthly']).optional().or(z.literal('').transform(() => undefined)),
  minPrice: z.literal('').transform(() => undefined).or(z.coerce.number().min(0)).optional(),
  maxPrice: z.literal('').transform(() => undefined).or(z.coerce.number().min(0)).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'rating']).default('newest').or(z.literal('').transform(() => 'newest' as const)),
  page: z.coerce.number().int().min(1).max(500).default(1).or(z.literal('').transform(() => 1)),
});


// GET /api/vehicles?category=&make=&model=&fuel=&driver=&condition=&district=&city=&payment=&minPrice=&maxPrice=&sort=&page=
export const searchVehicles = asyncHandler(async (req: Request, res: Response) => {
  const q = searchQuery.parse(req.query);
  const f: Record<string, unknown> = liveFilter();
  if (q.category) f.category = q.category;
  if (q.make) f.make = exactRe(q.make);
  if (q.model) f.vehicleModel = wordRe(q.model);
  if (q.fuel) f.fuel = q.fuel;
  if (q.driver) f.driver = { $in: [q.driver, 'both'] }; // "with driver" also finds the ones that offer both
  if (q.condition) f.condition = q.condition;
  if (q.city) f.city = exactRe(q.city); // a city was picked
  if (q.district && !q.city) f.district = exactRe(q.district); // "Colombo District" = every city of it
  if (q.q) { const re = wordRe(q.q); f.$or = [{ make: re }, { vehicleModel: re }, { city: re }, { district: re }]; }
  const priceField = q.payment === 'monthly' ? 'pricePerMonth' : 'pricePerDay';
  if (q.minPrice !== undefined || q.maxPrice !== undefined) {
    const range: Record<string, number> = {};
    if (q.minPrice !== undefined) range.$gte = q.minPrice;
    if (q.maxPrice !== undefined) range.$lte = q.maxPrice;
    f[priceField] = range; // ads that say "call now" have no price, so a price filter leaves them out
  }
  const { rows, total } = await runSearch(f, priceField, q.sort, q.page, PAGE_SIZE);
  res.json({ success: true, data: rows, meta: { total, page: q.page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), pageSize: PAGE_SIZE } });
});

// GET /api/vehicles/:id  (public)
export const getVehicle = asyncHandler(async (req: Request, res: Response) => {
  if (!Types.ObjectId.isValid(req.params.id)) throw new ApiError(404, 'Vehicle not found');
  const v = await Vehicle.findOne({ _id: req.params.id, ...liveFilter() }).select('+images').populate<{ owner: { _id: Types.ObjectId; name: string; createdAt: Date } }>('owner', 'name createdAt').lean();
  if (!v) throw new ApiError(404, 'This ad is no longer available (it may have expired or been removed)');
  const { images, ...rest } = v;
  res.json({ success: true, data: { ...card({ ...rest, images }), photos: photoUrls(v._id, images ?? []), owner: { name: v.owner?.name ?? 'Owner', since: v.owner?.createdAt } } });
});

// GET /api/vehicles/:id/images/:n  (public) - a photo that is kept in the database, as a real image so browsers can cache it
export const vehicleImage = asyncHandler(async (req: Request, res: Response) => {
  if (!Types.ObjectId.isValid(req.params.id)) throw new ApiError(404, 'Image not found');
  const v = await Vehicle.findById(req.params.id).select('+images').lean();
  const img = v?.images?.[Number(req.params.n)];
  if (img && isCloudUrl(img)) { res.set('Cache-Control', 'public, max-age=86400'); return res.redirect(302, optimised(img)); }
  const m = img?.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) throw new ApiError(404, 'Image not found');
  res.set({ 'Content-Type': m[1], 'Cache-Control': 'public, max-age=3600', 'Cross-Origin-Resource-Policy': 'cross-origin' });
  res.send(Buffer.from(m[2], 'base64'));
});

// GET /api/stats/public - numbers for the home page
export const publicStats = asyncHandler(async (_req: Request, res: Response) => {
  const live = liveFilter();
  const [vehicles, users, cities, byCategory] = await Promise.all([
    Vehicle.countDocuments(live),
    User.countDocuments({ role: 'user', isActive: true }),
    Vehicle.distinct('city', live),
    Vehicle.aggregate([{ $match: live }, { $group: { _id: '$category', n: { $sum: 1 } } }]),
  ]);
  res.json({ success: true, data: { vehicles, users, cities: cities.length, byCategory: Object.fromEntries(byCategory.map((c) => [c._id as string, c.n as number])) } });
});

// ---------------------------------------------------------------------------------------------
// The signed-in person's own ads (every account can post, nobody has to approve anything)
// ---------------------------------------------------------------------------------------------
export const myVehicles = asyncHandler(async (req: Request, res: Response) => {
  const list = await Vehicle.find({ owner: req.user!.id }).select('-images').sort({ createdAt: -1 }).lean();
  // the owner's numbers: views and call clicks are counters on the ad, saves are counted from the hearts
  const hearts = await Favorite.aggregate([{ $match: { vehicle: { $in: list.map((v) => v._id) } } }, { $group: { _id: '$vehicle', n: { $sum: 1 } } }]);
  const saves = new Map<string, number>(hearts.map((h) => [String(h._id), h.n as number]));
  res.json({ success: true, data: list.map((v) => ({ ...card(v), callClicks: v.callClicks ?? 0, saves: saves.get(String(v._id)) ?? 0 })) });
});

// GET /api/vehicles/mine/:id - my own ad WITH its photos (for the edit form)
export const myVehicle = asyncHandler(async (req: Request, res: Response) => {
  if (!Types.ObjectId.isValid(req.params.id)) throw new ApiError(404, 'Ad not found');
  const v = await Vehicle.findOne({ _id: req.params.id, owner: req.user!.id }).select('+images').lean();
  if (!v) throw new ApiError(404, 'Ad not found');
  res.json({ success: true, data: { ...card(v), images: v.images } });
});

/** the same vehicle posted twice (by the same owner, or by somebody else with the same phone number) is refused */
async function rejectDuplicate(ownerId: string, b: { category: string; make: string; vehicleModel: string; year?: number; city: string; contactNumber: string }): Promise<void> {
  const same = { category: b.category, make: b.make, vehicleModel: new RegExp(`^${regexEsc(b.vehicleModel.trim())}$`, 'i'), city: new RegExp(`^${regexEsc(b.city.trim())}$`, 'i'), ...(b.year ? { year: b.year } : {}), expiresAt: { $gt: new Date() } };
  if (await Vehicle.exists({ ...same, owner: ownerId })) throw new ApiError(409, 'You already posted this vehicle. Open My Ads to edit or renew that ad instead of posting it again.');
  if (await Vehicle.exists({ ...same, contactNumber: b.contactNumber, owner: { $ne: ownerId } })) throw new ApiError(409, 'An ad for this vehicle with the same phone number is already on Vehicle Buddy.');
}

export const createVehicle = asyncHandler(async (req: Request, res: Response) => {
  const body = finish(adSchema.parse(req.body));
  checkTexts({ 'model name': body.vehicleModel, description: body.description });
  await rejectDuplicate(String(req.user!.id), body);
  onlyOwnCloudUrls(body.images, []);
  if (totalBytes(body.images) > 14_000_000) throw new ApiError(413, 'The photos are too large together - remove a few or use smaller ones');
  if ((await Vehicle.countDocuments({ owner: req.user!.id })) >= MAX_ADS_PER_USER) throw new ApiError(400, `You can have up to ${MAX_ADS_PER_USER} ads at the same time. Delete an old one first.`);
  const images = await hostImages(body.images, 'findvehicle/ads'); // photos go to Cloudinary; only the short URL is stored
  const v = await Vehicle.create({ ...body, images, imageCount: images.length, owner: req.user!.id, expiresAt: new Date(Date.now() + AD_DAYS * DAY) });
  void mailAdLive(req.user!.email, req.user!.name, { id: String(v._id), title: `${v.make} ${v.vehicleModel}${v.year ? ' ' + v.year : ''}`, city: v.city, expiresAt: v.expiresAt });
  res.status(201).json({ success: true, data: { _id: v._id }, message: `Your ad is live now. It stays online for ${AD_DAYS} days and is then removed automatically.` });
});

export const updateVehicle = asyncHandler(async (req: Request, res: Response) => {
  checkTexts({ 'model name': String(req.body?.vehicleModel ?? ''), description: String(req.body?.description ?? '') });
  if (!Types.ObjectId.isValid(req.params.id)) throw new ApiError(404, 'Ad not found');
  const v = await Vehicle.findOne({ _id: req.params.id, owner: req.user!.id }).select('+images');
  if (!v) throw new ApiError(404, 'Ad not found');
  const body = finish(adSchema.parse(req.body));
  onlyOwnCloudUrls(body.images, v.images);
  if (totalBytes(body.images) > 14_000_000) throw new ApiError(413, 'The photos are too large together - remove a few or use smaller ones');
  const images = await hostImages(body.images, 'findvehicle/ads');
  const dropped = v.images.filter((old) => isCloudUrl(old) && !images.includes(old)); // photos the owner removed
  const { images: _i, ...rest } = body;
  v.set({ ...rest, images, imageCount: images.length });
  for (const k of ['pricePerKm', 'pricePerDay', 'pricePerMonth', 'year', 'seats', 'kmPerLitre', 'description'] as const) if (rest[k] === undefined) v.set(k, undefined);
  v.insuranceMailed = v.insuranceExpiry.getTime() < Date.now(); // a new, valid date: the owner may be told again when it runs out
  await v.save();
  void deleteImages(dropped);
  res.json({ success: true, data: { _id: v._id }, message: 'Ad updated' });
});

// DELETE /api/vehicles/:id - the owner can delete an ad whenever they want
export const deleteVehicle = asyncHandler(async (req: Request, res: Response) => {
  if (!Types.ObjectId.isValid(req.params.id)) throw new ApiError(404, 'Ad not found');
  const v = await Vehicle.findOne({ _id: req.params.id, owner: req.user!.id }).select('+images');
  if (!v) throw new ApiError(404, 'Ad not found');
  await deleteImages(v.images);
  await v.deleteOne();
  await removeAdData([v._id]);
  res.json({ success: true, message: 'Ad deleted' });
});

// POST /api/vehicles/:id/renew - another 60 days from today
export const renewVehicle = asyncHandler(async (req: Request, res: Response) => {
  if (!Types.ObjectId.isValid(req.params.id)) throw new ApiError(404, 'Ad not found');
  const v = await Vehicle.findOne({ _id: req.params.id, owner: req.user!.id });
  if (!v) throw new ApiError(404, 'Ad not found');
  v.expiresAt = new Date(Date.now() + AD_DAYS * DAY);
  await v.save();
  res.json({ success: true, message: v.insuranceExpiry.getTime() < Date.now() ? `Renewed for ${AD_DAYS} days, but the insurance has expired - edit the ad and enter the new insurance date, or it stays hidden.` : `Renewed - the ad stays online for another ${AD_DAYS} days.` });
});
