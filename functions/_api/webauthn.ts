// functions/_api/webauthn.ts
// Passkey (WebAuthn) registration and authentication.
//
// Verified to run in the Workers runtime by
// functions/_api/__tests__/webauthn.runtime.test.ts, which was written BEFORE
// any of this code. See the design doc, section 10.
//
// Why passkeys are the primary second factor: the browser binds the credential
// to the real origin and refuses to sign for any other, so a phishing page
// cannot replay it. `userVerification: 'required'` additionally forces the
// device to confirm a human, so a stolen unlocked laptop is not enough.

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type { Env } from './app';
import { nowIso } from './db';

/** Challenges are single-use and short-lived; KV with a TTL fits exactly. */
const CHALLENGE_TTL_SECONDS = 300;

export const RP_NAME = 'NWKS Encounter';

/**
 * The relying-party ID must be the site's registered domain — NOT a guess.
 * Deriving it from the request keeps localhost development and the deployed
 * Pages domain both working without a config switch that could silently point
 * production at the wrong origin.
 */
export function rpIdFromRequest(req: Request): string {
  return new URL(req.url).hostname;
}

export function originFromRequest(req: Request): string {
  return new URL(req.url).origin;
}

// ── Challenge storage ───────────────────────────────────────────────────────

function challengeKey(scope: 'reg' | 'auth', id: string): string {
  return `webauthn:${scope}:${id}`;
}

async function putChallenge(
  env: Env, scope: 'reg' | 'auth', id: string, challenge: string
): Promise<void> {
  await env.SESSIONS.put(challengeKey(scope, id), challenge, {
    expirationTtl: CHALLENGE_TTL_SECONDS,
  });
}

/**
 * Reads a challenge and immediately deletes it. Single use: a replayed
 * challenge is exactly what a captured-response attack needs.
 */
async function takeChallenge(
  env: Env, scope: 'reg' | 'auth', id: string
): Promise<string | null> {
  const key = challengeKey(scope, id);
  const value = await env.SESSIONS.get(key);
  if (value) await env.SESSIONS.delete(key);
  return value;
}

// ── Stored credential shape ─────────────────────────────────────────────────

export interface StoredCredential {
  id: number;
  credential_id: string;
  public_key: ArrayBuffer | Uint8Array;
  counter: number;
  transports: string | null;
  device_label: string | null;
}

export async function listCredentials(env: Env, userId: number): Promise<StoredCredential[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, credential_id, public_key, counter, transports, device_label
     FROM webauthn_credentials WHERE admin_user_id = ?`
  ).bind(userId).all<StoredCredential>();
  return results;
}

function toUint8(value: ArrayBuffer | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

// ── Registration (enrolling a new passkey) ──────────────────────────────────

export async function startRegistration(
  env: Env, req: Request, user: { id: number; email: string; name: string }
) {
  const existing = await listCredentials(env, user.id);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rpIdFromRequest(req),
    userName: user.email,
    userDisplayName: user.name || user.email,
    attestationType: 'none',
    // Already-registered devices are excluded so the browser tells the user
    // "you've already set this one up" instead of silently creating a duplicate.
    excludeCredentials: existing.map((c) => ({
      id: c.credential_id,
      transports: c.transports ? (JSON.parse(c.transports) as never) : undefined,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'required',
    },
  });

  await putChallenge(env, 'reg', String(user.id), options.challenge);
  return options;
}

export interface RegistrationResult {
  ok: boolean;
  error?: string;
  credentialId?: string;
}

export async function finishRegistration(
  env: Env,
  req: Request,
  userId: number,
  response: unknown,
  deviceLabel: string
): Promise<RegistrationResult> {
  const expectedChallenge = await takeChallenge(env, 'reg', String(userId));
  if (!expectedChallenge) return { ok: false, error: 'Challenge expired. Please try again.' };

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: response as never,
      expectedChallenge,
      expectedOrigin: originFromRequest(req),
      expectedRPID: rpIdFromRequest(req),
      requireUserVerification: true,
    });
  } catch (err) {
    // A failed verification is a real event worth seeing, not a shrug.
    console.warn('[webauthn] registration verification failed', err);
    return { ok: false, error: 'Could not verify that passkey.' };
  }

  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false, error: 'Could not verify that passkey.' };
  }

  const { credential } = verification.registrationInfo;

  try {
    await env.DB.prepare(
      `INSERT INTO webauthn_credentials
         (admin_user_id, credential_id, public_key, counter, transports, device_label, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      userId,
      credential.id,
      credential.publicKey,
      credential.counter ?? 0,
      JSON.stringify(credential.transports ?? []),
      deviceLabel.slice(0, 80) || 'Passkey',
      nowIso()
    ).run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE')) {
      return { ok: false, error: 'That passkey is already registered.' };
    }
    throw err;
  }

  // Enrollment is what flips enforcement on — and only after a passkey has
  // actually verified end to end. A deploy alone can never lock anyone out.
  await env.DB.prepare(
    `UPDATE admin_users SET webauthn_enabled = 1, two_factor_required = 1 WHERE id = ?`
  ).bind(userId).run();

  return { ok: true, credentialId: credential.id };
}

