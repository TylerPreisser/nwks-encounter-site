// Duo Universal — config gating, the signed request we send, and the security
// boundary on the way back.
//
// Duo itself is stubbed: what matters here is that WE sign correctly, that we
// refuse anything we cannot verify, and that Duo stays completely inert until
// all three secrets are present.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { SignJWT, jwtVerify } from 'jose';
import { duoConfig, createAuthUrl, exchangeCode, healthCheck } from '../duo';
import type { Env } from '../app';

const CFG = {
  clientId: 'DIXXXXXXXXXXXXXXXXXX',
  clientSecret: 'a-duo-secret-key-long-enough-for-hs512-aaaaaaaaaaaaaaaaaaaaaaaaaa',
  apiHost: 'api-12345678.duosecurity.com',
};

const secret = () => new TextEncoder().encode(CFG.clientSecret);

afterEach(() => vi.unstubAllGlobals());

describe('duoConfig — Duo is opt-in', () => {
  it('is null unless all three secrets are set', () => {
    expect(duoConfig({} as Env)).toBeNull();
    expect(duoConfig({ DUO_IKEY: 'a' } as unknown as Env)).toBeNull();
    expect(duoConfig({ DUO_IKEY: 'a', DUO_SKEY: 'b' } as unknown as Env)).toBeNull();
  });

  it('reads all three when present', () => {
    const cfg = duoConfig({
      DUO_IKEY: CFG.clientId, DUO_SKEY: CFG.clientSecret, DUO_API_HOST: CFG.apiHost,
    } as unknown as Env);
    expect(cfg).toMatchObject(CFG);
  });

  it('tolerates an API host pasted with a scheme or trailing slash', () => {
    const cfg = duoConfig({
      DUO_IKEY: CFG.clientId, DUO_SKEY: CFG.clientSecret,
      DUO_API_HOST: 'https://api-12345678.duosecurity.com/',
    } as unknown as Env);
    // Otherwise every Duo URL becomes https://https://api-.../oauth/...
    expect(cfg?.apiHost).toBe('api-12345678.duosecurity.com');
  });
});

describe('createAuthUrl', () => {
  it('signs a request JWT carrying the username, state and redirect', async () => {
    const url = await createAuthUrl(CFG, 'admin@nwksencounter.com', 'state-123', 'https://admin.test/cb');
    const parsed = new URL(url);

    expect(parsed.origin).toBe(`https://${CFG.apiHost}`);
    expect(parsed.pathname).toBe('/oauth/v1/authorize');
    expect(parsed.searchParams.get('client_id')).toBe(CFG.clientId);
    expect(parsed.searchParams.get('response_type')).toBe('code');

    const { payload } = await jwtVerify(parsed.searchParams.get('request')!, secret());
    expect(payload).toMatchObject({
      client_id: CFG.clientId,
      redirect_uri: 'https://admin.test/cb',
      state: 'state-123',
      duo_uname: 'admin@nwksencounter.com',
      scope: 'openid',
    });
  });

  it('produces a request JWT that cannot be verified with the wrong secret', async () => {
    const url = await createAuthUrl(CFG, 'a@b.com', 's', 'https://admin.test/cb');
    const request = new URL(url).searchParams.get('request')!;
    const wrong = new TextEncoder().encode('a-different-secret-key-long-enough-for-hs512-bbbbbbbbbbbbbbbb');
    await expect(jwtVerify(request, wrong)).rejects.toThrow();
  });
});

describe('healthCheck', () => {
  it('reports ok when Duo says OK', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ stat: 'OK' })));
    expect(await healthCheck(CFG)).toEqual({ ok: true });
  });

  it('reports not-ok with Duo\'s message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ stat: 'FAIL', message: 'invalid client' })));
    expect(await healthCheck(CFG)).toMatchObject({ ok: false, error: 'invalid client' });
  });

  it('reports not-ok rather than throwing when Duo is unreachable', async () => {
    // A Duo outage must degrade to "use another factor", never a 500.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    expect((await healthCheck(CFG)).ok).toBe(false);
  });
});

describe('exchangeCode — the security boundary', () => {
  /** Builds an id_token the way Duo would. */
  async function idToken(overrides: Record<string, unknown> = {}, signWith = secret()) {
    return new SignJWT({ preferred_username: 'admin@nwksencounter.com', ...overrides })
      .setProtectedHeader({ alg: 'HS512' })
      .setIssuer(`https://${CFG.apiHost}/oauth/v1/token`)
      .setAudience(CFG.clientId)
      .setExpirationTime('5m')
      .sign(signWith);
  }

  function stubToken(body: unknown) {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(body)));
  }

  it('accepts a properly signed token for the expected user', async () => {
    stubToken({ id_token: await idToken() });
    const res = await exchangeCode(CFG, 'code', 'admin@nwksencounter.com', 'https://admin.test/cb');
    expect(res).toMatchObject({ ok: true, username: 'admin@nwksencounter.com' });
  });

  it('matches the username case-insensitively', async () => {
    stubToken({ id_token: await idToken({ preferred_username: 'Admin@NWKSencounter.com' }) });
    expect((await exchangeCode(CFG, 'c', 'admin@nwksencounter.com', 'https://admin.test/cb')).ok).toBe(true);
  });

  it('REJECTS a token for a different user', async () => {
    // The code authenticated somebody — just not the person who started this
    // login. Accepting it would let one admin's Duo approval log in as another.
    stubToken({ id_token: await idToken({ preferred_username: 'someone.else@example.com' }) });
    const res = await exchangeCode(CFG, 'c', 'admin@nwksencounter.com', 'https://admin.test/cb');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/different user/i);
  });

  it('REJECTS a token signed with the wrong secret', async () => {
    const wrong = new TextEncoder().encode('an-attacker-secret-long-enough-for-hs512-cccccccccccccccccccc');
    stubToken({ id_token: await idToken({}, wrong) });
    expect((await exchangeCode(CFG, 'c', 'admin@nwksencounter.com', 'https://admin.test/cb')).ok).toBe(false);
  });

  it('REJECTS a token issued by someone else', async () => {
    const forged = await new SignJWT({ preferred_username: 'admin@nwksencounter.com' })
      .setProtectedHeader({ alg: 'HS512' })
      .setIssuer('https://evil.example.com/oauth/v1/token')
      .setAudience(CFG.clientId)
      .setExpirationTime('5m')
      .sign(secret());
    stubToken({ id_token: forged });
    expect((await exchangeCode(CFG, 'c', 'admin@nwksencounter.com', 'https://admin.test/cb')).ok).toBe(false);
  });

  it('REJECTS an expired token', async () => {
    const expired = await new SignJWT({ preferred_username: 'admin@nwksencounter.com' })
      .setProtectedHeader({ alg: 'HS512' })
      .setIssuer(`https://${CFG.apiHost}/oauth/v1/token`)
      .setAudience(CFG.clientId)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(secret());
    stubToken({ id_token: expired });
    expect((await exchangeCode(CFG, 'c', 'admin@nwksencounter.com', 'https://admin.test/cb')).ok).toBe(false);
  });

  it('surfaces Duo\'s error when no token comes back', async () => {
    stubToken({ error: 'invalid_grant', error_description: 'code already used' });
    const res = await exchangeCode(CFG, 'c', 'admin@nwksencounter.com', 'https://admin.test/cb');
    expect(res).toMatchObject({ ok: false, error: 'code already used' });
  });

  it('fails closed when the token endpoint is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    expect((await exchangeCode(CFG, 'c', 'a@b.com', 'https://admin.test/cb')).ok).toBe(false);
  });
});
