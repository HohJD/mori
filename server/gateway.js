import { getContext, getVercelOidcToken } from '@vercel/oidc';
import { ApiError } from './errors.js';

const hasValue = (value) => typeof value === 'string' && value.trim().length > 0;

// Presence only: do not resolve/refresh tokens, contact the Gateway, decode
// credentials, or inspect account credits while serving public configuration.
export function gatewayCredentialAvailable(env) {
  return hasValue(env.AI_GATEWAY_API_KEY) || hasValue(env.VERCEL_OIDC_TOKEN)
    || hasValue(getContext().headers?.['x-vercel-oidc-token']);
}

export const gatewayAuthError = () => new ApiError(
  502,
  'GATEWAY_AUTH_FAILED',
  'AI Gateway could not authenticate its server credential. Refresh the local Vercel OIDC token or check the deployment identity/API key.',
);

export async function resolveGatewayCredential(env, getOidcToken = getVercelOidcToken) {
  // An explicit server Gateway key wins; otherwise consult the official
  // request-context-aware helper for EVERY request, never a module-level token.
  if (hasValue(env.AI_GATEWAY_API_KEY)) return env.AI_GATEWAY_API_KEY.trim();
  try {
    const token = await getOidcToken();
    if (!hasValue(token)) throw gatewayAuthError();
    return token.trim();
  } catch {
    // SDK/refresh exceptions can contain private local paths or context.
    throw gatewayAuthError();
  }
}
