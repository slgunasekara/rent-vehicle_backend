import {env} from '../config/env';
import {AD_DAYS} from '../data/vehicleOptions';
import {sendMail} from './mail.service';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
})[c] as string);
const fmt = (d: Date): string => d.toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric'});

export function siteUrl(): string {
    const urls = env.clientUrl.split(',').map((u) => u.trim().replace(/\/+$/, '')).filter(Boolean);
    return urls.find((u) => !/localhost|127\.0\.0\.1|192\.168\.|10\.\d+\./.test(u)) ?? urls[0] ?? '';
}

const button = (href: string, text: string): string => `<p style="margin:18px 0"><a href="${href}" style="background:#1e6fd0;color:#fff;padding:11px 20px;border-radius:10px;text-decoration:none;font-weight:700">${text}</a></p>`;

export function mailAdLive(to: string, name: string, ad: {
    id: string;
    title: string;
    city: string;
    expiresAt: Date
}): Promise<boolean> {
    return sendMail(
        to,
        `Your ad is live: ${ad.title}`,
        'Thank you for posting your ad',
        `<p>Hi ${esc(name)},</p>
     <p>Thank you for posting on <b>Vehicle Buddy</b>. Your ad <b>${esc(ad.title)}</b> (${esc(ad.city)}) is live now and people can call you.</p>
     <p>It stays online for <b>${AD_DAYS} days</b> (until <b>${fmt(ad.expiresAt)}</b>). You can edit, renew or delete it any time from <b>My Ads</b>.</p>
     ${button(`${siteUrl()}/vehicle/${ad.id}`, 'See your ad')}
     <p style="color:#64748b;font-size:13px">Tip: keep your phone number and the insurance date up to date, so the ad is not hidden.</p>`
    );
}

export function mailAdExpired(to: string, name: string, ad: {
    title: string;
    city: string;
    expiresAt: Date
}): Promise<boolean> {
    return sendMail(
        to,
        `Your ad has expired: ${ad.title}`,
        'Your ad has expired',
        `<p>Hi ${esc(name)},</p>
     <p>Your ad <b>${esc(ad.title)}</b> (${esc(ad.city)}) ran out of its ${AD_DAYS} days on <b>${fmt(ad.expiresAt)}</b>, so it is no longer shown on Vehicle Buddy and has been removed.</p>
     <p>Still have the vehicle? You can post a new ad in a minute - it is free.</p>
     ${button(`${siteUrl()}/post`, 'Post a new ad')}
     <p style="color:#64748b;font-size:13px">Thank you for using Vehicle Buddy.</p>`
    );
}

export function mailInsuranceExpired(to: string, name: string, ad: {
    id: string;
    title: string;
    insuranceExpiry: Date
}): Promise<boolean> {
    return sendMail(
        to,
        `Your ad is hidden: insurance expired (${ad.title})`,
        'Your ad is hidden',
        `<p>Hi ${esc(name)},</p>
     <p>The insurance date of your ad <b>${esc(ad.title)}</b> was <b>${fmt(ad.insuranceExpiry)}</b>, so the ad is hidden from visitors until the date is updated.</p>
     <p>Renewed the insurance? Open the ad, put the new date in, and it is visible again.</p>
     ${button(`${siteUrl()}/post?edit=${ad.id}`, 'Update the insurance date')}`
    );
}

export function mailFeatured(to: string, name: string, p: {
    id: string;
    title: string;
    days: number;
    until: Date;
    amount: number;
    orderId: string
}): Promise<boolean> {
    return sendMail(
        to,
        `Your ad is now a Top ad: ${p.title}`,
        'Your ad is a Top ad',
        `<p>Hi ${esc(name)},</p>
     <p>Thank you. <b>${esc(p.title)}</b> is now a <b>Top ad</b> for <b>${p.days} days</b> (until <b>${fmt(p.until)}</b>): it is shown first in the search results with a Top ad badge.</p>
     <p style="color:#64748b;font-size:13px">Order ${esc(p.orderId)} · ${p.amount > 0 ? `Rs. ${p.amount.toLocaleString('en-US')}` : 'free (given by the Vehicle Buddy team)'}</p>
     ${button(`${siteUrl()}/vehicle/${p.id}`, 'See your Top ad')}`
    );
}

export function mailBanned(to: string, name: string, reason: string): Promise<boolean> {
    return sendMail(
        to,
        'Your Vehicle Buddy account has been suspended',
        'Your account has been suspended',
        `<p>Hi ${esc(name)},</p>
     <p>Your Vehicle Buddy account has been suspended, and your ads are hidden.</p>
     <p><b>Reason:</b> ${esc(reason)}</p>
     <p>If you think this is a mistake, please reply to this e-mail or contact us from the website.</p>`
    );
}

export function mailUnbanned(to: string, name: string): Promise<boolean> {
    return sendMail(to, 'Your Vehicle Buddy account is active again', 'Welcome back', `<p>Hi ${esc(name)},</p><p>Your account is active again and your ads are visible. Thank you for your patience.</p>${button(`${siteUrl()}/my-ads`, 'Open My Ads')}`);
}
