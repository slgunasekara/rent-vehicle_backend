# Vehicle Buddy - Backend

Created by **Praveena Gunasekara**.

This is the API behind Vehicle Buddy, a vehicle marketplace for Sri Lanka. It is an Express server written in TypeScript that stores everything in MongoDB. The React website in the `frontend` folder talks to it.

## What it does

- **Accounts**: email and password sign-up, Google sign-in, access and refresh tokens, password reset by emailed code, banning and unbanning users
- **Ads**: create, edit, renew and delete vehicle ads, search with filters, similar ads, view counts and call-click counts
- **Spam and duplicate protection**: the same vehicle or phone number cannot be posted twice, and ads, reviews and replies are checked for bad words and spam (see `src/utils/moderation.ts`)
- **Reviews and ratings**, with a reply from the ad owner
- **Favourites** and **reports** on ads
- **Share pages**: `GET /api/share/:id` returns a small page with preview tags so shared links look good on WhatsApp and Facebook
- **Top ads**: paid featured ads through PayHere, with a test mode when no keys are set
- **AI**: Buddy the chat helper and the "Write with AI" ad description, both using Google Gemini
- **Photos**: uploaded to Cloudinary
- **Email**: password reset codes, contact page messages and ad notices through SMTP
- **Expiry**: expired ads are deleted automatically (every hour on a normal server, or by a cron call on Vercel)
- **Company console**: stats, users, ads, reports, contact messages, payments and the admin team

## Built with

Node.js, Express 4, TypeScript, MongoDB with Mongoose, JWT, Zod for validation, Helmet, CORS, express-rate-limit, Nodemailer, Cloudinary and `@google/genai`.

## Getting started

You need Node.js 18 or newer and a MongoDB database (a free MongoDB Atlas cluster is fine).

```bash
cd backend
npm install
cp .env.example .env     # then fill in the values, see below
npm run seed             # creates the first admin account
npm run dev
```

The API runs at http://localhost:5000/api. The server restarts by itself when you change a file.

`npm run seed` uses `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` from your `.env`. That account becomes the **default admin**, the only one who can add or remove other admins.

## Environment variables

Copy `.env.example` to `.env`. Only the first group is needed to run the server. Everything else is optional and the matching feature simply switches off or falls back to a simple version when it is empty.

**Required**

| Variable | What it is |
| --- | --- |
| `MONGO_URI` | MongoDB connection string |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Two long random strings. Use different ones |
| `CLIENT_URL` | Address of the website, used for CORS and share links |
| `PORT`, `NODE_ENV` | Default `5000` and `development` |

**Optional**

| Variable | What it is |
| --- | --- |
| `ACCESS_TOKEN_EXPIRES`, `REFRESH_TOKEN_EXPIRES_DAYS` | Token lifetimes |
| `GOOGLE_CLIENT_ID` | Google sign-in. Same ID as the frontend |
| `ADMIN_EMAILS` | Comma separated emails that become admins |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Email. If `SMTP_HOST` is empty, emails are printed in the server console instead, which is handy for development |
| `COMPANY_EMAIL`, `COMPANY_PHONE` | Where contact messages go, and the company phone shown to users |
| `CLOUDINARY_URL` | `cloudinary://<api_key>:<api_secret>@<cloud_name>` for photos |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Buddy chat and AI descriptions. Empty hides Buddy |
| `FEATURE_PLANS` | Top ad plans as `days:price` pairs, with prices in Rs. |
| `PAYHERE_MERCHANT_ID`, `PAYHERE_MERCHANT_SECRET`, `PAYHERE_SANDBOX` | PayHere payments. Empty means test mode (only when `NODE_ENV` is not `production`) |
| `PUBLIC_API_URL` | Public address of this API so PayHere can reach it. `localhost` will not work |
| `CRON_SECRET` | Secret for `GET /api/cron/run` on Vercel |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Used by `npm run seed` |

