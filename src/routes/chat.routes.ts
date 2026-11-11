import { Router } from 'express';
import { chatLimiter } from '../middleware/rateLimiter';
import * as chat from '../controllers/chat.controller';

const r = Router();
// Buddy, the chat helper. Public (visitors ask too), so it is rate-limited per IP.
r.post('/chat', chatLimiter, chat.chat);
export default r;
