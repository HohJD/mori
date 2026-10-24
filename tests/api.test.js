import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from '../server/auth.js';
import { LIMITS, MAX_BODY_BYTES, publicProviders, validateChatRequest } from '../server/config.js';
import { createApiHandler } from '../server/handler.js';
import { createProviderClient } from '../server/providers.js';
import { clientAddress, createRateGuard } from '../server/rate-limit.js';

// All credentials and provider payloads in this file are deliberate fixtures.
// No .env file is loaded. Upstream fetch is always injected; actual HTTP
// requests below go only to an ephemeral 127.0.0.1 test server.
const OWNER = 'fixture-owner-access-code-not-a-real-secret';
const NOW = 1_800_000_000_000;
const messages = [
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi' },
  { role: 'user', content: 'Please help with this text.' },
];
const chatBody = (extra = {}) => ({ provider: 'openai', mode: 'chat', messages, ...extra });
const fixtureEnv = (extra = {}) => ({
  MORI_ACCESS_CODE: OWNER,
  OPENAI_API_KEY: 'fixture-openai-key',
  ANTHROPIC_API_KEY: 'fixture-claude-key',
  GEMINI_API_KEY: 'fixture-gemini-key',
  ...extra,
});
const openAIData = (extra = {}) => ({
  id: 'fixture-upstream-id',
  status: 'completed',
  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'A real fixture response.' }] }],
  usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
  ...extra,
});
const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const gatewayEnv = (extra = {}) => fixtureEnv({
  OPENAI_API_KEY: '',
  ANTHROPIC_API_KEY: '',
  GEMINI_API_KEY: '',
  MORI_GATEWAY_PROVIDERS: 'openai',
  VERCEL_OIDC_TOKEN: 'fixture-oidc-presence-only',
  ...extra,
});
// Shape/counts from the owner's successful Gateway nano request, not a live
// request made by this suite. This fixture is never used by production code.
const gatewayData = (extra = {}) => ({
  choices: [{ message: { role: 'assistant', content: 'MORI' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18, cost: 0.0000099 },
  ...extra,
});

async function startServer(t, options = {}, { preparse = false } = {}) {
  const handler = createApiHandler({
    env: fixtureEnv(),
    fetch: async () => { throw new Error('Unexpected upstream request in test.'); },
    getOidcToken: async () => { throw new Error('Unexpected OIDC resolution in test.'); },
    ...options,
  });
  const server = createServer(async (req, res) => {
    if (preparse && req.method === 'POST') {
      // Simulate Vercel's body parsing without changing the shared handler.
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      if (preparse === 'lazy') {
        Object.defineProperty(req, 'body', { get: () => JSON.parse(raw) });
      } else {
        try { req.body = JSON.parse(raw); } catch { req.body = raw; }
      }
    }
    await handler(req, res);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

function call(base, path, { method = 'GET', body, cookie, headers = {} } = {}) {
  const requestHeaders = new Headers({ Origin: base });
  if (body !== undefined) requestHeaders.set('Content-Type', 'application/json');
  if (cookie) requestHeaders.set('Cookie', cookie);
  for (const [name, value] of Object.entries(headers)) {
    if (value === null) requestHeaders.delete(name);
    else requestHeaders.set(name, value);
  }
  return fetch(`${base}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    redirect: 'manual',
  });
}

async function unlock(base, options = {}) {
  const response = await call(base, '/api/session', { method: 'POST', body: { code: OWNER }, ...options });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: true });
  return response.headers.get('set-cookie').split(';')[0];
}

async function expectError(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ['error']);
  assert.deepEqual(Object.keys(body.error).sort(), ['code', 'message']);
  assert.equal(body.error.code, code);
  assert.equal(typeof body.error.message, 'string');
  assert.ok(body.error.message.length > 0);
  assert.ok(!JSON.stringify(body).includes(OWNER));
  assert.ok(!JSON.stringify(body).includes('fixture-openai-key'));
  return body;
}

test('OpenAI uses Responses with curated instructions, storage disabled, visible output, and measured usage', async () => {
  let captured;
  const times = [100, 142.4];
  const client = createProviderClient({
    env: fixtureEnv(),
    clock: () => times.shift(),
    fetch: async (url, options) => {
      captured = { url, options, body: JSON.parse(options.body) };
      return jsonResponse(openAIData({
        output_text: 'SDK-only field must not be used.',
        output: [
          { type: 'reasoning', summary: [{ text: 'Hidden reasoning.' }] },
          { type: 'message', role: 'assistant', content: [
            { type: 'output_text', text: 'Hello ' },
            { type: 'refusal', refusal: 'Not a text block.' },
            { type: 'output_text', text: 'world.' },
          ] },
          { type: 'function_call', name: 'never_execute', arguments: '{}' },
        ],
      }));
    },
  });
  const result = await client.chat(chatBody({ mode: 'summarize' }));
  assert.equal(captured.url, 'https://api.openai.com/v1/responses');
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers.Authorization, 'Bearer fixture-openai-key');
  assert.equal(captured.options.redirect, 'error');
  assert.equal(captured.options.cache, 'no-store');
  assert.equal(captured.body.model, 'gpt-5.6-terra');
  assert.deepEqual(captured.body.input, messages);
  assert.match(captured.body.instructions, /Summarize the supplied material/);
  assert.equal(captured.body.max_output_tokens, 1024);
  assert.equal(captured.body.store, false);
  assert.deepEqual(captured.body.reasoning, { effort: 'none' });
  assert.equal(result.reply, 'Hello world.');
  assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 5, totalTokens: 15 });
  assert.equal(result.durationMs, 42);
  assert.match(result.requestId, /^[0-9a-f-]{36}$/);
  assert.notEqual(result.requestId, 'fixture-upstream-id');
  assert.equal(result.finishReason, 'completed');
  assert.equal(result.partial, false);
});

test('Claude sends Messages without deprecated sampling flags and sums reported cache input usage', async () => {
  let captured;
  const client = createProviderClient({
    env: fixtureEnv(),
    fetch: async (url, options) => {
      captured = { url, headers: options.headers, body: JSON.parse(options.body) };
      return jsonResponse({
        type: 'message',
        content: [
          { type: 'thinking', thinking: 'Never expose this.' },
          { type: 'text', text: 'Hello ' },
          { type: 'redacted_thinking', data: 'Never expose this either.' },
          { type: 'text', text: 'Claude.' },
        ],
        usage: { input_tokens: 5, cache_creation_input_tokens: 7, cache_read_input_tokens: 11, output_tokens: 3 },
        stop_reason: 'max_tokens',
      });
    },
  });
  const result = await client.chat(chatBody({ provider: 'claude', mode: 'write' }));
  assert.equal(captured.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(captured.headers['x-api-key'], 'fixture-claude-key');
  assert.equal(captured.headers['anthropic-version'], '2023-06-01');
  assert.deepEqual(Object.keys(captured.body).sort(), ['max_tokens', 'messages', 'model', 'system']);
  assert.equal(captured.body.model, 'claude-haiku-5-5');
  assert.equal(captured.body.max_tokens, 1024);
  assert.deepEqual(captured.body.messages, messages);
  assert.match(captured.body.system, /draft or revise/);
  assert.equal(result.reply, 'Hello Claude.');
  assert.deepEqual(result.usage, { inputTokens: 23, outputTokens: 3, totalTokens: 26 });
  assert.equal(result.finishReason, 'max_tokens');
  assert.equal(result.partial, true);
});

test('Gemini sends generateContent with the key in a header and excludes thoughts and alternative candidates', async () => {
  let captured;
  const client = createProviderClient({
    env: fixtureEnv(),
    fetch: async (url, options) => {
      captured = { url, headers: options.headers, body: JSON.parse(options.body) };
      return jsonResponse({
        candidates: [
          { content: { parts: [
            { text: 'Hidden thoughts.', thought: true },
            { text: 'Bonjour.' },
            { functionCall: { name: 'never_execute', args: {} } },
          ] }, finishReason: 'MAX_TOKENS' },
          { content: { parts: [{ text: 'An alternative, not a continuation.' }] }, finishReason: 'STOP' },
        ],
        usageMetadata: { promptTokenCount: 6, candidatesTokenCount: 3, thoughtsTokenCount: 9, totalTokenCount: 18 },
      });
    },
  });
  const result = await client.chat(chatBody({ provider: 'gemini', mode: 'translate' }));
  assert.equal(captured.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
  assert.ok(!captured.url.includes('key='));
  assert.equal(captured.headers['x-goog-api-key'], 'fixture-gemini-key');
  assert.deepEqual(captured.body.contents, messages.map(({ role, content }) => ({
    role: role === 'assistant' ? 'model' : 'user',
    parts: [{ text: content }],
  })));
  assert.match(captured.body.systemInstruction.parts[0].text, /Translate into the language/);
  assert.deepEqual(captured.body.generationConfig, { maxOutputTokens: 1024 });
  assert.equal(result.reply, 'Bonjour.');
  assert.deepEqual(result.usage, { inputTokens: 6, outputTokens: 3, totalTokens: 18 });
  assert.equal(result.finishReason, 'MAX_TOKENS');
  assert.equal(result.partial, true);
});

test('unknown usage stays null, reported zero is preserved, and truncation is explicit', async () => {
  const cases = [
    {
      provider: 'openai',
      data: openAIData({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, usage: { input_tokens: 0 } }),
      expected: { inputTokens: 0, outputTokens: null, totalTokens: null },
    },
    {
      provider: 'claude',
      data: { content: [{ type: 'text', text: 'Text' }], usage: { output_tokens: 0, cache_read_input_tokens: 5 } },
      expected: { inputTokens: null, outputTokens: 0, totalTokens: null },
    },
    {
      provider: 'gemini',
      data: { candidates: [{ content: { parts: [{ text: 'Text' }] } }], usageMetadata: { candidatesTokenCount: 0, totalTokenCount: 15 } },
      expected: { inputTokens: null, outputTokens: 0, totalTokens: 15 },
    },
  ];
  for (const { provider, data, expected } of cases) {
    const client = createProviderClient({ env: fixtureEnv(), fetch: async () => jsonResponse(data) });
    const result = await client.chat(chatBody({ provider }));
    assert.deepEqual(result.usage, expected);
    if (provider === 'openai') {
      assert.equal(result.partial, true);
      assert.equal(result.finishReason, 'max_output_tokens');
    } else {
      assert.equal(result.finishReason, null);
    }
  }
});

test('model overrides are server-only, keep fixed hosts, and omit default-only OpenAI reasoning options', async () => {
  const cases = [
    ['openai', 'OPENAI_MODEL', openAIData()],
    ['claude', 'ANTHROPIC_MODEL', { content: [{ type: 'text', text: 'Text' }] }],
    ['gemini', 'GEMINI_MODEL', { candidates: [{ content: { parts: [{ text: 'Text' }] } }] }],
  ];
  for (const [provider, variable, data] of cases) {
    let request;
    const client = createProviderClient({
      env: fixtureEnv({ [variable]: 'fixture-text-model' }),
      fetch: async (url, options) => {
        request = { url, body: JSON.parse(options.body) };
        return jsonResponse(data);
      },
    });
    const result = await client.chat(chatBody({ provider }));
    assert.equal(result.model, 'fixture-text-model');
    assert.ok(!Object.hasOwn(request.body, 'reasoning'));
    assert.ok(!Object.hasOwn(request.body, 'temperature'));
    if (provider === 'gemini') {
      assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models/fixture-text-model:generateContent');
    } else {
      assert.equal(request.body.model, 'fixture-text-model');
    }
  }
  let calls = 0;
  const invalid = createProviderClient({
    env: fixtureEnv({ GEMINI_MODEL: 'https://untrusted.invalid/model' }),
    fetch: async () => { calls += 1; },
  });
  await assert.rejects(invalid.chat(chatBody({ provider: 'gemini' })), { code: 'SETUP_REQUIRED' });
  assert.equal(calls, 0);
});

test('upstream auth, quotas, malformed responses, refusals, and blocks are explicit sanitized failures, never fallbacks', async () => {
  const marker = 'DO_NOT_ECHO_UPSTREAM_DETAILS';
  const cases = [
    { response: () => jsonResponse({ error: { message: marker } }, 401), code: 'PROVIDER_AUTH_FAILED' },
    { response: () => jsonResponse({ error: marker }, 403), code: 'PROVIDER_AUTH_FAILED' },
    { response: () => jsonResponse({ error: marker }, 429), code: 'RATE_LIMITED' },
    { response: () => jsonResponse({ error: marker }, 400), code: 'UPSTREAM_ERROR' },
    { response: () => jsonResponse({ error: marker }, 503), code: 'UPSTREAM_ERROR' },
    { response: () => new Response(`<html>${marker}</html>`), code: 'UPSTREAM_ERROR' },
    { response: () => jsonResponse(openAIData({ output: [], output_text: 'Do not use this SDK-only field.' })), code: 'UPSTREAM_ERROR' },
    { response: () => jsonResponse(openAIData({ status: 'failed', error: { message: marker } })), code: 'UPSTREAM_ERROR' },
    { response: () => jsonResponse({ promptFeedback: { blockReason: 'SAFETY' } }), provider: 'gemini', code: 'UPSTREAM_ERROR' },
  ];
  for (const entry of cases) {
    let calls = 0;
    const client = createProviderClient({
      env: fixtureEnv(),
      fetch: async () => { calls += 1; return entry.response(); },
    });
    await assert.rejects(client.chat(chatBody({ provider: entry.provider || 'openai' })), (error) => {
      assert.equal(error.code, entry.code);
      assert.ok(!error.message.includes(marker));
      assert.ok(!error.message.includes('fixture-'));
      return true;
    });
    assert.equal(calls, 1, 'No hidden retry or paid-provider fallback');
  }
  const networkFailure = createProviderClient({
    env: fixtureEnv(),
    fetch: async () => { throw new Error(marker); },
  });
  await assert.rejects(networkFailure.chat(chatBody()), (error) => error.code === 'UPSTREAM_ERROR' && !error.message.includes(marker));
});

test('upstream timeouts cover fetch and body reading, even if a fetch implementation ignores abort', async () => {
  let signal;
  const client = createProviderClient({
    env: fixtureEnv(),
    timeoutMs: 10,
    fetch: async (_url, options) => {
      signal = options.signal;
      return new Promise(() => {});
    },
  });
  await assert.rejects(client.chat(chatBody()), { code: 'TIMEOUT', status: 504 });
  assert.equal(signal.aborted, true);
  let cancelledBody = false;
  const slowBody = createProviderClient({
    env: fixtureEnv(),
    timeoutMs: 10,
    fetch: async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('{"status":')); },
      cancel() { cancelledBody = true; },
    })),
  });
  await assert.rejects(slowBody.chat(chatBody()), { code: 'TIMEOUT' });
  assert.equal(cancelledBody, true);
});

test('caller cancellation aborts upstream and pre-cancelled requests never fetch', async () => {
  let calls = 0;
  let upstreamSignal;
  const client = createProviderClient({
    env: fixtureEnv(),
    fetch: async (_url, options) => {
      calls += 1;
      upstreamSignal = options.signal;
      return new Promise(() => {});
    },
  });
  const controller = new AbortController();
  const pending = client.chat({ ...chatBody(), signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { code: 'REQUEST_CANCELLED' });
  assert.equal(upstreamSignal.aborted, true);
  await assert.rejects(client.chat({ ...chatBody(), signal: controller.signal }), { code: 'REQUEST_CANCELLED' });
  assert.equal(calls, 1);
});

test('public config reports presence, not health, and exposes no credentials, cookies, or unrelated environment', async (t) => {
  let calls = 0;
  const base = await startServer(t, {
    env: fixtureEnv({ ANTHROPIC_API_KEY: '', GEMINI_API_KEY: ' ', VERCEL_OIDC_TOKEN: 'fixture-unrelated-tooling-value' }),
    fetch: async () => { calls += 1; },
  });
  const response = await call(base, '/api/config');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('set-cookie'), null);
  const data = await response.json();
  assert.deepEqual(data, {
    auth: { required: true, configured: true, authenticated: false },
    providers: [
      { id: 'openai', name: 'OpenAI', model: 'gpt-5.6-terra', configured: true, transport: 'direct' },
      { id: 'claude', name: 'Claude', model: 'claude-haiku-5-5', configured: false, transport: null },
      { id: 'gemini', name: 'Gemini', model: 'gemini-3.8-flash', configured: false, transport: null },
    ],
    limits: LIMITS,
  });
  assert.ok(!JSON.stringify(data).includes('fixture-'));
  assert.equal(calls, 0);
});

test('missing, short, and whitespace owner codes fail closed even when provider keys exist', async (t) => {
  for (const code of [undefined, 'short', ' '.repeat(30)]) {
    let calls = 0;
    const base = await startServer(t, {
      env: fixtureEnv({ MORI_ACCESS_CODE: code }),
      fetch: async () => { calls += 1; },
    });
    const config = await (await call(base, '/api/config')).json();
    assert.deepEqual(config.auth, { required: true, configured: false, authenticated: false });
    assert.equal(config.providers[0].configured, true);
    await expectError(await call(base, '/api/chat', { method: 'POST', body: chatBody() }), 503, 'SETUP_REQUIRED');
    await expectError(await call(base, '/api/session', { method: 'POST', body: { code: OWNER } }), 503, 'SETUP_REQUIRED');
    assert.equal(calls, 0);
  }
});

test('session cookies are signed, bounded, HttpOnly, stateless, tamper-resistant, and cleared on logout', async (t) => {
  let now = NOW;
  let calls = 0;
  const env = fixtureEnv();
  const options = { env, clock: () => now, fetch: async () => { calls += 1; return jsonResponse(openAIData()); } };
  const base = await startServer(t, options);
  await expectError(await call(base, '/api/chat', { method: 'POST', body: chatBody() }), 401, 'AUTH_REQUIRED');
  await expectError(await call(base, '/api/session', { method: 'POST', body: { code: 'wrong-code' } }), 401, 'AUTH_REQUIRED');
  const response = await call(base, '/api/session', { method: 'POST', body: { code: OWNER } });
  assert.deepEqual(await response.json(), { authenticated: true });
  const header = response.headers.get('set-cookie');
  assert.match(header, /; HttpOnly;/);
  assert.match(header, /; SameSite=Strict;/);
  assert.match(header, /; Path=\/api;/);
  assert.match(header, new RegExp(`; Max-Age=${SESSION_TTL_SECONDS};`));
  assert.ok(!header.includes(OWNER));
  assert.ok(!header.includes('; Secure'));
  const cookie = header.split(';')[0];
  assert.equal((await (await call(base, '/api/config', { cookie })).json()).auth.authenticated, true);
  const second = await startServer(t, options);
  assert.equal((await (await call(second, '/api/config', { cookie })).json()).auth.authenticated, true);

  const parts = cookie.split('.');
  parts[4] = `${parts[4][0] === 'a' ? 'b' : 'a'}${parts[4].slice(1)}`;
  await expectError(await call(base, '/api/chat', { method: 'POST', body: chatBody(), cookie: parts.join('.') }), 401, 'AUTH_REQUIRED');
  await expectError(await call(base, '/api/chat', { method: 'POST', body: chatBody(), cookie: `${cookie}; ${cookie}` }), 401, 'AUTH_REQUIRED');
  now += SESSION_TTL_SECONDS * 1000;
  await expectError(await call(base, '/api/chat', { method: 'POST', body: chatBody(), cookie }), 401, 'AUTH_REQUIRED');
  assert.equal((await (await call(base, '/api/config', { cookie })).json()).auth.authenticated, false);

  const fresh = await unlock(base);
  env.MORI_ACCESS_CODE = 'fixture-rotated-owner-code-revokes-old-sessions';
  await expectError(await call(base, '/api/chat', { method: 'POST', body: chatBody(), cookie: fresh }), 401, 'AUTH_REQUIRED');
  const logout = await call(base, '/api/session', { method: 'DELETE', cookie: fresh });
  assert.deepEqual(await logout.json(), { authenticated: false });
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0;/);
  assert.match(logout.headers.get('set-cookie'), /HttpOnly/);
  assert.equal(calls, 0);
});

test('Vercel and HTTPS sessions set Secure, without needing a live deployment', async (t) => {
  for (const vercel of [false, true]) {
    const base = await startServer(t, { env: fixtureEnv(vercel ? { VERCEL: '1' } : {}) });
    const response = await call(base, '/api/session', {
      method: 'POST',
      body: { code: OWNER },
      headers: { Origin: base.replace('http:', 'https:'), ...(!vercel ? { 'X-Forwarded-Proto': 'https' } : {}) },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /; Secure$/);
    assert.deepEqual(await response.json(), { authenticated: true });
  }
});

test('raw Node/Vite and Vercel-style pre-parsed requests share the exact authenticated chat contract', async (t) => {
  for (const preparse of [false, true, 'lazy']) {
    let calls = 0;
    const times = [10, 36];
    const base = await startServer(t, {
      upstreamClock: () => times.shift(),
      fetch: async () => { calls += 1; return jsonResponse(openAIData()); },
    }, { preparse });
    const cookie = await unlock(base);
    const response = await call(base, '/api/chat', { method: 'POST', body: chatBody({ mode: 'plan' }), cookie });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = await response.json();
    assert.deepEqual(Object.keys(data).sort(), ['durationMs', 'finishReason', 'model', 'partial', 'provider', 'reply', 'requestId', 'usage']);
    assert.equal(data.provider, 'openai');
    assert.equal(data.model, 'gpt-5.6-terra');
    assert.equal(data.reply, 'A real fixture response.');
    assert.deepEqual(data.usage, { inputTokens: 10, outputTokens: 5, totalTokens: 15 });
    assert.equal(data.durationMs, 26);
    assert.equal(data.finishReason, 'completed');
    assert.equal(data.partial, false);
    assert.match(data.requestId, /^[0-9a-f-]{36}$/);
    assert.equal(calls, 1);
    if (preparse === 'lazy') {
      await expectError(await call(base, '/api/chat', { method: 'POST', body: '{"broken":', cookie }), 400, 'INVALID_REQUEST');
      assert.equal(calls, 1);
    }
  }
});

test('a missing selected provider key fails explicitly without falling back to another configured provider', async (t) => {
  let calls = 0;
  const base = await startServer(t, {
    env: fixtureEnv({ OPENAI_API_KEY: '' }),
    fetch: async () => { calls += 1; },
  });
  const cookie = await unlock(base);
  await expectError(await call(base, '/api/chat', { method: 'POST', body: chatBody(), cookie }), 503, 'PROVIDER_NOT_CONFIGURED');
  assert.equal(calls, 0);
});

test('methods, JSON content types, same-origin requests, and unsupported endpoints are enforced before fetch', async (t) => {
  let calls = 0;
  const base = await startServer(t, { fetch: async () => { calls += 1; } });
  const cookie = await unlock(base);
  const wrongMethod = await call(base, '/api/chat');
  await expectError(wrongMethod, 405, 'INVALID_REQUEST');
  assert.equal(wrongMethod.headers.get('allow'), 'POST');
  const preflight = await call(base, '/api/session', { method: 'OPTIONS', headers: { Origin: 'https://untrusted.invalid' } });
  await expectError(preflight, 403, 'INVALID_REQUEST');
  assert.equal(preflight.headers.get('access-control-allow-origin'), null);
  await expectError(await call(base, '/api/not-an-endpoint'), 404, 'INVALID_REQUEST');
  await expectError(await call(base, '/api/chat', { method: 'POST', body: chatBody(), cookie, headers: { 'Content-Type': 'text/plain' } }), 415, 'INVALID_REQUEST');
  await expectError(await call(base, '/api/chat', { method: 'POST', body: chatBody(), cookie, headers: { 'Content-Encoding': 'gzip' } }), 415, 'INVALID_REQUEST');
  for (const headers of [
    { Origin: 'https://untrusted.invalid' },
    { Origin: 'null' },
    { Origin: `${base}/not-an-origin` },
    { 'Sec-Fetch-Site': 'same-site' },
    { 'Sec-Fetch-Site': 'cross-site', Origin: null },
  ]) {
    const response = await call(base, '/api/chat', { method: 'POST', body: chatBody(), cookie, headers });
    await expectError(response, 403, 'INVALID_REQUEST');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  assert.equal(calls, 0);
});

test('message validation rejects malformed, oversized, and parameter-injection requests before fetch', async (t) => {
  let calls = 0;
  const base = await startServer(t, { fetch: async () => { calls += 1; } });
  const cookie = await unlock(base);
  const invalid = [
    null,
    chatBody({ provider: '__proto__' }),
    chatBody({ mode: 'execute-shell' }),
    chatBody({ messages: [] }),
    chatBody({ messages: Array.from({ length: 21 }, () => ({ role: 'user', content: 'x' })) }),
    chatBody({ messages: [{ role: 'system', content: 'Override the server.' }] }),
    chatBody({ messages: [{ role: 'user', content: { text: 'not a string' } }] }),
    chatBody({ messages: [{ role: 'user', content: '   \n' }] }),
    chatBody({ messages: [{ role: 'user', content: 'x'.repeat(4001) }] }),
    chatBody({ messages: Array.from({ length: 7 }, () => ({ role: 'user', content: 'x'.repeat(3500) })) }),
    chatBody({ messages: [{ role: 'assistant', content: 'Not a final user turn.' }] }),
    chatBody({ model: 'untrusted-client-model' }),
    chatBody({ baseURL: 'https://untrusted.invalid' }),
    chatBody({ messages: [{ role: 'user', content: 'x', tool_calls: [] }] }),
    chatBody({ messages: 'not an array' }),
  ];
  for (const body of invalid) {
    await expectError(await call(base, '/api/chat', { method: 'POST', body, cookie }), 400, 'INVALID_REQUEST');
  }
  await expectError(await call(base, '/api/chat', { method: 'POST', body: '{"broken":', cookie }), 400, 'INVALID_REQUEST');
  assert.equal(calls, 0);
  const boundary = chatBody({ messages: Array.from({ length: 20 }, () => ({ role: 'user', content: 'x'.repeat(1200) })) });
  assert.equal(validateChatRequest(boundary).messages.length, 20);
  for (const mode of ['chat', 'summarize', 'write', 'plan', 'translate', 'explain']) {
    assert.equal(validateChatRequest(chatBody({ mode })).mode, mode);
  }
});

test('100 KB body limits apply to Content-Length, chunked streams, and Vercel-style parsed bodies', async (t) => {
  let calls = 0;
  const options = { fetch: async () => { calls += 1; } };
  const base = await startServer(t, options);
  const raw = JSON.stringify({ code: 'x'.repeat(MAX_BODY_BYTES) });
  await expectError(await call(base, '/api/session', { method: 'POST', body: raw }), 413, 'INVALID_REQUEST');
  const chunked = await new Promise((resolve, reject) => {
    const req = httpRequest(`${base}/api/session`, {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    });
    req.on('error', reject);
    req.write(raw.slice(0, 40000));
    req.write(raw.slice(40000, 80000));
    req.end(raw.slice(80000));
  });
  assert.equal(chunked.status, 413);
  assert.equal(chunked.body.error.code, 'INVALID_REQUEST');
  const parsed = await startServer(t, options, { preparse: true });
  await expectError(await call(parsed, '/api/session', { method: 'POST', body: raw }), 413, 'INVALID_REQUEST');
  assert.equal(calls, 0);
});

test('bounded instance-local guards limit session attempts and authorized chat, with observable retry windows', async (t) => {
  let now = NOW;
  let calls = 0;
  const base = await startServer(t, {
    clock: () => now,
    rateLimits: {
      session: { limit: 2, globalLimit: 3, windowMs: 1000, maxKeys: 2 },
      chat: { limit: 2, globalLimit: 3, windowMs: 1000, maxKeys: 2 },
    },
    fetch: async () => { calls += 1; return jsonResponse(openAIData()); },
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await expectError(await call(base, '/api/session', { method: 'POST', body: { code: 'wrong' } }), 401, 'AUTH_REQUIRED');
  }
  const limitedSession = await call(base, '/api/session', { method: 'POST', body: { code: OWNER } });
  await expectError(limitedSession, 429, 'RATE_LIMITED');
  assert.equal(limitedSession.headers.get('retry-after'), '1');
  now += 1001;
  const cookie = await unlock(base);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await call(base, '/api/chat', { method: 'POST', body: chatBody(), cookie });
    assert.equal(response.status, 200);
    await response.json();
  }
  await expectError(await call(base, '/api/chat', { method: 'POST', body: chatBody(), cookie }), 429, 'RATE_LIMITED');
  assert.equal(calls, 2);
  now += 1001;
  const retry = await call(base, '/api/chat', { method: 'POST', body: chatBody(), cookie });
  assert.equal(retry.status, 200);
  await retry.json();
  assert.equal(calls, 3);
});

test('guard tables are bounded, aggregate limits cannot be bypassed with new IDs, and dev ignores spoofed proxy IPs', () => {
  let now = NOW;
  const guard = createRateGuard({ limit: 5, globalLimit: 6, windowMs: 1000, maxKeys: 2, clock: () => now });
  guard('a');
  guard('b');
  assert.throws(() => guard('c'), { code: 'RATE_LIMITED' });
  guard('a');
  guard('a');
  guard('a');
  guard('b');
  assert.throws(() => guard('b'), { code: 'RATE_LIMITED' });
  now += 1001;
  assert.doesNotThrow(() => guard('c'));
  const req = { headers: { 'x-forwarded-for': '198.51.100.10' }, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(clientAddress(req, {}), '127.0.0.1');
  assert.equal(clientAddress(req, { VERCEL: '1' }), '198.51.100.10');
});

test('HTTP upstream timeouts and credential errors use sanitized envelopes rather than raw errors', async (t) => {
  let signal;
  const timeout = await startServer(t, {
    timeoutMs: 10,
    fetch: async (_url, options) => { signal = options.signal; return new Promise(() => {}); },
  });
  const timeoutCookie = await unlock(timeout);
  await expectError(await call(timeout, '/api/chat', { method: 'POST', body: chatBody(), cookie: timeoutCookie }), 504, 'TIMEOUT');
  assert.equal(signal.aborted, true);
  const authFailure = await startServer(t, {
    fetch: async () => jsonResponse({ error: { message: 'DO_NOT_ECHO_UPSTREAM_DETAILS fixture-openai-key' } }, 401),
  });
  const cookie = await unlock(authFailure);
  const error = await expectError(await call(authFailure, '/api/chat', { method: 'POST', body: chatBody(), cookie }), 502, 'PROVIDER_AUTH_FAILED');
  assert.ok(!error.error.message.includes('DO_NOT_ECHO_UPSTREAM_DETAILS'));
});

test('closing a real local HTTP connection propagates cancellation to the provider AbortSignal', async (t) => {
  let started;
  let cancelled;
  let upstreamSignal;
  const upstreamStarted = new Promise((resolve) => { started = resolve; });
  const upstreamCancelled = new Promise((resolve) => { cancelled = resolve; });
  const base = await startServer(t, {
    fetch: async (_url, options) => {
      upstreamSignal = options.signal;
      upstreamSignal.addEventListener('abort', cancelled, { once: true });
      started();
      return new Promise(() => {});
    },
  });
  const cookie = await unlock(base);
  const req = httpRequest(`${base}/api/chat`, {
    method: 'POST',
    headers: { Origin: base, 'Content-Type': 'application/json', Cookie: cookie },
  });
  req.on('error', () => {}); // Deliberate client-side ECONNRESET below.
  req.end(JSON.stringify(chatBody()));
  const deadline = async (promise) => {
    let timer;
    try {
      await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Expected cancellation did not arrive.')), 1500);
      })]);
    } finally {
      clearTimeout(timer);
    }
  };
  await deadline(upstreamStarted);
  req.destroy();
  await deadline(upstreamCancelled);
  assert.equal(upstreamSignal.aborted, true);
  assert.ok(cookie.startsWith(`${SESSION_COOKIE}=`));
});

test('Gateway requires an explicit known-ID allowlist and credential presence; OIDC alone never activates it', async () => {
  let tokens = 0;
  let calls = 0;
  for (const [extra, code] of [
    [{ MORI_GATEWAY_PROVIDERS: undefined }, 'PROVIDER_NOT_CONFIGURED'],
    [{ MORI_GATEWAY_PROVIDERS: ' ' }, 'PROVIDER_NOT_CONFIGURED'],
    [{ VERCEL_OIDC_TOKEN: undefined }, 'PROVIDER_NOT_CONFIGURED'],
    [{ MORI_GATEWAY_PROVIDERS: '*' }, 'SETUP_REQUIRED'],
    [{ MORI_GATEWAY_PROVIDERS: 'openai,anthropic' }, 'SETUP_REQUIRED'],
    [{ MORI_GATEWAY_PROVIDERS: '__proto__' }, 'SETUP_REQUIRED'],
  ]) {
    const env = gatewayEnv(extra);
    assert.ok(publicProviders(env).every((entry) => !entry.configured && entry.transport === null));
    const client = createProviderClient({
      env,
      getOidcToken: async () => { tokens += 1; return 'fixture-token'; },
      fetch: async () => { calls += 1; return jsonResponse(gatewayData()); },
    });
    await assert.rejects(client.chat(chatBody()), { code });
  }
  assert.equal(tokens, 0);
  assert.equal(calls, 0);
  assert.deepEqual(publicProviders(gatewayEnv()).map(({ id, configured, transport }) => ({ id, configured, transport })), [
    { id: 'openai', configured: true, transport: 'gateway' },
    { id: 'claude', configured: false, transport: null },
    { id: 'gemini', configured: false, transport: null },
  ]);
  // Future explicit opt-in is configuration presence, NOT a paid-access claim.
  assert.deepEqual(publicProviders(gatewayEnv({ MORI_GATEWAY_PROVIDERS: ' openai, claude, gemini ' }))
    .map(({ model, configured, transport }) => ({ model, configured, transport })), [
    { model: 'openai/gpt-5.4-nano', configured: true, transport: 'gateway' },
    { model: 'anthropic/claude-haiku-5.5', configured: true, transport: 'gateway' },
    { model: 'google/gemini-3.8-flash', configured: true, transport: 'gateway' },
  ]);
});

test('public Gateway config stays secret-free and owner/setup/validation failures never resolve a token or fetch', async (t) => {
  let tokens = 0;
  let calls = 0;
  const options = {
    env: gatewayEnv(),
    getOidcToken: async () => { tokens += 1; return 'fixture-oidc-resolved'; },
    fetch: async () => { calls += 1; return jsonResponse(gatewayData()); },
  };
  const base = await startServer(t, options);
  const config = await (await call(base, '/api/config')).json();
  assert.equal(config.providers[0].model, 'openai/gpt-5.4-nano');
  assert.equal(config.providers[0].transport, 'gateway');
  assert.equal(config.providers[0].configured, true);
  assert.ok(!JSON.stringify(config).includes('fixture-'));
  assert.ok(!JSON.stringify(config).includes('credits'));
  assert.ok(!JSON.stringify(config).includes('VERCEL_OIDC_TOKEN'));
  await expectError(await call(base, '/api/chat', { method: 'POST', body: chatBody() }), 401, 'AUTH_REQUIRED');
  await expectError(await call(base, '/api/session', { method: 'POST', body: { code: 'wrong' } }), 401, 'AUTH_REQUIRED');
  const missingOwner = await startServer(t, { ...options, env: gatewayEnv({ MORI_ACCESS_CODE: '' }) });
  await expectError(await call(missingOwner, '/api/chat', { method: 'POST', body: chatBody() }), 503, 'SETUP_REQUIRED');
  const cookie = await unlock(base);
  await expectError(await call(base, '/api/chat', { method: 'POST', cookie, body: chatBody({ provider: 'gateway' }) }), 400, 'INVALID_REQUEST');
  await expectError(await call(base, '/api/chat', { method: 'POST', cookie, body: chatBody({ baseURL: 'https://untrusted.invalid' }) }), 400, 'INVALID_REQUEST');
  const absent = await startServer(t, { ...options, env: gatewayEnv({ VERCEL_OIDC_TOKEN: '' }) });
  const untrustedHeader = await (await call(absent, '/api/config', { headers: { 'x-vercel-oidc-token': 'fixture-client-supplied-token' } })).json();
  assert.equal(untrustedHeader.providers[0].configured, false, 'Raw client headers are not a trusted Vercel request context');
  assert.equal(tokens, 0);
  assert.equal(calls, 0);
});

test('direct provider keys win deterministically, then explicit Gateway keys; failures never switch credentials or routes', async () => {
  let tokens = 0;
  const requests = [];
  const env = fixtureEnv({ MORI_GATEWAY_PROVIDERS: 'openai', VERCEL_OIDC_TOKEN: 'fixture-oidc' });
  const direct = createProviderClient({
    env,
    getOidcToken: async () => { tokens += 1; return 'fixture-token'; },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return requests.length === 1 ? jsonResponse(openAIData()) : jsonResponse({ error: 'fixture-private-error' }, 401);
    },
  });
  assert.equal(publicProviders(env)[0].transport, 'direct');
  assert.equal((await direct.chat(chatBody())).model, 'gpt-5.6-terra');
  await assert.rejects(direct.chat(chatBody()), { code: 'PROVIDER_AUTH_FAILED' });
  assert.equal(requests.length, 2);
  assert.ok(requests.every(({ url, options }) => url === 'https://api.openai.com/v1/responses'
    && options.headers.Authorization === 'Bearer fixture-openai-key'));
  assert.equal(tokens, 0);

  let gatewayCalls = 0;
  const explicitKeyEnv = gatewayEnv({ AI_GATEWAY_API_KEY: 'fixture-explicit-gateway-key', VERCEL_OIDC_TOKEN: undefined });
  const gateway = createProviderClient({
    env: explicitKeyEnv,
    getOidcToken: async () => { tokens += 1; return 'fixture-token'; },
    fetch: async (_url, options) => {
      gatewayCalls += 1;
      assert.equal(options.headers.Authorization, 'Bearer fixture-explicit-gateway-key');
      return gatewayCalls === 1 ? jsonResponse(gatewayData()) : jsonResponse({ error: 'fixture-private-error' }, 401);
    },
  });
  assert.equal(publicProviders(explicitKeyEnv)[0].configured, true);
  assert.equal((await gateway.chat(chatBody())).model, 'openai/gpt-5.4-nano');
  await assert.rejects(gateway.chat(chatBody()), { code: 'GATEWAY_AUTH_FAILED' });
  assert.equal(gatewayCalls, 2);
  assert.equal(tokens, 0);
});

test('authenticated Gateway calls resolve OIDC per request and use the proven nano schema and reported usage', async (t) => {
  let tokens = 0;
  const requests = [];
  const times = [10, 17, 30, 39];
  const base = await startServer(t, {
    env: gatewayEnv({ OPENAI_MODEL: 'direct-only-override-is-not-a-gateway-model' }),
    upstreamClock: () => times.shift(),
    getOidcToken: async () => `fixture-fresh-oidc-${++tokens}`,
    fetch: async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      return jsonResponse(gatewayData());
    },
  });
  const cookie = await unlock(base);
  for (const [mode, durationMs] of [['chat', 7], ['explain', 9]]) {
    const response = await call(base, '/api/chat', { method: 'POST', cookie, body: chatBody({ mode }) });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.provider, 'openai');
    assert.equal(data.model, 'openai/gpt-5.4-nano');
    assert.equal(data.reply, 'MORI');
    assert.deepEqual(data.usage, { inputTokens: 12, outputTokens: 6, totalTokens: 18 });
    assert.equal(data.finishReason, 'stop');
    assert.equal(data.partial, false);
    assert.equal(data.durationMs, durationMs);
    assert.equal(Object.hasOwn(data, 'cost'), false);
    assert.equal(Object.hasOwn(data.usage, 'cost'), false);
    assert.ok(!JSON.stringify(data).includes('fixture-'));
  }
  assert.equal(tokens, 2);
  assert.equal(requests.length, 2);
  for (const [index, { url, options, body }] of requests.entries()) {
    assert.equal(url, 'https://ai-gateway.vercel.sh/v1/chat/completions');
    assert.equal(options.headers.Authorization, `Bearer fixture-fresh-oidc-${index + 1}`);
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.equal(body.model, 'openai/gpt-5.4-nano');
    assert.equal(body.messages[0].role, 'system');
    assert.match(body.messages[0].content, /You are MORI/);
    assert.deepEqual(body.messages.slice(1), messages);
    assert.equal(body.max_tokens, 1024);
    assert.equal(body.store, false);
    assert.equal(body.reasoning_effort, 'none');
  }
  assert.match(requests[1].body.messages[0].content, /Explain the requested concept/);
  await (await call(base, '/api/config', { cookie })).json();
  assert.equal(tokens, 2, 'Public/config status does not resolve or refresh a credential');
});

test('Gateway parsing excludes hidden content, preserves unknown usage/truncation, and scopes nano-only parameters', async () => {
  const client = createProviderClient({
    env: gatewayEnv(),
    getOidcToken: async () => 'fixture-token',
    fetch: async () => jsonResponse(gatewayData({
      choices: [{
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Visible ' },
            { type: 'reasoning', text: 'Hidden' },
            { type: 'text', text: 'Hidden thought', thought: true },
            { type: 'text', text: 'text.' },
          ],
          reasoning_content: 'Hidden reasoning',
          tool_calls: [{ name: 'never_execute' }],
        },
        finish_reason: 'length',
      }, { message: { role: 'assistant', content: 'Not a continuation.' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 0 },
    })),
  });
  const result = await client.chat(chatBody());
  assert.equal(result.reply, 'Visible text.');
  assert.deepEqual(result.usage, { inputTokens: 0, outputTokens: null, totalTokens: null });
  assert.equal(result.finishReason, 'length');
  assert.equal(result.partial, true);
  for (const [provider, model] of [['claude', 'anthropic/claude-haiku-5.5'], ['gemini', 'google/gemini-3.8-flash']]) {
    const future = createProviderClient({
      env: gatewayEnv({ MORI_GATEWAY_PROVIDERS: provider }),
      getOidcToken: async () => 'fixture-token',
      fetch: async (_url, options) => {
        const body = JSON.parse(options.body);
        assert.equal(body.model, model);
        assert.equal(Object.hasOwn(body, 'reasoning_effort'), false);
        return jsonResponse(gatewayData());
      },
    });
    assert.equal((await future.chat(chatBody({ provider }))).model, model);
  }
  const empty = createProviderClient({
    env: gatewayEnv(),
    getOidcToken: async () => 'fixture-token',
    fetch: async () => jsonResponse(gatewayData({ choices: [{ message: { role: 'assistant', content: null }, finish_reason: 'stop' }] })),
  });
  await assert.rejects(empty.chat(chatBody()), { code: 'UPSTREAM_ERROR' });
});

test('Gateway model restrictions, exhausted credits, and credential errors are distinct, sanitized, and never retried', async (t) => {
  const marker = 'DO_NOT_ECHO_GATEWAY_DETAILS';
  for (const [status, code, resultStatus] of [
    [401, 'GATEWAY_AUTH_FAILED', 502],
    [402, 'GATEWAY_CREDITS_REQUIRED', 402],
    [403, 'GATEWAY_ACCESS_REQUIRED', 403],
  ]) {
    let calls = 0;
    const client = createProviderClient({
      env: gatewayEnv(),
      getOidcToken: async () => 'fixture-token',
      fetch: async () => {
        calls += 1;
        return jsonResponse({ error: { type: 'no_providers_available', message: marker } }, status);
      },
    });
    await assert.rejects(client.chat(chatBody()), (error) => {
      assert.equal(error.code, code);
      assert.equal(error.status, resultStatus);
      assert.ok(!error.message.includes(marker));
      if (status === 403) assert.match(error.message, /model needs account access.*direct provider key/);
      return true;
    });
    assert.equal(calls, 1);
  }
  let calls = 0;
  const brokenResolver = createProviderClient({
    env: gatewayEnv(),
    getOidcToken: async () => { throw new Error(marker); },
    fetch: async () => { calls += 1; },
  });
  await assert.rejects(brokenResolver.chat(chatBody()), (error) => error.code === 'GATEWAY_AUTH_FAILED' && !error.message.includes(marker));
  assert.equal(calls, 0);
  const base = await startServer(t, {
    env: gatewayEnv(),
    getOidcToken: async () => 'fixture-token',
    fetch: async () => jsonResponse({ error: { type: 'no_providers_available', message: marker } }, 403),
  });
  const cookie = await unlock(base);
  const body = await expectError(await call(base, '/api/chat', { method: 'POST', cookie, body: chatBody() }), 403, 'GATEWAY_ACCESS_REQUIRED');
  assert.ok(!body.error.message.includes(marker));
});

test('Gateway credential resolution and fetch are deadline-bound; late tokens cannot start calls after timeout/cancellation', async () => {
  for (const cancel of [false, true]) {
    let resolveToken;
    let calls = 0;
    const controller = new AbortController();
    const client = createProviderClient({
      env: gatewayEnv(),
      timeoutMs: 10,
      getOidcToken: () => new Promise((resolve) => { resolveToken = resolve; }),
      fetch: async () => { calls += 1; return jsonResponse(gatewayData()); },
    });
    const pending = client.chat({ ...chatBody(), signal: controller.signal });
    if (cancel) controller.abort();
    await assert.rejects(pending, { code: cancel ? 'REQUEST_CANCELLED' : 'TIMEOUT' });
    resolveToken('fixture-too-late-token');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 0);
  }
  let signal;
  const client = createProviderClient({
    env: gatewayEnv(),
    timeoutMs: 10,
    getOidcToken: async () => 'fixture-token',
    fetch: async (_url, options) => {
      signal = options.signal;
      return new Promise(() => {});
    },
  });
  await assert.rejects(client.chat(chatBody()), { code: 'TIMEOUT' });
  assert.equal(signal.aborted, true);
});
