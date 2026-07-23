import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '@/api';
import { useProgram } from '@/App';
import PersonBadges from '@/components/PersonBadges';
import MergeDialog from '@/components/MergeDialog';

interface Person {
  id: number; first_name: string; last_name: string;
  email?: string | null; phone?: string | null;
  church?: string | null; city?: string | null; state?: string | null;
  times_attended: number; times_served: number;
}
interface Badges { times_attended: number; times_served: number; is_first_timer: boolean }
interface HistoryItem { id: number; event_id: number; role: string; year: number; title: string | null; created_at: string }
interface ProfileResponse {
  ok: boolean;
  person: Person;
  badges: Badges;
  history: HistoryItem[];
  possible_duplicates: Person[];
}

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const { program } = useProgram();
  const navigate = useNavigate();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<Person | null>(null);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    setData(null); setError(null);
    apiFetch<ProfileResponse>(`/admin/people/${id}`)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [id, program]);

  async function handleMerge() {
    if (!mergeTarget || !data) return;
    setMerging(true);
    try {
      await apiFetch(`/admin/people/${data.person.id}/merge`, {
        method: 'POST',
        body: JSON.stringify({ into_id: mergeTarget.id }),
      });
      setMergeTarget(null);
      navigate(`/admin/people/${mergeTarget.id}`, { replace: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Merge failed');
    } finally {
      setMerging(false);
    }
  }

  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!data) return <p className="text-gray-400 text-sm animate-pulse">Loading…</p>;

  const { person, badges, history, possible_duplicates } = data;

  return (
    <div className="max-w-2xl space-y-8">
      {/* Profile card */}
      <section className="rounded-2xl shadow-sm border border-gray-100 p-6" style={{ background: 'var(--color-surface)' }}>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
          {person.first_name} {person.last_name}
        </h1>
        <PersonBadges
          timesAttended={badges.times_attended}
          timesServed={badges.times_served}
          isFirstTimer={badges.is_first_timer}
        />
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {([
            ['Email', person.email],
            ['Phone', person.phone],
            ['Church', person.church],
            ['City/State', [person.city, person.state].filter(Boolean).join(', ')],
          ] as [string, string | null | undefined][]).map(([label, val]) =>
            val ? (
              <div key={label}>
                <dt className="text-xs text-gray-400 uppercase tracking-wide">{label}</dt>
                <dd className="font-medium text-gray-700">{val}</dd>
              </div>
            ) : null
          )}
        </dl>
      </section>

      {/* Event history timeline */}
      {history.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Event History</h2>
          <ul className="space-y-2">
            {history.map((h) => (
              <li
                key={h.id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm border border-gray-100 shadow-sm"
                style={{ background: 'var(--color-surface)' }}
              >
                <span className="font-medium text-gray-800">{h.title ?? `Event ${h.event_id}`}</span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full text-white"
                  style={{ background: h.role === 'server' ? 'var(--color-secondary)' : 'var(--color-accent)' }}
                >
                  {h.role}
                </span>
                <span className="ml-auto text-xs text-gray-400">{h.year}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Possible duplicates */}
      {possible_duplicates.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Possible Duplicate{possible_duplicates.length > 1 ? 's' : ''}
          </h2>
          <ul className="space-y-2">
            {possible_duplicates.map((dup) => (
              <li
                key={dup.id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-yellow-100 bg-yellow-50 text-sm"
              >
                <span className="font-medium text-gray-800">{dup.first_name} {dup.last_name}</span>
                {dup.email && <span className="text-gray-500">{dup.email}</span>}
                <button
                  onClick={() => setMergeTarget(dup)}
                  className="ml-auto text-xs font-semibold text-white px-3 py-1 rounded-lg"
                  style={{ background: 'var(--color-primary)' }}
                >
                  Merge into this person
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Merge dialog */}
      {mergeTarget && (
        <MergeDialog
          source={mergeTarget}
          target={person}
          loading={merging}
          onConfirm={handleMerge}
          onCancel={() => setMergeTarget(null)}
        />
      )}
    </div>
  );
}
