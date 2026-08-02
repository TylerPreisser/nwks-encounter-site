import { useState, useEffect, FormEvent } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { apiFetch } from '@/api';

export type VerifyWith = 'email' | 'passkey_direct';

interface Props {
  /** How this account proves itself before it can enrol: emailed code, or straight to passkey. */
  verifyWith: VerifyWith;
  /** "ty****@gmail.com" — shown so they know which inbox to open. */
  emailHint?: string;
  onDone: () => void;
}

type Stage = 'code' | 'offer_passkey';

const INK = '#18181B';
const MUTED = '#52525B';
const LINE = '#E4E4E7';

/**
 * First-run two-factor setup, shown immediately after the password on any
 * account that has no passkey yet.
 *
 *   password  ->  emailed 6-digit code  ->  "want a passkey?"  ->  in
 *
 * The passkey offer comes AFTER the code rather than instead of it, so nobody
 * is ever stuck: the code works on any device with an inbox, and the passkey is
 * the upgrade they opt into once they're already through the door.
 *
 * Where email cannot be delivered, `verifyWith='passkey_direct'` skips straight
 * to enrolment rather than parking someone on "check your email" for a message
 * that will never arrive.
 */
export default function TwoFactorSetup({ verifyWith, emailHint, onDone }: Props) {
  const [stage, setStage] = useState<Stage>(verifyWith === 'email' ? 'code' : 'offer_passkey');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(30);

  // A visible countdown stops people hammering "resend" and tripping the rate
  // limit on the one thing standing between them and their account.
  useEffect(() => {
    if (stage !== 'code' || resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [stage, resendIn]);

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/auth/2fa/email/verify', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      setStage('offer_passkey');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code is not valid');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/auth/2fa/email/send', { method: 'POST', body: JSON.stringify({}) });
      setNotice('Sent — check your email again.');
      setResendIn(30);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send another code');
    } finally {
      setBusy(false);
    }
  }

  async function enrolPasskey() {
    setError(null);
    setBusy(true);
    try {
      const { options } = await apiFetch<{ options: Parameters<typeof startRegistration>[0]['optionsJSON'] }>(
        '/auth/setup/passkey/options', { method: 'POST', body: JSON.stringify({}) }
      );
      const response = await startRegistration({ optionsJSON: options });
      await apiFetch('/auth/setup/passkey/verify', {
        method: 'POST',
        body: JSON.stringify({ response, label: navigator.platform || 'This device' }),
      });
      onDone();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not set up a passkey';
      setError(/abort|cancel|NotAllowed/i.test(msg) ? 'Passkey setup was cancelled.' : msg);
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    try {
      await apiFetch('/auth/setup/skip', { method: 'POST', body: JSON.stringify({}) });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not continue');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5" data-testid="two-factor-setup">
      <div className="text-center">
        <h2 className="text-lg font-semibold" style={{ color: INK }}>
          {stage === 'code' ? 'Check your email' : 'Make next time easier'}
        </h2>
        <p className="mt-1 text-sm" style={{ color: MUTED }}>
          {stage === 'code' ? (
            <>We sent a 6-digit code to <strong style={{ color: INK }}>{emailHint ?? 'your email'}</strong>.</>
          ) : (
            'Use Face ID, Touch ID, or your security key to sign in — no code to wait for.'
          )}
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-lg px-4 py-3 text-sm"
          style={{ background: '#FAFAF9', borderLeft: '3px solid #B91C1C', color: '#8C1D18' }}>
          {error}
        </div>
      )}
      {notice && !error && (
        <p className="text-center text-xs" style={{ color: MUTED }}>{notice}</p>
      )}

      {stage === 'code' && (
        <form onSubmit={submitCode} className="space-y-4">
          <input
            data-testid="setup-code-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="123456"
            required
            aria-label="6-digit code"
            className="w-full rounded-lg border px-3 py-3 text-center text-lg tracking-[0.4em] focus:outline-none"
            style={{ borderColor: LINE, color: INK }}
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: INK }}
          >
            {busy ? 'Checking…' : 'Verify'}
          </button>
          <button
            type="button"
            onClick={() => void resend()}
            disabled={busy || resendIn > 0}
            data-testid="resend-code"
            className="w-full text-center text-xs underline disabled:no-underline"
            style={{ color: resendIn > 0 ? '#A1A1AA' : MUTED }}
          >
            {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Send another code'}
          </button>
        </form>
      )}

      {stage === 'offer_passkey' && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => void enrolPasskey()}
            disabled={busy}
            data-testid="setup-passkey"
            className="w-full rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: INK }}
          >
            {busy ? 'Waiting for your device…' : 'Set up a passkey'}
          </button>
          <button
            type="button"
            onClick={() => void skip()}
            disabled={busy}
            data-testid="setup-skip"
            className="w-full text-center text-xs underline"
            style={{ color: MUTED }}
          >
            Not now — take me in
          </button>
          <p className="text-center text-[11px]" style={{ color: '#A1A1AA' }}>
            You can always set one up later under Security.
          </p>
        </div>
      )}
    </div>
  );
}
