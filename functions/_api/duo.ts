// functions/_api/duo.ts
// Duo Universal Prompt, implemented directly against Duo's OIDC-style endpoints.
//
// The official @duosecurity/duo_universal SDK depends on axios, which is a poor
// fit for the Workers runtime. The protocol itself is only signed JWTs over
// HTTPS, so this implements it with `jose` (proven on Workers by
// duo.runtime.test.ts) and fetch — fewer moving parts than bending the SDK.
//
// Flow:
//   1. createAuthUrl()  -> redirect the browser to Duo
//   2. user approves the push on their phone
//   3. Duo redirects back with ?code=&state=
//   4. exchangeCode()   -> verifies the signed id_token, returns the username
//
// Duo is OPTIONAL. Everything here is unreachable unless all three secrets are
// configured; see duoConfigured() in security.ts.

import { SignJWT, jwtVerify } from 'jose';
import type { Env } from './app';

export interface DuoConfig {
  clientId: string;      // Duo "integration key" (ikey)
  clientSecret: string;  // Duo "secret key" (skey)
  apiHost: string;       // e.g. api-xxxxxxxx.duosecurity.com
}

/** Reads Duo config from the environment, or null when not configured. */
export function duoConfig(env: Env): DuoConfig | null {
  const e = env as unknown as Record<string, string | undefined>;
  if (!e.DUO_IKEY || !e.DUO_SKEY || !e.DUO_API_HOST) return null;
  return {
    clientId: e.DUO_IKEY,
    clientSecret: e.DUO_SKEY,
    // Tolerate a host pasted with a scheme.
    apiHost: e.DUO_API_HOST.replace(/^https?:\/\//, '').replace(/\/$/, ''),
  };
}

function secretKey(cfg: DuoConfig): Uint8Array {
  return new TextEncoder().encode(cfg.clientSecret);
}

function tokenEndpoint(cfg: DuoConfig): string {
  return `https://${cfg.apiHost}/oauth/v1/token`;
}

/**
 * The client_assertion JWT that authenticates US to Duo. Duo requires it on
 * both the health check and the token exchange.
 */
async function clientAssertion(cfg: DuoConfig): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS512' })
    .setIssuer(cfg.clientId)
    .setSubject(cfg.clientId)
    .setAudience(tokenEndpoint(cfg))
    .setJti(crypto.randomUUID())
    .setExpirationTime('5m')
    .sign(secretKey(cfg));
}

const ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';

/**
 * Confirms Duo is reachable and our credentials are valid.
 *
 * Called before redirecting a user: if Duo is down, we must fall back to
 * another factor rather than stranding someone on a broken redirect.
 */
export async function healthCheck(cfg: DuoConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const body = new URLSearchParams({
      client_id: cfg.clientId,
      client_assertion: await clientAssertion(cfg),
    });
    const res = await fetch(`https://${cfg.apiHost}/oauth/v1/health_check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await res.json<{ stat?: string; message?: string }>();
    if (data.stat === 'OK') return { ok: true };
    return { ok: false, error: data.message ?? 'Duo health check failed' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Duo unreachable' };
  }
}

/**
 * Builds the URL to send the browser to. `state` is an opaque random value we
 * generate and must see returned unchanged — that is what stops an attacker
 * replaying someone else's Duo redirect at our callback.
 */
export async function createAuthUrl(
  cfg: DuoConfig,
  username: string,
  state: string,
  redirectUri: string
): Promise<string> {
  const request = await new SignJWT({
    response_type: 'code',
    scope: 'openid',
    exp: Math.floor(Date.now() / 1000) + 300,
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    state,
    duo_uname: username,
    use_duo_code_attribute: true,
  })
    .setProtectedHeader({ alg: 'HS512' })
    .setIssuer(cfg.clientId)
    .setAudience(`https://${cfg.apiHost}`)
    .setExpirationTime('5m')
    .sign(secretKey(cfg));

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    request,
  });
  return `https://${cfg.apiHost}/oauth/v1/authorize?${params}`;
}

export interface DuoExchangeResult {
  ok: boolean;
  username?: string;
  error?: string;
}

/**
 * Exchanges the returned code for an id_token and verifies it.
 *
 * The verification is the security boundary: the token must be signed with our
 * secret, issued by the expected token endpoint, addressed to our client id,
 * unexpired, and carry the username we started the flow for. A mismatch on
 * `preferred_username` means the code belongs to a different person's Duo
 * session, so it is rejected rather than trusted.
 */
export async function exchangeCode(
  cfg: DuoConfig,
  code: string,
  expectedUsername: string,
  redirectUri: string
): Promise<DuoExchangeResult> {
  let tokenJson: { id_token?: string; error_description?: string; error?: string };
  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: cfg.clientId,
      client_assertion_type: ASSERTION_TYPE,
      client_assertion: await clientAssertion(cfg),
    });
    const res = await fetch(tokenEndpoint(cfg), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // Duo requires a User-Agent on the token call.
        'User-Agent': 'nwks-encounter-admin',
      },
      body,
    });
    tokenJson = await res.json();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Duo token exchange failed' };
  }

  if (!tokenJson.id_token) {
    return { ok: false, error: tokenJson.error_description ?? tokenJson.error ?? 'Duo returned no token' };
  }

  try {
    const { payload } = await jwtVerify(tokenJson.id_token, secretKey(cfg), {
      issuer: tokenEndpoint(cfg),
      audience: cfg.clientId,
    });

    const username = String(payload.preferred_username ?? '');
    if (username.toLowerCase() !== expectedUsername.toLowerCase()) {
      // The code authenticated somebody — just not the person who started this
      // login. Treat as hostile.
      return { ok: false, error: 'Duo returned a different user.' };
    }
    return { ok: true, username };
  } catch (err) {
    console.warn('[duo] id_token verification failed', err);
    return { ok: false, error: 'Could not verify the Duo response.' };
  }
}
