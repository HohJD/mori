import {
  accessCodeMatches, authConfigured, authenticated, clearedSessionCookie, createSession, sessionCookie,
} from './auth.js';
import { LIMITS, hasOnlyKeys, isRecord, publicProviders, validateChatRequest } from './config.js';
import { ApiError, invalidRequest, publicError } from './errors.js';
import { assertJsonRequest, assertSameOrigin, readJsonBody, sendJson } from './http.js';
import { createProviderClient } from './providers.js';
import { CHAT_RATE, SESSION_RATE, clientAddress, createRateGuard } from './rate-limit.js';

const METHODS = Object.freeze({
  '/api/config': ['GET'],
  '/api/session': ['POST', 'DELETE'],
  '/api/chat': ['POST'],
});

export function createApiHandler({
  env = process.env,
  fetch: fetchImpl = globalThis.fetch,
  clock = Date.now,
  upstreamClock,
  timeoutMs,
  bodyTimeoutMs,
  getOidcToken,
  rateLimits = {},
} = {}) {
  const providers = createProviderClient({ env, fetch: fetchImpl, clock: upstreamClock, timeoutMs, getOidcToken });
  const sessionGuard = createRateGuard({ ...SESSION_RATE, ...rateLimits.session, clock });
  const chatGuard = createRateGuard({ ...CHAT_RATE, ...rateLimits.chat, clock });

  return async function handleApi(req, res) {
    const controller = new AbortController();
    const onDisconnect = () => {
      if (!res.writableEnded) controller.abort();
    };
    req.once('aborted', onDisconnect);
    // Keep this harmless listener on the request through any rejected-body
    // drain, which can outlive the response if a client disconnects.
    req.once('error', onDisconnect);
    res.once('close', onDisconnect);
    try {
      const path = new URL(req.url, 'http://mori.internal').pathname;
      const allowed = METHODS[path];
      if (!allowed) throw invalidRequest('This API endpoint does not exist.', 404);
      assertSameOrigin(req, env);
      if (!allowed.includes(req.method)) {
        throw new ApiError(405, 'INVALID_REQUEST', 'This endpoint does not support that method.', { Allow: allowed.join(', ') });
      }
      if (path === '/api/config') {
        sendJson(res, 200, {
          auth: {
            required: true,
            configured: authConfigured(env),
            authenticated: authenticated(req.headers.cookie, env, clock()),
          },
          providers: publicProviders(env),
          limits: LIMITS,
        });
        return;
      }
      if (req.method === 'DELETE') {
        sendJson(res, 200, { authenticated: false }, { 'Set-Cookie': clearedSessionCookie(req, env) });
        return;
      }
      assertJsonRequest(req);
      if (!authConfigured(env)) {
        throw new ApiError(503, 'SETUP_REQUIRED', 'Set a server owner access code of at least 20 characters before using AI.');
      }
      const address = clientAddress(req, env);
      if (path === '/api/session') {
        sessionGuard(address);
        const body = await readJsonBody(req, { signal: controller.signal, timeoutMs: bodyTimeoutMs });
        if (!isRecord(body) || !hasOnlyKeys(body, ['code']) || typeof body.code !== 'string' || !body.code.trim()) {
          throw invalidRequest('Send the owner access code in a JSON object containing only code.');
        }
        if (!accessCodeMatches(body.code, env)) {
          throw new ApiError(401, 'AUTH_REQUIRED', 'The access code was not accepted.');
        }
        const now = clock();
        sendJson(res, 200, { authenticated: true }, {
          'Set-Cookie': sessionCookie(createSession(env, now), req, env, now),
        });
        return;
      }
      if (!authenticated(req.headers.cookie, env, clock())) {
        throw new ApiError(401, 'AUTH_REQUIRED', 'Unlock this MORI instance with its owner access code first.');
      }
      chatGuard(address);
      const body = await readJsonBody(req, { signal: controller.signal, timeoutMs: bodyTimeoutMs });
      const request = validateChatRequest(body);
      const result = await providers.chat({ ...request, signal: controller.signal });
      sendJson(res, 200, result);
    } catch (error) {
      const safe = publicError(error);
      if (safe.status === 413 || safe.status === 408) res.shouldKeepAlive = false;
      sendJson(res, safe.status, { error: { code: safe.code, message: safe.message } }, safe.headers);
    } finally {
      req.off('aborted', onDisconnect);
      res.off('close', onDisconnect);
      if (!req.readableEnded && !req.destroyed) req.resume();
    }
  };
}
