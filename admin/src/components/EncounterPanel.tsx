import type { ReactNode } from 'react';
import { type NwksEvent, encounterName, parseLaunchLocations } from '@/types/events';

interface Props {
  event: NwksEvent;
  /**
   * Confirmed attendee registrations. Only the encounter that is actually
   * taking sign-ups has a count, so this is null for every other one — a stale
   * or borrowed number here would read as fact.
   */
  registeredCount: number | null;
  onEdit: (ev: NwksEvent) => void;
  onMakeCurrent: (id: number) => void;
  /**
   * The live enrollment controls. Only the current encounter takes sign-ups, so
   * this is absent otherwise and the panel falls back to a read-only state.
   */
  enrollment?: ReactNode;
}

/** Small status chip. Green = open/current, grey = closed/inactive. */
function Pill({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span
      className={
        'text-xs px-2 py-0.5 rounded-full font-medium ' +
        (on ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600')
      }
    >
      {children}
    </span>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-1 text-sm text-gray-700">{children}</dd>
    </div>
  );
}

/**
 * The control panel for ONE encounter — what it is, how full it is, and every
 * lever that acts on it.
 *
 * This replaced a seven-column table of every encounter. A table made the
 * operator scan rows to answer the only question they actually have ("is the
 * upcoming Encounter open, and how full is it?"), and buried the controls in
 * the last two columns.
 */
export default function EncounterPanel({
  event, registeredCount, onEdit, onMakeCurrent, enrollment,
}: Props) {
  const name = encounterName(event);
  const isCurrent = event.is_current === 1;
  const locations = parseLaunchLocations(event.launch_locations);
  const limit = event.attendee_limit;

  const attendees = registeredCount == null
    ? (limit != null ? `— of ${limit}` : '—')
    : `${registeredCount}${limit != null ? ` of ${limit}` : ' registered'}`;

  return (
    <section
      aria-label={`${name} control panel`}
      data-testid="encounter-panel"
      className="rounded-2xl border p-5 shadow-sm space-y-5"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-accent)' }}
    >
      {/* Identity + the actions that act on the whole encounter */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
              {name}
            </h2>
            {isCurrent ? (
              <span
                data-testid="current-badge"
                className="text-xs px-2 py-0.5 rounded-full font-semibold bg-green-100 text-green-800"
              >
                ✓ Current
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onMakeCurrent(event.id)}
                aria-label={`Make ${name} current`}
                className="text-xs px-2.5 py-1 rounded-lg border font-semibold hover:bg-gray-50"
                style={{ color: 'var(--color-primary)', borderColor: 'var(--color-primary)' }}
              >
                Make Current
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">{event.title ?? '—'}</p>
        </div>

        <button
          type="button"
          onClick={() => onEdit(event)}
          aria-label={`Edit ${name} event`}
          className="text-sm px-3 py-1.5 rounded-lg border font-semibold hover:opacity-80 transition-opacity"
          style={{ color: 'var(--color-secondary)', borderColor: 'var(--color-secondary)' }}
        >
          Edit
        </button>
      </div>

      {/* The three facts the operator is actually here to check. auto-fit so the
          row reflows instead of clipping when the content column is narrow;
          capped so the three don't drift to opposite ends of a wide desktop. */}
      <dl
        className="grid gap-6"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))', maxWidth: '46rem' }}
      >
        <Fact label="Dates">
          {event.start_date ?? '?'} – {event.end_date ?? '?'}
        </Fact>
        <Fact label="Launch locations">{locations.join(', ') || '—'}</Fact>
        <Fact label="Attendees">
          <span data-testid="panel-attendees">{attendees}</span>
        </Fact>
      </dl>

      <div className="border-t pt-4 space-y-3" style={{ borderColor: 'var(--color-bg)' }}>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Enrollment</h3>
        {enrollment ?? (
          // No live controls: this encounter isn't the one taking sign-ups, so
          // its flags are shown as state and changed through Edit.
          <div className="space-y-2" data-testid="panel-enrollment-readonly">
            <div className="flex flex-wrap gap-2">
              <Pill on={event.attendee_registration_open === 1}>
                Attendees {event.attendee_registration_open ? 'open' : 'closed'}
              </Pill>
              <Pill on={event.server_registration_open === 1}>
                Servers {event.server_registration_open ? 'open' : 'closed'}
              </Pill>
            </div>
            {!isCurrent && (
              <p className="text-xs text-gray-500">
                Only the current encounter takes sign-ups. Make this one current, or use Edit to
                change its registration flags.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
