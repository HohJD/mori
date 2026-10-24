import { randomUUID } from 'node:crypto';
import { MAX_OUTPUT_TOKENS, UPSTREAM_TIMEOUT_MS, providerSettings, systemInstructions } from './config.js';
import { ApiError, cancelledRequest } from './errors.js';
import { gatewayAuthError, resolveGatewayCredential } from './gateway.js';

const MAX_RESPONSE_BYTES = 1024 * 1024;
const tokenCount = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
const sumCounts = (...values) => values.some((value) => value === null)
  ? null : tokenCount(values.reduce((sum, value) => sum + value, 0));
const unreadableResponse = () =>
  new ApiError(502, 'UPSTREAM_ERROR', 'The provider returned an unreadable response. Please try again.');
const noTextResponse = () =>
  new ApiError(502, 'UPSTREAM_ERROR', 'The provider returned no usable text. Try rephrasing the request or check the server model setting.');
const blockedResponse = () =>
  new ApiError(502, 'UPSTREAM_ERROR', 'The provider blocked this request. Try rephrasing it.');

function requestFor({ id, model, apiKey, transport }, mode, messages) {
  const instructions = systemInstructions(mode);
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (transport === 'gateway') {
    return {
      url: 'https://ai-gateway.vercel.sh/v1/chat/completions',
      headers: { ...headers, Authorization: `Bearer ${apiKey}` },
      body: {
        model,
        messages: [{ role: 'system', content: instructions }, ...messages],
        max_tokens: MAX_OUTPUT_TOKENS,
        store: false,
        ...(model === 'openai/gpt-5.4-nano' ? { reasoning_effort: 'none' } : {}),
      },
    };
  }
  if (id === 'openai') {
    return {
      url: 'https://api.openai.com/v1/responses',
      headers: { ...headers, Authorization: `Bearer ${apiKey}` },
      body: {
        model,
        input: messages,
        instructions,
        max_output_tokens: MAX_OUTPUT_TOKENS,
        store: false,
        // This option is supported by the default model. Arbitrary server
        // overrides do not inherit possibly incompatible reasoning settings.
        ...(model === 'gpt-5.6-terra' ? { reasoning: { effort: 'none' } } : {}),
      },
    };
  }
  if (id === 'claude') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: { ...headers, 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: { model, max_tokens: MAX_OUTPUT_TOKENS, messages, system: instructions },
    };
  }
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    headers: { ...headers, 'x-goog-api-key': apiKey },
    body: {
      contents: messages.map(({ role, content }) => ({
        role: role === 'assistant' ? 'model' : 'user',
        parts: [{ text: content }],
      })),
      systemInstruction: { parts: [{ text: instructions }] },
      generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
    },
  };
}

function parseGateway(data) {
  if (data.error) throw unreadableResponse();
  const choice = data.choices?.[0];
  if (choice?.message?.role !== 'assistant') throw unreadableResponse();
  if (choice.finish_reason === 'content_filter') throw blockedResponse();
  const content = choice.message.content;
  const reply = typeof content === 'string' ? content : (Array.isArray(content) ? content : [])
    .filter((part) => part?.type === 'text' && !part.thought && typeof part.text === 'string')
    .map((part) => part.text).join('');
  return {
    reply,
    usage: {
      inputTokens: tokenCount(data.usage?.prompt_tokens),
      outputTokens: tokenCount(data.usage?.completion_tokens),
      totalTokens: tokenCount(data.usage?.total_tokens),
    },
    finishReason: ['stop', 'length', 'tool_calls', 'function_call'].includes(choice.finish_reason)
      ? choice.finish_reason : null,
    partial: choice.finish_reason === 'length',
  };
}

