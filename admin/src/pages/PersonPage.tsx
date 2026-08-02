import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { apiFetch } from '@/api';
import { useProgram } from '@/App';
import PersonBadges from '@/components/PersonBadges';
import MergeDialog from '@/components/MergeDialog';
import RegistrationDetail from '@/components/RegistrationDetail';
import PersonTestimonies from '@/components/PersonTestimonies';
import type { PersonTestimony } from '@/components/PersonTestimonies';
import type { RegistrationRow } from '@/components/registrationFields';

interface Person {
  id: number; first_name: string; last_name: string;
  email?: string | null; phone?: string | null;
  church?: string | null; city?: string | null; state?: string | null;
  times_attended: number; times_served: number;
}
interface Badges { times_attended: number; times_served: number; is_first_timer: boolean }
interface ProfileResponse {
  ok: boolean;
  person: Person;
  badges: Badges;
  history: RegistrationRow[];
  possible_duplicates: Person[];
  /** Optional so a cached/older API response can't blank the page. */
  testimonies?: PersonTestimony[];
}

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const { program } = useProgram();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<Person | null>(null);
  const [merging, setMerging] = useState(false);

  // Arriving from a roster row deep-links the registration that was clicked:
  // ?reg=<id> expands it, ?from=<path>&fromLabel=<text> draws the back button.
  const focusedReg = params.get('reg') ? Number(params.get('reg')) : null;
  const backTo = params.get('from');
  const backLabel = params.get('fromLabel') ?? 'the roster';

  const [expandedReg, setExpandedReg] = useState<number | null>(focusedReg);
  useEffect(() => { setExpandedReg(focusedReg); }, [focusedReg]);

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
      navigate(`/people/${mergeTarget.id}`, { replace: true });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Merge failed');
    } finally {
      setMerging(false);
    }
  }

  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!data) return <p className="text-gray-400 text-sm animate-pulse">Loading…</p>;

  const { person, badges, history, possible_duplicates, testimonies } = data;

  // The registration they clicked in from sorts to the top; the rest of the
  // person's history follows underneath.
  const orderedHistory = focusedReg
    ? [...history].sort((a, b) => Number(b.id === focusedReg) - Number(a.id === focusedReg))
    : history;

  return (
    <div className="max-w-2xl space-y-8">
      {backTo && (
        <Link
          to={backTo}
          className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
          style={{ color: 'var(--color-primary)' }}
        >
          <span aria-hidden="true">←</span> Back to {backLabel}
        </Link>
      )}

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
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {focusedReg ? 'Registrations' : 'Event History'}
          </h2>
          <ul className="space-y-2">
            {orderedHistory.map((h) => (
              <RegistrationDetail
                key={h.id}
                reg={h}
                expanded={expandedReg === h.id}
                highlighted={focusedReg === h.id}
                onToggle={() => setExpandedReg(expandedReg === h.id ? null : h.id)}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Their emailed-in testimonies & teachings */}
      <PersonTestimonies testimonies={testimonies ?? []} />

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
