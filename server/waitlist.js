import { createHash } from 'node:crypto';
import { BlobError, put } from '@vercel/blob';
import { hasOnlyKeys, isRecord } from './config.js';
import { ApiError, invalidRequest } from './errors.js';

export const WAITLIST_RATE = Object.freeze({ limit: 5, globalLimit: 300, windowMs: 10 * 60 * 1000, maxKeys: 2048 });
export const INTERESTS = Object.freeze(['pebble', 'nest', 'coats', 'plus', 'everything']);
// Deliberately simple: one @, a dotted domain, no spaces. The inbox is the real check.
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

export function validateWaitlistRequest(body) {
  if (!isRecord(body) || !hasOnlyKeys(body, ['email', 'interest', 'website'])) {
    throw invalidRequest('Send a JSON object containing only email, interest, and website.');
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !EMAIL.test(email)) {
    throw invalidRequest('That email address doesn’t look quite right.');
  }
  const interest = body.interest ?? 'everything';
  if (!INTERESTS.includes(interest)) throw invalidRequest('Pick one of the listed products.');
  // The hidden "website" field is a honeypot: people never see it, bots fill it.
  const bot = typeof body.website === 'string' && body.website.trim() !== '';
  return { email, interest, bot };
}

// One private blob per address, named by its hash, so a repeat signup is a
// no-op and the store's file listing never exposes an email address.
export function createWaitlist({ env, put: putImpl = put, clock = Date.now }) {
  return async function join({ email, interest }) {
    if (!env.BLOB_READ_WRITE_TOKEN) {
      throw new ApiError(503, 'SETUP_REQUIRED', 'The waitlist isn’t connected yet. Please try again later.');
    }
    const id = createHash('sha256').update(email).digest('hex');
    const record = JSON.stringify({ email, interest, joinedAt: new Date(clock()).toISOString() });
    try {
      await putImpl(`waitlist/${id}.json`, record, {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: 'application/json',
        token: env.BLOB_READ_WRITE_TOKEN,
      });
    } catch (error) {
      if (error instanceof BlobError && /already exists/i.test(error.message)) return;
      throw new ApiError(502, 'UPSTREAM_ERROR', 'We couldn’t save that just now. Please try again.');
    }
  };
}
