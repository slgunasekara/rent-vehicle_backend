import type {Request, Response} from 'express';
import mongoose from 'mongoose';
import {app} from './app';
import {connectDB} from './config/db';
import {drainBackground} from './utils/background';

let waitUntil: (p: Promise<unknown>) => unknown = (p) => p;
try {
    waitUntil = require('@vercel/functions').waitUntil;
} catch {
}

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
        res.status(503).json({message: 'Database is not reachable. Please try again.'});
        return;
    }
    waitUntil(drainBackground());
    app(req, res);
}
