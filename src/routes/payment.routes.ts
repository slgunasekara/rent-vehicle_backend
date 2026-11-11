import { Router } from 'express';
import { protect } from '../middleware/auth';
import { writeLimiter } from '../middleware/rateLimiter';
import * as p from '../controllers/payment.controller';

const r = Router();
r.get('/payments/plans', p.plans);
r.post('/payments/featured', protect, writeLimiter, p.startFeatured);
r.post('/payments/demo/confirm', protect, writeLimiter, p.demoConfirm);
r.get('/payments/status/:orderId', protect, p.paymentStatus);
r.post('/payments/payhere/notify', p.payhereNotify);
export default r;
