import { Link } from 'react-router-dom';

export interface RegistrationRow {
  id: number;
  person_id?: number;
  first_name: string;
  last_name: string;
  email?: string | null;
  role: 'attendee' | 'server';
  launch_location?: string | null;
  shirt_size?: string | null;
  created_at: string;
}

interface Props {
  rows: RegistrationRow[];
}

export default function RegistrationTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">
        No registrations found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl shadow-sm border border-gray-100">
      <table className="min-w-full divide-y divide-gray-100 text-sm">
        <thead style={{ background: 'var(--color-bg)' }}>
          <tr>
            {['Name', 'Email', 'Role', 'Location', 'Shirt', 'Date'].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 bg-white">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 font-medium text-gray-900">
                {r.person_id ? (
                  <Link
                    to={`/people/${r.person_id}`}
                    className="hover:underline"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    <span>{r.first_name}</span>{' '}
                    <span>{r.last_name}</span>
                  </Link>
                ) : (
                  <>
                    <span>{r.first_name}</span>{' '}
                    <span>{r.last_name}</span>
                  </>
                )}
              </td>
              <td className="px-4 py-3 text-gray-500">{r.email ?? '—'}</td>
              <td className="px-4 py-3">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                  style={{ background: r.role === 'server' ? 'var(--color-secondary)' : 'var(--color-accent)' }}
                >
                  {r.role}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-500">{r.launch_location ?? '—'}</td>
              <td className="px-4 py-3 text-gray-500">{r.shirt_size ?? '—'}</td>
              <td className="px-4 py-3 text-gray-400">{new Date(r.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
