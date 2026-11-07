import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';

export interface TokenPayload {
  id: string;
  role: string;
}

export const signAccessToken = (p: TokenPayload): string =>
  jwt.sign(p, env.jwtAccessSecret, { expiresIn: env.accessExpires as jwt.SignOptions['expiresIn'] });

// jti makes every refresh token unique, even when two are issued within the same second
export const signRefreshToken = (p: TokenPayload): string =>
  jwt.sign({ ...p, jti: crypto.randomUUID() }, env.jwtRefreshSecret, { expiresIn: `${env.refreshDays}d` as jwt.SignOptions['expiresIn'] });

export const verifyAccess = (t: string): TokenPayload => jwt.verify(t, env.jwtAccessSecret) as TokenPayload;
export const verifyRefresh = (t: string): TokenPayload => jwt.verify(t, env.jwtRefreshSecret) as TokenPayload;

// refresh tokens are stored hashed so a database leak cannot be replayed
export const hashToken = (t: string): string => crypto.createHash('sha256').update(t).digest('hex');
