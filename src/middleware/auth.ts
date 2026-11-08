import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { verifyAccess } from '../utils/jwt';
import { User, IUser, Role } from '../models/user.model';

declare module 'express-serve-static-core' {
  interface Request { user?: IUser }
}

export async function protect(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const h = req.headers.authorization;
    if (!h || !h.startsWith('Bearer ')) throw new ApiError(401, 'Not authenticated');
    let payload;
    try { payload = verifyAccess(h.slice(7)); } catch { throw new ApiError(401, 'Token expired or invalid', 'TOKEN_EXPIRED'); }
    const user = await User.findById(payload.id);
    if (!user || !user.isActive) throw new ApiError(401, 'Account not available');
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

/** like protect, but a visitor without a (valid) token just continues without req.user */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const h = req.headers.authorization;
    if (h?.startsWith('Bearer ')) {
      const user = await User.findById(verifyAccess(h.slice(7)).id);
      if (user?.isActive) req.user = user;
    }
  } catch { /* not signed in: fine */ }
  next();
}

export const authorize = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.user || !roles.includes(req.user.role)) return next(new ApiError(403, 'You do not have permission'));
  next();
};

export const adminOnly = [protect, authorize('admin')];
