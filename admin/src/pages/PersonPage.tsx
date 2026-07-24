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
interface RegistrationRow {
  id: number;
  event_id: number;
  role: string;
  year: number;
  title: string | null;
  created_at: string;
  // named columns
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  phone_type?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  launch_location?: string | null;
  shirt_size?: string | null;
  church?: string | null;
  times_attended_self_report?: string | null;
  invited_by?: string | null;
  prayer_contact_name?: string | null;
  prayer_contact_phone?: string | null;
  dietary_health?: string | null;
  questions?: string | null;
  status?: string | null;
  // extra JSON bag
  extra?: string | null;
  [key: string]: unknown;
}
interface ProfileResponse {
  ok: boolean;
  person: Person;
  badges: Badges;
  history: RegistrationRow[];
  possible_duplicates: Person[];
}

/** Human-readable labels for named registration columns */
const NAMED_FIELD_LABELS: Record<string, string> = {
  email:                     'Email',
  phone:                     'Phone',
  phone_type:                'Phone Type',
  address:                   'Address',
  city:                      'City',
  state:                     'State',
  launch_location:           'Launch Location',
  shirt_size:                'Shirt Size',
  church:                    'Church',
  times_attended_self_report:'Times Attended (self-reported)',
  invited_by:                'Invited By',
  prayer_contact_name:       'Prayer Contact Name',
  prayer_contact_phone:      'Prayer Contact Phone',
  dietary_health:            'Dietary / Health Notes',
  questions:                 'Questions / Comments',
  status:                    'Registration Status',
};

/** Human-readable labels for known `extra` bag keys */
const EXTRA_FIELD_LABELS: Record<string, string> = {
  zip:                       'ZIP Code',
  sandwich_preference:       'Sandwich Preference',
  prior_attendance:          'Prior Attendance',
  life_event_note:           'Life Event Note',
  times_served_self_report:  'Times Served (self-reported)',
  emergency_contact_name:    'Emergency Contact Name',
  emergency_contact_phone:   'Emergency Contact Phone',
  roommate_request:          'Roommate Request',
  transportation:            'Transportation',
  special_needs:             'Special Needs',
  tshirt_size:               'T-Shirt Size',
  arrival_time:              'Arrival Time',
  departure_time:            'Departure Time',
};

/** Parse the `extra` JSON field into a flat key→value map */
function parseExtra(extra: string | null | undefined): Record<string, string> {
  if (!extra) return {};
  try {
    const obj = JSON.parse(extra);
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return {};
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== null && v !== undefined && v !== '') {
        result[k] = String(v);
      }
    }
    return result;
  } catch {
    return {};
  }
}

/** Return a human-readable label for a field key */
function labelFor(key: string): string {
  if (NAMED_FIELD_LABELS[key]) return NAMED_FIELD_LABELS[key];
  if (EXTRA_FIELD_LABELS[key]) return EXTRA_FIELD_LABELS[key];
  // Fallback: convert snake_case to Title Case
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Skip fields that are already shown elsewhere or are structural */
const SKIP_NAMED = new Set([
  'id', 'program', 'event_id', 'person_id', 'role',
  'first_name', 'last_name', 'created_at', 'extra',
  'year', 'title', 'start_date', 'end_date',
]);

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const { program } = useProgram();
  const navigate = useNavigate();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<Person | null>(null);
  const [merging, setMerging] = useState(false);
  const [expandedReg, setExpandedReg] = useState<number | null>(null);

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
            {history.map((h) => {
              const extraFields = parseExtra(h.extra);
              const isExpanded = expandedReg === h.id;

              // Collect all named fields with values (skip structural ones)
              const namedFields: [string, string][] = Object.entries(NAMED_FIELD_LABELS)
                .map(([key]) => [key, String(h[key] ?? '')] as [string, string])
                .filter(([, val]) => val !== '' && val !== 'null' && val !== 'undefined');

              const allExtraEntries = Object.entries(extraFields);
              const hasDetails = namedFields.length > 0 || allExtraEntries.length > 0;

              return (
                <li
                  key={h.id}
                  className="rounded-xl border border-gray-100 shadow-sm overflow-hidden"
                  style={{ background: 'var(--color-surface)' }}
                >
                  {/* Row header */}
                  <div className="flex items-center gap-3 px-4 py-3 text-sm">
                    <span className="font-medium text-gray-800">{h.title ?? `Event ${h.event_id}`}</span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full text-white"
                      style={{ background: h.role === 'server' ? 'var(--color-secondary)' : 'var(--color-accent)' }}
                    >
                      {h.role}
                    </span>
                    <span className="text-xs text-gray-400">{h.year}</span>
                    {hasDetails && (
                      <button
                        type="button"
                        onClick={() => setExpandedReg(isExpanded ? null : h.id)}
                        aria-expanded={isExpanded}
                        data-testid={`reg-expand-${h.id}`}
                        className="ml-auto text-xs text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {isExpanded ? 'Hide fields ▲' : 'All fields ▼'}
                      </button>
                    )}
                    {!hasDetails && <span className="ml-auto" />}
                  </div>

                  {/* Expanded fields */}
                  {isExpanded && (
                    <div
                      data-testid={`reg-fields-${h.id}`}
                      className="border-t border-gray-100 px-4 py-3"
                    >
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                        {namedFields.map(([key, val]) => (
                          <div key={key}>
                            <dt className="text-gray-400 uppercase tracking-wide">{labelFor(key)}</dt>
                            <dd className="font-medium text-gray-700 break-words">{val}</dd>
                          </div>
                        ))}
                        {allExtraEntries.map(([key, val]) => (
                          <div key={`extra_${key}`}>
                            <dt className="text-gray-400 uppercase tracking-wide">{labelFor(key)}</dt>
                            <dd className="font-medium text-gray-700 break-words">{val}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}
                </li>
              );
            })}
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
