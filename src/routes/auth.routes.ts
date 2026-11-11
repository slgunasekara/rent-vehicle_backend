import { Router } from 'express';
import { protect } from '../middleware/auth';
import { authLimiter, otpLimiter } from '../middleware/rateLimiter';
import * as auth from '../controllers/auth.controller';

const r = Router();
r.post('/auth/register', authLimiter, auth.register);
r.post('/auth/login', authLimiter, auth.login);
r.post('/auth/google', authLimiter, auth.googleAuth);
r.post('/auth/refresh', auth.refresh);
r.post('/auth/logout', authLimiter, auth.logout);
r.get('/auth/me', protect, auth.me);
r.put('/auth/me', protect, auth.updateProfile);
r.delete('/auth/me', protect, authLimiter, auth.deleteMe);
r.post('/auth/forgot-password', otpLimiter, auth.forgotPassword);
r.post('/auth/reset-password', otpLimiter, auth.resetPassword);
r.put('/auth/password', protect, authLimiter, auth.changePassword);
export default r;
