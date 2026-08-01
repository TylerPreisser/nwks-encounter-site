// functions/_api/seasons.ts
// One source of truth for encounter seasons.
//
// NWKS runs two encounters per program per year: a spring one and a fall one.
// An encounter is identified by (program, year, season) — see migration
// 0026_encounter_seasons.sql. Everything about how a season is validated,
// ordered, named, and advanced lives here so the rules can't drift between the
// admin API, the public API, and the rollover.

export const SEASONS = ['spring', 'fall'] as const;
export type Season = (typeof SEASONS)[number];

/** Narrows unknown input (query params, JSON bodies) to a Season. */
export function isSeason(value: unknown): value is Season {
  return value === 'spring' || value === 'fall';
}

/**
 * SQL ordering fragment placing the most recent encounter first.
 *
 * A plain `season DESC` sorts ALPHABETICALLY, which puts 'spring' above 'fall'
 * and silently reverses every encounter list. Ordering must always go through
 * this explicit ordinal.
 */
export const ORDER_RECENT_FIRST =
  `year DESC, CASE season WHEN 'fall' THEN 1 ELSE 0 END DESC`;

/** "Spring 2026" / "Fall 2026". Derived for display; never stored. */
export function displayName(year: number, season: Season | string): string {
  const label = season === 'fall' ? 'Fall' : 'Spring';
  return `${label} ${year}`;
}

/**
 * The encounter that follows this one in the calendar:
 *   spring 2027 -> fall 2027   (same year)
 *   fall   2026 -> spring 2027 (next year)
 */
export function nextSeason(
  year: number,
  season: Season | string
): { year: number; season: Season } {
  return season === 'spring'
    ? { year, season: 'fall' }
    : { year: year + 1, season: 'spring' };
}

/** Row shape shared by every events query — whatever else the row carries. */
type EventRow = Record<string, unknown> & { year: number; season: string };

/**
 * Attaches the derived `display_name` to an event row before it goes over the
 * wire. Every response that returns an event goes through this, so the admin
 * and public clients never have to rebuild the label themselves.
 */
export function withDisplayName<T extends EventRow>(row: T): T & { display_name: string };
export function withDisplayName(row: null | undefined): null;
export function withDisplayName<T extends EventRow>(
  row: T | null | undefined
): (T & { display_name: string }) | null {
  if (!row) return null;
  return { ...row, display_name: displayName(row.year, row.season) };
}
