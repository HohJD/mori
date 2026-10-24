import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'mori_session';
export const SESSION_TTL_SECONDS = 4 * 60 * 60;
const SIGNING_CONTEXT = 'mori:owner-session:v1\0';

export function authConfigured(env) {
  return typeof env.MORI_ACCESS_CODE === 'string' && env.MORI_ACCESS_CODE.trim().length >= 20;
}

export function accessCodeMatches(code, env) {
  if (!authConfigured(env) || typeof code !== 'string') return false;
  // Fixed-length digests avoid exposing the secret's length through comparison.
  const digest = (value) => createHash('sha256').update('mori:owner-unlock:v1\0').update(value).digest();
  return timingSafeEqual(digest(code), digest(env.MORI_ACCESS_CODE));
}

function signature(payload, env) {
  return createHmac('sha256', env.MORI_ACCESS_CODE).update(SIGNING_CONTEXT).update(payload).digest();
}

export function createSession(env, now = Date.now()) {
  if (!authConfigured(env)) throw new Error('Owner access is not configured.');
  const issued = Math.floor(now / 1000);
  const payload = `v1.${issued}.${issued + SESSION_TTL_SECONDS}.${randomBytes(16).toString('base64url')}`;
  return `${payload}.${signature(payload, env).toString('base64url')}`;
}

function cookieToken(header) {
  if (typeof header !== 'string' || header.length > 16384) return null;
  const matches = header.split(';').map((part) => part.trim())
    .filter((part) => part.startsWith(`${SESSION_COOKIE}=`));
  // Ambiguous duplicate cookies are not accepted.
  return matches.length === 1 ? matches[0].slice(SESSION_COOKIE.length + 1) : null;
}

export function authenticated(cookieHeader, env, now = Date.now()) {
  if (!authConfigured(env)) return false;
  const token = cookieToken(cookieHeader);
  const match = token?.match(/^(v1\.(\d{1,12})\.(\d{1,12})\.[A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/);
  if (!match) return false;
  const expected = signature(match[1], env);
  const supplied = Buffer.from(match[4], 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false;
  // Enforce canonical base64url as well as its decoded signature.
  if (supplied.toString('base64url') !== match[4]) return false;
  const issued = Number(match[2]);
  const expires = Number(match[3]);
  const seconds = Math.floor(now / 1000);
  return issued <= seconds + 60 && expires > seconds
    && expires - issued === SESSION_TTL_SECONDS;
}

export function isHttps(req, env) {
  return env.VERCEL === '1' || Boolean(req.socket?.encrypted)
    || req.headers['x-forwarded-proto'] === 'https';
}

export function sessionCookie(token, req, env, now = Date.now()) {
  const expires = new Date(now + SESSION_TTL_SECONDS * 1000).toUTCString();
  return `${SESSION_COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Strict; `
    + `Max-Age=${SESSION_TTL_SECONDS}; Expires=${expires}${isHttps(req, env) ? '; Secure' : ''}`;
}

export function clearedSessionCookie(req, env) {
  return `${SESSION_COOKIE}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0; `
    + `Expires=Thu, 01 Jan 1970 00:00:00 GMT${isHttps(req, env) ? '; Secure' : ''}`;
}
