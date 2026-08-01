import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { applyMigrations, seedAdmin } from './setup';
import type { Env } from '../app';
import {
  sha256Hex, randomNumericCode, randomRecoveryCode, timingSafeEqualHex,
  issueEmailOtp, issueRecoveryCodes, consumeAuthCode, countUnusedRecoveryCodes,
  issueTrustedDevice, isTrustedDevice, revokeTrustedDevices,
  registerFailedLogin, clearFailedLogins, lockState,
  recordLoginAttempt, isIpRateLimited, isSecondFactorRateLimited,
  audit, duoConfigured,
} from '../security';

const testEnv = env as unknown as Env;
const db = () => (env as unknown as { DB: D1Database }).DB;

let userId: number;
let userEmail: string;

beforeEach(async () => {
  await applyMigrations(env as unknown as { DB: D1Database });
  const seeded = await seedAdmin();
  userId = seeded.id;
  userEmail = seeded.email;
});

describe('code generation', () => {
  it('produces 6 digits', () => {
    for (let i = 0; i < 50; i++) expect(randomNumericCode(6)).toMatch(/^\d{6}$/);
  });

  it('produces distinct codes (the RNG is actually random)', () => {
    const seen = new Set(Array.from({ length: 200 }, () => randomNumericCode(6)));
    expect(seen.size).toBeGreaterThan(190);
  });

  it('formats recovery codes without ambiguous characters', () => {
    for (let i = 0; i < 100; i++) {
      const code = randomRecoveryCode();
      expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      // 0/O and 1/I/L get misread off paper, which is a lockout.
      expect(code).not.toMatch(/[01OIL]/);
    }
  });

  it('compares hex in constant time, and correctly', async () => {
    const a = await sha256Hex('hello');
    expect(timingSafeEqualHex(a, a)).toBe(true);
    expect(timingSafeEqualHex(a, await sha256Hex('hello!'))).toBe(false);
    expect(timingSafeEqualHex(a, 'short')).toBe(false);
  });
});

describe('emailed one-time codes', () => {
  it('issues a code and stores only its hash', async () => {
    const code = await issueEmailOtp(testEnv, userId);
    expect(code).toMatch(/^\d{6}$/);

    const row = await db()
      .prepare(`SELECT code_hash FROM auth_codes WHERE admin_user_id = ? AND kind='email_otp'`)
      .bind(userId)
      .first<{ code_hash: string }>();
    expect(row!.code_hash).not.toBe(code);
    expect(row!.code_hash).toBe(await sha256Hex(code!));
  });

  it('accepts the right code exactly once', async () => {
    const code = await issueEmailOtp(testEnv, userId);
    expect(await consumeAuthCode(testEnv, userId, 'email_otp', code!)).toBe(true);
    // Replay must fail — a code captured in transit is worthless afterwards.
    expect(await consumeAuthCode(testEnv, userId, 'email_otp', code!)).toBe(false);
  });

  it('rejects a wrong code', async () => {
    await issueEmailOtp(testEnv, userId);
    expect(await consumeAuthCode(testEnv, userId, 'email_otp', '000000')).toBe(false);
  });

  it('rejects an expired code', async () => {
    const code = await issueEmailOtp(testEnv, userId);
    await db()
      .prepare(`UPDATE auth_codes SET expires_at = ? WHERE admin_user_id = ?`)
      .bind(new Date(Date.now() - 60_000).toISOString(), userId)
      .run();
    expect(await consumeAuthCode(testEnv, userId, 'email_otp', code!)).toBe(false);
  });

  it('invalidates the previous code when a new one is issued', async () => {
    const first = await issueEmailOtp(testEnv, userId);
    await issueEmailOtp(testEnv, userId);
    expect(await consumeAuthCode(testEnv, userId, 'email_otp', first!)).toBe(false);
  });

  it('stops issuing after too many requests, so it cannot flood an inbox', async () => {
    const issued = [];
    for (let i = 0; i < 7; i++) issued.push(await issueEmailOtp(testEnv, userId));
    expect(issued.filter(Boolean).length).toBe(5);
    expect(issued[5]).toBeNull();
  });

  it("never accepts another user's code", async () => {
    const other = await seedAdmin({ email: 'other@nwks.test' });
    const code = await issueEmailOtp(testEnv, userId);
    expect(await consumeAuthCode(testEnv, other.id, 'email_otp', code!)).toBe(false);
  });
});

