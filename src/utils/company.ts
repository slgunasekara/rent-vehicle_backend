import { env } from '../config/env';

/** the company's public contact details - shown in emails and on the Contact page */
export const COMPANY = {
  name: 'Vehicle Buddy',
  phone: env.companyPhone,
  email: env.companyEmail,
};
