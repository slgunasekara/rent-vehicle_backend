import {Request, Response} from 'express';
import {z} from 'zod';
import {asyncHandler} from '../utils/asyncHandler';
import {ApiError} from '../utils/ApiError';
import {askBuddy, buddyReady, BuddySearch} from '../services/ai.service';
import {exactRe, liveFilter, runSearch, wordRe} from '../services/vehicleSearch.service';

const MAX_CARDS = 4;

const body = z.object({
    message: z.string().trim().min(1, 'Write a message').max(500, 'Please keep your message under 500 characters'),
    history: z.array(z.object({role: z.enum(['user', 'assistant']), text: z.string().max(1500)})).max(12).default([]),
});

function filterFor(s: BuddySearch): { f: Record<string, unknown>; priceField: 'pricePerDay' | 'pricePerMonth' } {
    const f: Record<string, unknown> = liveFilter();
    if (s.category) f.category = s.category;
    if (s.make) f.make = exactRe(s.make);
    if (s.model) f.vehicleModel = wordRe(s.model);
    if (s.fuel) f.fuel = s.fuel;
    if (s.driver) f.driver = {$in: [s.driver, 'both']};
    if (s.condition) f.condition = s.condition;
    if (s.city) f.city = exactRe(s.city);
    else if (s.district) f.district = exactRe(s.district);
    const priceField = s.payment === 'monthly' ? 'pricePerMonth' : 'pricePerDay';
    if (s.minPrice !== undefined || s.maxPrice !== undefined) {
        const range: Record<string, number> = {};
        if (s.minPrice !== undefined) range.$gte = s.minPrice;
        if (s.maxPrice !== undefined) range.$lte = s.maxPrice;
        f[priceField] = range;
    }
    return {f, priceField};
}

function findPath(s: BuddySearch): string {
    const q = new URLSearchParams();
    const put = (k: string, v?: string | number) => {
        if (v !== undefined && v !== '') q.set(k, String(v));
    };
    put('category', s.category);
    put('make', s.make);
    put('model', s.model);
    put('fuel', s.fuel);
    put('driver', s.driver);
    put('condition', s.condition);
    put('district', s.district);
    put('city', s.city);
    if (s.minPrice !== undefined || s.maxPrice !== undefined) {
        put('payment', s.payment ?? 'daily');
        put('minPrice', s.minPrice);
        put('maxPrice', s.maxPrice);
    } else if (s.payment === 'monthly') put('payment', 'monthly');
    if (s.sort && s.sort !== 'newest') put('sort', s.sort);
    const qs = q.toString();
    return qs ? `/find?${qs}` : '/find';
}

export const chat = asyncHandler(async (req: Request, res: Response) => {
    const {message, history} = body.parse(req.body);
    if (!buddyReady()) throw new ApiError(503, 'Buddy is not available right now.');
    const answer = await askBuddy(history, message);

    let vehicles: unknown[] = [];
    let total = 0;
    let path: string | null = null;
    if (answer.search) {
        const {f, priceField} = filterFor(answer.search);
        const r = await runSearch(f, priceField, answer.search.sort ?? 'newest', 1, MAX_CARDS);
        vehicles = r.rows;
        total = r.total;
        path = findPath(answer.search);
    }
    res.json({success: true,
        data: {
            reply: answer.reply,
            vehicles,
            total,
            findPath: path,
            noResults: !!answer.search && total === 0,
            degraded: !!answer.degraded
        }
    });
});