// ── Authentication (using a passkey to log in) ──────────────────────────────

export async function startAuthentication(env: Env, req: Request, userId: number) {
  const creds = await listCredentials(env, userId);

  const options = await generateAuthenticationOptions({
    rpID: rpIdFromRequest(req),
    userVerification: 'required',
    allowCredentials: creds.map((c) => ({
      id: c.credential_id,
      transports: c.transports ? (JSON.parse(c.transports) as never) : undefined,
    })),
  });

  await putChallenge(env, 'auth', String(userId), options.challenge);
  return options;
}

export interface AuthenticationResult {
  ok: boolean;
  error?: string;
  /** True when the authenticator's counter went backwards — a cloned device. */
  cloneSuspected?: boolean;
}

export async function finishAuthentication(
  env: Env,
  req: Request,
  userId: number,
  response: unknown
): Promise<AuthenticationResult> {
  const expectedChallenge = await takeChallenge(env, 'auth', String(userId));
  if (!expectedChallenge) return { ok: false, error: 'Challenge expired. Please try again.' };

  const credentialId = (response as { id?: string } | null)?.id;
  if (!credentialId) return { ok: false, error: 'Malformed passkey response.' };

  const stored = await env.DB.prepare(
    `SELECT id, credential_id, public_key, counter FROM webauthn_credentials
     WHERE admin_user_id = ? AND credential_id = ?`
  ).bind(userId, credentialId).first<StoredCredential>();

  // Scoped to THIS user: a valid passkey belonging to someone else must not
  // authenticate this account.
  if (!stored) return { ok: false, error: 'Unknown passkey.' };

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: response as never,
      expectedChallenge,
      expectedOrigin: originFromRequest(req),
      expectedRPID: rpIdFromRequest(req),
      requireUserVerification: true,
      credential: {
        id: stored.credential_id,
        publicKey: toUint8(stored.public_key),
        counter: stored.counter,
      },
    });
  } catch (err) {
    console.warn('[webauthn] authentication verification failed', err);
    return { ok: false, error: 'Could not verify that passkey.' };
  }

  if (!verification.verified) return { ok: false, error: 'Could not verify that passkey.' };

  const newCounter = verification.authenticationInfo.newCounter;

  // A counter that fails to advance means the credential was cloned. Some
  // authenticators legitimately always report 0; only a genuine regression from
  // a non-zero counter is treated as a clone.
  if (stored.counter > 0 && newCounter <= stored.counter) {
    return { ok: false, error: 'This passkey looks cloned. Use another method.', cloneSuspected: true };
  }

  await env.DB.prepare(
    `UPDATE webauthn_credentials SET counter = ?, last_used_at = ? WHERE id = ?`
  ).bind(newCounter, nowIso(), stored.id).run();

  return { ok: true };
}

/** Removes one passkey; clears the enabled flag when it was the last one. */
export async function deleteCredential(
  env: Env, userId: number, credentialDbId: number
): Promise<boolean> {
  const res = await env.DB.prepare(
    `DELETE FROM webauthn_credentials WHERE id = ? AND admin_user_id = ?`
  ).bind(credentialDbId, userId).run();

  if (!res.meta.changes) return false;

  const remaining = await listCredentials(env, userId);
  if (remaining.length === 0) {
    // No passkey left means 2FA cannot be satisfied by the primary factor, so
    // enforcement is stood down rather than leaving the user permanently locked
    // out. The recovery ladder still exists; this just avoids a dead end.
    await env.DB.prepare(
      `UPDATE admin_users SET webauthn_enabled = 0, two_factor_required = 0 WHERE id = ?`
    ).bind(userId).run();
  }
  return true;
}