describe('recovery codes — the "no email, no phone" backstop', () => {
  it('issues ten single-use codes', async () => {
    const codes = await issueRecoveryCodes(testEnv, userId);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(await countUnusedRecoveryCodes(testEnv, userId)).toBe(10);
  });

  it('accepts one exactly once and leaves the rest usable', async () => {
    const codes = await issueRecoveryCodes(testEnv, userId);
    expect(await consumeAuthCode(testEnv, userId, 'recovery', codes[3])).toBe(true);
    expect(await consumeAuthCode(testEnv, userId, 'recovery', codes[3])).toBe(false);
    expect(await countUnusedRecoveryCodes(testEnv, userId)).toBe(9);
    expect(await consumeAuthCode(testEnv, userId, 'recovery', codes[4])).toBe(true);
  });

  it('accepts a code typed off paper in any case or spacing', async () => {
    const codes = await issueRecoveryCodes(testEnv, userId);
    const messy = codes[0].toLowerCase().replace(/-/g, ' ');
    expect(await consumeAuthCode(testEnv, userId, 'recovery', messy)).toBe(true);
  });

  it('does not expire (that is the whole point)', async () => {
    const codes = await issueRecoveryCodes(testEnv, userId);
    const row = await db()
      .prepare(`SELECT expires_at FROM auth_codes WHERE kind='recovery' LIMIT 1`)
      .first<{ expires_at: string | null }>();
    expect(row!.expires_at).toBeNull();
    expect(await consumeAuthCode(testEnv, userId, 'recovery', codes[0])).toBe(true);
  });

  it('regenerating replaces the old set entirely', async () => {
    const first = await issueRecoveryCodes(testEnv, userId);
    await issueRecoveryCodes(testEnv, userId);
    expect(await consumeAuthCode(testEnv, userId, 'recovery', first[0])).toBe(false);
    expect(await countUnusedRecoveryCodes(testEnv, userId)).toBe(10);
  });

  it('rejects a well-formed code that was never issued', async () => {
    await issueRecoveryCodes(testEnv, userId);
    expect(await consumeAuthCode(testEnv, userId, 'recovery', 'ZZZZ-ZZZZ-ZZZZ')).toBe(false);
  });
});

describe('trusted devices', () => {
  const req = () =>
    new Request('http://localhost/', {
      headers: { 'CF-Connecting-IP': '1.2.3.4', 'User-Agent': 'QA Browser' },
    });

  it('recognises a device it issued', async () => {
    const token = await issueTrustedDevice(testEnv, userId, req());
    expect(await isTrustedDevice(testEnv, userId, token)).toBe(true);
  });

  it('stores only the hash of the token', async () => {
    const token = await issueTrustedDevice(testEnv, userId, req());
    const row = await db()
      .prepare(`SELECT token_hash FROM trusted_devices WHERE admin_user_id = ?`)
      .bind(userId)
      .first<{ token_hash: string }>();
    expect(row!.token_hash).toBe(await sha256Hex(token));
    expect(row!.token_hash).not.toBe(token);
  });

  it('rejects an unknown or absent token', async () => {
    expect(await isTrustedDevice(testEnv, userId, 'nope')).toBe(false);
    expect(await isTrustedDevice(testEnv, userId, undefined)).toBe(false);
  });

  it("never accepts another user's device token", async () => {
    const other = await seedAdmin({ email: 'other@nwks.test' });
    const token = await issueTrustedDevice(testEnv, userId, req());
    expect(await isTrustedDevice(testEnv, other.id, token)).toBe(false);
  });

  it('rejects an expired device', async () => {
    const token = await issueTrustedDevice(testEnv, userId, req());
    await db()
      .prepare(`UPDATE trusted_devices SET expires_at = ? WHERE admin_user_id = ?`)
      .bind(new Date(Date.now() - 1000).toISOString(), userId)
      .run();
    expect(await isTrustedDevice(testEnv, userId, token)).toBe(false);
  });

  it('revokes every device for a user', async () => {
    const a = await issueTrustedDevice(testEnv, userId, req());
    const b = await issueTrustedDevice(testEnv, userId, req());
    await revokeTrustedDevices(testEnv, userId);
    expect(await isTrustedDevice(testEnv, userId, a)).toBe(false);
    expect(await isTrustedDevice(testEnv, userId, b)).toBe(false);
  });
});

