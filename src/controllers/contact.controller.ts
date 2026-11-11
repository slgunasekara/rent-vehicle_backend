import crypto from 'crypto';
import {Request, Response} from 'express';
import {z} from 'zod';
import {env} from '../config/env';
import {ContactMessage} from '../models/contactMessage.model';
import {asyncHandler} from '../utils/asyncHandler';
import {ApiError} from '../utils/ApiError';
import {sendMail, esc} from '../services/mail.service';
import {COMPANY} from '../utils/company';
import {Types} from 'mongoose';


const sign = (ts: string): string => crypto.createHmac('sha256', env.jwtAccessSecret).update('contact:' + ts).digest('hex').slice(0, 32);

export const challenge = (_req: Request, res: Response): void => {
    const ts = String(Date.now());
    res.json({success: true, data: {token: `${ts}.${sign(ts)}`}});
};

const schema = z.object({
    firstName: z.string().trim().min(1, 'Enter your first name').max(50),
    lastName: z.string().trim().min(1, 'Enter your last name').max(50),
    email: z.string().trim().email('Enter a valid email').max(120),
    phone: z.string().trim().min(7, 'Enter a valid phone number').max(25),
    message: z.string().trim().min(5, 'Write a short message').max(2000),
    captcha: z.string().min(10),
    website: z.string().optional(), // honeypot
});

export const sendContact = asyncHandler(async (req: Request, res: Response) => {
    const b = schema.parse(req.body);
    if (b.website) {
        res.json({success: true, message: 'Message sent'});
        return;
    } // a bot filled the trap field: pretend it worked
    const [ts, sig] = b.captcha.split('.');
    const given = Buffer.from(sig ?? '');
    const real = Buffer.from(sign(ts ?? ''));
    const ok = !!ts && !!sig && given.length === real.length && crypto.timingSafeEqual(given, real);
    const age = Date.now() - Number(ts);
    if (!ok || !(age > 0)) throw new ApiError(400, 'Please tick "I\'m not a robot" again');
    if (age < 2500) throw new ApiError(400, 'That was very quick - please try again');
    if (age > 2 * 60 * 60 * 1000) throw new ApiError(400, 'The check expired - please tick "I\'m not a robot" again');

    await ContactMessage.create({
        firstName: b.firstName,
        lastName: b.lastName,
        email: b.email,
        phone: b.phone,
        message: b.message
    });
    void sendMail(
        COMPANY.email,
        `New message from ${b.firstName} ${b.lastName}`,
        'New contact message',
        `<p><b>Name:</b> ${esc(b.firstName)} ${esc(b.lastName)}<br/><b>Email:</b> ${esc(b.email)}<br/><b>Phone:</b> ${esc(b.phone)}</p><p style="white-space:pre-wrap;background:#f3f7fd;border-radius:10px;padding:12px 14px">${esc(b.message)}</p><p style="font-size:12px;color:#6b7c93">Reply to this email to answer ${esc(b.firstName)} directly.</p>`,
        b.email
    );
    res.status(201).json({success: true, message: 'Message sent'});
});


const view = (m: InstanceType<typeof ContactMessage>) => ({
    id: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    email: m.email,
    phone: m.phone,
    message: m.message,
    read: !!m.read,
    readAt: m.readAt ?? null,
    replied: !!m.replied,
    repliedAt: m.repliedAt ?? null,
    replyText: m.replyText ?? '',
    createdAt: m.createdAt,
});

const findOr404 = async (id: string) => {
    if (!Types.ObjectId.isValid(id)) throw new ApiError(404, 'Message not found');
    const m = await ContactMessage.findById(id);
    if (!m) throw new ApiError(404, 'Message not found');
    return m;
};

export const listMessages = asyncHandler(async (req: Request, res: Response) => {
    const q = z.object({
        filter: z.enum(['all', 'unread', 'unreplied', 'replied']).default('all'),
        q: z.string().trim().max(80).optional()
    }).parse(req.query);
    const filter: Record<string, unknown> = {};
    if (q.filter === 'unread') filter.read = {$ne: true};
    if (q.filter === 'unreplied') filter.replied = {$ne: true};
    if (q.filter === 'replied') filter.replied = true;
    if (q.q) {
        const re = new RegExp(q.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{firstName: re}, {lastName: re}, {email: re}, {phone: re}, {message: re}];
    }
    const [list, total, unread, unreplied] = await Promise.all([
        ContactMessage.find(filter).sort({createdAt: -1}).limit(300),
        ContactMessage.countDocuments({}),
        ContactMessage.countDocuments({read: {$ne: true}}),
        ContactMessage.countDocuments({replied: {$ne: true}}),
    ]);
    res.json({success: true, data: list.map(view), counts: {total, unread, unreplied}});
});

export const unreadCount = asyncHandler(async (_req: Request, res: Response) => {
    res.json({success: true, data: {unread: await ContactMessage.countDocuments({read: {$ne: true}})}});
});

export const updateMessage = asyncHandler(async (req: Request, res: Response) => {
    const body = z.object({
        read: z.boolean().optional(),
        replied: z.boolean().optional()
    }).refine((b) => b.read !== undefined || b.replied !== undefined, 'Nothing to change').parse(req.body);
    const m = await findOr404(req.params.id);
    if (body.read !== undefined) {
        m.read = body.read;
        m.readAt = body.read ? new Date() : undefined;
    }
    if (body.replied !== undefined) {
        m.replied = body.replied;
        m.repliedAt = body.replied ? new Date() : undefined;
        m.repliedBy = body.replied ? req.user!._id : undefined;
        if (body.replied) {
            m.read = true;
            m.readAt = m.readAt ?? new Date();
        } // replying means it was read
    }
    await m.save();
    res.json({success: true, data: view(m)});
});

export const replyToMessage = asyncHandler(async (req: Request, res: Response) => {
    const {message} = z.object({message: z.string().trim().min(2, 'Write your reply').max(4000)}).parse(req.body);
    const m = await findOr404(req.params.id);
    const sent = await sendMail(
        m.email,
        'Re: your message to Vehicle Buddy',
        'Our reply to your message',
        `<p>Hi ${esc(m.firstName)},</p>
     <p style="white-space:pre-wrap">${esc(message)}</p>
     <p style="margin-top:18px;color:#6b7c93;font-size:12px">Your message to us:</p>
     <p style="white-space:pre-wrap;background:#f3f7fd;border-radius:10px;padding:12px 14px;color:#41546f">${esc(m.message)}</p>
     <p style="font-size:12px;color:#6b7c93">${esc(req.user!.name)} - ${esc(COMPANY.name)}${COMPANY.phone ? ` - ${esc(COMPANY.phone)}` : ''}</p>`,
        COMPANY.email
    );
    if (!sent) throw new ApiError(502, 'The email could not be sent (check the SMTP settings). The message was NOT marked as replied.');
    Object.assign(m, {
        replied: true,
        repliedAt: new Date(),
        repliedBy: req.user!._id,
        replyText: message,
        read: true,
        readAt: m.readAt ?? new Date()
    });
    await m.save();
    res.json({success: true, data: view(m), message: `Reply sent to ${m.email}`});
});

export const deleteMessage = asyncHandler(async (req: Request, res: Response) => {
    const m = await findOr404(req.params.id);
    await m.deleteOne();
    res.json({success: true, message: 'Message deleted'});
});
