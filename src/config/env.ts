import dotenv from 'dotenv';
dotenv.config();

const get = (k: string, d = ''): string => process.env[k] ?? d;

export const env = {
  port: Number(get('PORT', '5000')),
  nodeEnv: get('NODE_ENV', 'development'),
  mongoUri: get('MONGO_URI', 'mongodb://127.0.0.1:27017/findvehicle'),
  clientUrl: get('CLIENT_URL', 'http://localhost:5173'),
  jwtAccessSecret: get('JWT_ACCESS_SECRET', 'dev_access_secret'),
  jwtRefreshSecret: get('JWT_REFRESH_SECRET', 'dev_refresh_secret'),
  accessExpires: get('ACCESS_TOKEN_EXPIRES', '15m'),
  refreshDays: Number(get('REFRESH_TOKEN_EXPIRES_DAYS', '7')),
  googleClientId: get('GOOGLE_CLIENT_ID'),
  // comma separated emails that become "admin" (company console) when they register / sign in with Google
  adminEmails: get('ADMIN_EMAILS').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  smtp: {
    host: get('SMTP_HOST'),
    port: Number(get('SMTP_PORT', '587')),
    user: get('SMTP_USER'),
    pass: get('SMTP_PASS'),
    from: get('MAIL_FROM', 'Vehicle Buddy <no-reply@vehiclebuddy.lk>'),
  },
  // secret for GET /api/cron/run (Vercel has no always-on server, so an outside timer calls it to delete expired ads)
  cronSecret: get('CRON_SECRET'),
  // Buddy, the chat helper (Google Gemini). Without a key the chat button shows a friendly "not available" message.
  gemini: { apiKey: get('GEMINI_API_KEY'), model: get('GEMINI_MODEL') },
  // "Top ad" (featured) plans, "days:price in Rs." pairs, e.g. "3:500,7:1000,30:3000"
  featurePlans: get('FEATURE_PLANS', '3:500,7:1000,30:3000').split(',').map((p) => p.split(':').map((n) => Number(n.trim()))).filter(([d, p]) => d > 0 && p > 0).map(([days, price]) => ({ days, price })),
  // PayHere (https://www.payhere.lk). Without a merchant id the Top ad payment runs in TEST mode (no money) while not in production.
  payhere: { merchantId: get('PAYHERE_MERCHANT_ID'), merchantSecret: get('PAYHERE_MERCHANT_SECRET'), sandbox: get('PAYHERE_SANDBOX', 'true') !== 'false' },
  // the address PayHere can reach this API on (for the payment notification). localhost does not work for that, use your deployed API address.
  publicApiUrl: get('PUBLIC_API_URL').replace(/\/+$/, ''),
  demoPayments: get('DEMO_PAYMENTS') === 'true', // allow the no-money test payment even in production (for a demo)
  companyEmail: get('COMPANY_EMAIL'),
  companyPhone: get('COMPANY_PHONE', '+94754424053'),
};

if (env.nodeEnv === 'production') {
  const weak = (v: string): boolean => !v || v.startsWith('change_me') || v.startsWith('dev_');
  if (weak(env.jwtAccessSecret) || weak(env.jwtRefreshSecret)) {
    console.error('FATAL: set strong JWT_ACCESS_SECRET and JWT_REFRESH_SECRET in production');
    process.exit(1);
  }
}
