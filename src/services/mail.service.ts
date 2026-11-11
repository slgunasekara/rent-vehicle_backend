import nodemailer from 'nodemailer';
import {env} from '../config/env';
import {track} from '../utils/background';

const transporter = env.smtp.host
    ? nodemailer.createTransport({
        host: env.smtp.host,
        port: env.smtp.port,
        secure: env.smtp.port === 465,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
        auth: {user: env.smtp.user, pass: env.smtp.pass},
    })
    : null;

export const esc = (v: unknown): string =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[c] as string);

const wrap = (title: string, body: string): string => `
<div style="font-family:Segoe UI,Arial,sans-serif;background:#f3f7fd;padding:24px">
  <div style="max-width:560px;margin:auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #dbe6f5">
    <div style="background:linear-gradient(135deg,#041f41,#0c4f9e);color:#fff;padding:20px 24px;font-size:20px;font-weight:700">Vehicle Buddy</div>
    <div style="padding:24px;color:#10233f"><h2 style="margin:0 0 12px;color:#0c4f9e">${title}</h2>${body}</div>
    <div style="padding:14px 24px;background:#f3f7fd;color:#6b7c93;font-size:12px">This is an automated message from Vehicle Buddy.</div>
  </div>
</div>`;

async function sendMailNow(to: string, subject: string, title: string, body: string, replyTo?: string): Promise<boolean> {
    if (!to) return false;
    const html = wrap(title, body);
    if (!transporter) {
        console.log(`[mail:dev] to=${to} | ${subject}\n${body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')}`);
        return env.nodeEnv !== 'production'; // in production a missing mail server is a real failure
    }
    try {
        await transporter.sendMail({from: env.smtp.from, to, subject, html, ...(replyTo ? {replyTo} : {})});
        return true;
    } catch (e) {
        console.error('Email failed:', (e as Error).message);
        return false;
    }
}

export const sendMail = (to: string, subject: string, title: string, body: string, replyTo?: string): Promise<boolean> => track(sendMailNow(to, subject, title, body, replyTo));
