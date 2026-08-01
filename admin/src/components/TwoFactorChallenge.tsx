import { useState, useEffect, FormEvent } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { apiFetch } from '@/api';

export interface TwoFactorMethods {
  passkey: boolean;
  email: boolean;
  recovery: boolean;
  duo: boolean;
}

interface Props {
  methods: TwoFactorMethods;
  onSuccess: () => void;
}

type Mode = 'passkey' | 'email' | 'recovery';

/**
 * The second-factor step of login. Offers the passkey first and falls back
 * through the recovery ladder — emailed code, then a printed recovery code —
 * so losing a phone is an inconvenience rather than a lockout.
 */
export default function TwoFactorChallenge({ methods, onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>(methods.passkey ? 'passkey' : 'email');
  const [code, setCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Offer the passkey immediately — the browser prompt IS the interaction, so
  // making someone click a button first is a step for nothing.
  useEffect(() => {
    if (mode === 'passkey' && methods.passkey) void runPasskey();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function runPasskey() {
    setError(null);
    setBusy(true);
    try {
      const { options } = await apiFetch<{ options: PublicKeyCredentialRequestOptionsJSON }>(
        '/auth/2fa/passkey/options',
        { method: 'POST', body: JSON.stringify({}) }
      );
      const response = await startAuthentication({ optionsJSON: options });
      await apiFetch('/auth/2fa/passkey/verify', {
        method: 'POST',
        body: JSON.stringify({ response, trust_device: trustDevice }),
      });
      onSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Passkey sign-in failed';
      // A cancelled prompt is a choice, not an error — don't shout about it.
      setError(/abort|cancel|NotAllowed/i.test(msg) ? null : msg);
    } finally {
      setBusy(false);
    }
  }

  async function sendEmailCode() {
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/auth/2fa/email/send', { method: 'POST', body: JSON.stringify({}) });
      setEmailSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send a code');
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const path = mode === 'recovery' ? '/auth/2fa/recovery/verify' : '/auth/2fa/email/verify';
      await apiFetch(path, {
        method: 'POST',
        body: JSON.stringify({ code, trust_device: trustDevice }),
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code is not valid');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5" data-testid="two-factor-challenge">
      <div className="text-center">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-primary, #6B7645)' }}>
          Confirm it&rsquo;s you
        </h2>
        <p className="text-sm mt-1" style={{ color: '#78716c' }}>
          {mode === 'passkey' && 'Use Face ID, Touch ID, or your security key.'}
          {mode === 'email' && 'We can email you a 6-digit code.'}
          {mode === 'recovery' && 'Enter one of your printed recovery codes.'}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border px-4 py-3 text-sm"
          style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}
        >
          {error}
        </div>
      )}

      {mode === 'passkey' && (
        <button
          type="button"
          onClick={() => void runPasskey()}
          disabled={busy}
          data-testid="use-passkey"
          className="w-full rounded-lg py-2.5 text-sm font-semibold text-white"
          style={{ background: 'var(--color-primary, #6B7645)', opacity: busy ? 0.6 : 1 }}
        >
          {busy ? 'Waiting for your device…' : 'Use your passkey'}
        </button>
      )}

      {(mode === 'email' || mode === 'recovery') && (
        <form onSubmit={submitCode} className="space-y-4">
          {mode === 'email' && !emailSent && (
            <button
              type="button"
              onClick={() => void sendEmailCode()}
              disabled={busy}
              data-testid="send-email-code"
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-white"
              style={{ background: 'var(--color-primary, #6B7645)', opacity: busy ? 0.6 : 1 }}
            >
              {busy ? 'Sending…' : 'Email me a code'}
            </button>
          )}

          {(mode === 'recovery' || emailSent) && (
            <>
              <label htmlFor="code" className="block text-sm font-medium" style={{ color: '#44403c' }}>
                {mode === 'recovery' ? 'Recovery code' : '6-digit code'}
              </label>
              <input
                id="code"
                data-testid="code-input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode={mode === 'recovery' ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                placeholder={mode === 'recovery' ? 'ABCD-EFGH-JKMN' : '123456'}
                required
                className="w-full rounded-lg border px-3 py-2 text-sm tracking-widest text-center focus:outline-none focus:ring-2"
                style={{ borderColor: '#d6d3d1' }}
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg py-2.5 text-sm font-semibold text-white"
                style={{ background: 'var(--color-primary, #6B7645)', opacity: busy ? 0.6 : 1 }}
              >
                {busy ? 'Checking…' : 'Verify'}
              </button>
            </>
          )}
        </form>
      )}

      <label className="flex items-center gap-2 text-sm" style={{ color: '#57534e' }}>
        <input
          type="checkbox"
          checked={trustDevice}
          data-testid="trust-device"
          onChange={(e) => setTrustDevice(e.target.checked)}
        />
        Trust this device for 2 days
      </label>

      <div className="flex flex-wrap gap-3 justify-center text-xs pt-1" style={{ color: '#78716c' }}>
        {mode !== 'passkey' && methods.passkey && (
          <button type="button" className="underline" onClick={() => setMode('passkey')}>
            Use my passkey
          </button>
        )}
        {mode !== 'email' && (
          <button type="button" className="underline" data-testid="switch-email" onClick={() => setMode('email')}>
            Email me a code instead
          </button>
        )}
        {mode !== 'recovery' && (
          <button type="button" className="underline" data-testid="switch-recovery" onClick={() => setMode('recovery')}>
            I can&rsquo;t access my email
          </button>
        )}
      </div>
    </div>
  );
}

/** Minimal shape of the options blob; the browser library validates the rest. */
type PublicKeyCredentialRequestOptionsJSON = Parameters<
  typeof startAuthentication
>[0] extends { optionsJSON: infer T }
  ? T
  : never;
