import { ApiError, invalidRequest } from './errors.js';
import { gatewayCredentialAvailable } from './gateway.js';

export const LIMITS = Object.freeze({
  maxMessages: 20,
  maxMessageChars: 4000,
  maxTotalChars: 24000,
});
export const MAX_BODY_BYTES = 100 * 1024;
export const MAX_OUTPUT_TOKENS = 1024;
export const UPSTREAM_TIMEOUT_MS = 25000;

const PROVIDERS = Object.freeze([
  { id: 'openai', name: 'OpenAI', key: 'OPENAI_API_KEY', modelEnv: 'OPENAI_MODEL', model: 'gpt-5.6-terra' },
  { id: 'claude', name: 'Claude', key: 'ANTHROPIC_API_KEY', modelEnv: 'ANTHROPIC_MODEL', model: 'claude-haiku-5-5' },
  { id: 'gemini', name: 'Gemini', key: 'GEMINI_API_KEY', modelEnv: 'GEMINI_MODEL', model: 'gemini-3.8-flash' },
]);

// OpenAI nano is the only model verified on the current free Gateway account.
// The other routes require future explicit opt-in AND suitable account access.
const GATEWAY_MODELS = Object.freeze({
  openai: 'openai/gpt-5.4-nano',
  claude: 'anthropic/claude-haiku-5.5',
  gemini: 'google/gemini-3.8-flash',
});

const BASE_INSTRUCTIONS = 'You are MORI, a helpful AI accessed through a simple voice and text console. '
  + 'Be clear, accurate, and concise, with a natural response suitable for reading aloud. '
  + 'Be honest about uncertainty. You can only return text: do not claim to browse, use tools, '
  + 'control devices, or perform actions outside this conversation.';

export const MODE_INSTRUCTIONS = Object.freeze({
  chat: 'Answer the user directly. Keep simple conversational turns short; give more detail when requested.',
  summarize: 'Summarize the supplied material faithfully. Prioritize the main points and useful takeaways. Do not invent missing details.',
  write: 'Help draft or revise the text the user requests. Follow their audience, tone, and format, and return usable writing without invented facts.',
  plan: 'Turn the user’s goal into a practical, short sequence of steps. State important assumptions and ask for essential missing information.',
  translate: 'Translate into the language the user requests, preserving meaning, tone, names, and formatting. Ask for the target language if it is unclear.',
  explain: 'Explain the requested concept in plain language. Use a short example when helpful, and distinguish established facts from uncertainty.',
});

const hasValue = (value) => typeof value === 'string' && value.trim().length > 0;
const validModel = (value) => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value);

function gatewayAllowlist(env) {
  if (!hasValue(env.MORI_GATEWAY_PROVIDERS)) return { valid: true, ids: [] };
  const ids = env.MORI_GATEWAY_PROVIDERS.split(',').map((id) => id.trim());
  return { ids, valid: ids.every((id) => Object.hasOwn(GATEWAY_MODELS, id)) };
}

function settings(definition, env) {
  const direct = hasValue(env[definition.key]);
  const gateway = gatewayAllowlist(env);
  const optedIn = !direct && gateway.valid && gateway.ids.includes(definition.id);
  const useGateway = optedIn && gatewayCredentialAvailable(env);
  // Direct model overrides never change the fixed, separately chosen Gateway
  // models. A direct key always wins, including when that direct request fails.
  if (optedIn) {
    return {
      ...definition,
      model: GATEWAY_MODELS[definition.id],
      modelValid: true,
      gatewayValid: true,
      configured: useGateway,
      transport: useGateway ? 'gateway' : null,
    };
  }
  const override = env[definition.modelEnv];
  const overridden = hasValue(override);
  const modelValid = !overridden || validModel(override.trim());
  return {
    ...definition,
    model: overridden && modelValid ? override.trim() : definition.model,
    modelValid,
    gatewayValid: direct || gateway.valid,
    configured: direct,
    transport: direct ? 'direct' : null,
  };
}

export function publicProviders(env) {
  return PROVIDERS.map((definition) => {
    const { id, name, model, configured, transport } = settings(definition, env);
    return { id, name, model, configured, transport };
  });
}

export function providerSettings(id, env) {
  const definition = PROVIDERS.find((entry) => entry.id === id);
  if (!definition) throw invalidRequest('Choose openai, claude, or gemini.');
  const result = settings(definition, env);
  if (!result.gatewayValid) {
    throw new ApiError(503, 'SETUP_REQUIRED', 'The Gateway allowlist must contain only comma-separated openai, claude, or gemini IDs.');
  }
  if (!result.configured) {
    throw new ApiError(503, 'PROVIDER_NOT_CONFIGURED', `${result.name} has no direct API key or explicitly enabled AI Gateway credential configured.`);
  }
  if (!result.modelValid) {
    throw new ApiError(503, 'SETUP_REQUIRED', 'The server model setting for this provider is invalid.');
  }
  return { ...result, ...(result.transport === 'direct' ? { apiKey: env[definition.key].trim() } : {}) };
}

export function systemInstructions(mode) {
  if (!Object.hasOwn(MODE_INSTRUCTIONS, mode)) {
    throw invalidRequest('Choose a supported quick action.');
  }
  return `${BASE_INSTRUCTIONS}\n\n${MODE_INSTRUCTIONS[mode]}`;
}

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export function validateChatRequest(body) {
  if (!isRecord(body) || !hasOnlyKeys(body, ['provider', 'mode', 'messages'])) {
    throw invalidRequest('Send only provider, mode, and messages in a JSON object.');
  }
  if (!PROVIDERS.some(({ id }) => id === body.provider)) {
    throw invalidRequest('Choose openai, claude, or gemini.');
  }
  if (typeof body.mode !== 'string' || !Object.hasOwn(MODE_INSTRUCTIONS, body.mode)) {
    throw invalidRequest('Choose chat, summarize, write, plan, translate, or explain.');
  }
  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > LIMITS.maxMessages) {
    throw invalidRequest(`Send between 1 and ${LIMITS.maxMessages} messages.`);
  }
  let totalChars = 0;
  for (const message of body.messages) {
    if (!isRecord(message) || !hasOnlyKeys(message, ['role', 'content'])
      || !['user', 'assistant'].includes(message.role)) {
      throw invalidRequest('Each message must contain only a user/assistant role and text content.');
    }
    if (typeof message.content !== 'string' || !message.content.trim()
      || message.content.length > LIMITS.maxMessageChars) {
      throw invalidRequest(`Each message must contain nonblank text of at most ${LIMITS.maxMessageChars} characters.`);
    }
    totalChars += message.content.length;
  }
  if (totalChars > LIMITS.maxTotalChars) {
    throw invalidRequest(`Messages must total at most ${LIMITS.maxTotalChars} characters.`);
  }
  if (body.messages.at(-1).role !== 'user') {
    throw invalidRequest('The last message must be from the user.');
  }
  return {
    provider: body.provider,
    mode: body.mode,
    messages: body.messages.map(({ role, content }) => ({ role, content })),
  };
}
