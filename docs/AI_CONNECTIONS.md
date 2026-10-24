# MORI AI connections

MORI is a simple voice/text console for a provider you choose, with curated quick
actions and actual per-response usage and timing. The backend does not simulate
answers, switch to another paid provider, run tools, or control hardware. Its
direct adapters still need privately supplied provider keys. **The owner has
separately verified OpenAI `openai/gpt-5.4-nano` through Vercel AI Gateway using
the linked project's OIDC identity, without a new provider key.** This optional
route requires explicit server opt-in and owner unlock; OIDC presence alone
never activates it. Claude/Gemini access is not implied by that verification.

## Private local setup

Requires Node 22.12 or newer, matching the project.

1. Run `npm run setup:ai`.
2. Open [`.env.ai.local`](../.env.ai.local) **privately in your editor**. The
   scaffold contains only `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and a randomly
   generated `MORI_ACCESS_CODE`, plus explanatory comments. Add at least one
   provider key for direct mode, or use the explicit OpenAI Gateway option below.
   Neither both direct keys nor Gemini are required.
3. Start/restart the app with `npm run dev -- --port 4175`. Do not stop another
   project using port 4173. Restart after changing server settings; they are
   loaded when the development server starts.
4. Use the generated owner code in the console's unlock form, not as a chat
   message. Keep it private. Do not put it in a URL, screenshot, shell command
   history, browser storage, or a `VITE_` variable.

The setup command exclusively creates the file with mode `0600`. Re-running it
does **not** read, overwrite, rotate, or change an existing file. It never prints
any setting value. The access code is 32 cryptographically random bytes encoded
as base64url. Provider keys start empty. Setup never reads or changes the
separate `.env.local` tooling file. Development middleware now loads its OIDC
identity server-side, without printing or rewriting it.

Both `.gitignore` and `.vercelignore` already exclude `.env.*`. Never commit or
upload the local private file as a static asset. The Vite plugin uses Node's
`loadEnvFile` on root `.env.local` and `.env.ai.local`; existing process environment
settings take precedence. It does not serialize environment variables into
client code. Keep all provider/access variables **without** a `VITE_` prefix.
`npm run preview` is a static Vite preview, not an API server; use the development
server or a Vercel deployment for the full console.

### Getting a key and understanding billing

| Direct provider | Private setting | Obtain an API key | Direct default model |
| --- | --- | --- | --- |
| OpenAI | `OPENAI_API_KEY` | [OpenAI API keys](https://platform.openai.com/api-keys) | `gpt-5.6-terra` |
| Claude | `ANTHROPIC_API_KEY` | [Claude Console keys](https://platform.claude.com/settings/keys) | `claude-haiku-5-5` |
| Gemini (optional) | `GEMINI_API_KEY` | [Google AI Studio API keys](https://aistudio.google.com/apikey) | `gemini-3.8-flash` |

API billing/access are separate from consumer chat subscriptions:

- [OpenAI: API usage is not included in ChatGPT subscriptions](https://help.openai.com/en/articles/8156019-is-api-usage-included-in-chatgpt-subscriptions).
- [Anthropic: Claude subscriptions and API/Console billing are separate](https://support.claude.com/en/articles/9876003-i-have-a-paid-claude-subscription-pro-max-team-or-enterprise-plans-why-do-i-have-to-pay-separately-to-use-the-claude-api-and-console).
- Gemini requires an eligible API project/key; check that project's current
  billing, model access, and quota in AI Studio/Google Cloud.

An API key being present does **not** establish validity, remaining credit,
model entitlement, latency, or live provider health. `GET /api/config` checks
presence/route configuration only and never contacts a provider or Gateway
credit endpoint. Configure provider-side budget
alerts/limits appropriate for your account. MORI does not supply a global
spending cap or a billing dashboard.

## Optional Vercel AI Gateway: verified OpenAI route

The owner's real Gateway request succeeded with `openai/gpt-5.4-nano` and the
project's existing OIDC identity. Other probed models, including the Claude and
Gemini Gateway defaults below, were denied by the current free-tier account.
This is **one verified model**, not a promise of universal free access or a
current credit balance. MORI neither exposes account credits publicly nor
purchases credits, upgrades plans, or creates permanent Gateway keys.

For local development, retain the generated owner code in `.env.ai.local` and
run:

```sh
MORI_GATEWAY_PROVIDERS=openai npm run dev -- --port 4175
```

The Node-only loader reads the existing ignored root `.env.local` for OIDC.
Neither private file is changed and no opt-in is written into either file.
The initial setup scaffold remains exactly the three direct-mode fields.

Routing is deterministic for each provider:

1. A nonblank **direct provider API key always wins**, using the direct adapter
   and its direct model setting.
2. Without that key, Gateway is used only if the provider is explicitly listed
   in `MORI_GATEWAY_PROVIDERS` **and** a Gateway credential is present.
3. Otherwise the provider is not configured. On an upstream failure, MORI
   never changes transport, provider, model, or credential as a fallback.

The allowlist is comma-separated, case-sensitive `openai`, `claude`, and/or
`gemini`. Unknown names or wildcards fail closed for Gateway; there is no
implicit “all providers” option. **Use only `openai` for the verified current
free-tier configuration.** Direct keys are optional for this OpenAI route;
Claude/Gemini still require their own direct keys unless the owner later
obtains suitable Gateway access and explicitly enables them.

| Provider ID | Fixed Gateway model | Current account evidence |
| --- | --- | --- |
| `openai` | `openai/gpt-5.4-nano` | Successful owner-verified request. |
| `claude` | `anthropic/claude-haiku-5.5` | Free-tier access denied; future explicit opt-in/account access required. |
| `gemini` | `google/gemini-3.8-flash` | Free-tier access denied; future explicit opt-in/account access required. |

Gateway Anthropic IDs use dots (`5.5`); the direct Claude ID uses hyphens
(`5-5`). Direct `*_MODEL` overrides do not affect these Gateway model choices.

Credential resolution happens **per authenticated, validated request**: an
existing explicit `AI_GATEWAY_API_KEY` takes precedence, otherwise
`getVercelOidcToken()` from the pinned server-only `@vercel/oidc@4.0.3` package
consults the current Vercel request identity. No OIDC token is cached at module
startup. Local tokens expire; the official helper can use Vercel's authenticated
local refresh mechanism. An authorized `vercel env pull` and server restart can
also refresh the local environment. MORI does not itself rewrite the env files,
print token values, or expose their expiry. Public config checks presence only,
without resolving/refreshing a token or querying balances.

Gateway uses fixed `POST https://ai-gateway.vercel.sh/v1/chat/completions`,
Bearer authorization, server system instructions followed by validated
user/assistant messages, `max_tokens: 1024`, and `store: false`. Only the
verified OpenAI nano model receives `reasoning_effort: 'none'`. Visible text
comes from the first assistant choice; usage maps `prompt_tokens`,
`completion_tokens`, and `total_tokens` into the existing nullable fields.
`finish_reason: 'length'` sets `partial: true`. Reasoning/tool fields, alternate
choices, cost fields, and account-credit metadata are not returned.

