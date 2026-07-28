import { useEffect, useState } from 'react';
import { listEncounters, type EncounterSummary } from '@/api';

type EncounterOption = EncounterSummary;

/**
 * Year switcher for navigating past/current encounters. Loads the program's
 * events and renders a dropdown whose option values are event ids. On first
 * load it defaults the selection to the current encounter.
 *
 * Remount per program (pass key={program}) so it reloads + re-defaults when the
 * active program changes.
 */
export function EncounterYearSelect({
  value,
  onChange,
  includeAll = false,
  className,
}: {
  value: number | null;
  onChange: (eventId: number | null, isCurrent: boolean) => void;
  includeAll?: boolean;
  className?: string;
}) {
  const [events, setEvents] = useState<EncounterOption[]>([]);

  useEffect(() => {
    let off = false;
    // Resilient: a failed/empty encounters load must never crash the host page.
    Promise.resolve(listEncounters())
      .then((list) => {
        if (off) return;
        const evs = (Array.isArray(list) ? list : []).slice().sort((a, b) => b.year - a.year);
        setEvents(evs);
        if (value == null) {
          const cur = evs.find((e) => e.is_current);
          if (cur) onChange(cur.id, true);
        }
      })
      .catch(() => setEvents([]));
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <select
      aria-label="Encounter year"
      value={value == null ? '' : String(value)}
      onChange={(e) => {
        const id = e.target.value === '' ? null : Number(e.target.value);
        const ev = events.find((x) => x.id === id);
        onChange(id, ev ? ev.is_current === 1 : false);
      }}
      className={className ?? 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2'}
    >
      {includeAll && <option value="">All years</option>}
      {events.map((e) => (
        <option key={e.id} value={e.id}>
          {e.year}{e.is_current ? ' (current)' : ''}
        </option>
      ))}
    </select>
  );
}
