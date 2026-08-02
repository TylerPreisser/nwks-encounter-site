import { useEffect, useState } from 'react';
import { apiFetch } from '@/api';
import { useProgram } from '@/App';
import StatCard from '@/components/StatCard';
import TestimonyAlertTile from '@/components/TestimonyAlertTile';
import UpcomingEncounterTile from '@/components/UpcomingEncounterTile';

interface Stats {
  attendee_count: number;
  server_count: number;
  first_timers: number;
  email_sent_count: number;
  by_launch_location: Array<{ location: string; count: number }>;
  by_shirt_size: Array<{ size: string; count: number }>;
  recent_registrations: Array<{
    id: number;
    first_name: string;
    last_name: string;
    role: string;
    created_at: string;
  }>;
  upcoming_event: {
    title: string | null;
    start_date: string | null;
    end_date: string | null;
  } | null;
}

/** null = still loading, 'error' = the count could not be fetched. */
type TestimonyCount = number | null | 'error';

export default function DashboardPage() {
  const { program } = useProgram();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testimonyCount, setTestimonyCount] = useState<TestimonyCount>(null);

  useEffect(() => {
    setStats(null);
    setError(null);
    apiFetch<{ ok: boolean; stats: Stats }>('/admin/dashboard')
      .then((res) => setStats(res.stats))
      .catch((err: Error) => setError(err.message));
  }, [program]);

  // Same endpoint the nav badge uses, so the two can never disagree. The
  // dashboard payload also carries an inbox_count, but that is a second,
  // hand-duplicated implementation of this query — deliberately unused.
  useEffect(() => {
    let cancelled = false;
    setTestimonyCount(null);
    apiFetch<{ ok: boolean; program_new: number; unassigned_new: number }>(
      '/admin/testimonies/new-count',
    )
      .then((res) => {
        if (!cancelled) setTestimonyCount((res.program_new ?? 0) + (res.unassigned_new ?? 0));
      })
      .catch((err: Error) => {
        // Surfaced in the tile rather than swallowed: a silent 0 would read as
        // "all caught up" when submissions may in fact be waiting.
        console.warn('[dashboard] testimony count failed:', err.message);
        if (!cancelled) setTestimonyCount('error');
      });
    return () => { cancelled = true; };
  }, [program]);

  if (error) {
    return <p role="alert" className="text-red-600 text-sm">{error}</p>;
  }

  if (!stats) {
    return <p className="text-gray-400 text-sm animate-pulse">Loading…</p>;
  }

  const locationMax = Math.max(...stats.by_launch_location.map((l) => l.count), 1);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
        {stats.upcoming_event?.title ?? 'Dashboard'}
        {stats.upcoming_event?.start_date && (
          <span className="ml-3 text-base font-normal text-gray-400">
            {stats.upcoming_event.start_date} – {stats.upcoming_event.end_date}
          </span>
        )}
      </h1>

      {/* ── Upcoming Encounter quick-edit tile ────────────────── */}
      <UpcomingEncounterTile />

      {/* ── Testimony arrivals monitor ────────────────────────── */}
      <TestimonyAlertTile count={testimonyCount} />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Attendees"    value={stats.attendee_count} />
        <StatCard label="Servers"      value={stats.server_count} />
        <StatCard label="First-timers" value={stats.first_timers} />
        <StatCard label="Emails sent"  value={stats.email_sent_count} />
      </div>

      {/* Launch locations */}
      {stats.by_launch_location.length > 0 && (
        <section aria-label="By Launch Location">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            By Launch Location
          </h2>
          <div className="space-y-2">
            {stats.by_launch_location.map(({ location, count }) => (
              <div key={location} className="flex items-center gap-3">
                <span className="w-28 text-sm text-gray-700 truncate">{location}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(count / locationMax) * 100}%`,
                      background: 'var(--color-accent)',
                    }}
                  />
                </div>
                <span className="w-8 text-right text-sm font-semibold text-gray-600">{count}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Shirt sizes */}
      {stats.by_shirt_size.length > 0 && (
        <section aria-label="Shirt Sizes">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Shirt Sizes
          </h2>
          <div className="flex flex-wrap gap-2">
            {stats.by_shirt_size.map(({ size, count }) => (
              <span
                key={size}
                className="px-3 py-1 rounded-full text-sm font-semibold text-white"
                style={{ background: 'var(--color-secondary)' }}
              >
                {size}: {count}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Recent registrations */}
      {stats.recent_registrations.length > 0 && (
        <section aria-label="Recent Registrations">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Recent Registrations
          </h2>
          <ul className="divide-y divide-gray-100 rounded-xl overflow-hidden shadow-sm border border-gray-100">
            {stats.recent_registrations.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 px-4 py-3 text-sm"
                style={{ background: 'var(--color-surface)' }}
              >
                <span className="font-medium text-gray-800">
                  {r.first_name} {r.last_name}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                  {r.role}
                </span>
                <span className="ml-auto text-xs text-gray-400">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
