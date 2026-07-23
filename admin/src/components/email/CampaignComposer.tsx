import { useState, useEffect, useCallback } from 'react';
import { useProgram } from '@/App';
import { RecipientPreview } from './RecipientPreview';

interface Segment {
  event_id?: number;
  role?: 'attendee' | 'server' | '';
  launch_location?: string;
  first_timers_only?: boolean;
  status?: string;
}

interface PreviewData { recipient_count: number; sample: Array<{ first_name: string; last_name: string; email: string }>; }

interface Props { onSent?: () => void; }

export function CampaignComposer({ onSent }: Props) {
  const { program } = useProgram();
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [segment, setSegment] = useState<Segment>({});
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [scheduleFor, setScheduleFor] = useState('');
  const [mode, setMode] = useState<'now' | 'schedule'>('now');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/admin/campaigns/preview?program=${program}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment }),
      });
      const data = await res.json();
      if (data.ok) setPreview(data);
    } finally {
      setPreviewLoading(false);
    }
  }, [program, segment]);

  // Auto-refresh preview when segment changes (debounced 500ms)
  useEffect(() => {
    const timer = setTimeout(fetchPreview, 500);
    return () => clearTimeout(timer);
  }, [fetchPreview]);

  async function submit() {
    if (!subject.trim() || !bodyHtml.trim() || !bodyText.trim()) {
      setErrorMsg('Subject and both body fields are required.');
      return;
    }
    setStatus('sending');
    setErrorMsg('');
    try {
      // 1. Create draft
      const draftRes = await fetch(`/api/admin/campaigns?program=${program}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body_html: bodyHtml, body_text: bodyText, segment }),
      });
      const draft = await draftRes.json();
      if (!draft.ok) throw new Error(draft.error ?? 'create failed');
      const id: number = draft.campaign.id;

      // 2. Send or schedule
      if (mode === 'now') {
        const sendRes = await fetch(`/api/admin/campaigns/${id}/send?program=${program}`, {
          method: 'POST', credentials: 'include',
        });
        const sendData = await sendRes.json();
        if (!sendData.ok) throw new Error(sendData.error ?? 'send failed');
      } else {
        if (!scheduleFor) throw new Error('Pick a send date/time first.');
        const schedRes = await fetch(`/api/admin/campaigns/${id}/schedule?program=${program}`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduled_for: new Date(scheduleFor).toISOString() }),
        });
        const schedData = await schedRes.json();
        if (!schedData.ok) throw new Error(schedData.error ?? 'schedule failed');
      }

      setStatus('done');
      onSent?.();
    } catch (e: unknown) {
      setStatus('error');
      setErrorMsg(e instanceof Error ? e.message : 'unknown error');
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <h3 className="text-base font-semibold text-gray-700">New Campaign</h3>

      {/* Segment builder */}
      <fieldset className="border border-gray-200 rounded p-4 space-y-3">
        <legend className="text-xs font-semibold text-gray-500 uppercase px-1">Segment</legend>
        <div className="flex gap-4 flex-wrap">
          <label className="flex flex-col text-xs text-gray-600 gap-1">
            Role
            <select
              className="border rounded px-2 py-1 text-sm"
              value={segment.role ?? ''}
              onChange={e => setSegment(s => ({ ...s, role: e.target.value as Segment['role'] }))}
            >
              <option value="">All roles</option>
              <option value="attendee">Attendees</option>
              <option value="server">Servers</option>
            </select>
          </label>
          <label className="flex flex-col text-xs text-gray-600 gap-1">
            Launch location
            <input
              className="border rounded px-2 py-1 text-sm"
              placeholder="e.g. Colby"
              value={segment.launch_location ?? ''}
              onChange={e => setSegment(s => ({ ...s, launch_location: e.target.value || undefined }))}
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-600 mt-4">
            <input
              type="checkbox"
              checked={segment.first_timers_only ?? false}
              onChange={e => setSegment(s => ({ ...s, first_timers_only: e.target.checked || undefined }))}
            />
            First-timers only
          </label>
        </div>
      </fieldset>

      {/* Live recipient preview */}
      <RecipientPreview
        count={preview?.recipient_count ?? 0}
        sample={preview?.sample ?? []}
        loading={previewLoading}
      />

      {/* Email fields */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
        <input
          className="w-full border rounded px-3 py-2 text-sm"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Email subject…"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Body (HTML)</label>
        <textarea
          className="w-full border rounded px-3 py-2 text-sm font-mono h-36"
          value={bodyHtml}
          onChange={e => setBodyHtml(e.target.value)}
          placeholder="<p>Hello {{first_name}},</p>"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Body (Plain text)</label>
        <textarea
          className="w-full border rounded px-3 py-2 text-sm font-mono h-24"
          value={bodyText}
          onChange={e => setBodyText(e.target.value)}
          placeholder="Hello {{first_name}},"
        />
      </div>

      {/* Send mode */}
      <div className="flex gap-4 items-center">
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="mode" checked={mode === 'now'} onChange={() => setMode('now')} />
          Send now
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="mode" checked={mode === 'schedule'} onChange={() => setMode('schedule')} />
          Schedule for…
        </label>
        {mode === 'schedule' && (
          <input
            type="datetime-local"
            aria-label="Schedule date and time"
            className="border rounded px-2 py-1 text-sm"
            value={scheduleFor}
            onChange={e => setScheduleFor(e.target.value)}
          />
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={status === 'sending' || status === 'done'}
          className="px-5 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {status === 'sending' ? 'Sending…' : mode === 'now' ? 'Send Campaign' : 'Schedule Campaign'}
        </button>
        {status === 'done' && <span className="text-green-600 text-sm">Done!</span>}
        {status === 'error' && <span className="text-red-600 text-sm">{errorMsg}</span>}
        {errorMsg && status !== 'error' && <span className="text-red-600 text-sm">{errorMsg}</span>}
      </div>
    </div>
  );
}