The existing owner cookie, origin checks, limits, and cancellation all apply
equally to Gateway. Token resolution is included in the overall request
deadline; a token arriving after timeout/cancellation cannot start a paid call.
No extra live calls were made to implement or test this extension.

Official references:
[OIDC authentication](https://vercel.com/docs/ai-gateway/authentication-and-byok/oidc),
[OpenAI-compatible Chat Completions](https://vercel.com/docs/ai-gateway/sdks-and-apis/openai-chat-completions),
[REST API](https://vercel.com/docs/ai-gateway/sdks-and-apis/rest-api),
[pricing and free-tier model eligibility](https://vercel.com/docs/ai-gateway/pricing).

## Owner unlock and request safety

This is an explicit **personal-instance owner unlock**, not multiuser account
management. `MORI_ACCESS_CODE` must be at least 20 characters long after trimming
surrounding whitespace (the generated code is stronger). Missing, blank, or short configuration fails
closed, even if a provider key is present. Share neither the code nor the
unlocked browser session with untrusted people.

- Successful unlock sets a four-hour HMAC-signed, `HttpOnly`, `SameSite=Strict`
  cookie scoped to `/api`. It is `Secure` on Vercel or HTTPS. Local loopback HTTP
  development works without that flag.
- Code comparison and signature verification use timing-safe, fixed-length
  comparisons. The signing context is domain-separated from code comparison.
  Expiry and the maximum session lifetime are checked on every authenticated
  request. No JavaScript-readable auth token or localStorage credential is
  issued.
- Logout clears the browser's cookie. With stateless sessions it does not
  revoke a previously copied cookie before expiry; rotating the server access
  code invalidates **all** existing sessions. Restart/redeploy the appropriate
  runtime when changing settings.
- Billable chat requires a configured owner code **and** a valid session.
  Unknown providers, client model/base-URL overrides, system/tool roles, extra
  payload fields, blank/oversized text, and unsupported quick actions are
  rejected before any provider fetch.
- Requests with another `Origin`, a null origin, or cross-site/same-site
  Fetch Metadata are rejected. POST requires UTF-8 `application/json`.
  Non-browser clients without Origin still need valid authentication. There is
  no permissive CORS or cross-origin preflight support.
- Every handler response, including errors and config, is `Cache-Control:
  no-store`. Raw upstream bodies/errors, cookies, credentials, and environment
  values are not logged or returned as diagnostics.
- Per warm instance, session POSTs admit at most 8 attempts per client address
  and 60 in aggregate per 15-minute fixed window. Authenticated chat admits at
  most 20 attempts per address and 60 in aggregate per one-minute fixed window.
  Each guard holds at most 1,024 address buckets and fails closed when full.
  Vercel proxy IP headers are trusted only in the Vercel runtime.

These modest in-memory guards reset on cold starts and do not coordinate across
serverless instances. They are **not a global rate limit or spending quota**.
The strong generated owner code, authentication, validation, and token caps
prevent accidental anonymous use; provider-side account controls remain
important. Do not treat this prototype as a public, multi-tenant service.

## HTTP contract

The same Node HTTP handler serves Vite development and Vercel. No browser keys,
provider SDKs, database, remote MCP connection, or speech API are required.

### `GET /api/config`

Returns `200`:

```ts
{
  auth: { required: true, configured: boolean, authenticated: boolean },
  providers: Array<{
    id: 'openai' | 'claude' | 'gemini',
    name: string,
    model: string,
    configured: boolean,
    transport: 'direct' | 'gateway' | null
  }>,
  limits: { maxMessages: 20, maxMessageChars: 4000, maxTotalChars: 24000 }
}
```

Provider configuration means a nonblank direct key, or explicit Gateway opt-in
plus credential presence. `transport` is additive metadata; `model` reflects
the chosen route. Neither configuration nor transport proves token validity,
model entitlement, remaining credits, or live health. Auth configuration means
a sufficiently long server owner code exists. No values, hashes, code prefixes,
session tokens, balances, or unrelated environment settings are included.

### `POST /api/session` and `DELETE /api/session`

- POST JSON: `{ code: string }`. Success: `200 { authenticated: true }` and the
  signed HTTP-only cookie. No code/token is returned in JSON.
- DELETE: no body needed. Success: `200 { authenticated: false }` and an expired
  cookie. It is safe to clear a session even when setup is missing.

### `POST /api/chat`

JSON input:

```ts
{
  provider: 'openai' | 'claude' | 'gemini',
  mode: 'chat' | 'summarize' | 'write' | 'plan' | 'translate' | 'explain',
  messages: Array<{ role: 'user' | 'assistant', content: string }>
}
```

Messages must be nonblank, contain 1–20 turns, end with a user turn, be at most
4,000 characters each and 24,000 in total (JavaScript string lengths). The JSON
body is capped at 100 KiB, including when sent chunked or pre-parsed by the
runtime. Request-body reading is bounded to four seconds. Client models,
instructions, endpoints, tools, and API keys are not accepted.

Success returns `200`:

```ts
{
  provider: string,
  model: string,
  reply: string,
  usage: {
    inputTokens: number | null,
    outputTokens: number | null,
    totalTokens: number | null
  },
  durationMs: number,
  requestId: string,
  finishReason: string | null,
  partial: boolean
}
```

Quick actions select curated server system instructions only. They do not
silently execute tools or external actions. The selected provider is the only
one called; there are no hidden retries or fallbacks.

- `reply` contains actual visible text blocks, not reasoning/thought blocks,
  tool calls, SDK-only helper fields, or dummy completion text. Gemini
  alternatives are not concatenated. Blocked/empty responses fail clearly.
- `usage` contains actual reported token counts. Missing/unusable counts are
  `null`, not invented zero. Direct Anthropic input sums its reported base,
  cache-creation, and cache-read counts; total is computed only when input and
  output are known. Missing optional cache counters add no reported cache
  usage. OpenAI/Gemini totals come from the vendor. Gemini thought tokens are
  not added to candidate output; its total may exceed input plus output.
  Gateway maps its reported prompt/completion/total counters without exposing
  its cost or credit fields.
- `durationMs` measures upstream fetch plus response reading/parsing with a
  monotonic clock, excluding Gateway credential resolution. It is **not** time
  to first token. This is a non-streaming endpoint.
- `requestId` is a fresh MORI UUID, not an auth token or an upstream error ID.
  `finishReason` reflects a recognized provider finish/status value, or `null`
  if unknown. `partial` flags an incomplete/truncated answer.
- Generated output is capped at 1,024 tokens. Upstream fetch/body processing
  times out at approximately 25 seconds, and upstream bodies are capped at
  1 MiB. The Vercel function duration is 30 seconds. Client disconnects abort
  the upstream fetch when the runtime exposes the disconnect. Cancellation or
  a timeout cannot guarantee that the provider stopped computing or billing.
- There are no fabricated cost estimates, account quotas, or live-health
  claims.

All handler errors use `{ error: { code: string, message: string } }`:

| Code | Usual status | Meaning |
| --- | --- | --- |
| `SETUP_REQUIRED` | 503 | Owner access is missing/too short, or a server model/allowlist setting is malformed. |
| `AUTH_REQUIRED` | 401 | Wrong owner code, missing/expired/tampered session. |
| `PROVIDER_NOT_CONFIGURED` | 503 | The chosen provider has neither a direct key nor an explicitly enabled Gateway credential. |
| `PROVIDER_AUTH_FAILED` | 502 | The chosen provider rejected its credential or permissions; no fallback occurs. |
| `GATEWAY_AUTH_FAILED` | 502 | Gateway credential resolution failed or Gateway returned 401; this is not an owner-unlock failure. |
| `GATEWAY_CREDITS_REQUIRED` | 402 | Gateway reported a credit/budget limit; no automatic credit purchase occurs. |
| `GATEWAY_ACCESS_REQUIRED` | 403 | The selected Gateway model needs account access or a direct provider key; this is not mislabeled as an invalid key. |
| `INVALID_REQUEST` | 400 / 403 / 404 / 405 / 413 / 415 | Invalid schema, origin, route, method, size, or content type. |
| `RATE_LIMITED` | 429 | Local guard or provider quota/rate limit; includes a bounded `Retry-After`. |
| `UPSTREAM_ERROR` | 502 | Provider rejection/outage, unusable text, block, or invalid response; raw details are hidden. |
| `TIMEOUT` | 504 (upstream) / 408 (body) | Upstream or incoming-body deadline elapsed. |
| `REQUEST_CANCELLED` | 499, if connection remains writable | The caller cancelled; a disconnected socket usually cannot receive a response. |
| `INTERNAL_ERROR` | 500 | Unexpected server failure; no internal exception is exposed. |

## Direct provider adapters and official references

The default model choices follow the official references below. No old
mini-tier or legacy-account-only model is selected as an automatic fallback.
Direct account access to a model still needs verification with a user-supplied
key. The explicitly opted-in Gateway nano route is separate, as documented above.

**OpenAI**

- Fixed endpoint: `POST https://api.openai.com/v1/responses`.
- Server-only `Authorization: Bearer` header; `model`, message `input`,
  top-level `instructions`, `max_output_tokens: 1024`, and `store: false`.
- For the default `gpt-5.6-terra` only, `reasoning: { effort: 'none' }` favors
  quick speech turns. No model-specific reasoning option is guessed for a
  different override.
- Extracts `output[]` message `content[]` blocks with `type: 'output_text'`,
  **not** a top-level `output_text` SDK convenience property. Usage reads
  `input_tokens`, `output_tokens`, and `total_tokens`.
- Official references: [model](https://developers.openai.com/api/docs/models/gpt-5.6-terra.md),
  [text generation](https://developers.openai.com/api/docs/guides/text.md),
  [Responses create](https://developers.openai.com/api/reference/resources/responses/methods/create),
  [Responses migration and storage control](https://developers.openai.com/api/docs/guides/migrate-to-responses).

**Claude**

- Fixed endpoint: `POST https://api.anthropic.com/v1/messages`.
- Server-only `x-api-key`, `anthropic-version: 2023-06-01`, model
  `claude-haiku-5-5`, `max_tokens: 1024`, messages, and top-level system text.
- No temperature, top-p, top-k, or guessed thinking flags. Only text content
  blocks are returned; thinking/redacted-thinking/tool blocks are ignored.
- Official references: [Messages API](https://platform.claude.com/docs/en/api/messages.md),
  [working with Messages](https://platform.claude.com/docs/en/build-with-claude/working-with-messages),
  [Haiku 5.5](https://platform.claude.com/docs/en/models/haiku-5-5/overview.md).

**Gemini (optional advanced setup)**

- Add `GEMINI_API_KEY` to the same private file or server environment if wanted.
  It is intentionally **not** another required key in the initial scaffold.
- Fixed host/path family:
  `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent`.
- Server-only `x-goog-api-key` header, never a query-string key. Messages map to
  `contents` with user/model roles and text parts; instructions go into
  `systemInstruction.parts`. Generation sets `maxOutputTokens: 1024` without
  deprecated temperature/top-p/top-k knobs.
- Only non-thought text in the first candidate is returned; token metrics come
  from `usageMetadata`. No Interactions API or new SDK is needed for this
  simple text use case.
- Official references: [get started](https://ai.google.dev/gemini-api/docs/generate-content/get-started),
  [generateContent API](https://ai.google.dev/api/generate-content),
  [text generation](https://ai.google.dev/gemini-api/docs/generate-content/text-generation).

### Optional server model overrides

Set `OPENAI_MODEL`, `ANTHROPIC_MODEL`, or `GEMINI_MODEL` **on the server only** to
an account-accessible text model supported by that provider's direct endpoint. These
are optional and are not in the initial private scaffold. IDs must be at most
128 letters/digits/dots/underscores/hyphens, starting with a letter or digit;
do not supply a URL, slash-prefixed resource path, or query string.
These overrides apply only to direct-key routes, not Gateway.

Overrides keep the fixed provider endpoint family and 1,024-token budget. They
do not enable tools, audio, images, or special thinking settings. OpenAI
overrides other than the exact default omit `reasoning.effort`; choose a model
that can return visible text within this budget. An unsupported account/model
combination fails explicitly; it never silently routes to another provider.
Malformed overrides fail closed with `SETUP_REQUIRED`; config uses the safe
default display name rather than exposing the malformed value.

## Deployment and privacy boundaries

`api/[route].js` is a small Vercel Node route adapter importing `server/handler.js`.
Vercel discovers root `api/` functions alongside the `website/dist` static
output. `vercel.json` keeps the Vite framework/build settings and configures the
API function duration via `api/*.js`; there is no SPA rewrite over `/api`.
Vite's server-only plugin mounts the same handler before its static/SPA
middleware in development.

The router also handles Vercel's parsed/lazy `request.body` helper, including
sanitizing lazy JSON parse failures. See the official
[Node.js request/response helpers](https://vercel.com/docs/functions/runtimes/node-js).

For a later, explicitly authorized Vercel deployment using the verified
zero-provider-key OpenAI option, configure:

- `MORI_ACCESS_CODE` (a strong private owner code);
- `MORI_GATEWAY_PROVIDERS=openai`.

Vercel supplies the deployment OIDC identity; do not copy the expiring local
OIDC token into a public variable or mint another key for this setup. If using
an existing explicit `AI_GATEWAY_API_KEY`, it overrides OIDC. Direct provider
keys and their model overrides remain optional and take precedence when added.
Claude/Gemini need direct keys for the current account's supported configuration.

Use Vercel's private environment settings for the desired environments, not
client build constants or committed files. A new deployment may be needed to
apply changed variables. **This implementation does not upload credentials,
change external settings, deploy, or touch any vault.** Without these values,
the deployed API reports setup missing and refuses billable requests.

The microphone permission policy is `microphone=(self)`, while camera and
geolocation remain denied. Speech recognition/synthesis is a frontend/browser
capability; browser support and whether audio is processed remotely depend on
that browser. This backend has no speech service and does not receive audio.
Text/history sent in `/api/chat` goes to the chosen AI provider. There is no
backend chat-history database or transcript logging. Provider billing and
retention policies still apply; OpenAI's `store: false` is not a claim of zero
provider retention or zero billing.

## Verification without paid requests

Run `npm run test:api` for the backend tests in `tests/api.test.js`.
`npm test` includes both the existing state tests and this backend suite.
No provider SDK was added. The only new direct dependency for Gateway is the
official server identity helper, pinned to `@vercel/oidc@4.0.3`.

Tests use documented fake credentials and injected provider fetch/env/clock
fixtures. They cover all three request formats, visible-text and usage parsing,
truncation, invalid configuration, signed-cookie expiry/tampering/rotation,
config secrecy, no unauthenticated upstream calls, request validation, methods,
content types, origins, byte caps, bounded rate guards, sanitized upstream
failures, timeouts, and cancellation. Ephemeral loopback HTTP integration tests
exercise both raw-stream (Vite/Node) and pre-parsed-body (Vercel-style) requests,
including an actual disconnected client. Tests neither load private environment
files nor contact outside services.

Gateway tests inject the OIDC resolver as well as fetch/env/clock. They cover
explicit opt-in and known IDs, status secrecy, owner checks before token
resolution, direct/Gateway-key precedence, per-request token resolution,
the live-proven nano response shape, nullable usage and truncation,
model-access/credit/identity errors, and no late paid fetch after cancellation.

Build/browser and production Gateway verification are separate checks for the
main agent. Successful fixture tests do not establish real key validity,
account entitlement, production runtime behavior, or live health; the owner's
separate nano request is the only live Gateway success claimed here.
