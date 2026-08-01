// Does @simplewebauthn/server actually run in the Workers runtime?
//
// This is deliberately the FIRST test written for Project B. The library is
// documented as isomorphic (WebCrypto, no Node built-ins), but "should work on
// the edge" is a claim, not evidence — and if it turns out not to, the fallback
// is hand-rolled WebCrypto verification, NOT a silent downgrade to email-only
// 2FA. Better to find that out here than three files into the auth rewrite.

import { describe, it, expect } from 'vitest';

describe('@simplewebauthn/server in the Workers runtime', () => {
  it('imports without pulling in a Node built-in', async () => {
    const mod = await import('@simplewebauthn/server');
    expect(typeof mod.generateRegistrationOptions).toBe('function');
    expect(typeof mod.verifyRegistrationResponse).toBe('function');
    expect(typeof mod.generateAuthenticationOptions).toBe('function');
    expect(typeof mod.verifyAuthenticationResponse).toBe('function');
  });

  it('generates registration options (exercises its RNG + base64url path)', async () => {
    const { generateRegistrationOptions } = await import('@simplewebauthn/server');

    const options = await generateRegistrationOptions({
      rpName: 'NWKS Encounter',
      rpID: 'nwks-encounter-backend.pages.dev',
      userName: 'admin@nwksencounter.com',
      userDisplayName: 'QA Admin',
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required',
      },
    });

    expect(options.challenge).toBeTruthy();
    expect(options.rp.id).toBe('nwks-encounter-backend.pages.dev');
    // userVerification: 'required' is what makes the passkey a genuine second
    // factor — the device must confirm a human (biometric/PIN), not merely that
    // the credential exists.
    expect(options.authenticatorSelection?.userVerification).toBe('required');
  });

  it('generates authentication options for a known credential', async () => {
    const { generateAuthenticationOptions } = await import('@simplewebauthn/server');

    const options = await generateAuthenticationOptions({
      rpID: 'nwks-encounter-backend.pages.dev',
      userVerification: 'required',
      allowCredentials: [{ id: 'dGVzdC1jcmVkZW50aWFsLWlk' }],
    });

    expect(options.challenge).toBeTruthy();
    expect(options.allowCredentials?.[0].id).toBe('dGVzdC1jcmVkZW50aWFsLWlk');
  });

  it('rejects a forged authentication response instead of throwing something unhandled', async () => {
    const { verifyAuthenticationResponse } = await import('@simplewebauthn/server');

    await expect(
      verifyAuthenticationResponse({
        response: {
          id: 'bogus',
          rawId: 'bogus',
          response: {
            clientDataJSON: 'bogus',
            authenticatorData: 'bogus',
            signature: 'bogus',
          },
          clientExtensionResults: {},
          type: 'public-key',
        },
        expectedChallenge: 'nope',
        expectedOrigin: 'https://nwks-encounter-backend.pages.dev',
        expectedRPID: 'nwks-encounter-backend.pages.dev',
        credential: {
          id: 'bogus',
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
        },
      })
    ).rejects.toThrow();
  });
});
