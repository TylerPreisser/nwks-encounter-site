import { useState, useEffect, FormEvent } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { apiFetch } from '@/api';

export interface TwoFactorMethods {
  passkey: boolean;
  email: boolean;
  duo: boolean;
}

interface Props {
  methods: TwoFactorMethods;
  onSuccess: () => void;
}

type Mode = 'passkey' | 'email' | 'duo';

/**
 * The second-factor step of login. Leads with the passkey and falls back to an
 * emailed code or a Duo push. If none of those is reachable, another admin
 * clears your 2FA from Security settings.
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

  /**
   * Duo Universal is a full-page redirect: we hand off to Duo, the user approves
   * the push, and Duo sends them back to /admin/#/duo-callback with a code.
   * The pending-login cookie survives the round trip, so the callback can finish
   * the same login.
   */
  async function startDuo() {
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ redirect_url: string; state: string }>(
        '/auth/2fa/duo/start', { method: 'POST', body: JSON.stringify({}) }
      );
      sessionStorage.setItem('nwks_duo_trust', trustDevice ? '1' : '0');
      window.location.assign(res.redirect_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach Duo');
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
      await apiFetch('/auth/2fa/email/verify', {
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
          {mode === 'duo' && 'Approve the push notification on your phone.'}
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

      {mode === 'duo' && (
        <button
          type="button"
          onClick={() => void startDuo()}
          disabled={busy}
          data-testid="use-duo"
          className="w-full rounded-lg py-2.5 text-sm font-semibold text-white"
          style={{ background: 'var(--color-primary, #6B7645)', opacity: busy ? 0.6 : 1 }}
        >
          {busy ? 'Opening Duo…' : 'Send me a Duo push'}
        </button>
      )}

      {mode === 'email' && (
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

          {emailSent && (
            <>
              <label htmlFor="code" className="block text-sm font-medium" style={{ color: '#44403c' }}>
                6-digit code
              </label>
              <input
                id="code"
                data-testid="code-input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
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
        {mode !== 'duo' && methods.duo && (
          <button type="button" className="underline" data-testid="switch-duo" onClick={() => setMode('duo')}>
            Use Duo instead
          </button>
        )}
        {mode !== 'email' && (
          <button type="button" className="underline" data-testid="switch-email" onClick={() => setMode('email')}>
            Email me a code instead
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