function parseOpenAI(data) {
  if (data.error || ['failed', 'cancelled', 'queued', 'in_progress'].includes(data.status)) {
    throw unreadableResponse();
  }
  // output_text on SDK objects is a convenience helper, NOT the HTTP schema.
  const reply = (Array.isArray(data.output) ? data.output : [])
    .filter((item) => item?.type === 'message' && (!item.role || item.role === 'assistant'))
    .flatMap((item) => Array.isArray(item.content) ? item.content : [])
    .filter((part) => part?.type === 'output_text' && typeof part.text === 'string')
    .map((part) => part.text).join('');
  const partial = data.status === 'incomplete';
  const reason = data.incomplete_details?.reason;
  const finishReason = partial
    ? (['max_output_tokens', 'content_filter'].includes(reason) ? reason : 'incomplete')
    : (data.status === 'completed' ? 'completed' : null);
  return {
    reply,
    usage: {
      inputTokens: tokenCount(data.usage?.input_tokens),
      outputTokens: tokenCount(data.usage?.output_tokens),
      totalTokens: tokenCount(data.usage?.total_tokens),
    },
    finishReason,
    partial,
  };
}

function parseClaude(data) {
  if (data.type === 'error' || data.error) throw unreadableResponse();
  const reply = (Array.isArray(data.content) ? data.content : [])
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text).join('');
  const usage = data.usage || {};
  const inputTokens = sumCounts(
    tokenCount(usage.input_tokens),
    // The base count is required; optional cache counters add only reported
    // cache usage. An invalid reported counter makes the aggregate unknown.
    usage.cache_creation_input_tokens === undefined ? 0 : tokenCount(usage.cache_creation_input_tokens),
    usage.cache_read_input_tokens === undefined ? 0 : tokenCount(usage.cache_read_input_tokens),
  );
  const outputTokens = tokenCount(usage.output_tokens);
  const reasons = ['end_turn', 'max_tokens', 'stop_sequence', 'tool_use', 'pause_turn', 'refusal', 'model_context_window_exceeded'];
  return {
    reply,
    usage: { inputTokens, outputTokens, totalTokens: sumCounts(inputTokens, outputTokens) },
    finishReason: reasons.includes(data.stop_reason) ? data.stop_reason : null,
    partial: ['max_tokens', 'pause_turn', 'model_context_window_exceeded'].includes(data.stop_reason),
  };
}

function parseGemini(data) {
  if (data.error) throw unreadableResponse();
  // Candidates are alternative answers, not pieces of one answer.
  const candidate = data.candidates?.[0];
  const blocked = ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY'];
  if (data.promptFeedback?.blockReason || blocked.includes(candidate?.finishReason)) throw blockedResponse();
  const reply = (Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [])
    .filter((part) => part && !part.thought && typeof part.text === 'string')
    .map((part) => part.text).join('');
  const usage = data.usageMetadata;
  return {
    reply,
    usage: {
      inputTokens: tokenCount(usage?.promptTokenCount),
      // Do not add thoughtsTokenCount to visible candidate output. The vendor's
      // total can legitimately exceed inputTokens + outputTokens.
      outputTokens: tokenCount(usage?.candidatesTokenCount),
      totalTokens: tokenCount(usage?.totalTokenCount),
    },
    finishReason: ['STOP', 'MAX_TOKENS', 'OTHER', 'LANGUAGE', 'MALFORMED_FUNCTION_CALL', 'UNEXPECTED_TOOL_CALL']
      .includes(candidate?.finishReason) ? candidate.finishReason : null,
    partial: candidate?.finishReason === 'MAX_TOKENS',
  };
}

const PARSERS = { openai: parseOpenAI, claude: parseClaude, gemini: parseGemini };

function discardBody(response) {
  try {
    const cancelled = response?.body?.cancel();
    cancelled?.catch(() => {});
  } catch {
    // A closed/aborted upstream body needs no further handling or logging.
  }
}

async function readResponse(response, signal) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (declaredLength > MAX_RESPONSE_BYTES || !response.body) {
    discardBody(response);
    throw unreadableResponse();
  }
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      if (signal.aborted) throw cancelledRequest();
      const { done, value } = await reader.read();
      if (signal.aborted) throw cancelledRequest();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        cancel();
        throw unreadableResponse();
      }
      chunks.push(Buffer.from(value));
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw unreadableResponse();
    return data;
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

