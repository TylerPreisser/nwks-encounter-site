import { useState } from 'react';
import { type NwksEvent, encounterName, parseLaunchLocations } from '@/types/events';

interface Props {
  /** Every encounter except the current one, newest first. */
  events: NwksEvent[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

/**
 * History, folded away.
 *
 * Old encounters are reference material, not the job — they used to sit in the
 * same table as the upcoming one, so the page opened on a wall of finished
 * events. Rows are pickers only: choosing one loads it into the control panel
 * above, which is where Edit and Make Current live, so there is exactly one
 * place to act on an encounter.
 */
export default function PastEncounters({ events, selectedId, onSelect }: Props) {
  const [open, setOpen] = useState(false);

  if (events.length === 0) return null;

  // "Not current" is almost always "already happened" — the rollover makes the
  // new encounter current the moment it creates it. An encounter created by
  // hand and not promoted is the exception, and gets called out so the list
  // never quietly files a future encounter under history.
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="toggle-past-encounters"
        className="text-sm font-semibold flex items-center gap-2 hover:opacity-80 transition-opacity"
        style={{ color: 'var(--color-primary)' }}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        {open ? 'Hide' : 'Show'} past encounters ({events.length})
      </button>

      {open && (
        <ul className="space-y-2" data-testid="past-encounters-list">
          {events.map((ev) => {
            const name = encounterName(ev);
            const isSelected = ev.id === selectedId;
            return (
              <li key={ev.id}>
                <button
                  type="button"
                  onClick={() => onSelect(ev.id)}
                  aria-label={`View ${name}`}
                  aria-current={isSelected ? 'true' : undefined}
                  className={
                    'w-full text-left rounded-xl p-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 ' +
                    'hover:bg-gray-50 transition-colors'
                  }
                  style={{
                    background: 'var(--color-surface)',
                    // Border width is constant so selecting a row doesn't nudge
                    // the list; only the colour changes.
                    border: `2px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-bg)'}`,
                  }}
                >
                  <span className="font-semibold text-sm" style={{ color: 'var(--color-primary)' }}>
                    {name}
                  </span>
                  <span className="text-xs text-gray-500">
                    {ev.start_date ?? '?'} – {ev.end_date ?? '?'}
                  </span>
                  <span className="text-xs text-gray-400">
                    {parseLaunchLocations(ev.launch_locations).join(', ') || 'no launch locations'}
                  </span>
                  {ev.end_date != null && ev.end_date >= today && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800">
                      Hasn&rsquo;t happened yet
                    </span>
                  )}
                  <span
                    className="text-xs font-semibold ml-auto"
                    style={{ color: 'var(--color-secondary)' }}
                  >
                    {isSelected ? 'Showing above' : 'View →'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
