import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/api';

interface AdminRow {
  id: number; email: string; name: string | null; role: string;
  webauthn_enabled: number; two_factor_required: number;
  locked_until: string | null; last_login_at: string | null;
}
interface InviteRow {
  id: number; email: string; role: string; invited_by_email: string | null; expires_at: string;
}

/**
 * Who can get into the admin. Super admins only — the server enforces that too,
 * so hiding this tab is convenience, not the control.
 */
export default function TeamPage() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'super_admin'>('admin');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Shown when email can't be delivered, so the link can be passed on by hand. */
  const [manualLink, setManualLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch<{ admins: AdminRow[]; invites: InviteRow[] }>('/admin/team');
      setAdmins(d.admins ?? []); setInvites(d.invites ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the team');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setNotice(null); setManualLink(null); setBusy(true);
    try {
      const res = await apiFetch<{ emailed: boolean; accept_url?: string }>('/admin/team/invite', {
        method: 'POST', body: JSON.stringify({ email, role }),
      });
      if (res.emailed) setNotice(`Invitation emailed to ${email}.`);
      else setManualLink(res.accept_url ?? null);
      setEmail('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that invitation');
    } finally { setBusy(false); }
  }

  async function revoke(id: number) {
    setBusy(true);
    try { await apiFetch(`/admin/team/invite/${id}/revoke`, { method: 'POST', body: '{}' }); await load(); }
    finally { setBusy(false); }
  }

  async function remove(a: AdminRow) {
    if (!confirm(`Remove ${a.email}? They lose access immediately.`)) return;
    setError(null); setBusy(true);
    try { await apiFetch(`/admin/team/${a.id}`, { method: 'DELETE' }); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not remove them'); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>Team</h1>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-green-300 bg-green-50 text-green-800 px-4 py-3 text-sm">{notice}</div>}

      {manualLink && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-2">
          <p><strong>Email isn&rsquo;t configured yet</strong>, so the invitation wasn&rsquo;t sent. Give them this link — it works once and expires in 7 days.</p>
          <code data-testid="manual-invite-link" className="block break-all rounded bg-white px-2 py-1 text-xs">{manualLink}</code>
        </div>
      )}

      <form onSubmit={invite} className="rounded-xl border border-gray-100 shadow-sm p-4 space-y-3" style={{ background: 'var(--color-surface)' }}>
        <h2 className="font-semibold">Invite someone</h2>
        <div className="flex gap-2 flex-wrap">
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="their@email.com" aria-label="Email address"
            className="flex-1 min-w-[220px] rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'super_admin')}
            aria-label="Role" className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="admin">Admin</option>
            <option value="super_admin">Super admin</option>
          </select>
          <button type="submit" disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: 'var(--color-primary)' }}>
            {busy ? 'Sending…' : 'Send invitation'}
          </button>
        </div>
        <p className="text-xs text-gray-500">
          They&rsquo;ll set their own password and be required to set up two-factor sign-in before they can get in.
        </p>
      </form>

      {invites.length > 0 && (
        <section className="rounded-xl border border-gray-100 shadow-sm p-4 space-y-2" style={{ background: 'var(--color-surface)' }}>
          <h2 className="font-semibold">Pending invitations</h2>
          <ul className="text-sm space-y-1">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{i.email}</span>
                <span className="text-xs text-gray-400">
                  {i.role === 'super_admin' ? 'super admin' : 'admin'} · expires {new Date(i.expires_at).toLocaleDateString()}
                </span>
                <button onClick={() => void revoke(i.id)} disabled={busy}
                  className="text-xs underline text-gray-400 hover:text-red-600">Cancel</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-gray-100 shadow-sm p-4 space-y-2" style={{ background: 'var(--color-surface)' }}>
        <h2 className="font-semibold">People with access</h2>
        <ul className="space-y-2">
          {admins.map((a) => (
            <li key={a.id} className="flex items-center gap-2 flex-wrap text-sm">
              <span className="font-medium">{a.name || a.email}</span>
              {a.name && <span className="text-gray-500 text-xs">{a.email}</span>}
              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={a.role === 'super_admin'
                  ? { background: 'var(--color-primary)', color: '#fff' }
                  : { background: 'rgb(243 244 246)', color: 'rgb(75 85 99)' }}>
                {a.role === 'super_admin' ? 'Super admin' : 'Admin'}
              </span>
              <span className="text-xs text-gray-400">
                {a.two_factor_required ? '2FA on' : '2FA not set up'}
                {a.locked_until && new Date(a.locked_until) > new Date() ? ' · locked' : ''}
              </span>
              <button onClick={() => void remove(a)} disabled={busy}
                className="ml-auto text-xs underline text-gray-400 hover:text-red-600">Remove</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
