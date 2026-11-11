import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import {env} from './config/env';
import routes from './routes';
import {errorHandler, notFound} from './middleware/error';
import {purgeExpired} from './services/expiry.service';
import {asyncHandler} from './utils/asyncHandler';

export const app = express();

if (env.nodeEnv === 'production') app.set('trust proxy', 1); // Vercel/Render/Railway sit behind a proxy

const origins = env.clientUrl.split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean); // "https://site.com/" must match the browser's "https://site.com"
app.use(helmet({crossOriginResourcePolicy: {policy: 'cross-origin'}}));
const lan = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;
app.use(cors({
    origin: (o, cb) => cb(null, !o || origins.includes(o) || (env.nodeEnv !== 'production' && lan.test(o))),
    credentials: true
}));
app.use('/api/payments/payhere/notify', express.urlencoded({extended: false}));
app.use(express.json({limit: '20mb'}));
if (env.nodeEnv !== 'test') app.use(morgan('dev'));

app.get('/', (_req, res) => res.json({name: 'Vehicle Buddy API', status: 'ok'}));
app.get('/health', (_req, res) => res.json({status: 'ok', time: new Date().toISOString()}));
app.get('/api/cron/run', asyncHandler(async (req: express.Request, res: express.Response) => {
    const given = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || String(req.query.key ?? '');
    if (!env.cronSecret) return res.status(503).json({message: 'CRON_SECRET is not set'});
    if (given !== env.cronSecret) return res.status(401).json({message: 'Unauthorized'});
    res.json({ok: true, ...(await purgeExpired())});
}));
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);
