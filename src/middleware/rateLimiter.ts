import rateLimit from 'express-rate-limit';

const opts = {standardHeaders: true, legacyHeaders: false} as const;
export const authLimiter = rateLimit({windowMs: 15 * 60 * 1000, limit: 60, ...opts});
export const otpLimiter = rateLimit({windowMs: 15 * 60 * 1000, limit: 12, ...opts});
export const writeLimiter = rateLimit({windowMs: 60 * 60 * 1000, limit: 40, ...opts});
export const contactLimiter = rateLimit({windowMs: 60 * 60 * 1000, limit: 8, ...opts});
export const chatLimiter = rateLimit({windowMs: 10 * 60 * 1000, limit: 30, ...opts});
export const engageLimiter = rateLimit({windowMs: 60 * 60 * 1000, limit: 300, ...opts});
export const reportLimiter = rateLimit({windowMs: 60 * 60 * 1000, limit: 10, ...opts});
export const aiLimiter = rateLimit({windowMs: 60 * 60 * 1000, limit: 20, ...opts});
export const hitLimiter = rateLimit({windowMs: 60 * 60 * 1000, limit: 600, ...opts});
