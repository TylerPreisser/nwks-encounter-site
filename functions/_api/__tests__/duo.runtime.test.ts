// Does `jose` (HS512 JWT sign/verify — the whole of Duo Universal's crypto)
// run in the Workers runtime? Proven before the Duo integration is written, for
// the same reason as webauthn.runtime.test.ts: "should work on the edge" is a
// claim, not evidence. Fallback would be raw WebCrypto HMAC-SHA512.

import { describe, it, expect } from 'vitest';

describe('jose in the Workers runtime', () => {
  it('signs and verifies an HS512 JWT', async () => {
    const { SignJWT, jwtVerify } = await import('jose');
    const secret = new TextEncoder().encode('a-secret-at-least-64-bytes-long-for-hs512-aaaaaaaaaaaaaaaaaaaaaaaa');

    const jwt = await new SignJWT({ scope: 'openid' })
      .setProtectedHeader({ alg: 'HS512' })
      .setIssuer('client-id')
      .setSubject('client-id')
      .setAudience('https://api-xxxx.duosecurity.com/oauth/v1/token')
      .setExpirationTime('5m')
      .setJti('unique')
      .sign(secret);

    const { payload } = await jwtVerify(jwt, secret, {
      issuer: 'client-id',
      audience: 'https://api-xxxx.duosecurity.com/oauth/v1/token',
    });
    expect(payload.scope).toBe('openid');
  });

  it('rejects a token signed with a different secret', async () => {
    const { SignJWT, jwtVerify } = await import('jose');
    const good = new TextEncoder().encode('a-secret-at-least-64-bytes-long-for-hs512-aaaaaaaaaaaaaaaaaaaaaaaa');
    const bad = new TextEncoder().encode('b-secret-at-least-64-bytes-long-for-hs512-bbbbbbbbbbbbbbbbbbbbbbbb');

    const jwt = await new SignJWT({}).setProtectedHeader({ alg: 'HS512' })
      .setExpirationTime('5m').sign(bad);

    await expect(jwtVerify(jwt, good)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const { SignJWT, jwtVerify } = await import('jose');
    const secret = new TextEncoder().encode('a-secret-at-least-64-bytes-long-for-hs512-aaaaaaaaaaaaaaaaaaaaaaaa');
    const jwt = await new SignJWT({}).setProtectedHeader({ alg: 'HS512' })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(secret);
    await expect(jwtVerify(jwt, secret)).rejects.toThrow();
  });
});
