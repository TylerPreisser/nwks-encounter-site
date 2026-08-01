import { useEffect, useState, useCallback } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { apiFetch } from '@/api';

interface Passkey { id: number; label: string | null; credential_id: string }
interface TrustedDevice { id: number; user_agent: string | null; ip: string | null; expires_at: string; last_seen_at: string | null }
interface AdminRow { id: number; email: string; name: string | null; webauthn_enabled: number; two_factor_required: number; locked_until: string | null }

interface Status {
  two_factor_required: boolean;
  webauthn_enabled: boolean;
  duo_available: boolean;
  passkeys: Passkey[];
  trusted_devices: TrustedDevice[];
  recovery_codes_remaining: number;
}

/**
 * Security settings: enroll a passkey, hold recovery codes, see and revoke
 * trusted devices, and (as the last rung of the recovery ladder) clear another
 * admin's 2FA when they're locked out.
 */
export default function SecurityPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Shown exactly once — the server stores only hashes and cannot re-show them. */
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([
        apiFetch<Status>('/admin/security'),
        apiFetch<{ admins: AdminRow[] }>('/admin/security/admins'),
      ]);
      setStatus(s);
      setAdmins(a.admins ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load security settings');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function enrollPasskey() {
    setError(null); setNotice(null); setBusy(true);
    try {
      const { options } = await apiFetch<{ options: Parameters<typeof startRegistration>[0]['optionsJSON'] }>(
        '/admin/security/passkey/options', { method: 'POST', body: JSON.stringify({}) }
      );
      const response = await startRegistration({ optionsJSON: options });
      const label = navigator.platform || 'This device';
      const res = await apiFetch<{ recovery_codes: string[] | null }>(
        '/admin/security/passkey/verify',
        { method: 'POST', body: JSON.stringify({ response, label }) }
      );
      if (res.recovery_codes) setNewCodes(res.recovery_codes);
      setNotice('Passkey added. Two-factor sign-in is now on for your account.');
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not add that passkey';
      setError(/abort|cancel|NotAllowed/i.test(msg) ? 'Passkey setup was cancelled.' : msg);
    } finally {
      setBusy(false);
    }
  }

  async function removePasskey(id: number) {
    setError(null); setBusy(true);
    try {
      await apiFetch(`/admin/security/passkey/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that passkey');
    } finally { setBusy(false); }
  }

  async function regenerateCodes() {
    setError(null); setBusy(true);
    try {
      const res = await apiFetch<{ recovery_codes: string[] }>(
        '/admin/security/recovery-codes', { method: 'POST', body: JSON.stringify({}) }
      );
      setNewCodes(res.recovery_codes);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate codes');
    } finally { setBusy(false); }
  }

  async function revokeDevices() {
    setBusy(true);
    try {
      await apiFetch('/admin/security/trusted-devices/revoke', { method: 'POST', body: JSON.stringify({}) });
      setNotice('Signed out of all trusted devices.');
      await load();
    } finally { setBusy(false); }
  }

  async function resetOther(target: AdminRow) {
    if (!confirm(`Clear two-factor for ${target.email}? They'll sign in with just their password until they set it up again.`)) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/security/reset-2fa/${target.id}`, { method: 'POST', body: JSON.stringify({}) });
      setNotice(`Two-factor cleared for ${target.email}. This was recorded in the audit log.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset that account');
    } finally { setBusy(false); }
  }

  function downloadCodes(codes: string[]) {
    const blob = new Blob(
      [`NWKS Encounter admin recovery codes\n\nEach code works once. Keep these somewhere safe and offline.\n\n${codes.join('\n')}\n`],
      { type: 'text/plain' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'nwks-recovery-codes.txt'; a.click();
    URL.revokeObjectURL(url);
  }

  if (error && !status) return <p className="text-red-600 text-sm">{error}</p>;
  if (!status) return <p className="text-gray-400 text-sm animate-pulse">Loading…</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>Security</h1>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-green-300 bg-green-50 text-green-800 px-4 py-3 text-sm">{notice}</div>}

      {/* One-time recovery code display */}
      {newCodes && (
        <section className="rounded-xl border-2 p-4 space-y-3" style={{ borderColor: 'var(--color-primary)' }}>
          <h2 className="font-semibold">Save these recovery codes now</h2>
          <p className="text-sm text-gray-600">
            Each works once, and they never expire. They&rsquo;re how you get in if you lose your
            phone <em>and</em> can&rsquo;t reach your email. <strong>This is the only time
            they&rsquo;ll be shown</strong> — we store only a one-way hash, so we genuinely
            cannot show them again.
          </p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-sm" data-testid="recovery-codes">
            {newCodes.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <div className="flex gap-2">
            <button onClick={() => downloadCodes(newCodes)} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--color-primary)' }}>
              Download
            </button>
            <button onClick={() => setNewCodes(null)} className="px-3 py-1.5 rounded-lg text-sm border">
              I&rsquo;ve saved them
            </button>
          </div>
        </section>
      )}

      {/* Two-factor status */}
      <section className="rounded-xl border border-gray-100 shadow-sm p-4 space-y-3" style={{ background: 'var(--color-surface)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-semibold">Two-factor sign-in</h2>
          <span
            data-testid="twofa-state"
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={status.two_factor_required
              ? { background: '#dcfce7', color: '#166534' }
              : { background: '#fef3c7', color: '#92400e' }}
          >
            {status.two_factor_required ? 'On' : 'Not set up'}
          </span>
        </div>

        {!status.two_factor_required && (
          <p className="text-sm text-gray-600">
            Right now your password is the only thing protecting every attendee&rsquo;s address and
            phone number. A passkey uses your face or fingerprint and can&rsquo;t be phished.
          </p>
        )}

        <ul className="space-y-1 text-sm">
          {status.passkeys.map((k) => (
            <li key={k.id} className="flex items-center gap-3">
              <span>🔑 {k.label ?? 'Passkey'}</span>
              <button onClick={() => void removePasskey(k.id)} disabled={busy} className="text-xs text-gray-400 hover:text-red-600 underline">
                Remove
              </button>
            </li>
          ))}
        </ul>

        <button
          onClick={() => void enrollPasskey()}
          disabled={busy}
          data-testid="add-passkey"
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: 'var(--color-primary)' }}
        >
          {status.passkeys.length ? 'Add another passkey' : 'Set up a passkey'}
        </button>

        {status.duo_available && (
          <p className="text-xs text-gray-500">Duo push is also available on this account.</p>
        )}
      </section>

      {/* Recovery codes */}
      <section className="rounded-xl border border-gray-100 shadow-sm p-4 space-y-2" style={{ background: 'var(--color-surface)' }}>
        <h2 className="font-semibold">Recovery codes</h2>
        <p className="text-sm text-gray-600">
          <strong data-testid="codes-remaining">{status.recovery_codes_remaining}</strong> unused.
          These work with no phone and no email.
        </p>
        <button onClick={() => void regenerateCodes()} disabled={busy} className="px-3 py-1.5 rounded-lg text-sm border" style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>
          Generate new codes
        </button>
      </section>

      {/* Trusted devices */}
      <section className="rounded-xl border border-gray-100 shadow-sm p-4 space-y-2" style={{ background: 'var(--color-surface)' }}>
        <h2 className="font-semibold">Trusted devices</h2>
        {status.trusted_devices.length === 0 ? (
          <p className="text-sm text-gray-500">None. You&rsquo;ll confirm your identity every sign-in.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {status.trusted_devices.map((d) => (
              <li key={d.id} className="text-gray-600">
                {d.user_agent?.slice(0, 60) ?? 'Unknown browser'} · {d.ip} · until{' '}
                {new Date(d.expires_at).toLocaleDateString()}
              </li>
            ))}
          </ul>
        )}
        {status.trusted_devices.length > 0 && (
          <button onClick={() => void revokeDevices()} disabled={busy} className="px-3 py-1.5 rounded-lg text-sm border">
            Sign out of all trusted devices
          </button>
        )}
      </section>

      {/* Team — admin-assisted reset */}
      <section className="rounded-xl border border-gray-100 shadow-sm p-4 space-y-2" style={{ background: 'var(--color-surface)' }}>
        <h2 className="font-semibold">Team</h2>
        <p className="text-sm text-gray-600">
          If someone loses their phone and their recovery codes, clear their two-factor here.
          Every reset is written to the audit log.
        </p>
        <ul className="text-sm space-y-1">
          {admins.map((a) => (
            <li key={a.id} className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{a.email}</span>
              <span className="text-xs text-gray-400">
                {a.two_factor_required ? '2FA on' : '2FA off'}
                {a.locked_until && new Date(a.locked_until) > new Date() ? ' · locked' : ''}
              </span>
              {a.two_factor_required === 1 && (
                <button onClick={() => void resetOther(a)} disabled={busy} className="text-xs underline text-gray-400 hover:text-red-600">
                  Reset their 2FA
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
