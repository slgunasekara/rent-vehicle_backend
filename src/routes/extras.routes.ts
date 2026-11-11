import { Router } from 'express';
import { optionalAuth, protect } from '../middleware/auth';
import { aiLimiter, hitLimiter } from '../middleware/rateLimiter';
import * as x from '../controllers/extras.controller';

const r = Router();
r.get('/share/:id', x.sharePage);
r.get('/vehicles/by-ids', x.byIds);
r.post('/vehicles/describe', protect, aiLimiter, x.describeAd);
r.post('/vehicles/:id/view', optionalAuth, hitLimiter, x.recordView);
r.post('/vehicles/:id/call-click', optionalAuth, hitLimiter, x.recordCall);
r.get('/vehicles/:id/similar', x.similar);
export default r;
