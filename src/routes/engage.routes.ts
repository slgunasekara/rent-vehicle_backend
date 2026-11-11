import { Router } from 'express';
import { optionalAuth, protect } from '../middleware/auth';
import { engageLimiter, reportLimiter } from '../middleware/rateLimiter';
import * as e from '../controllers/engage.controller';

const r = Router();
// the reviews list is public; everything else needs a signed-in user (stars, hearts and reports are tied to an account)
r.get('/vehicles/:id/reviews', optionalAuth, e.reviews); // public
r.get('/vehicles/:id/me', protect, e.mine);
r.put('/vehicles/:id/rating', protect, engageLimiter, e.rate);
r.delete('/vehicles/:id/rating', protect, engageLimiter, e.unrate);
r.post('/vehicles/:id/report', protect, reportLimiter, e.report);
r.put('/vehicles/:id/reviews/:reviewId/reply', protect, engageLimiter, e.replyToReview);
r.delete('/vehicles/:id/reviews/:reviewId/reply', protect, engageLimiter, e.deleteReviewReply);
r.get('/favorites/ids', protect, e.favoriteIds);
r.get('/favorites', protect, e.listFavorites);
r.put('/favorites/:id', protect, engageLimiter, e.addFavorite);
r.delete('/favorites/:id', protect, engageLimiter, e.removeFavorite);
export default r;
