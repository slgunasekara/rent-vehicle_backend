import { app } from './app';
import { connectDB } from './config/db';
import { env } from './config/env';
import { startExpiryJob } from './services/expiry.service';

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

connectDB()
  .then(() => app.listen(env.port, () => { console.log(`Vehicle Buddy API running on port ${env.port}`); startExpiryJob(); }))
  .catch((e) => {
    console.error('Failed to start server', e);
    process.exit(1);
  });
