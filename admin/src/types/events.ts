// admin/src/types/events.ts
// Shared encounter shapes. Extracted from the Events page so the rollover
// dialog and the enrollment control can be understood (and tested) without
// pulling in the whole page.

export interface NwksEvent {
  id: number;
  program: string;
  year: number;
  /** 'spring' | 'fall' — NWKS runs two encounters a year per program. */
  season: string;
  /** Server-derived "Fall 2026". */
  display_name?: string;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  /** Raw JSON string from the API. */
  launch_locations: string;
  attendee_registration_open: number;
  server_registration_open: number;
  attendee_limit: number | null;
  attendee_full_message: string | null;
  is_current: number;
}

export interface EventFormState {
  year: string;
  season: 'spring' | 'fall';
  title: string;
  start_date: string;
  end_date: string;
  /** Comma-separated for the UI; split on submit. */
  launch_locations: string;
  attendee_registration_open: boolean;
  server_registration_open: boolean;
  /** '' means no cap. */
  attendee_limit: string;
  attendee_full_message: string;
}

export interface RolloverPreview {
  current: NwksEvent | null;
  registered_count: number;
  board_count: number;
  /** People on the finishing encounter's waitlist — the rollover emails them. */
  interest_count: number;
  ended: boolean;
  suggested_year: number;
  suggested_season: 'spring' | 'fall';
}

/** "Fall 2026" for any event-ish row, preferring the server-derived name. */
export function encounterName(ev: {
  year: number;
  season?: string;
  display_name?: string;
}): string {
  if (ev.display_name) return ev.display_name;
  return `${ev.season === 'fall' ? 'Fall' : 'Spring'} ${ev.year}`;
}

export function emptyEventForm(): EventFormState {
  return {
    year: String(new Date().getFullYear()),
    season: 'spring',
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

export function parseLaunchLocations(raw: string): string[] {
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}