Never commit your `.env` file or share it. It holds your database password and API keys.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start with auto restart |
| `npm run build` | Compile TypeScript into `dist/` |
| `npm start` | Run the compiled server |
| `npm run seed` | Create the first admin account |
| `npm run upload:assets` | Upload the site assets (such as the home video) to Cloudinary |
| `npm run migrate:images` | Move older ad photos over to Cloudinary |

## API overview

Everything is under `/api`. "Auth" means a signed-in user, "Admin" means a company admin.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register`, `/auth/login`, `/auth/google`, `/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`; `GET/PUT/DELETE /auth/me`; `PUT /auth/password` |
| Ads | `GET /vehicles`, `GET /vehicles/:id`, `GET /vehicles/:id/similar`, `GET /vehicles/by-ids`, `GET /vehicles/mine` (Auth), `POST /vehicles` (Auth), `PUT/DELETE /vehicles/:id` (Auth), `POST /vehicles/:id/renew` (Auth), `POST /vehicles/describe` (Auth) |
| Engagement | `POST /vehicles/:id/view`, `POST /vehicles/:id/call-click`, `POST /vehicles/:id/report`, `GET /share/:id`, `GET /stats/public` |
| Reviews | `GET /vehicles/:id/reviews`, `PUT/DELETE /vehicles/:id/rating` (Auth), `PUT/DELETE /vehicles/:id/reviews/:reviewId/reply` (Auth, ad owner) |
| Favourites | `GET /favorites`, `GET /favorites/ids`, `PUT/DELETE /favorites/:id` (Auth) |
| Payments | `GET /payments/plans`, `POST /payments/featured` (Auth), `POST /payments/demo/confirm`, `GET /payments/status/:orderId`, `POST /payments/payhere/notify` |
| Contact and chat | `GET /contact/challenge`, `POST /contact`, `POST /chat` |
| Admin | `/admin/stats`, `/admin/users`, `/admin/vehicles`, `/admin/reports`, `/admin/contact`, `/admin/payments`, `/admin/admins`, plus ban, unban and featured actions |
| System | `GET /cron/run` (needs `CRON_SECRET`) |

Sign in by sending `Authorization: Bearer <access token>`. Requests are rate limited, and the contact form asks for a small challenge to keep bots out.

## Project layout

```
backend/
  src/
    server.ts        starts the server (local / normal hosting)
    vercel.ts        entry point for Vercel
    app.ts           Express setup, middleware, cron route
    routes/          URL to controller mapping
    controllers/     request handling
    models/          Mongoose models (user, vehicle, payment, report ...)
    services/        mail, AI, storage, search, expiry, cleanup
    middleware/      auth, rate limiting, error handling
    config/          env loading and database connection
    utils/           JWT, moderation, helpers
    scripts/         seed, asset upload, image migration
  api/index.js       Vercel function wrapper
```

## Deploying

**Normal server (VPS, Render, Railway and so on)**

```bash
npm install
npm run build
npm start
```

Set all the environment variables on the host, and set `NODE_ENV=production`. Expired ads are cleaned up by the server itself every hour.

**Vercel**

`vercel.json` is already set up. Set the root directory to `backend` and add the environment variables. Vercel has no always-running server, so use an outside timer (for example cron-job.org) to call `GET /api/cron/run` with your `CRON_SECRET` every hour so expired ads get removed.

## Troubleshooting

- **Server exits on start** - check `MONGO_URI`, and that your IP is allowed in MongoDB Atlas.
- **Browser says CORS error** - `CLIENT_URL` must match the website address exactly.
- **No emails arrive** - without `SMTP_HOST` the emails are printed in the console. Look there for the reset code.
- **Top ad payment does not complete** - PayHere needs a public `PUBLIC_API_URL`. On localhost use the test mode by leaving the PayHere keys empty.
- **No Buddy chat** - `GEMINI_API_KEY` is empty. That is intended.

## Author

Built and maintained by Praveena Gunasekara.
