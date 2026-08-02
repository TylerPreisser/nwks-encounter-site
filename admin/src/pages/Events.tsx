import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/api';
import { useProgram } from '@/App';
import EnrollmentControl from '@/components/EnrollmentControl';
import RolloverDialog from '@/components/RolloverDialog';
import EventForm from '@/components/EventForm';
import EncounterPanel from '@/components/EncounterPanel';
import PastEncounters from '@/components/PastEncounters';
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

  /**
   * Which encounter the panel is showing. Page-local on purpose: picking one
   * here changes THIS page only.
   * TODO(cross-page): to make the choice follow the operator into the roster,
   * the board and the dashboard, lift this into a shared encounter context
   * (alongside ProgramContext in App.tsx) and have those pages read from it.
   */
  const [selectedId, setSelectedId] = useState<number | null>(null);

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

  const currentEvent = events.find((e) => e.is_current) ?? null;
  const selectedEvent = events.find((e) => e.id === selectedId) ?? null;

  // Keep the selection pointing at a real row. Covers the first load and a
  // program switch, where the previous selection belongs to the other program's
  // events and would otherwise leave the panel blank.
  useEffect(() => {
    if (events.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!events.some((e) => e.id === selectedId)) {
      setSelectedId((currentEvent ?? events[0]).id);
    }
  }, [events, selectedId, currentEvent]);

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
  const currentEnded = !currentEvent?.end_date || currentEvent.end_date < new Date().toISOString().slice(0, 10);

  // Newest first — history reads backwards from now. Fall outranks Spring
  // within a year because NWKS runs Spring then Fall.
  const seasonRank = (e: NwksEvent) => (e.season === 'fall' ? 1 : 0);
  const pastEvents = events
    .filter((e) => !e.is_current)
    .slice()
    .sort((a, b) => (b.year - a.year) || (seasonRank(b) - seasonRank(a)));

  // The picker leads with the encounter that's live, then history.
  const pickerEvents = currentEvent ? [currentEvent, ...pastEvents] : pastEvents;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const formLabel = editId !== null ? 'Edit event' : 'New event';

  return (
    <div className="space-y-6">
      {/* Header — the title matches the nav ("Upcoming Encounter"), and the
          picker sits with it because switching encounters is navigation, not an
          action. flex-wrap so the buttons drop to their own line instead of
          squeezing the picker once the content column gets narrow. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
            Upcoming Encounter
          </h1>
          {pickerEvents.length > 0 && (
            <select
              aria-label="Encounter"
              data-testid="encounter-picker"
              value={selectedId == null ? '' : String(selectedId)}
              onChange={(e) => setSelectedId(Number(e.target.value))}
              className="rounded-lg border px-3 py-1.5 text-sm font-medium bg-white"
              style={{ borderColor: 'var(--color-accent)', color: 'var(--color-primary)' }}
            >
              {pickerEvents.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {encounterName(ev)}{ev.is_current ? ' (current)' : ''}
                </option>
              ))}
            </select>
          )}
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

      {/* The control panel — one encounter, everything that acts on it */}
      {loading ? (
        <p className="text-gray-400 text-sm animate-pulse">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-gray-500">No events yet. Create one above.</p>
      ) : selectedEvent ? (
        <>
          <EncounterPanel
            event={selectedEvent}
            // Only the current encounter's counts are fetched, so any other
            // encounter shows no number rather than a borrowed one.
            registeredCount={selectedEvent.is_current ? currentCounts.registered : null}
            onEdit={openEdit}
            onMakeCurrent={handleSetCurrent}
            enrollment={
              // Live toggles belong to the encounter taking sign-ups, and are
              // stood down while a form or the rollover owns the page.
              selectedEvent.is_current && !formOpen && !rolloverOpen ? (
                <EnrollmentControl
                  eventId={selectedEvent.id}
                  attendeeOpen={selectedEvent.attendee_registration_open === 1}
                  serverOpen={selectedEvent.server_registration_open === 1}
                  registeredCount={currentCounts.registered}
                  attendeeLimit={selectedEvent.attendee_limit}
                  interestCount={currentCounts.interest}
                  onChanged={async () => { await loadEvents(); await loadCurrentCounts(); }}
                />
              ) : undefined
            }
          />

          <PastEncounters
            events={pastEvents}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </>
      ) : null}
    </div>
  );
}
