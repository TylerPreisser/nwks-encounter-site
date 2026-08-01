import { useEffect, useState, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { apiFetch, apiFetchRaw } from '@/api';
import { useProgram } from '@/App';
import { EncounterYearSelect } from '@/components/EncounterYearSelect';

export interface RosterRow {
  id: number;
  person_id?: number;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  role: 'attendee' | 'server';
  launch_location?: string | null;
  shirt_size?: string | null;
  dietary_health?: string | null;
  times_attended?: number;
  times_served?: number;
  is_first_timer?: number;
  created_at: string;
}

interface Props {
  role: 'attendee' | 'server';
}

const COPY = {
  attendee: { title: 'Attendees', empty: 'No attendees have registered yet.', file: 'attendees.csv' },
  server:   { title: 'Servers',   empty: 'No servers have signed up yet.',    file: 'servers.csv' },
} as const;

/**
 * The roster for one role at one encounter — Attendees or Servers.
 *
 * A list rather than a table: the six-column table this replaced could only
 * show a third of what people actually submit, and the columns that got cut
 * (phone, dietary needs) are the ones you scan a roster for. Clicking a row
 * opens the full submission on the person page.
 */
export default function RosterPage({ role }: Props) {
  const { program } = useProgram();
  const location = useLocation();
  const copy = COPY[role];

  const [rows, setRows] = useState<RosterRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [eventId, setEventId] = useState<number | null>(null);
  const [encounterLabel, setEncounterLabel] = useState('the roster');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Switching program (or role) re-defaults to that program's current encounter.
  useEffect(() => { setEventId(null); setPage(1); setQ(''); }, [program, role]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), role });
      if (q) params.set('q', q);
      if (eventId != null) params.set('event_id', String(eventId));
      const res = await apiFetch<{ ok: boolean; rows: RosterRow[]; total: number }>(
        `/admin/registrations?${params}`
      );
      setRows(res.rows ?? []);
      setTotal(res.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [program, role, page, q, eventId]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams({ role });
      if (eventId != null) params.set('event_id', String(eventId));
      const res = await apiFetchRaw(`/admin/registrations/export.csv?${params}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = copy.file;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const perPage = 50;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  /** Deep-links the clicked registration and remembers where to come back to. */
  function detailHref(r: RosterRow): string {
    const back = new URLSearchParams({
      reg: String(r.id),
      from: location.pathname,
      fromLabel: `${encounterLabel} ${copy.title}`,
    });
    return `/people/${r.person_id}?${back}`;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
          {copy.title}
          <span className="ml-2 text-base font-normal text-gray-400">{total}</span>
        </h1>

        <button
          onClick={handleExport}
          disabled={exporting || total === 0}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
          style={{ background: 'var(--color-secondary)' }}
        >
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <label htmlFor="encounter-filter" className="text-sm text-gray-500">Encounter</label>
        <EncounterYearSelect
          key={program}
          value={eventId}
          onChange={(id, _isCurrent, label) => {
            setEventId(id);
            setPage(1);
            if (label) setEncounterLabel(label);
          }}
          includeAll
        />
        <input
          type="search"
          placeholder="Search name or email…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2"
        />
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm animate-pulse">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">{copy.empty}</div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                to={detailHref(r)}
                data-testid={`roster-row-${r.id}`}
                className="block rounded-xl border border-gray-100 shadow-sm px-4 py-3 hover:shadow-md transition-shadow"
                style={{ background: 'var(--color-surface)' }}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900">
                    {r.first_name} {r.last_name}
                  </span>
                  <span
                    data-testid={`badge-${r.id}`}
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={
                      r.is_first_timer
                        ? { background: 'var(--color-accent)', color: '#fff' }
                        : { background: 'rgb(243 244 246)', color: 'rgb(75 85 99)' }
                    }
                  >
                    {r.is_first_timer
                      ? 'First time'
                      : `${r.times_attended ?? 0}× attended`}
                  </span>
                  {r.dietary_health ? (
                    <span
                      data-testid={`dietary-${r.id}`}
                      title={r.dietary_health}
                      className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800"
                    >
                      ⚑ {r.dietary_health}
                    </span>
                  ) : null}
                </div>

                <div className="mt-1 flex gap-x-4 gap-y-0.5 flex-wrap text-xs text-gray-500">
                  {r.email && <span>{r.email}</span>}
                  {r.phone && <span>{r.phone}</span>}
                  {r.launch_location && <span>{r.launch_location}</span>}
                  {r.shirt_size && <span>Shirt: {r.shirt_size}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
