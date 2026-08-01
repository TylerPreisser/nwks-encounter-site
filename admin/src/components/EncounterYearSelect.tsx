import { useEffect, useState } from 'react';
import { listEncounters, type EncounterSummary } from '@/api';

type EncounterOption = EncounterSummary;

/**
 * "Fall 2026". Prefers the server-derived display_name; falls back to composing
 * it locally so an older cached response still labels sensibly.
 */
function encounterLabel(e: EncounterOption): string {
  if (e.display_name) return e.display_name;
  if (e.season) return `${e.season === 'fall' ? 'Fall' : 'Spring'} ${e.year}`;
  return String(e.year);
}

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
  /** `label` is the human name ("Fall 2026") — callers use it for headings and back links. */
  onChange: (eventId: number | null, isCurrent: boolean, label?: string) => void;
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
          if (cur) onChange(cur.id, true, encounterLabel(cur));
        }
      })
      .catch(() => setEvents([]));
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <select
      aria-label="Encounter"
      value={value == null ? '' : String(value)}
      onChange={(e) => {
        const id = e.target.value === '' ? null : Number(e.target.value);
        const ev = events.find((x) => x.id === id);
        onChange(id, ev ? ev.is_current === 1 : false, ev ? encounterLabel(ev) : undefined);
      }}
      className={className ?? 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2'}
    >
      {includeAll && <option value="">All encounters</option>}
      {events.map((e) => (
        <option key={e.id} value={e.id}>
          {encounterLabel(e)}{e.is_current ? ' (current)' : ''}
        </option>
      ))}
    </select>
  );
}