function upstreamStatusError(status, transport) {
  if (transport === 'gateway') {
    if (status === 401) return gatewayAuthError();
    if (status === 402) {
      return new ApiError(402, 'GATEWAY_CREDITS_REQUIRED', 'AI Gateway credits or its budget are exhausted. Review the account or configure a direct provider key. MORI does not purchase credits automatically.');
    }
    if (status === 403) {
      return new ApiError(403, 'GATEWAY_ACCESS_REQUIRED', 'The selected AI Gateway model needs account access. Check Gateway model eligibility or configure a direct provider key. MORI does not upgrade plans automatically.');
    }
  }
  if (status === 401 || status === 403) {
    return new ApiError(502, 'PROVIDER_AUTH_FAILED', 'The provider rejected its server credential. Check the API key and its account permissions.');
  }
  if (status === 429) {
    return new ApiError(429, 'RATE_LIMITED', 'The provider is rate-limited or out of quota. Check its billing and limits before retrying.', { 'Retry-After': '30' });
  }
  if (status >= 400 && status < 500) {
    return new ApiError(502, 'UPSTREAM_ERROR', 'The provider rejected the request. Check the server model setting and account access.');
  }
  return new ApiError(502, 'UPSTREAM_ERROR', 'The provider is temporarily unavailable. Please try again later.');
}

export function createProviderClient({
  env = process.env,
  fetch: fetchImpl = globalThis.fetch,
  clock = () => performance.now(),
  timeoutMs = UPSTREAM_TIMEOUT_MS,
  getOidcToken,
} = {}) {
  return {
    async chat({ provider, mode, messages, signal }) {
      const settings = providerSettings(provider, env);
      if (signal?.aborted) throw cancelledRequest();
      const controller = new AbortController();
      let timedOut = false;
      const onCallerAbort = () => controller.abort();
      signal?.addEventListener('abort', onCallerAbort, { once: true });
      let onAbort;
      const interrupted = new Promise((_, reject) => {
        onAbort = () => reject(timedOut
          ? new ApiError(504, 'TIMEOUT', 'The provider took too long to respond. Please try again.')
          : cancelledRequest());
        controller.signal.addEventListener('abort', onAbort, { once: true });
      });
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      let started;
      try {
        const perform = async () => {
          const apiKey = settings.transport === 'gateway'
            ? await resolveGatewayCredential(env, getOidcToken) : settings.apiKey;
          // Token resolution is inside the overall deadline. If a resolver
          // finishes after timeout/disconnect, it must NEVER start a paid call.
          if (controller.signal.aborted) throw cancelledRequest();
          const request = requestFor({ ...settings, apiKey }, mode, messages);
          started = clock(); // Upstream elapsed time excludes token resolution.
          const response = await fetchImpl(request.url, {
            method: 'POST',
            headers: request.headers,
            body: JSON.stringify(request.body),
            signal: controller.signal,
            redirect: 'error',
            cache: 'no-store',
          });
          if (controller.signal.aborted) {
            discardBody(response);
            throw cancelledRequest();
          }
          if (!response.ok) {
            discardBody(response);
            throw upstreamStatusError(response.status, settings.transport);
          }
          const parse = settings.transport === 'gateway' ? parseGateway : PARSERS[provider];
          const parsed = parse(await readResponse(response, controller.signal));
          if (!parsed.reply.trim()) throw noTextResponse();
          return parsed;
        };
        // Native fetch observes AbortSignal; the race additionally bounds
        // runtimes/mocks that do not reject promptly when aborted.
        const parsed = await Promise.race([perform(), interrupted]);
        return {
          provider,
          model: settings.model,
          reply: parsed.reply,
          usage: parsed.usage,
          durationMs: Math.max(0, Math.round(clock() - started)),
          requestId: randomUUID(),
          finishReason: parsed.finishReason,
          partial: parsed.partial,
        };
      } catch (error) {
        if (timedOut) throw new ApiError(504, 'TIMEOUT', 'The provider took too long to respond. Please try again.');
        if (signal?.aborted) throw cancelledRequest();
        if (error instanceof ApiError) throw error;
        // Do not log or serialize fetch exceptions or upstream response bodies.
        throw unreadableResponse();
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onCallerAbort);
        controller.signal.removeEventListener('abort', onAbort);
      }
    },
  };
}
