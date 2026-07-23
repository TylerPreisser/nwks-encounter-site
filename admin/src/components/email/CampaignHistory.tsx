import { useState, useEffect } from 'react';
import { useProgram } from '@/App';

interface Campaign {
  id: number; subject: string; status: string;
  recipient_count: number; created_at: string; sent_at: string | null;
  scheduled_for: string | null;
}

export function CampaignHistory({ refresh }: { refresh: number }) {
  const { program } = useProgram();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    fetch(`/api/admin/campaigns?program=${program}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setCampaigns(d.campaigns ?? []));
  }, [program, refresh]);

  if (campaigns.length === 0) {
    return <p className="text-sm text-gray-400">No campaigns yet.</p>;
  }

  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="text-left text-xs text-gray-500 uppercase border-b">
          <th className="pb-2 pr-4">Subject</th>
          <th className="pb-2 pr-4">Status</th>
          <th className="pb-2 pr-4">Recipients</th>
          <th className="pb-2 pr-4">Sent / Scheduled</th>
        </tr>
      </thead>
      <tbody>
        {campaigns.map(c => (
          <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
            <td className="py-2 pr-4 font-medium">{c.subject}</td>
            <td className="py-2 pr-4">
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                c.status === 'sent' ? 'bg-green-100 text-green-700' :
                c.status === 'scheduled' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-600'
              }`}>{c.status}</span>
            </td>
            <td className="py-2 pr-4">{c.recipient_count}</td>
            <td className="py-2 text-gray-500">
              {c.sent_at
                ? new Date(c.sent_at).toLocaleString()
                : c.scheduled_for
                  ? `Scheduled: ${new Date(c.scheduled_for).toLocaleString()}`
                  : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
