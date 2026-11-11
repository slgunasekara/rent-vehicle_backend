import { Router } from 'express';
import { chatLimiter } from '../middleware/rateLimiter';
import * as chat from '../controllers/chat.controller';

const r = Router();
r.post('/chat', chatLimiter, chat.chat);
export default r;
