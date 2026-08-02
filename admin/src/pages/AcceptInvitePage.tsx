import { useEffect, useState, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '@/api';
import EncounterLogos from '@/components/EncounterLogos';

const INK = '#18181B';
const MUTED = '#52525B';
const LINE = '#E4E4E7';
const MIN_PASSWORD = 10;

/**
 * Accepting an invitation: confirm who invited you, choose a password, then
 * sign in — which routes straight into the normal first-run 2FA setup.
 *
 * Deliberately does NOT issue a session on acceptance. Everyone reaches the
 * admin through the same front door, so there is no second, softer way in.
 *
 * Styled like the login screen (neutral, both logos) because this is the same
 * moment: no program has been chosen yet.
 */
export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [invite, setInvite] = useState<{ email: string; invited_by: string | null } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    apiFetch<{ email: string; invited_by: string | null }>(`/invite/${token}`)
      .then(setInvite)
      .catch((e: Error) => setLoadError(e.message));
  }, [token]);

  async function accept(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return setError('Those passwords do not match.');
    setBusy(true);
    try {
      await apiFetch(`/invite/${token}/accept`, {
        method: 'POST', body: JSON.stringify({ password, name }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept the invitation');
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-5" style={{ background: '#0B0B0C' }}>
      <div className="w-full max-w-sm rounded-2xl p-8"
        style={{ background: '#FFFFFF', boxShadow: '0 30px 60px -25px rgba(0,0,0,.85)' }}>
        <div className="text-center">
          <div className="flex justify-center"><EncounterLogos /></div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight" style={{ color: INK, fontFamily: 'Georgia, serif' }}>
            NWKS Encounter
          </h1>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: MUTED }}>
            Admin Panel
          </p>
        </div>

        <div className="my-5" style={{ height: 1, background: LINE }} />

        {loadError && (
          <div role="alert" className="rounded-lg px-4 py-3 text-sm"
            style={{ background: '#FAFAF9', borderLeft: '3px solid #B91C1C', color: '#8C1D18' }}>
            {loadError}
          </div>
        )}

        {done && (
          <div className="space-y-4 text-center" data-testid="invite-accepted">
            <p className="text-sm" style={{ color: MUTED }}>
              Your account is ready. Sign in and you&rsquo;ll be asked to set up two-factor security.
            </p>
            <button onClick={() => navigate('/login', { replace: true })}
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-white" style={{ background: INK }}>
              Go to sign in
            </button>
          </div>
        )}

        {!done && invite && (
          <form onSubmit={accept} className="space-y-4" data-testid="accept-invite-form">
            <p className="text-sm" style={{ color: MUTED }}>
              {invite.invited_by ? <><strong style={{ color: INK }}>{invite.invited_by}</strong> invited </> : 'You were invited '}
              <strong style={{ color: INK }}>{invite.email}</strong> to help run the admin panel.
            </p>

            {error && (
              <div role="alert" className="rounded-lg px-4 py-3 text-sm"
                style={{ background: '#FAFAF9', borderLeft: '3px solid #B91C1C', color: '#8C1D18' }}>
                {error}
              </div>
            )}

            <div>
              <label htmlFor="name" className="block text-sm font-medium mb-1" style={{ color: '#3F3F46' }}>Your name</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name"
                className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: LINE }} />
            </div>
            <div>
              <label htmlFor="pw" className="block text-sm font-medium mb-1" style={{ color: '#3F3F46' }}>Choose a password</label>
              <input id="pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: LINE }} />
              <p className="mt-1 text-[11px]" style={{ color: '#A1A1AA' }}>At least {MIN_PASSWORD} characters.</p>
            </div>
            <div>
              <label htmlFor="pw2" className="block text-sm font-medium mb-1" style={{ color: '#3F3F46' }}>Confirm password</label>
              <input id="pw2" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: LINE }} />
            </div>

            <button type="submit" disabled={busy}
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-60" style={{ background: INK }}>
              {busy ? 'Creating your account…' : 'Accept invitation'}
            </button>
          </form>
        )}

        {!done && !invite && !loadError && (
          <p className="text-center text-sm animate-pulse" style={{ color: MUTED }}>Checking your invitation…</p>
        )}
      </div>
    </div>
  );
}
