/**
 * UpcomingEncounterTile
 *
 * Dashboard quick-edit panel for the current event.
 * Fetches GET /api/admin/events and finds the is_current=1 entry.
 * Lets the admin edit start_date, end_date, title, and launch_locations inline.
 * Saves via PATCH /api/admin/events/:id.
 *
 * Program-aware; shows create-prompt when no current event exists.
 */

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '@/api';
import { useProgram } from '@/App';

interface NwksEvent {
  id: number;
  program: string;
  year: number;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  launch_locations: string; // raw JSON string
  attendee_registration_open: number;
  server_registration_open: number;
  is_current: number;
}

function parseLocs(raw: string): string {
  try {
    const arr = JSON.parse(raw) as string[];
    return arr.join(', ');
  } catch {
    return '';
  }
}

function locsToArray(csv: string): string[] {
  return csv.split(',').map(s => s.trim()).filter(Boolean);
}

export default function UpcomingEncounterTile() {
  const { program } = useProgram();

  const [event, setEvent] = useState<NwksEvent | null | undefined>(undefined); // undefined = loading
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ title: '', start_date: '', end_date: '', launch_locations: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setEvent(undefined);
    setFetchError(null);
    setEditing(false);
    setSaved(false);
    try {
      const data = await apiFetch<{ ok: boolean; events: NwksEvent[] }>('/admin/events');
      const current = data.events.find(e => e.is_current === 1) ?? null;
      setEvent(current);
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load event');
    }
  }, [program]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  function openEdit() {
    if (!event) return;
    setForm({
      title:           event.title ?? '',
      start_date:      event.start_date ?? '',
      end_date:        event.end_date ?? '',
      launch_locations: parseLocs(event.launch_locations),
    });
    setSaveError(null);
    setSaved(false);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setSaveError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!event) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await apiFetch(`/admin/events/${event.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title:           form.title || undefined,
          start_date:      form.start_date || undefined,
          end_date:        form.end_date || undefined,
          launch_locations: locsToArray(form.launch_locations),
          // preserve existing registration flags
          attendee_registration_open: event.attendee_registration_open === 1,
          server_registration_open:   event.server_registration_open === 1,
          year: event.year,
        }),
      });
      setSaved(true);
      setEditing(false);
      await load();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  /* ── Error (check before loading — fetchError may be set while event is still undefined) ── */
  if (fetchError) {
    return (
      <section
        role="alert"
        aria-label="Upcoming Encounter"
        className="rounded-2xl border p-5 shadow-sm"
        style={{ background: 'var(--color-surface)', borderColor: '#FCA5A5' }}
      >
        <p className="text-sm text-red-600">{fetchError}</p>
      </section>
    );
  }

  /* ── Loading ── */
  if (event === undefined) {
    return (
      <section
        aria-label="Upcoming Encounter"
        className="rounded-2xl border p-5 shadow-sm animate-pulse"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-accent)' }}
      >
        <p className="text-sm text-gray-400">Loading upcoming encounter…</p>
      </section>
    );
  }

  /* ── No current event ── */
  if (event === null) {
    return (
      <section
        aria-label="Upcoming Encounter"
        className="rounded-2xl border p-5 shadow-sm"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-accent)' }}
      >
        <h2
          className="text-sm font-bold uppercase tracking-widest mb-2"
          style={{ color: 'var(--color-primary)' }}
        >
          Upcoming Encounter
        </h2>
        <p className="text-sm text-gray-500 mb-3">No current event set for this program.</p>
        <Link
          to="/events"
          className="text-sm font-semibold underline"
          style={{ color: 'var(--color-secondary)' }}
        >
          Create the upcoming encounter →
        </Link>
      </section>
    );
  }

  const locDisplay = parseLocs(event.launch_locations) || '—';

  /* ── Edit form ── */
  if (editing) {
    return (
      <section
        aria-label="Upcoming Encounter"
        className="rounded-2xl border p-5 shadow-sm"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-accent)' }}
      >
        <h2
          className="text-sm font-bold uppercase tracking-widest mb-4"
          style={{ color: 'var(--color-primary)' }}
        >
          Edit Upcoming Encounter
        </h2>
        <form onSubmit={handleSave} aria-label="edit upcoming encounter" className="space-y-3">
          {saveError && (
            <p role="alert" className="text-red-600 text-sm">{saveError}</p>
          )}
          <label className="flex flex-col text-sm font-medium gap-1">
            Title
            <input
              type="text"
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder={`${program === 'mens' ? "Men's" : "Women's"} Encounter ${event.year}`}
              className="border rounded px-2 py-1.5 text-sm"
              style={{ borderColor: 'var(--color-accent)' }}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col text-sm font-medium gap-1">
              Start Date
              <input
                type="date"
                value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })}
                className="border rounded px-2 py-1.5 text-sm"
                style={{ borderColor: 'var(--color-accent)' }}
              />
            </label>
            <label className="flex flex-col text-sm font-medium gap-1">
              End Date
              <input
                type="date"
                value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })}
                className="border rounded px-2 py-1.5 text-sm"
                style={{ borderColor: 'var(--color-accent)' }}
              />
            </label>
          </div>
          <label className="flex flex-col text-sm font-medium gap-1">
            Launch Locations (comma-separated)
            <input
              type="text"
              value={form.launch_locations}
              onChange={e => setForm({ ...form, launch_locations: e.target.value })}
              placeholder="Colby, Hays, Dodge City"
              className="border rounded px-2 py-1.5 text-sm"
              style={{ borderColor: 'var(--color-accent)' }}
            />
          </label>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--color-secondary)' }}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </section>
    );
  }

  /* ── Display ── */
  return (
    <section
      aria-label="Upcoming Encounter"
      className="rounded-2xl border p-5 shadow-sm"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-accent)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2
          className="text-sm font-bold uppercase tracking-widest"
          style={{ color: 'var(--color-primary)' }}
        >
          Upcoming Encounter
        </h2>
        <button
          type="button"
          onClick={openEdit}
          className="text-xs px-3 py-1 rounded-lg border font-semibold hover:opacity-80 transition-opacity"
          style={{ color: 'var(--color-secondary)', borderColor: 'var(--color-secondary)' }}
        >
          Edit
        </button>
      </div>

      {saved && (
        <p className="text-green-600 text-xs mt-1">Saved.</p>
      )}

      <p
        className="text-xl font-bold mt-2"
        style={{ color: 'var(--color-primary)' }}
      >
        {event.title ?? `${program === 'mens' ? "Men's" : "Women's"} Encounter ${event.year}`}
      </p>

      <dl className="mt-3 space-y-1 text-sm text-gray-600">
        <div className="flex gap-2">
          <dt className="font-medium w-28 flex-shrink-0">Dates</dt>
          <dd>{event.start_date ?? '—'} – {event.end_date ?? '—'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium w-28 flex-shrink-0">Locations</dt>
          <dd>{locDisplay}</dd>
        </div>
      </dl>
    </section>
  );
}
