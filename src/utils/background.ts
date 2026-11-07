/**
 * Fire-and-forget work (e-mails, bell notifications) is started with `void sendMail(...)` all over the code.
 * On a normal server that just keeps running after the response is sent. On Vercel (serverless) the function can be
 * frozen right after the response, so api/index.js calls drainBackground() inside waitUntil() to let that work finish.
 * On a normal server nothing calls drainBackground(), so this file changes nothing there.
 */
const pending = new Set<Promise<unknown>>();

export function track<T>(p: Promise<T>): Promise<T> {
  pending.add(p);
  p.then(() => pending.delete(p), () => pending.delete(p));
  return p;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** wait a moment (so work that is queued behind a database call can register itself), then wait until all tracked work is done */
export async function drainBackground(graceMs = 1500, maxMs = 25_000): Promise<void> {
  const end = Date.now() + maxMs;
  await sleep(graceMs);
  while (pending.size && Date.now() < end) {
    await Promise.race([Promise.allSettled([...pending]), sleep(Math.max(0, end - Date.now()))]);
  }
}
