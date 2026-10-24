import { isIP } from 'node:net';
import { ApiError } from './errors.js';

export const SESSION_RATE = Object.freeze({ limit: 8, globalLimit: 60, windowMs: 15 * 60 * 1000, maxKeys: 1024 });
export const CHAT_RATE = Object.freeze({ limit: 20, globalLimit: 60, windowMs: 60 * 1000, maxKeys: 1024 });

// These guards protect one warm process, not a shared/global spending budget.
export function createRateGuard({ limit, globalLimit, windowMs, maxKeys, clock = Date.now }) {
  const buckets = new Map();
  let overall = { count: 0, until: 0 };
  const reject = (until, now) => {
    throw new ApiError(429, 'RATE_LIMITED', 'Too many requests. Wait before trying again.', {
      'Retry-After': String(Math.max(1, Math.ceil((until - now) / 1000))),
    });
  };
  return (key) => {
    const now = clock();
    if (now >= overall.until) overall = { count: 0, until: now + windowMs };
    if (overall.count >= globalLimit) reject(overall.until, now);
    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.until) {
      // A bounded table fails closed when full rather than evicting active
      // buckets (which would let changing client IDs bypass the guard).
      for (const [id, entry] of buckets) {
        if (now >= entry.until) buckets.delete(id);
      }
      if (buckets.size >= maxKeys) reject(overall.until, now);
      bucket = { count: 0, until: now + windowMs };
      buckets.set(key, bucket);
    }
    if (bucket.count >= limit) reject(bucket.until, now);
    bucket.count += 1;
    overall.count += 1;
  };
}

export function clientAddress(req, env) {
  // Forwarded addresses are trusted only inside the Vercel runtime. Local dev
  // cannot bypass its bucket by supplying an arbitrary X-Forwarded-For header.
  if (env.VERCEL === '1') {
    for (const name of ['x-vercel-forwarded-for', 'x-forwarded-for']) {
      const value = req.headers[name];
      const first = typeof value === 'string' ? value.split(',')[0].trim() : '';
      if (isIP(first)) return first;
    }
  }
  return req.socket?.remoteAddress || 'unknown';
}
