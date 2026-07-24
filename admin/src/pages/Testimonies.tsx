// admin/src/pages/Testimonies.tsx -- Testimonies & Teachings Board (roster/tracker)
import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '@/api';
import { useProgram } from '@/App';
import { THEMES } from '@/theme';
import { RichTextEditor, htmlToText } from '@/components/email/RichTextEditor';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BoardStatus = 'unfulfilled' | 'in_progress' | 'awaiting_next' | 'approved' | 'archived';

export interface TestimonyRow {
  id: number;
  program: string | null;
  person_id: number | null;
  first_name: string | null;
  last_name: string | null;
  from_name: string | null;
  from_email: string;
  subject: string | null;
  title: string | null;
  status: BoardStatus;
  type: 'testimony' | 'teaching';
  received_at: string | null;
  created_at: string;
  attachment_count: number;
  comment_count: number;
}

export interface Attachment {
  id: number;
  filename: string | null;
  content_type: string | null;
  size: number | null;
  r2_key: string | null;
  link_url: string | null;
  created_at: string;
}

export interface Comment {
  id: number;
  body: string;
  created_at: string;
  admin_name: string | null;
}

export interface PersonSummary {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  program: string | null;
}

export interface TestimonyDetail {
  id: number;
  program: string | null;
  person_id: number | null;
  from_name: string | null;
  from_email: string;
  subject: string | null;
  title: string | null;
  body_html: string | null;
  body_text: string | null;
  status: BoardStatus;
  type: 'testimony' | 'teaching';
  received_at: string | null;
  created_at: string;
}

type FilterType = 'all' | 'testimony' | 'teaching';
type FilterStatus = 'all' | BoardStatus;
type ViewMode = 'program' | 'unassigned';

// ── Status helpers ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<BoardStatus, string> = {
  unfulfilled:  'Unfulfilled',
  in_progress:  'In Progress',
  awaiting_next: 'Awaiting Next',
  approved:     'Approved',
  archived:     'Archived',
};

const STATUS_COLORS: Record<BoardStatus, string> = {
  unfulfilled:  'bg-gray-100 text-gray-600',
  in_progress:  'bg-blue-100 text-blue-800',
  awaiting_next: 'bg-amber-100 text-amber-800',
  approved:     'bg-green-100 text-green-700',
  archived:     'bg-yellow-50 text-yellow-700',
};

const FULFILLED_STATUSES: BoardStatus[] = ['approved'];
const NEEDS_ATTENTION: BoardStatus[] = ['unfulfilled', 'in_progress', 'awaiting_next'];

function isFulfilled(status: BoardStatus) {
  return FULFILLED_STATUSES.includes(status);
}

