import { useState } from 'react';
import { apiFetch } from '@/api';

interface Props {
  eventId: number;
  attendeeOpen: boolean;
  serverOpen: boolean;
  /** Confirmed attendee registrations, for the count against the cap. */
  registeredCount: number;
  attendeeLimit: number | null;
  /** People waiting on this encounter's Express Interest queue. */
  interestCount: number;
  onChanged: () => void | Promise<void>;
}

/**
 * Open/close enrollment for one encounter, in one click, with the numbers that
 * make the decision: how full it is, and how many people are already waiting.
 *
 * These toggles previously lived only inside the event edit form, which meant
 * closing enrollment was a five-click errand. Closing by hand is deliberately
 * indistinguishable from hitting the cap: the public site swaps Register for
 * Express Interest either way.
 */
export default function EnrollmentControl({
  eventId, attendeeOpen, serverOpen, registeredCount, attendeeLimit, interestCount, onChanged,
}: Props) {
  const [busy, setBusy] = useState<'attendee' | 'server' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const atCap = attendeeLimit != null && registeredCount >= attendeeLimit;
  // What the PUBLIC sees — the toggle alone doesn't decide this.
  const effectivelyOpen = attendeeOpen && !atCap;

  async function toggle(which: 'attendee' | 'server', next: boolean) {
    setBusy(which);
    setError(null);
    try {
      await apiFetch(`/admin/events/${eventId}/enrollment`, {
        method: 'POST',
        body: JSON.stringify(which === 'attendee' ? { attendee_open: next } : { server_open: next }),
      });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change enrollment');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-gray-100 p-4 space-y-3" style={{ background: 'var(--color-bg)' }}>
      <div className="flex items-baseline gap-2 flex-wrap text-sm">
        <span className="font-semibold text-gray-700">Attendees</span>
        <span className="text-gray-500" data-testid="enrollment-count">
          {registeredCount}{attendeeLimit != null ? ` of ${attendeeLimit}` : ' registered'}
        </span>
        <span
          data-testid="enrollment-state"
          className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={
            effectivelyOpen
              ? { background: '#dcfce7', color: '#166534' }
              : { background: '#fee2e2', color: '#991b1b' }
          }
        >
          {effectivelyOpen ? 'Open' : atCap && attendeeOpen ? 'Full' : 'Closed'}
        </span>
      </div>

      {atCap && attendeeOpen && (
        <p className="text-xs text-gray-500">
          At capacity — the public site is already showing Express Interest.
        </p>
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void toggle('attendee', !attendeeOpen)}
          data-testid="toggle-attendee-enrollment"
          className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: attendeeOpen ? 'var(--color-secondary)' : 'var(--color-primary)' }}
        >
          {busy === 'attendee'
            ? 'Saving…'
            : attendeeOpen ? 'Close attendee enrollment' : 'Reopen attendee enrollment'}
        </button>

        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void toggle('server', !serverOpen)}
          data-testid="toggle-server-enrollment"
          className="px-3 py-1.5 rounded-lg text-sm font-semibold border disabled:opacity-60"
          style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
        >
          {busy === 'server'
            ? 'Saving…'
            : serverOpen ? 'Close server sign-ups' : 'Reopen server sign-ups'}
        </button>
      </div>

      {interestCount > 0 && (
        <p className="text-xs text-gray-600" data-testid="interest-count">
          <strong>{interestCount}</strong>{' '}
          {interestCount === 1 ? 'person has' : 'people have'} expressed interest in the next
          Encounter. They&rsquo;ll be emailed automatically when you start it.
        </p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
