import { Router } from 'express';
import { protect, authorize } from '../middleware/auth';
import { contactLimiter } from '../middleware/rateLimiter';
import * as contact from '../controllers/contact.controller';

const r = Router();

r.get('/contact/challenge', contact.challenge);
r.post('/contact', contactLimiter, contact.sendContact);
r.get('/admin/contact/unread-count', protect, authorize('admin'), contact.unreadCount);
r.get('/admin/contact', protect, authorize('admin'), contact.listMessages);
r.patch('/admin/contact/:id', protect, authorize('admin'), contact.updateMessage);
r.post('/admin/contact/:id/reply', protect, authorize('admin'), contact.replyToMessage);
r.delete('/admin/contact/:id', protect, authorize('admin'), contact.deleteMessage);

export default r;
