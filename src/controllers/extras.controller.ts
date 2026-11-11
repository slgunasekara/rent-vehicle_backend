import crypto from 'crypto';
import {Request, Response} from 'express';
import {z} from 'zod';
import {Types} from 'mongoose';
import {Vehicle} from '../models/vehicle.model';
import {ViewLog} from '../models/viewLog.model';
import {asyncHandler} from '../utils/asyncHandler';
import {ApiError} from '../utils/ApiError';
import {card, liveFilter, optimisedCover} from '../services/vehicleSearch.service';
import {siteUrl} from '../services/adMail.service';
import {writeDescription} from '../services/ai.service';
import {checkTexts} from '../utils/moderation';
import {CATEGORY_KEYS, FUEL_KEYS, DRIVER_KEYS, CONDITION_KEYS} from '../data/vehicleOptions';

const HOUR = 3_600_000;


const viewerKey = (req: Request): string => (req.user ? `u:${req.user.id}` : 'v:' + crypto.createHash('sha1').update(`${req.ip}|${req.headers['user-agent'] ?? ''}`).digest('hex').slice(0, 24));

async function hit(req: Request, kind: 'view' | 'call', hours: number): Promise<{
    counted: boolean;
    views: number;
    callClicks: number
}> {
    if (!Types.ObjectId.isValid(req.params.id)) throw new ApiError(404, 'Ad not found');
    const v = await Vehicle.findOne({_id: req.params.id, ...liveFilter()}).select('owner views callClicks');
    if (!v) throw new ApiError(404, 'Ad not found');
    let counted = false;
    if (!(req.user && String(v.owner) === String(req.user.id))) {
        try {
            await ViewLog.create({
                vehicle: v._id,
                kind,
                viewer: viewerKey(req),
                expireAt: new Date(Date.now() + hours * HOUR)
            });
            await Vehicle.updateOne({_id: v._id}, {$inc: kind === 'view' ? {views: 1} : {callClicks: 1}});
            counted = true;
        } catch (e) {
            if ((e as { code?: number }).code !== 11000) throw e; // 11000 = this visitor was already counted recently
        }
    }
    return {
        counted,
        views: v.views + (counted && kind === 'view' ? 1 : 0),
        callClicks: v.callClicks + (counted && kind === 'call' ? 1 : 0)
    };
}

export const recordView = asyncHandler(async (req: Request, res: Response) => {
    res.json({success: true, data: await hit(req, 'view', 6)});
});
export const recordCall = asyncHandler(async (req: Request, res: Response) => {
    res.json({success: true, data: await hit(req, 'call', 1)});
});

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
})[c] as string);
const rs = (n: number): string => `Rs. ${n.toLocaleString('en-US')}`;

function priceText(v: {
    priceType: string;
    pricePerKm?: number;
    pricePerDay?: number;
    pricePerMonth?: number
}): string {
    const parts = [v.pricePerDay ? `${rs(v.pricePerDay)} / day` : '', v.pricePerKm ? `${rs(v.pricePerKm)} / km` : '', v.pricePerMonth ? `${rs(v.pricePerMonth)} / month` : ''].filter(Boolean);
    return v.priceType === 'call' || !parts.length ? 'Call for the price' : parts.join(' + ');
}


export const sharePage = asyncHandler(async (req: Request, res: Response) => {
    const home = siteUrl() || '/';
    const v = Types.ObjectId.isValid(req.params.id) ? await Vehicle.findOne({_id: req.params.id, ...liveFilter()}).select('-images').lean() : null;
    res.set('Content-Type', 'text/html; charset=utf-8').set('Cache-Control', 'public, max-age=300');
    if (!v) {
        res.status(404).send(`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${esc(home)}"><a href="${esc(home)}">Vehicle Buddy</a>`);
        return;
    }
    const base = `${req.protocol}://${req.get('host')}`;
    const cover = optimisedCover(v);
    const image = cover ? (cover.startsWith('http') ? cover : `${base}/api${cover}`) : '';
    const title = `${v.make} ${v.vehicleModel}${v.year ? ' ' + v.year : ''} for hire in ${v.city}`;
    const desc = `${priceText(v)} · ${v.fuel}${v.kmPerLitre ? ` ${v.kmPerLitre} km/L` : ''} · ${v.driver === 'with' ? 'with driver' : v.driver === 'without' ? 'without driver' : 'with or without driver'} · ${v.city}, ${v.district}. Call the owner directly on Vehicle Buddy.`;
    const target = `${home}/vehicle/${String(v._id)}`;
    res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)} | Vehicle Buddy</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Vehicle Buddy"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(target)}">
