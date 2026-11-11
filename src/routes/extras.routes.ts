import { Router } from 'express';
import { optionalAuth, protect } from '../middleware/auth';
import { aiLimiter, hitLimiter } from '../middleware/rateLimiter';
import * as x from '../controllers/extras.controller';

const r = Router();
r.get('/share/:id', x.sharePage); // the link people share: has the preview tags, then opens the ad
r.get('/vehicles/by-ids', x.byIds); // must come before /vehicles/:id
r.post('/vehicles/describe', protect, aiLimiter, x.describeAd);
r.post('/vehicles/:id/view', optionalAuth, hitLimiter, x.recordView);
r.post('/vehicles/:id/call-click', optionalAuth, hitLimiter, x.recordCall);
r.get('/vehicles/:id/similar', x.similar);
export default r;
