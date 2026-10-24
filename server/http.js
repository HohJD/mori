import { isHttps } from './auth.js';
import { MAX_BODY_BYTES } from './config.js';
import { ApiError, cancelledRequest, invalidRequest } from './errors.js';

export function assertSameOrigin(req, env) {
  const reject = () => {
    throw new ApiError(403, 'INVALID_REQUEST', 'Use this API from the same origin as the MORI console.');
  };
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') reject();
  const origin = req.headers.origin;
  // Non-browser clients may omit Origin; they still need the owner code/cookie.
  // Cross-origin browser JSON requests cannot pass a CORS preflight either.
  if (origin === undefined) return;
  if (typeof origin !== 'string' || typeof req.headers.host !== 'string') reject();
  try {
    const expected = new URL(`${isHttps(req, env) ? 'https' : 'http'}://${req.headers.host}`);
    const supplied = new URL(origin);
    if (expected.username || expected.password || expected.pathname !== '/' || expected.search || expected.hash
      || supplied.origin !== origin || supplied.origin !== expected.origin) reject();
  } catch {
    reject();
  }
}

export function assertJsonRequest(req) {
  const type = req.headers['content-type'];
  if (typeof type !== 'string' || type.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw invalidRequest('POST requests must use Content-Type: application/json.', 415);
  }
  const charset = type.match(/;\s*charset\s*=\s*"?([^;"\s]+)/i)?.[1]?.toLowerCase();
  if (charset && charset !== 'utf-8' && charset !== 'utf8') {
    throw invalidRequest('JSON requests must use UTF-8.', 415);
  }
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') {
    throw invalidRequest('Compressed request bodies are not supported.', 415);
  }
}

const bodyTooLarge = () => invalidRequest('The JSON request body must be at most 100 KB.', 413);

function checkSize(size) {
  if (size > MAX_BODY_BYTES) throw bodyTooLarge();
}

function parseJson(raw) {
  checkSize(Buffer.byteLength(raw));
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw invalidRequest('Send a valid JSON request body.');
  }
}

export async function readJsonBody(req, { signal, timeoutMs = 4000 } = {}) {
  if (signal?.aborted || req.aborted) throw cancelledRequest();
  const length = req.headers['content-length'];
  if (length !== undefined) {
    const number = typeof length === 'string' && /^\d+$/.test(length) ? Number(length) : NaN;
    if (!Number.isSafeInteger(number) || number < 0) throw invalidRequest('Invalid Content-Length.');
    if (number > MAX_BODY_BYTES) {
      req.resume();
      throw bodyTooLarge();
    }
  }
  // Vercel can pre-parse IncomingMessage.body. Vite/Node usually leave a raw
  // stream. Both paths apply the same byte limit and subsequent schema checks.
  let preparedBody;
  try {
    // Vercel may expose a lazy getter that throws for malformed JSON. Do not
    // allow a platform parsing exception or its details into our error output.
    preparedBody = req.body;
  } catch {
    throw invalidRequest('Send a valid JSON request body.');
  }
  if (preparedBody !== undefined) {
    if (typeof preparedBody === 'string' || Buffer.isBuffer(preparedBody)) return parseJson(preparedBody);
    let serialized;
    try {
      serialized = JSON.stringify(preparedBody);
    } catch {
      throw invalidRequest('Send a valid JSON request body.');
    }
    if (serialized === undefined) throw invalidRequest('Send a valid JSON request body.');
    checkSize(Buffer.byteLength(serialized));
    return preparedBody;
  }
  const raw = await new Promise((resolve, reject) => {
    let settled = false;
    let size = 0;
    const chunks = [];
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
      req.off('aborted', onAbort);
      signal?.removeEventListener('abort', onAbort);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      // Drain instead of destroying the socket, so a 400/413 JSON response
      // still reaches the client (including for chunked, oversized bodies).
      req.resume();
      reject(error);
    };
    const onData = (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.byteLength;
      if (size > MAX_BODY_BYTES) return fail(bodyTooLarge());
      chunks.push(buffer);
    };
    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks));
    };
    const onError = () => fail(invalidRequest('The request body could not be read.'));
    const onAbort = () => fail(cancelledRequest());
    req.on('data', onData);
    req.once('end', onEnd);
    req.once('error', onError);
    req.once('aborted', onAbort);
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => fail(new ApiError(408, 'TIMEOUT', 'The request body took too long to arrive.')), timeoutMs);
    if (req.readableEnded) onEnd();
    else if (signal?.aborted || req.aborted) onAbort();
  });
  return parseJson(raw);
}

export function sendJson(res, status, body, headers = {}) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin, Cookie',
    ...headers,
  });
  res.end(JSON.stringify(body));
}
