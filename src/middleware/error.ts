import {Request, Response, NextFunction} from 'express';
import {ZodError} from 'zod';
import {ApiError} from '../utils/ApiError';

export function notFound(req: Request, _res: Response, next: NextFunction): void {
    next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
    if (err instanceof ZodError) {
        res.status(400).json({
            success: false,
            message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        });
        return;
    }
    if (err instanceof ApiError) {
        res.status(err.status).json({success: false, message: err.message, code: err.code});
        return;
    }
    const e = err as { code?: number; message?: string; name?: string; keyValue?: Record<string, unknown> };
    if (e.code === 11000) {
        res.status(409).json({success: false, message: `Already exists: ${Object.keys(e.keyValue || {}).join(', ')}`});
        return;
    }
    if (e.name === 'ValidationError' || e.name === 'CastError') {
        res.status(400).json({success: false, message: e.message});
        return;
    }
    const he = err as { status?: number; statusCode?: number; type?: string };
    const hs = he.status ?? he.statusCode;
    if (typeof hs === 'number' && hs >= 400 && hs < 500) {
        res.status(hs).json({
            success: false,
            message: he.type === 'entity.too.large' ? 'The upload is too large. Use smaller photos.' : he.type === 'entity.parse.failed' ? 'The request was not valid JSON' : 'Bad request'
        });
        return;
    }
    console.error(err);
    res.status(500).json({success: false, message: 'Internal server error'});
}
