import { env } from '../config/env';

/** the DEFAULT admin: the company account made by `npm run seed` (the first e-mail in ADMIN_EMAILS). Nobody can delete or change it except itself. */
export const defaultAdminEmail = (): string => (env.adminEmails[0] || process.env.SEED_ADMIN_EMAIL || '').toLowerCase();
export const isDefaultAdmin = (u: { email: string; role: string } | null | undefined): boolean => !!u && u.role === 'admin' && !!defaultAdminEmail() && u.email.toLowerCase() === defaultAdminEmail();
