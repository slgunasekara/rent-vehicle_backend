import { Vehicle, IVehicle } from '../models/vehicle.model';
import { isCloudUrl, optimised } from './storage.service';

const DAY = 24 * 60 * 60 * 1000;

/** shared by the public search (vehicle.controller) and by Buddy the chat helper (chat.controller) */
export const regexEsc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** "toy" finds Toyota (start of the name or of any word in it) */
export const wordRe = (s: string): RegExp => new RegExp('(^|\\s)' + regexEsc(s.trim()), 'i');
export const exactRe = (s: string): RegExp => new RegExp('^' + regexEsc(s.trim()) + '$', 'i');

/** ads people may see: not past their 60 days, insurance still valid */
export const liveFilter = (): Record<string, unknown> => ({ expiresAt: { $gt: new Date() }, insuranceExpiry: { $gte: new Date() }, suspended: { $ne: true } });

export type Lean = Pick<IVehicle, 'cover' | 'imageCount' | 'expiresAt' | 'insuranceExpiry'> & { _id: unknown; featuredUntil?: Date };

/** a photo address the browser can open: Cloudinary URLs as they are, photos kept in the database through /vehicles/:id/images/:n */
export const photoUrls = (id: unknown, images: string[]): string[] => images.map((img, n) => (isCloudUrl(img) ? optimised(img) : `/vehicles/${String(id)}/images/${n}`));
export const coverOf = (v: Lean): string | undefined => (v.cover ? optimised(v.cover) : v.imageCount ? `/vehicles/${String(v._id)}/images/0` : undefined);

export const optimisedCover = (v: { _id: unknown; cover?: string; imageCount: number }): string | undefined => coverOf(v as Lean);

export const card = <T extends Lean & { images?: string[] }>(v: T) => {
  // callClicks / insuranceMailed / suspended are for the owner and the company only: never part of a public card
  const { images: _images, cover: _cover, callClicks: _calls, insuranceMailed: _im, suspended: _sus, ...rest } = v as typeof v & { callClicks?: number; insuranceMailed?: boolean; suspended?: boolean };
  const now = Date.now();
  return {
    ...rest,
    cover: coverOf(v),
    featured: !!v.featuredUntil && new Date(v.featuredUntil).getTime() > now, // a paid "Top ad"
    daysLeft: Math.max(0, Math.ceil((new Date(v.expiresAt).getTime() - now) / DAY)),
    expired: new Date(v.expiresAt).getTime() < now,
    insuranceExpired: new Date(v.insuranceExpiry).getTime() < now,
  };
};

export type SortKey = 'newest' | 'price_asc' | 'price_desc' | 'rating';

/** one page of ads for a filter, sorted; ads without a price go to the end of a price sort */
export async function runSearch(f: Record<string, unknown>, priceField: 'pricePerDay' | 'pricePerMonth', sort: SortKey, page: number, pageSize: number) {
  const dir = sort === 'price_asc' ? 1 : -1;
  // paid "Top ads" come first when the list is sorted by newest / rating (a price sort stays a pure price sort)
  const sortStage: Record<string, 1 | -1> = sort === 'newest' ? { _f: -1, createdAt: -1 } : sort === 'rating' ? { _f: -1, ratingAvg: -1, ratingCount: -1, createdAt: -1 } : { _k: dir, createdAt: -1 };
  const [rows, total] = await Promise.all([
    Vehicle.aggregate([
      { $match: f },
      { $addFields: { _k: { $ifNull: [`$${priceField}`, dir > 0 ? 1e12 : -1] }, _f: { $cond: [{ $gt: ['$featuredUntil', new Date()] }, 1, 0] } } },
      { $sort: sortStage },
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize },
      { $project: { images: 0, _k: 0, _f: 0, __v: 0 } },
    ]),
    Vehicle.countDocuments(f),
  ]);
  return { rows: rows.map(card), total };
}
