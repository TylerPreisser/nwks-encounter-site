import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/api';
import { useProgram } from '@/App';
import EnrollmentControl from '@/components/EnrollmentControl';
import RolloverDialog from '@/components/RolloverDialog';
import EventForm from '@/components/EventForm';
import EncounterLogos from '@/components/EncounterLogos';
import {
  type NwksEvent, type EventFormState, type RolloverPreview,
  encounterName, emptyEventForm as emptyForm, parseLaunchLocations,
} from '@/types/events';

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

  // Rollover ("Start Next Encounter")
  const [preview, setPreview] = useState<RolloverPreview | null>(null);
  const [rolloverOpen, setRolloverOpen] = useState(false);
  const [rolloverForm, setRolloverForm] = useState<EventFormState>(emptyForm());
  const [confirmYear, setConfirmYear] = useState('');
  const [force, setForce] = useState(false);
  /** Email the finishing encounter's interest queue. Defaults ON. */
  const [notifyInterest, setNotifyInterest] = useState(true);
  const [rollingOver, setRollingOver] = useState(false);
  const [rolloverError, setRolloverError] = useState<string | null>(null);
  const [rolloverDone, setRolloverDone] = useState<string | null>(null);

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

  // Counts for the enrollment panel: how full the current encounter is, and how
  // many people are waiting on it. Kept off the events fetch so a failure here
  // degrades to zeroes instead of blanking the page.
  const [currentCounts, setCurrentCounts] = useState({ registered: 0, interest: 0 });

  const loadCurrentCounts = useCallback(async () => {
    try {
      const pv = await apiFetch<RolloverPreview>('/admin/events/rollover/preview');
      setCurrentCounts({
        registered: pv?.registered_count ?? 0,
        interest: pv?.interest_count ?? 0,
      });
    } catch {
      setCurrentCounts({ registered: 0, interest: 0 });
    }
  }, [program]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void loadCurrentCounts(); }, [loadCurrentCounts]);

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
      season: ev.season === 'fall' ? 'fall' : 'spring',
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
      season: form.season,
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

  async function openRollover() {
    // Fetch the finishing-encounter counts on demand (kept off the load path so
    // it doesn't interfere with the main events list fetch).
    let pv: RolloverPreview | null = null;
    try {
      pv = await apiFetch<RolloverPreview>('/admin/events/rollover/preview');
      setPreview(pv);
    } catch { setPreview(null); }
    // Default to the encounter that actually comes next: spring -> fall of the
    // same year, fall -> spring of the next one.
    const sy = pv?.suggested_year
      ?? (currentEvent ? (currentEvent.season === 'spring' ? currentEvent.year : currentEvent.year + 1) : new Date().getFullYear() + 1);
    const ss = pv?.suggested_season
      ?? (currentEvent?.season === 'spring' ? 'fall' : 'spring');
    setRolloverForm({ ...emptyForm(), year: String(sy), season: ss });
    setConfirmYear('');
    setForce(false);
    setNotifyInterest(true);
    setRolloverError(null);
    setRolloverDone(null);
    setRolloverOpen(true);
  }

  async function handleRollover(e: React.FormEvent) {
    e.preventDefault();
    setRollingOver(true);
    setRolloverError(null);

    const payload = {
      year: Number(rolloverForm.year),
      season: rolloverForm.season,
      notify_interest: notifyInterest,
      title: rolloverForm.title || undefined,
      start_date: rolloverForm.start_date || undefined,
      end_date: rolloverForm.end_date || undefined,
      launch_locations: rolloverForm.launch_locations
        ? rolloverForm.launch_locations.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      attendee_registration_open: rolloverForm.attendee_registration_open,
      server_registration_open: rolloverForm.server_registration_open,
      attendee_limit: rolloverForm.attendee_limit.trim() === '' ? null : Number(rolloverForm.attendee_limit),
      attendee_full_message: rolloverForm.attendee_full_message.trim() || null,
      confirm_year: Number(confirmYear),
      force,
    };

    try {
      const res = await apiFetch<{
        ok: boolean; archived_count: number; new_event: NwksEvent;
        interest_notified: number; interest_failed: number;
        interest_errors: { email: string; error: string }[];
      }>(
        '/admin/events/rollover',
        { method: 'POST', body: JSON.stringify(payload) },
      );
      setRolloverOpen(false);

      const parts = [
        `Archived ${res.archived_count} board item(s) to ${preview?.current ? encounterName(preview.current) : 'the last encounter'}.`,
        `${encounterName(res.new_event)} is now the current encounter.`,
      ];
      if (res.interest_notified > 0) {
        parts.push(`Emailed ${res.interest_notified} ${res.interest_notified === 1 ? 'person' : 'people'} on the interest list.`);
      }
      // A partly-sent blast must never read as a clean one.
      if (res.interest_failed > 0) {
        parts.push(
          `⚠ ${res.interest_failed} invite(s) did NOT send and are still waiting — ` +
          `${res.interest_errors.map((e) => e.email).join(', ')}. Re-run the rollover notification to retry.`
        );
      }
      setRolloverDone(parts.join(' '));
      await loadEvents();
    } catch (err: unknown) {
      setRolloverError(err instanceof Error ? err.message : 'Rollover failed');
    } finally {
      setRollingOver(false);
    }
  }

  const programLabel = program === 'mens' ? "Men's" : "Women's";
  const currentEvent = events.find((e) => e.is_current) ?? null;
  const currentEnded = !currentEvent?.end_date || currentEvent.end_date < new Date().toISOString().slice(0, 10);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const formLabel = editId !== null ? 'Edit event' : 'New event';

  return (
    <div className="space-y-6">
      {/* Header — the Men's + Women's lockup sits with the title because this
          page manages the encounters for BOTH programs, not just the themed one.
          flex-wrap so the action buttons drop to their own line instead of
          squeezing the lockup once the content column gets narrow. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        {/* flex-wrap here too: the shell's fixed 14rem sidebar leaves a very
            narrow content column on a phone, so the title drops under the
            lockup rather than being clipped off the right edge. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
          <EncounterLogos />
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
            Events
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {currentEvent && (
            <button
              onClick={openRollover}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: 'var(--color-primary)' }}
            >
              Start Next Encounter →
            </button>
          )}
          <button
            onClick={openCreate}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'var(--color-secondary)' }}
          >
            + New Event
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 text-red-700 rounded">
          {error}
        </div>
      )}

      {/* Rollover success banner */}
      {rolloverDone && (
        <div role="status" className="p-3 bg-green-50 border border-green-300 text-green-800 rounded">
          {rolloverDone}
        </div>
      )}

      {/* Rollover panel — "Start Next Encounter" */}
      {rolloverOpen && currentEvent && (
        <RolloverDialog
          programLabel={programLabel}
          currentEvent={currentEvent}
          currentEnded={currentEnded}
          preview={preview}
          form={rolloverForm}
          setForm={setRolloverForm}
          confirmYear={confirmYear}
          setConfirmYear={setConfirmYear}
          force={force}
          setForce={setForce}
          notifyInterest={notifyInterest}
          setNotifyInterest={setNotifyInterest}
          busy={rollingOver}
          error={rolloverError}
          onSubmit={handleRollover}
          onCancel={() => setRolloverOpen(false)}
        />
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
        <EventForm
          form={form}
          setForm={setForm}
          editId={editId}
          formLabel={formLabel}
          programLabel={programLabel}
          saving={saving}
          formError={formError}
          onSubmit={handleSubmit}
          closeForm={closeForm}
        />
      )}

      {/* Enrollment for the encounter that's actually taking sign-ups */}
      {currentEvent && !formOpen && !rolloverOpen && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            {encounterName(currentEvent)} — enrollment
          </h2>
          <EnrollmentControl
            eventId={currentEvent.id}
            attendeeOpen={currentEvent.attendee_registration_open === 1}
            serverOpen={currentEvent.server_registration_open === 1}
            registeredCount={currentCounts.registered}
            attendeeLimit={currentEvent.attendee_limit}
            interestCount={currentCounts.interest}
            onChanged={async () => { await loadEvents(); await loadCurrentCounts(); }}
          />
        </section>
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
              <th className="p-2 border">Encounter</th>
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
                <td className="p-2 border font-medium">{encounterName(ev)}</td>
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
                      aria-label={`Make ${encounterName(ev)} current`}
                    >
                      Make Current
                    </button>
                  )}
                </td>
                <td className="p-2 border">
                  <button
                    onClick={() => openEdit(ev)}
                    className="text-xs px-2 py-1 border rounded hover:bg-gray-100"
                    aria-label={`Edit ${encounterName(ev)} event`}
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