function StatusBadge({ status }: { status: BoardStatus }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ── People search/select ───────────────────────────────────────────────────────

interface PersonSearchResult {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  program: string;
}

interface PersonSearchProps {
  currentPersonId: number | null;
  onSelect: (personId: number | null) => void;
}

function PersonSearch({ currentPersonId, onSelect }: PersonSearchProps) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PersonSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const search = useCallback(async (query: string) => {
    if (query.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await apiFetch<{ ok: boolean; rows: PersonSearchResult[] }>(
        `/admin/registrations?q=${encodeURIComponent(query)}&page=1`
      );
      setResults(res.rows?.slice(0, 8) ?? []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(q), 300);
    return () => clearTimeout(t);
  }, [q, search]);

  return (
    <div className="space-y-2">
      <input
        type="text"
        placeholder="Search by name or email…"
        value={q}
        onChange={e => setQ(e.target.value)}
        aria-label="Search person"
        className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      {searching && <p className="text-xs text-gray-400">Searching…</p>}
      {results.length > 0 && (
        <ul className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-40 overflow-y-auto">
          {results.map(p => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 text-gray-800"
              >
                {p.first_name} {p.last_name}
                {p.email && <span className="ml-2 text-xs text-gray-400">{p.email}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {currentPersonId && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="text-xs text-red-600 hover:underline"
        >
          Remove person match
        </button>
      )}
    </div>
  );
}

// ── Add Needed Item dialog ─────────────────────────────────────────────────────

interface AddItemProps {
  program: string;
  onCreated: () => void;
  onCancel: () => void;
}

function AddItemForm({ program, onCreated, onCancel }: AddItemProps) {
  const theme = THEMES[program as 'mens' | 'women'] ?? THEMES.mens;
  const [type, setType] = useState<'testimony' | 'teaching'>('testimony');
  const [title, setTitle] = useState('');
  const [personId, setPersonId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/admin/testimonies', {
        method: 'POST',
        body: JSON.stringify({
          type,
          title: title.trim() || null,
          person_id: personId,
        }),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Add Needed Item</h2>

        {/* Type */}
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Type</label>
          <div className="flex gap-2">
            {(['testimony', 'teaching'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                  type === t ? 'border-transparent text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
                style={type === t ? { background: theme.primary } : {}}
              >
                {t === 'testimony' ? 'Testimony' : 'Teaching'}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <label htmlFor="add-title" className="text-xs font-medium text-gray-500 block mb-1">
            Label / Title <span className="text-gray-400">(optional)</span>
          </label>
          <input
            id="add-title"
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Saturday night testimony"
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {/* Assign person */}
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">
            Assign Person <span className="text-gray-400">(optional)</span>
          </label>
          <PersonSearch currentPersonId={personId} onSelect={setPersonId} />
          {personId && (
            <p className="text-xs text-green-600 mt-1">Person selected (ID {personId})</p>
          )}
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            style={{ background: theme.primary }}
            className="flex-1 py-2 text-sm text-white rounded-md disabled:opacity-50 hover:opacity-90 transition-opacity font-medium"
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 rounded-md hover:bg-gray-100"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Board row ──────────────────────────────────────────────────────────────────

interface BoardRowProps {
  item: TestimonyRow;
  selected: boolean;
  onSelect: () => void;
  onStatusChange: (id: number, status: BoardStatus) => void;
}

function BoardRow({ item, selected, onSelect, onStatusChange }: BoardRowProps) {
  const personName = item.first_name
    ? `${item.first_name} ${item.last_name ?? ''}`.trim()
    : item.from_name || '—';
  const label = item.title || (item.type === 'teaching' ? 'Teaching' : 'Testimony');
  const isUnfulfilled = item.status === 'unfulfilled';

  return (
    <div
      data-testid={`testimony-row-${item.id}`}
      className={`flex items-center gap-3 px-4 py-3 border-b border-gray-100 cursor-pointer transition-colors ${
        selected ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-gray-50'
      }`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSelect(); }}
    >
      {/* New indicator */}
      {isUnfulfilled && (
        <span
          className="w-2 h-2 rounded-full bg-gray-400 flex-shrink-0"
          aria-label="New"
        />
      )}

      {/* Type icon */}
      <span className="text-sm flex-shrink-0 text-gray-400" aria-hidden>
        {item.type === 'teaching' ? '🎓' : '🕊️'}
      </span>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm truncate font-medium ${isUnfulfilled ? 'text-gray-900' : 'text-gray-700'}`}>
            {label}
          </span>
          <StatusBadge status={item.status} />
        </div>
        <p className="text-xs text-gray-500 truncate mt-0.5">{personName}</p>
      </div>

      {/* Inline status control */}
      <div
        className="flex-shrink-0"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        <select
          value={item.status}
          onChange={e => onStatusChange(item.id, e.target.value as BoardStatus)}
          className="text-xs border border-gray-200 rounded-md px-1.5 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          aria-label={`Status for ${label}`}
          onClick={e => e.stopPropagation()}
        >
          {(['unfulfilled', 'in_progress', 'awaiting_next', 'approved', 'archived'] as BoardStatus[]).map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// ── Detail view ──────────────────────────────────────────────────────────────

interface DetailProps {
  testimonyId: number;
  initialStatus: BoardStatus;
  program: string;
  onUpdate: () => void;
}

function TestimonyDetail({ testimonyId, initialStatus, program, onUpdate }: DetailProps) {
  const theme = THEMES[program as 'mens' | 'women'] ?? THEMES.mens;
  const [testimony, setTestimony] = useState<TestimonyDetail | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [person, setPerson] = useState<PersonSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Use a ref for onUpdate to avoid it being a dep of load (prevents infinite loops)
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);

  // Comment
  const [commentBody, setCommentBody] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // Reply
  const [showReply, setShowReply] = useState(false);
  const [replySubject, setReplySubject] = useState('');
  const [replyHtml, setReplyHtml] = useState('');
  const [replyText, setReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [replySuccess, setReplySuccess] = useState(false);

  // Reassign
  const [showReassign, setShowReassign] = useState(false);
  const [patching, setPatching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{
        ok: boolean;
        testimony: TestimonyDetail;
        attachments: Attachment[];
        comments: Comment[];
        person: PersonSummary | null;
      }>(`/admin/testimonies/${testimonyId}`);
      if (!mountedRef.current) return;
      setTestimony(res.testimony);
      setAttachments(res.attachments ?? []);
      setComments(res.comments ?? []);
      setPerson(res.person);

      // Auto-advance from unfulfilled to in_progress when first opened
      if (initialStatus === 'unfulfilled') {
        apiFetch(`/admin/testimonies/${testimonyId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'in_progress' }),
        })
          .then(() => {
            if (!mountedRef.current) return;
            setTestimony(prev => prev ? { ...prev, status: 'in_progress' } : prev);
            onUpdateRef.current();
          })
          .catch(() => {});
      }
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [testimonyId, initialStatus]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleComment() {
    if (!commentBody.trim()) return;
    setSubmittingComment(true);
    try {
      const res = await apiFetch<{ ok: boolean; comment: Comment }>(
        `/admin/testimonies/${testimonyId}/comment`,
        { method: 'POST', body: JSON.stringify({ body: commentBody.trim() }) }
      );
      if (mountedRef.current) {
        setComments(prev => [...prev, res.comment]);
        setCommentBody('');
      }
    } finally {
      if (mountedRef.current) setSubmittingComment(false);
    }
  }

  async function handleReply() {
    if (!replySubject.trim() || !replyText.trim()) return;
    setSubmittingReply(true);
    try {
      await apiFetch(`/admin/testimonies/${testimonyId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ subject: replySubject, body_html: replyHtml, body_text: replyText }),
      });
      if (mountedRef.current) {
        setShowReply(false);
        setReplySuccess(true);
        setTestimony(prev => prev ? { ...prev, status: 'awaiting_next' } : prev);
        onUpdateRef.current();
      }
    } finally {
      if (mountedRef.current) setSubmittingReply(false);
    }
  }

  async function patch(fields: Record<string, string | number | null>) {
    setPatching(true);
    try {
      const res = await apiFetch<{ ok: boolean; testimony: { status: BoardStatus; type: string; title: string | null; person_id: number | null; program: string | null } }>(
        `/admin/testimonies/${testimonyId}`,
        { method: 'PATCH', body: JSON.stringify(fields) }
      );
      if (mountedRef.current) {
        const update = (res as Record<string, unknown>)?.testimony as Partial<TestimonyDetail> | undefined;
        if (update) {
          setTestimony(prev => prev ? { ...prev, ...update } : prev);
        }
        onUpdateRef.current();
      }
    } finally {
      if (mountedRef.current) setPatching(false);
    }
  }

  async function handleReassign(pid: number | null) {
    await patch({ person_id: pid });
    setShowReassign(false);
    load();
  }

  if (loading) return <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Loading…</div>;
  if (error) return <div className="flex-1 flex items-center justify-center text-sm text-red-500">{error}</div>;
  if (!testimony) return null;

  const isPdf = (att: Attachment) =>
    att.content_type === 'application/pdf' || att.filename?.toLowerCase().endsWith('.pdf');

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 truncate">
            {testimony.title || testimony.subject || '(No title)'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {testimony.type === 'teaching' ? '🎓 Teaching' : '🕊️ Testimony'}
            {testimony.received_at && (
              <> &middot; Received {new Date(testimony.received_at).toLocaleDateString()}</>
            )}
          </p>
        </div>
        <StatusBadge status={testimony.status} />
      </div>

      {/* Assigned person */}
      {person ? (
        <div className="rounded-lg border border-gray-200 p-3 bg-gray-50 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Assigned person</p>
            <Link
              to={`/people/${person.id}`}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              {person.first_name} {person.last_name}
            </Link>
            {person.email && <span className="text-xs text-gray-400 ml-2">{person.email}</span>}
          </div>
          <button
            type="button"
            onClick={() => setShowReassign(v => !v)}
            className="text-xs text-gray-500 hover:text-gray-800 underline"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 p-3 bg-gray-50 flex items-center justify-between gap-2">
          <p className="text-xs text-gray-500 italic">No person assigned</p>
          <button
            type="button"
            onClick={() => setShowReassign(v => !v)}
            className="text-xs text-blue-600 hover:underline"
          >
            Assign person
          </button>
        </div>
      )}

      {showReassign && (
        <div className="rounded-lg border border-blue-200 p-3 bg-blue-50">
          <p className="text-xs font-semibold text-blue-700 mb-2">Reassign person</p>
          <PersonSearch
            currentPersonId={testimony.person_id}
            onSelect={handleReassign}
          />
        </div>
      )}

      {/* Status + Type controls */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <label htmlFor={`type-${testimony.id}`} className="text-xs text-gray-500 font-medium">Type:</label>
          <select
            id={`type-${testimony.id}`}
            value={testimony.type}
            onChange={e => patch({ type: e.target.value })}
            disabled={patching}
            aria-label="Retag type"
            className="text-xs border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="testimony">Testimony</option>
            <option value="teaching">Teaching</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <label htmlFor={`status-${testimony.id}`} className="text-xs text-gray-500 font-medium">Status:</label>
          <select
            id={`status-${testimony.id}`}
            value={testimony.status}
            onChange={e => patch({ status: e.target.value })}
            disabled={patching}
            aria-label="Change status"
            className="text-xs border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {(['unfulfilled', 'in_progress', 'awaiting_next', 'approved', 'archived'] as BoardStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Submitted content */}
      {(testimony.body_html || testimony.body_text) && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Submitted Content</p>
          {testimony.body_html ? (
            <div
              className="prose prose-sm max-w-none text-gray-800"
              /* eslint-disable-next-line react/no-danger */
              dangerouslySetInnerHTML={{ __html: testimony.body_html }}
            />
          ) : (
            <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">
              {testimony.body_text}
            </pre>
          )}
        </div>
      )}

      {/* Attachments / Links / PDF viewer */}
      {attachments.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Attachments & Links ({attachments.length})
          </p>
          <ul className="space-y-3">
            {attachments.map(att => (
              <li key={att.id}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500" aria-hidden>
                    {isPdf(att) ? '📄' : att.link_url ? '🔗' : '📎'}
                  </span>
                  {att.link_url ? (
                    <a
                      href={att.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                      aria-label={`Open ${att.filename ?? 'attachment'}`}
                    >
                      {att.filename ?? att.link_url}
                    </a>
                  ) : (
                    <span className="text-gray-700">{att.filename ?? 'Attachment'}</span>
                  )}
                  {att.content_type && !att.link_url && (
                    <span className="text-xs text-gray-400">{att.content_type}</span>
                  )}
                </div>
                {/* PDF viewer: if r2_key will be present in the future, render iframe here */}
                {isPdf(att) && att.r2_key && (
                  <div className="mt-2 rounded border border-gray-200 overflow-hidden">
                    <embed
                      src={`/api/admin/attachments/${att.r2_key}`}
                      type="application/pdf"
                      width="100%"
                      height="480"
                      title={att.filename ?? 'PDF document'}
                    />
                  </div>
                )}
                {isPdf(att) && !att.r2_key && !att.link_url && (
                  <p className="text-xs text-gray-400 mt-1 ml-6">
                    {att.filename} — file viewer enabled once storage is connected.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Comments */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Notes / Comments ({comments.length})
        </p>
        {comments.length === 0 && (
          <p className="text-xs text-gray-400 italic">No notes yet.</p>
        )}
        {comments.map(c => (
          <div key={c.id} className="bg-gray-50 rounded-md px-3 py-2">
            <p className="text-xs text-gray-500 mb-0.5">
              {c.admin_name ?? 'Admin'} &middot; {new Date(c.created_at).toLocaleString()}
            </p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{c.body}</p>
          </div>
        ))}

        {/* Add comment */}
        <div className="space-y-2">
          <textarea
            rows={2}
            placeholder="Add a note…"
            value={commentBody}
            onChange={e => setCommentBody(e.target.value)}
            aria-label="Add comment"
            className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
          <button
            type="button"
            onClick={handleComment}
            disabled={submittingComment || !commentBody.trim()}
            style={{ background: theme.primary }}
            className="px-3 py-1.5 text-xs text-white rounded-md disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {submittingComment ? 'Saving…' : 'Add note'}
          </button>
        </div>
      </div>

      {/* Reply by email */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Reply by email</p>
          {!showReply && !replySuccess && (
            <button
              type="button"
              onClick={() => {
                setShowReply(true);
                if (!replySubject && testimony.subject) {
                  setReplySubject(`Re: ${testimony.subject}`);
                }
              }}
              style={{ color: theme.primary }}
              className="text-xs font-medium hover:underline"
            >
              Compose reply →
            </button>
          )}
          {replySuccess && (
            <span className="text-xs text-green-600 font-medium">Reply sent — awaiting next draft</span>
          )}
        </div>

        {showReply && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Subject</label>
              <input
                type="text"
                value={replySubject}
                onChange={e => setReplySubject(e.target.value)}
                aria-label="Reply subject"
                className="w-full text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Body</label>
              <RichTextEditor
                value={replyHtml}
                onChange={(html, text) => {
                  setReplyHtml(html);
                  setReplyText(text || htmlToText(html));
                }}
                placeholder="Write your reply…"
                label="Reply body"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleReply}
                disabled={submittingReply || !replySubject.trim() || !replyText.trim()}
                style={{ background: theme.primary }}
                className="px-4 py-1.5 text-sm text-white rounded-md disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {submittingReply ? 'Sending…' : 'Send reply'}
              </button>
              <button
                type="button"
                onClick={() => setShowReply(false)}
                className="px-3 py-1.5 text-sm text-gray-500 rounded-md hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Board page ────────────────────────────────────────────────────────────

export default function Testimonies() {
  const { program } = useProgram();
  const theme = THEMES[program as 'mens' | 'women'] ?? THEMES.mens;

  const [viewMode, setViewMode] = useState<ViewMode>('program');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [items, setItems] = useState<TestimonyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<BoardStatus>('unfulfilled');
  const [listRefresh, setListRefresh] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (viewMode === 'unassigned') {
        params.set('assigned', 'unassigned');
      }
      if (filterType !== 'all') params.set('type', filterType);
      if (filterStatus !== 'all') params.set('status', filterStatus);

      const res = await apiFetch<{ ok: boolean; testimonies: TestimonyRow[] }>(
        `/admin/testimonies?${params}`
      );
      if (!mountedRef.current) return;
      setItems(res.testimonies ?? []);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [program, viewMode, filterType, filterStatus, listRefresh]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // Reset selection when program or view changes
  useEffect(() => {
    setSelectedId(null);
  }, [program, viewMode]);

  function handleSelect(t: TestimonyRow) {
    setSelectedId(t.id);
    setSelectedStatus(t.status);
  }

  const handleUpdate = useCallback(() => {
    setListRefresh(n => n + 1);
  }, []);

  async function handleInlineStatusChange(id: number, status: BoardStatus) {
    // Optimistic update
    setItems(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    try {
      await apiFetch(`/admin/testimonies/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    } catch {
      // Revert on failure
      setListRefresh(n => n + 1);
    }
  }

  // Split fulfilled vs unfulfilled
  const unfulfilled = items.filter(t => NEEDS_ATTENTION.includes(t.status));
  const fulfilled = items.filter(t => isFulfilled(t.status));
  const archived = items.filter(t => t.status === 'archived');

  const filterBtnBase = 'px-3 py-1 text-xs rounded-md border transition-colors';
  function filterBtnClass(active: boolean) {
    return `${filterBtnBase} ${
      active
        ? 'border-transparent text-white'
        : 'border-gray-200 text-gray-600 hover:border-gray-300'
    }`;
  }

  function renderSection(title: string, sectionItems: TestimonyRow[], count: number) {
    return (
      <div>
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</span>
          <span className="text-xs text-gray-400">{count}</span>
        </div>
        {sectionItems.length === 0 ? (
          <div className="px-4 py-3 text-xs text-gray-400 italic">None</div>
        ) : (
          sectionItems.map(t => (
            <BoardRow
              key={t.id}
              item={t}
              selected={t.id === selectedId}
              onSelect={() => handleSelect(t)}
              onStatusChange={handleInlineStatusChange}
            />
          ))
        )}
      </div>
    );
  }

  const totalItems = items.length;
  const unfulfilledCount = unfulfilled.length;
  const fulfilledCount = fulfilled.length;

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden rounded-xl shadow-sm border border-gray-200 bg-white">
      {/* Add needed item dialog */}
      {showAddForm && (
        <AddItemForm
          program={program}
          onCreated={() => {
            setShowAddForm(false);
            setListRefresh(n => n + 1);
          }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* ── Left column: filters + board list ─────────────────────── */}
      <div className="w-80 flex-shrink-0 border-r border-gray-100 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-100" style={{ background: theme.bg }}>
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-base font-semibold text-gray-900">Testimonies & Teachings</h1>
            <button
              type="button"
              data-testid="add-needed-item"
              onClick={() => setShowAddForm(true)}
              style={{ background: theme.primary }}
              className="px-2.5 py-1 text-xs text-white rounded-md hover:opacity-90 transition-opacity font-medium"
              title="Add needed testimony or teaching"
            >
              + Add
            </button>
          </div>

          {/* Summary counts */}
          {!loading && !error && (
            <div className="flex gap-3 mb-2">
              <span className="text-xs text-gray-500">
                <strong className="text-gray-800">{unfulfilledCount}</strong> unfulfilled
              </span>
              <span className="text-xs text-gray-500">
                <strong className="text-gray-800">{fulfilledCount}</strong> fulfilled
              </span>
              <span className="text-xs text-gray-500">
                <strong className="text-gray-800">{totalItems}</strong> total
              </span>
            </div>
          )}

          {/* View mode */}
          <div className="flex gap-1 mt-1">
            <button
              type="button"
              data-testid="view-program"
              onClick={() => setViewMode('program')}
              className={filterBtnClass(viewMode === 'program')}
              style={viewMode === 'program' ? { background: theme.primary } : {}}
            >
              All
            </button>
            <button
              type="button"
              data-testid="view-unassigned"
              onClick={() => setViewMode('unassigned')}
              className={filterBtnClass(viewMode === 'unassigned')}
              style={viewMode === 'unassigned' ? { background: theme.secondary } : {}}
            >
              Unassigned
            </button>
          </div>

          {/* Type filter */}
          <div className="flex gap-1 mt-2 flex-wrap">
            {(['all', 'testimony', 'teaching'] as FilterType[]).map(ft => (
              <button
                key={ft}
                type="button"
                data-testid={`filter-type-${ft}`}
                onClick={() => setFilterType(ft)}
                className={filterBtnClass(filterType === ft)}
                style={filterType === ft ? { background: theme.primary } : {}}
              >
                {ft === 'all' ? 'All types' : ft === 'testimony' ? 'Testimonies' : 'Teachings'}
              </button>
            ))}
          </div>

          {/* Status filter */}
          <div className="flex gap-1 mt-2 flex-wrap">
            {(['all', 'unfulfilled', 'in_progress', 'awaiting_next', 'approved', 'archived'] as FilterStatus[]).map(fs => (
              <button
                key={fs}
                type="button"
                data-testid={`filter-status-${fs}`}
                onClick={() => setFilterStatus(fs)}
                className={filterBtnClass(filterStatus === fs)}
                style={filterStatus === fs ? { background: theme.primary } : {}}
              >
                {fs === 'all' ? 'All' : STATUS_LABELS[fs as BoardStatus]}
              </button>
            ))}
          </div>
        </div>

        {/* Board list body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
            Loading…
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-sm text-red-400 p-4">
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400 p-8">
            No testimonies found.
          </div>
        ) : filterStatus !== 'all' ? (
          // When status-filtered, show flat list without sections
          <div className="flex-1 overflow-y-auto">
            {items.map(t => (
              <BoardRow
                key={t.id}
                item={t}
                selected={t.id === selectedId}
                onSelect={() => handleSelect(t)}
                onStatusChange={handleInlineStatusChange}
              />
            ))}
          </div>
        ) : (
          // Default: grouped sections
          <div className="flex-1 overflow-y-auto">
            {renderSection('Unfulfilled', unfulfilled, unfulfilled.length)}
            {renderSection('Fulfilled', fulfilled, fulfilled.length)}
            {archived.length > 0 && renderSection('Archived', archived, archived.length)}
          </div>
        )}
      </div>

      {/* ── Right column: detail ─────────────────────────────────── */}
      {selectedId ? (
        <TestimonyDetail
          key={selectedId}
          testimonyId={selectedId}
          initialStatus={selectedStatus}
          program={program}
          onUpdate={handleUpdate}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
          Select an item to view details
        </div>
      )}
    </div>
  );
}