describe('lockout + rate limiting', () => {
  it('does not lock before the threshold', async () => {
    let state = { locked: false, until: null as string | null };
    for (let i = 0; i < 4; i++) state = await registerFailedLogin(testEnv, userId, i);
    expect(state.locked).toBe(false);
  });

  it('locks on the fifth failure', async () => {
    let state = { locked: false, until: null as string | null };
    for (let i = 0; i < 5; i++) state = await registerFailedLogin(testEnv, userId, i);
    expect(state.locked).toBe(true);
    expect(new Date(state.until!).getTime()).toBeGreaterThan(Date.now());
  });

  it('backs off further on each subsequent failure', async () => {
    let first: string | null = null;
    let later: string | null = null;
    for (let i = 0; i < 5; i++) first = (await registerFailedLogin(testEnv, userId, i)).until;
    for (let i = 5; i < 8; i++) later = (await registerFailedLogin(testEnv, userId, i)).until;
    expect(new Date(later!).getTime()).toBeGreaterThan(new Date(first!).getTime());
  });

  it('clears the lock on a successful login', async () => {
    for (let i = 0; i < 5; i++) await registerFailedLogin(testEnv, userId, i);
    await clearFailedLogins(testEnv, userId);
    const row = await db()
      .prepare(`SELECT failed_login_count, locked_until FROM admin_users WHERE id = ?`)
      .bind(userId)
      .first<{ failed_login_count: number; locked_until: string | null }>();
    expect(row).toMatchObject({ failed_login_count: 0, locked_until: null });
  });

  it('treats an elapsed lock as unlocked', () => {
    expect(lockState(new Date(Date.now() - 1000).toISOString()).locked).toBe(false);
    expect(lockState(new Date(Date.now() + 60_000).toISOString()).locked).toBe(true);
    expect(lockState(null).locked).toBe(false);
  });

  it('rate limits an IP hammering many accounts', async () => {
    expect(await isIpRateLimited(testEnv, '9.9.9.9')).toBe(false);
    for (let i = 0; i < 20; i++) {
      await recordLoginAttempt(testEnv, `u${i}@x.com`, '9.9.9.9', 'bad_password');
    }
    expect(await isIpRateLimited(testEnv, '9.9.9.9')).toBe(true);
    // A different address is unaffected — one attacker must not lock out the team.
    expect(await isIpRateLimited(testEnv, '8.8.8.8')).toBe(false);
  });

  it('does not count successful logins toward the IP limit', async () => {
    for (let i = 0; i < 25; i++) {
      await recordLoginAttempt(testEnv, userEmail, '7.7.7.7', 'success');
    }
    expect(await isIpRateLimited(testEnv, '7.7.7.7')).toBe(false);
  });

  it('rate limits brute-forcing the 6-digit second factor', async () => {
    expect(await isSecondFactorRateLimited(testEnv, '5.5.5.5')).toBe(false);
    for (let i = 0; i < 10; i++) {
      await recordLoginAttempt(testEnv, userEmail, '5.5.5.5', 'bad_second_factor');
    }
    expect(await isSecondFactorRateLimited(testEnv, '5.5.5.5')).toBe(true);
  });
});

describe('audit trail', () => {
  it('writes an entry with request metadata', async () => {
    await audit(testEnv, {
      adminUserId: userId,
      adminEmail: userEmail,
      action: 'login.success',
      detail: { method: 'passkey' },
      req: new Request('http://localhost/', {
        headers: { 'CF-Connecting-IP': '1.2.3.4', 'User-Agent': 'QA Browser' },
      }),
    });

    const row = await db()
      .prepare(`SELECT admin_email, action, detail, ip, user_agent FROM audit_log`)
      .first<Record<string, string>>();
    expect(row).toMatchObject({
      admin_email: userEmail, action: 'login.success', ip: '1.2.3.4', user_agent: 'QA Browser',
    });
    expect(JSON.parse(row!.detail)).toEqual({ method: 'passkey' });
  });

  it('never throws, even if the write fails', async () => {
    await db().prepare(`DROP TABLE audit_log`).run();
    // An audit failure must not be the reason a legitimate login fails.
    await expect(
      audit(testEnv, { action: 'login.success', adminEmail: userEmail })
    ).resolves.toBeUndefined();
  });
});

describe('Duo', () => {
  it('is off unless all three secrets are present', () => {
    expect(duoConfigured(testEnv)).toBe(false);
    expect(duoConfigured({ ...testEnv, DUO_IKEY: 'a' } as unknown as Env)).toBe(false);
    expect(
      duoConfigured({ ...testEnv, DUO_IKEY: 'a', DUO_SKEY: 'b', DUO_API_HOST: 'c' } as unknown as Env)
    ).toBe(true);
  });
});
