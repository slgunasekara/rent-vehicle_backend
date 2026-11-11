import {Request, Response} from 'express';
import {z} from 'zod';
import {Types} from 'mongoose';
import {Vehicle} from '../models/vehicle.model';
import {Rating} from '../models/rating.model';
import {Favorite} from '../models/favorite.model';
import {Report} from '../models/report.model';
import {asyncHandler} from '../utils/asyncHandler';
import {ApiError} from '../utils/ApiError';
import {env} from '../config/env';
import {COMPANY} from '../utils/company';
import {sendMail} from '../services/mail.service';
import {recalcRating} from '../services/cleanup.service';
import {card, liveFilter} from '../services/vehicleSearch.service';
import {REPORT_REASONS, REPORT_REASON_KEYS} from '../data/vehicleOptions';
import {checkTexts} from '../utils/moderation';

const MAX_FAVORITES = 500;

async function liveAd(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new ApiError(404, 'Ad not found');
    const v = await Vehicle.findOne({_id: id, ...liveFilter()}).select('-images');
    if (!v) throw new ApiError(404, 'Ad not found');
    return v;
}

const title = (v: {
    make: string;
    vehicleModel: string;
    year?: number
}) => `${v.make} ${v.vehicleModel}${v.year ? ' ' + v.year : ''}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
})[c] as string);


export const rate = asyncHandler(async (req: Request, res: Response) => {
    const {stars, comment} = z.object({
        stars: z.number().int().min(1, 'Choose 1 to 5 stars').max(5, 'Choose 1 to 5 stars'),
        comment: z.string().trim().max(500, 'Please keep your message under 500 characters').optional(),
    }).parse(req.body);
    checkTexts({message: comment});
    const v = await liveAd(req.params.id);
    if (String(v.owner) === String(req.user!._id)) throw new ApiError(403, 'You cannot rate your own ad');
    await Rating.updateOne({vehicle: v._id, user: req.user!._id}, comment ? {$set: {stars, comment}} : {
        $set: {stars},
        $unset: {comment: 1}
    }, {upsert: true});
    const summary = await recalcRating(v._id);
    res.json({success: true, data: {...summary, myRating: stars, myComment: comment ?? ''}});
});

export const unrate = asyncHandler(async (req: Request, res: Response) => {
    if (!Types.ObjectId.isValid(req.params.id)) throw new ApiError(404, 'Ad not found');
    await Rating.deleteOne({vehicle: req.params.id, user: req.user!._id});
    const summary = await recalcRating(req.params.id);
    res.json({success: true, data: {...summary, myRating: 0, myComment: ''}});
});

export const mine = asyncHandler(async (req: Request, res: Response) => {
    if (!Types.ObjectId.isValid(req.params.id)) throw new ApiError(404, 'Ad not found');
    const [v, rating, fav, rep] = await Promise.all([
        Vehicle.findById(req.params.id).select('owner'),
        Rating.findOne({vehicle: req.params.id, user: req.user!._id}),
        Favorite.exists({vehicle: req.params.id, user: req.user!._id}),
        Report.exists({vehicle: req.params.id, reporter: req.user!._id, status: 'open'}),
    ]);
    res.json({
        success: true,
        data: {
            isOwner: !!v && String(v.owner) === String(req.user!._id),
            myRating: rating?.stars ?? 0,
            myComment: rating?.comment ?? '',
            favorite: !!fav,
            reported: !!rep
        }
    });
});


export const favoriteIds = asyncHandler(async (req: Request, res: Response) => {
    const rows = await Favorite.find({user: req.user!._id}).select('vehicle').lean();
    res.json({success: true, data: rows.map((r) => String(r.vehicle))});
});

export const listFavorites = asyncHandler(async (req: Request, res: Response) => {
    const rows = await Favorite.find({user: req.user!._id}).sort({createdAt: -1}).limit(MAX_FAVORITES).lean();
    const order = new Map(rows.map((r, i) => [String(r.vehicle), i]));
    const ads = await Vehicle.find({_id: {$in: rows.map((r) => r.vehicle)}, ...liveFilter()}).select('-images').lean();
    ads.sort((a, b) => (order.get(String(a._id)) ?? 0) - (order.get(String(b._id)) ?? 0));
    res.json({success: true, data: ads.map(card)});
});

export const addFavorite = asyncHandler(async (req: Request, res: Response) => {
    const v = await liveAd(req.params.id);
    if ((await Favorite.countDocuments({user: req.user!._id})) >= MAX_FAVORITES) throw new ApiError(400, `You can save up to ${MAX_FAVORITES} ads. Remove some first.`);
    await Favorite.updateOne({user: req.user!._id, vehicle: v._id}, {
        $setOnInsert: {
            user: req.user!._id,
            vehicle: v._id
        }
    }, {upsert: true});
    res.json({success: true, message: 'Saved'});
});

export const removeFavorite = asyncHandler(async (req: Request, res: Response) => {
    if (!Types.ObjectId.isValid(req.params.id)) throw new ApiError(404, 'Ad not found');
    await Favorite.deleteOne({user: req.user!._id, vehicle: req.params.id});
    res.json({success: true, message: 'Removed'});
});

// reports
const reportSchema = z.object({
    reason: z.enum(REPORT_REASON_KEYS, {errorMap: () => ({message: 'Choose why you are reporting this ad'})}),
    message: z.string().trim().min(10, 'Please tell us a little more (at least 10 characters)').max(1000, 'Please keep it under 1000 characters'),
});

export const report = asyncHandler(async (req: Request, res: Response) => {
    const body = reportSchema.parse(req.body);
    const v = await liveAd(req.params.id);
    const user = req.user!;
    if (String(v.owner) === String(user._id)) throw new ApiError(403, 'This is your own ad');
    if (await Report.exists({
        vehicle: v._id,
        reporter: user._id,
        status: 'open'
    })) throw new ApiError(409, 'You already reported this ad. Our team is looking at it.');

    const r = await Report.create({
        vehicle: v._id,
        reporter: user._id,
        reason: body.reason,
        message: body.message,
        adTitle: title(v),
        adCity: v.city,
        reporterName: user.name,
        reporterEmail: user.email
    });
    res.status(201).json({
        success: true,
        message: 'Thank you. We received your report and our team will look at this ad.'
    });

    const label = REPORT_REASONS.find((x) => x.key === body.reason)?.label ?? body.reason;
    const link = `${env.clientUrl.split(',')[0].trim().replace(/\/+$/, '')}/admin/reports`;
    void sendMail(
        COMPANY.email,
        `Ad reported: ${title(v)} (${label})`,
        'An ad was reported',
        `<p><b>${esc(title(v))}</b> in ${esc(v.city)} was reported by ${esc(user.name)} (${esc(user.email)}).</p>
     <p><b>Reason:</b> ${esc(label)}</p><p><b>Message:</b><br/>${esc(body.message).replace(/\n/g, '<br/>')}</p>
     <p><a href="${link}">Open the Reports page in the Company console</a> (report ${String(r._id)})</p>`
    );
});

const REVIEWS_PER_PAGE = 10;
export const reviews = asyncHandler(async (req: Request, res: Response) => {
    if (!Types.ObjectId.isValid(req.params.id)) throw new ApiError(404, 'Ad not found');
    const page = Math.max(1, Number(req.query.page) || 1);
    const filter = {vehicle: req.params.id};
    const [rows, total] = await Promise.all([
        Rating.find(filter).sort({updatedAt: -1}).skip((page - 1) * REVIEWS_PER_PAGE).limit(REVIEWS_PER_PAGE).populate('user', 'name avatar').lean(),
        Rating.countDocuments(filter),
    ]);
    res.json({
        success: true,
        data: {
            total, page, pages: Math.max(1, Math.ceil(total / REVIEWS_PER_PAGE)),
            items: rows.map((r) => {
                const u = r.user as unknown as { _id: Types.ObjectId; name: string; avatar?: string } | null;
                return {
                    id: String(r._id),
                    stars: r.stars,
                    comment: r.comment ?? '',
                    userName: u?.name ?? 'A member',
                    userAvatar: u?.avatar,
                    reply: r.reply?.text ? {text: r.reply.text, at: r.reply.at} : undefined,
                    createdAt: (r as unknown as { updatedAt: Date }).updatedAt,
                    mine: !!u && !!req.user && String(u._id) === String(req.user._id)
                };
            }),
        },
    });
});

export const replyToReview = asyncHandler(async (req: Request, res: Response) => {
    const {text} = z.object({text: z.string().trim().min(2, 'Write your reply').max(500, 'Please keep your reply under 500 characters')}).parse(req.body);
    checkTexts({reply: text});
    if (!Types.ObjectId.isValid(req.params.id) || !Types.ObjectId.isValid(req.params.reviewId)) throw new ApiError(404, 'Review not found');
    const v = await Vehicle.findById(req.params.id).select('owner');
    if (!v) throw new ApiError(404, 'Ad not found');
    if (String(v.owner) !== String(req.user!._id)) throw new ApiError(403, 'Only the owner of this ad can reply to its reviews');
    const r = await Rating.findOne({_id: req.params.reviewId, vehicle: v._id});
    if (!r) throw new ApiError(404, 'Review not found');
    r.reply = {text, at: new Date()};
    await r.save();
    res.json({success: true, data: {text, at: r.reply.at}});
});

export const deleteReviewReply = asyncHandler(async (req: Request, res: Response) => {
    if (!Types.ObjectId.isValid(req.params.id) || !Types.ObjectId.isValid(req.params.reviewId)) throw new ApiError(404, 'Review not found');
    const v = await Vehicle.findById(req.params.id).select('owner');
    if (!v || String(v.owner) !== String(req.user!._id)) throw new ApiError(403, 'Only the owner of this ad can do this');
    await Rating.updateOne({_id: req.params.reviewId, vehicle: v._id}, {$unset: {reply: 1}});
    res.json({success: true, message: 'Reply removed'});
});
