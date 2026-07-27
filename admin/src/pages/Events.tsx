import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/api';
import { useProgram } from '@/App';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NwksEvent {
  id: number;
  program: string;
  year: number;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  launch_locations: string; // raw JSON string from API
  attendee_registration_open: number;
  server_registration_open: number;
  attendee_limit: number | null;
  attendee_full_message: string | null;
  is_current: number;
}

interface EventFormState {
  year: string;
  title: string;
  start_date: string;
  end_date: string;
  launch_locations: string; // comma-separated for UI
  attendee_registration_open: boolean;
  server_registration_open: boolean;
  attendee_limit: string;        // '' = no cap
  attendee_full_message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseLaunchLocations(raw: string): string[] {
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

function emptyForm(): EventFormState {
  return {
    year: String(new Date().getFullYear()),
    title: '',
    start_date: '',
    end_date: '',
    launch_locations: '',
    attendee_registration_open: true,
    server_registration_open: true,
    attendee_limit: '',
    attendee_full_message: '',
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Events() {
  const { program } = useProgram();

  const [events, setEvents] = useState<NwksEvent[]>([]);
  const [needsNextEvent, setNeedsNextEvent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form
  const [form, setForm] = useState<EventFormState>(emptyForm());
  const [editId, setEditId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ ok: boolean; events: NwksEvent[]; needs_next_event?: boolean; error?: string }>(
        '/admin/events',
      );
      setEvents(data.events);
      setNeedsNextEvent(data.needs_next_event ?? false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [program]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void loadEvents(); }, [loadEvents]);

  // ---------------------------------------------------------------------------
  // Form actions
  // ---------------------------------------------------------------------------

  function openCreate() {
    setEditId(null);
    setForm(emptyForm());
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(ev: NwksEvent) {
    setEditId(ev.id);
    setForm({
      year: String(ev.year),
      title: ev.title ?? '',
      start_date: ev.start_date ?? '',
      end_date: ev.end_date ?? '',
      launch_locations: parseLaunchLocations(ev.launch_locations).join(', '),
      attendee_registration_open: ev.attendee_registration_open === 1,
      server_registration_open: ev.server_registration_open === 1,
      attendee_limit: ev.attendee_limit != null ? String(ev.attendee_limit) : '',
      attendee_full_message: ev.attendee_full_message ?? '',
    });
    setFormError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditId(null);
    setForm(emptyForm());
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);

    const payload = {
      year: Number(form.year),
      title: form.title || undefined,
      start_date: form.start_date || undefined,
      end_date: form.end_date || undefined,
      launch_locations: form.launch_locations
        ? form.launch_locations.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      attendee_registration_open: form.attendee_registration_open,
      server_registration_open: form.server_registration_open,
      attendee_limit: form.attendee_limit.trim() === '' ? null : Number(form.attendee_limit),
      attendee_full_message: form.attendee_full_message.trim() || null,
    };

    try {
      if (editId !== null) {
        await apiFetch(`/admin/events/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/admin/events', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      closeForm();
      await loadEvents();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleSetCurrent(id: number) {
    try {
      await apiFetch(`/admin/events/${id}/set-current`, { method: 'POST' });
      await loadEvents();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const formLabel = editId !== null ? 'Edit event' : 'New event';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
          Events
        </h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: 'var(--color-secondary)' }}
        >
          + New Event
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Needs-next-event nudge */}
      {needsNextEvent && (
        <div role="alert" aria-label="needs-next-event" className="p-4 bg-amber-50 border border-amber-300 text-amber-800 rounded-lg flex items-start gap-3">
          <span className="text-xl" aria-hidden="true">⚠️</span>
          <div>
            <p className="font-semibold">
              The current {program === 'mens' ? "Men's" : "Women's"} Encounter has ended.
            </p>
            <p className="text-sm mt-1">
              Create the next event so the website automatically updates to the new dates.
            </p>
          </div>
        </div>
      )}

      {/* Create / Edit form */}
      {formOpen && (
        <form
          onSubmit={handleSubmit}
          aria-label={formLabel}
          className="p-4 border rounded-lg bg-gray-50 space-y-3"
        >
          <h2 className="text-lg font-semibold">
            {editId !== null ? 'Edit Event' : 'New Event'}
          </h2>

          {formError && (
            <p role="alert" className="text-red-600 text-sm">{formError}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col text-sm font-medium gap-1">
              Year *
              <input
                type="number"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
                required
                min={2020}
                max={2100}
                disabled={editId !== null}
                className="border rounded px-2 py-1"
              />
            </label>

            <label className="flex flex-col text-sm font-medium gap-1">
              Title
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={`${program === 'mens' ? "Men's" : "Women's"} Encounter ${form.year}`}
                className="border rounded px-2 py-1"
              />
            </label>

            <label className="flex flex-col text-sm font-medium gap-1">
              Start Date (YYYY-MM-DD)
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="border rounded px-2 py-1"
              />
            </label>

            <label className="flex flex-col text-sm font-medium gap-1">
              End Date (YYYY-MM-DD)
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="border rounded px-2 py-1"
              />
            </label>
          </div>

          <label className="flex flex-col text-sm font-medium gap-1">
            Launch Locations (comma-separated)
            <input
              type="text"
              value={form.launch_locations}
              onChange={(e) => setForm({ ...form, launch_locations: e.target.value })}
              placeholder="Colby, Hays, Dodge City"
              className="border rounded px-2 py-1"
            />
          </label>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.attendee_registration_open}
                onChange={(e) => setForm({ ...form, attendee_registration_open: e.target.checked })}
              />
              Attendee registration open
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.server_registration_open}
                onChange={(e) => setForm({ ...form, server_registration_open: e.target.checked })}
              />
              Server registration open
            </label>
          </div>

          {/* ── Attendee cap ─────────────────────────────────────── */}
          <div className="rounded-lg border border-gray-200 p-3 space-y-3 bg-gray-50/60">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Attendee limit (auto full)</p>
            <label className="flex flex-col text-sm font-medium gap-1">
              Max attendees <span className="font-normal text-gray-400">— leave blank for no limit</span>
              <input
                type="number" min="0" inputMode="numeric"
                value={form.attendee_limit}
                onChange={(e) => setForm({ ...form, attendee_limit: e.target.value })}
                placeholder="e.g. 60"
                className="border rounded px-2 py-1 w-40"
                aria-label="Attendee limit"
              />
            </label>
            <label className="flex flex-col text-sm font-medium gap-1">
              "Currently full" message <span className="font-normal text-gray-400">— shown when the limit is reached</span>
              <textarea
                value={form.attendee_full_message}
                onChange={(e) => setForm({ ...form, attendee_full_message: e.target.value })}
                placeholder="This upcoming Encounter is currently full…"
                className="border rounded px-2 py-1.5 text-sm min-h-[3rem]"
                aria-label="Attendee full message"
              />
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--color-secondary)' }}
            >
              {saving ? 'Saving…' : editId !== null ? 'Save Changes' : 'Create Event'}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Events list */}
      {loading ? (
        <p className="text-gray-400 text-sm animate-pulse">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-gray-500">No events yet. Create one above.</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="p-2 border">Year</th>
              <th className="p-2 border">Title</th>
              <th className="p-2 border">Dates</th>
              <th className="p-2 border">Launch Locations</th>
              <th className="p-2 border">Reg Open</th>
              <th className="p-2 border">Current</th>
              <th className="p-2 border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.id} className={ev.is_current ? 'bg-green-50' : ''}>
                <td className="p-2 border">{ev.year}</td>
                <td className="p-2 border">{ev.title ?? '—'}</td>
                <td className="p-2 border">
                  {ev.start_date ?? '?'} – {ev.end_date ?? '?'}
                </td>
                <td className="p-2 border">
                  {parseLaunchLocations(ev.launch_locations).join(', ') || '—'}
                </td>
                <td className="p-2 border">
                  {ev.attendee_registration_open ? 'Att ' : ''}
                  {ev.server_registration_open ? 'Srv' : ''}
                  {!ev.attendee_registration_open && !ev.server_registration_open ? 'Closed' : ''}
                </td>
                <td className="p-2 border text-center">
                  {ev.is_current ? (
                    <span className="text-green-700 font-bold">✓ Current</span>
                  ) : (
                    <button
                      onClick={() => handleSetCurrent(ev.id)}
                      className="text-xs px-2 py-1 border rounded hover:bg-gray-100"
                      aria-label={`Make ${ev.year} current`}
                    >
                      Make Current
                    </button>
                  )}
                </td>
                <td className="p-2 border">
                  <button
                    onClick={() => openEdit(ev)}
                    className="text-xs px-2 py-1 border rounded hover:bg-gray-100"
                    aria-label={`Edit ${ev.year} event`}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
