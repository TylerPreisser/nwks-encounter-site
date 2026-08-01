import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/api';
import { useProgram } from '@/App';
import { encounterLabel } from '@/components/registrationFields';

export interface InterestRow {
  id: number;
  role: 'attendee' | 'server';
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  status: 'waiting' | 'notified';
  notified_at: string | null;
  created_at: string;
  /** The encounter they were last invited to — both null if never invited. */
  notified_year: number | null;
  notified_season: string | null;
}

type RoleFilter = 'all' | 'attendee' | 'server';

const ROLE_FILTERS: { value: RoleFilter; label: string }[] = [
  { value: 'all',      label: 'All'       },
  { value: 'attendee', label: 'Attendees' },
  { value: 'server',   label: 'Servers'   },
];

const ROLE_LABEL: Record<InterestRow['role'], string> = {
  attendee: 'Attendee',
  server: 'Server',
};

/** Short, readable date for "joined the list" — the time of day is noise here. */
function joinedOn(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

/**
 * "Fall 2026" for the encounter this person was last invited to.
 *
 * Built through the shared `encounterLabel` rather than a local season switch so
 * the standing list names an encounter exactly the way the roster and person
 * pages do — one place to change if a third season ever appears. The row carries
 * no display_name/title, so the season+year branch is the one that fires;
 * `event_id: 0` only feeds that function's unreachable last-resort fallback.
 */
function invitedToLabel(r: InterestRow): string | null {
  if (r.notified_year == null || !r.notified_season) return null;
  return encounterLabel({
    id: r.id,
    event_id: 0,
    role: r.role,
    year: r.notified_year,
    season: r.notified_season,
    title: null,
    created_at: r.created_at,
  });
}

/**
 * The standing interest list — everyone who raised a hand for an Encounter but
 * has not signed up yet.
 *
 * Deliberately built as cards in the same shape as RosterPage rather than a
 * table: these rows carry the same "who is this person and how do I reach them"
 * payload, and matching the roster means the two lists read as one system.
 * Unlike the roster there is no person page to link to — nobody here has a
 * registration yet — so the row is a plain card with a Remove action instead of
 * a link.
 */
export default function InterestedPage() {
  const { program } = useProgram();

  const [rows, setRows] = useState<InterestRow[]>([]);
  const [total, setTotal] = useState(0);
  const [role, setRole] = useState<RoleFilter>('all');
  const [loading, setLoading] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Switching program starts the filter over: an "Attendees" view of the men's
  // list says nothing about the women's one.
  useEffect(() => { setRole('all'); }, [program]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // `role` is omitted entirely for "All" — the API treats an absent param as
      // "every role", and sending role=all would just be silently ignored.
      const params = new URLSearchParams();
      if (role !== 'all') params.set('role', role);
      const qs = params.toString();
      const res = await apiFetch<{ ok: boolean; rows: InterestRow[]; total: number }>(
        qs ? `/admin/interest?${qs}` : '/admin/interest'
      );
      setRows(res.rows ?? []);
      setTotal(res.total ?? 0);
    } catch (e) {
      // Never fail silently: an empty list and a failed request look identical
      // otherwise, and "nobody is interested" is the wrong thing to conclude
      // from a network error.
      setError(e instanceof Error ? e.message : 'Could not load the interest list.');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [program, role]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function handleRemove(r: InterestRow) {
    // Removing is irreversible from this screen — they only come back by filling
    // the interest form again — so it gets a confirmation.
    if (!confirm(`Remove ${r.first_name} ${r.last_name} from the interest list? They'll stop receiving invitations.`)) {
      return;
    }
    setRemovingId(r.id);
    setError(null);
    try {
      await apiFetch(`/admin/interest/${r.id}/remove`, { method: 'POST' });
      // Refetch rather than splicing locally: the list is small and the server
      // decides who still qualifies as "interested".
      await fetchRows();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove that person.');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
          Interested
          <span className="ml-2 text-base font-normal text-gray-400">{total}</span>
        </h1>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <label htmlFor="interest-role-filter" className="text-sm text-gray-500">Role</label>
        <select
          id="interest-role-filter"
          value={role}
          onChange={(e) => setRole(e.target.value as RoleFilter)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2"
        >
          {ROLE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {error && (
        <p data-testid="interest-error" className="text-sm text-red-600">{error}</p>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm animate-pulse">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          {role === 'all'
            ? 'Nobody is waiting on the interest list yet. When registration is closed, people who ask to be told about the next Encounter show up here.'
            : `Nobody is waiting on the interest list as ${role === 'server' ? 'a server' : 'an attendee'} yet. Try the All filter, or check back once registration closes.`}
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const invited = invitedToLabel(r);
            return (
              <li key={r.id}>
                <div
                  data-testid={`interest-row-${r.id}`}
                  className="rounded-xl border border-gray-100 shadow-sm px-4 py-3"
                  style={{ background: 'var(--color-surface)' }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">
                          {r.first_name} {r.last_name}
                        </span>
                        <span
                          data-testid={`role-badge-${r.id}`}
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={
                            r.role === 'server'
                              ? { background: 'var(--color-accent)', color: '#fff' }
                              : { background: 'rgb(243 244 246)', color: 'rgb(75 85 99)' }
                          }
                        >
                          {ROLE_LABEL[r.role]}
                        </span>
                        <span
                          data-testid={`status-badge-${r.id}`}
                          className={
                            'text-xs px-2 py-0.5 rounded-full font-medium ' +
                            (r.status === 'notified'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800')
                          }
                        >
                          {/* Which encounter they were invited to matters more than
                              the bare word "notified" — it tells you whether the
                              invitation they got is still the current one. */}
                          {r.status === 'notified'
                            ? (invited ? `Invited to ${invited}` : 'Invited')
                            : 'Waiting'}
                        </span>
                      </div>

                      <div className="mt-1 flex gap-x-4 gap-y-0.5 flex-wrap text-xs text-gray-500">
                        {r.email && <span>{r.email}</span>}
                        {r.phone && <span>{r.phone}</span>}
                        <span>Joined {joinedOn(r.created_at)}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleRemove(r)}
                      disabled={removingId === r.id}
                      data-testid={`remove-${r.id}`}
                      className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {removingId === r.id ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