${image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:image" content="${esc(image)}">` : ''}
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}">
<meta http-equiv="refresh" content="0;url=${esc(target)}"></head><body><p>Opening <a href="${esc(target)}">${esc(title)}</a> ...</p></body></html>`);
});

const words = (s: string): Set<string> => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1));

export const similar = asyncHandler(async (req: Request, res: Response) => {
    if (!Types.ObjectId.isValid(req.params.id)) throw new ApiError(404, 'Ad not found');
    const base = await Vehicle.findById(req.params.id).select('-images').lean();
    if (!base) throw new ApiError(404, 'Ad not found');
    const pool = await Vehicle.find({
        category: base.category,
        _id: {$ne: base._id}, ...liveFilter()
    }).select('-images').sort({createdAt: -1}).limit(80).lean();
    const bw = words(base.vehicleModel);
    const price = base.pricePerDay ?? base.pricePerMonth ?? base.pricePerKm;
    const scored = pool.map((v) => {
        let s = 0;
        if (v.city.toLowerCase() === base.city.toLowerCase()) s += 4; else if (v.district === base.district) s += 2;
        if (v.make === base.make) s += 2;
        if ([...words(v.vehicleModel)].some((w) => bw.has(w))) s += 1;
        const p = v.pricePerDay ?? v.pricePerMonth ?? v.pricePerKm;
        if (price && p && Math.abs(p - price) / price <= 0.5) s += 1;
        return {
            v,
            s: s + (v.ratingAvg ?? 0) / 10 + ((v.featuredUntil && new Date(v.featuredUntil) > new Date()) ? 0.5 : 0)
        };
    });
    scored.sort((a, b) => b.s - a.s);
    res.json({success: true, data: scored.slice(0, 6).map((x) => card(x.v))});
});

export const byIds = asyncHandler(async (req: Request, res: Response) => {
    const ids = String(req.query.ids ?? '').split(',').map((s) => s.trim()).filter((s) => Types.ObjectId.isValid(s)).slice(0, 12);
    const list = await Vehicle.find({_id: {$in: ids}, ...liveFilter()}).select('-images').lean();
    const order = new Map(ids.map((id, i) => [id, i]));
    list.sort((a, b) => (order.get(String(a._id)) ?? 0) - (order.get(String(b._id)) ?? 0));
    res.json({success: true, data: list.map(card)});
});

//Write with AI
const describeSchema = z.object({
    category: z.enum(CATEGORY_KEYS),
    make: z.string().trim().min(1).max(40),
    vehicleModel: z.string().trim().min(1).max(60),
    year: z.coerce.number().int().min(1900).max(2100).optional().or(z.literal('').transform(() => undefined)),
    fuel: z.enum(FUEL_KEYS),
    kmPerLitre: z.coerce.number().min(0.5).max(200).optional().or(z.literal('').transform(() => undefined)),
    driver: z.enum(DRIVER_KEYS),
    condition: z.enum(CONDITION_KEYS),
    seats: z.coerce.number().int().min(1).max(100).optional().or(z.literal('').transform(() => undefined)),
    district: z.string().trim().min(1).max(60),
    city: z.string().trim().min(1).max(60),
    lang: z.enum(['en', 'si', 'ta']).default('en'),
});
export const describeAd = asyncHandler(async (req: Request, res: Response) => {
    const {lang, ...facts} = describeSchema.parse(req.body);
    checkTexts({model: facts.vehicleModel});
    res.json({success: true, data: await writeDescription(facts, lang)});
});
