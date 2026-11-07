/**
 * Serverless entry point (Vercel). api/index.js is a one-line shim that loads this compiled file from dist/,
 * so the real code stays in TypeScript and is type-checked by `npm run build` like everything else.
 * The normal server (src/server.ts, `npm start`) is untouched and still works on Render / your laptop.
 */
import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { app } from './app';
import { connectDB } from './config/db';
import { drainBackground } from './utils/background';

let waitUntil: (p: Promise<unknown>) => unknown = (p) => p;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  waitUntil = require('@vercel/functions').waitUntil;
} catch {
  /* package missing: background work just runs best-effort */
}

// one connection per warm instance, reused by the next requests
let ready: Promise<void> | null = null;
function init(): Promise<void> {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!ready) {
    ready = connectDB().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    await init();
  } catch (e) {
    console.error('Database connection failed:', (e as Error).message);
    res.status(503).json({ message: 'Database is not reachable. Please try again.' });
    return;
  }
  // let e-mails / notifications started with `void ...` finish after the response has been sent
  waitUntil(drainBackground());
  app(req, res);
}
