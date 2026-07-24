// admin/src/pages/Testimonies.tsx — Testimonies & Teachings admin page
import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '@/api';
import { useProgram } from '@/App';
import { THEMES } from '@/theme';
import { RichTextEditor, htmlToText } from '@/components/email/RichTextEditor';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TestimonyRow {
  id: number;
  program: string | null;
  person_id: number | null;
  first_name: string | null;
  last_name: string | null;
  from_name: string | null;
  from_email: string;
  subject: string | null;
  status: 'new' | 'read' | 'replied' | 'archived';
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
  body_html: string | null;
  body_text: string | null;
  status: 'new' | 'read' | 'replied' | 'archived';
  type: 'testimony' | 'teaching';
  received_at: string | null;
  created_at: string;
}

type FilterType = 'all' | 'testimony' | 'teaching';
type FilterStatus = 'all' | 'new' | 'read' | 'replied' | 'archived';
type ViewMode = 'program' | 'unassigned';

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    new:      'bg-blue-100 text-blue-800',
    read:     'bg-gray-100 text-gray-600',
    replied:  'bg-green-100 text-green-700',
    archived: 'bg-yellow-50 text-yellow-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${classes[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

// ── Testimony list ─────────────────────────────────────────────────────────────

interface ListProps {
  testimonies: TestimonyRow[];
  selectedId: number | null;
  onSelect: (t: TestimonyRow) => void;
}

function TestimonyList({ testimonies, selectedId, onSelect }: ListProps) {
  if (testimonies.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-400 p-8">
        No testimonies found.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
      {testimonies.map((t) => {
        const isNew = t.status === 'new';
        const selected = t.id === selectedId;
        const senderName = t.from_name || t.from_email;
        const personLabel = t.first_name
          ? `${t.first_name} ${t.last_name ?? ''}`.trim()
          : null;

        return (
          <button
            key={t.id}
            type="button"
            data-testid={`testimony-row-${t.id}`}
            onClick={() => onSelect(t)}
            className={`w-full text-left px-4 py-3 transition-colors focus:outline-none focus:ring-2 focus:ring-inset ${
              selected
                ? 'bg-blue-50 border-l-4 border-blue-500'
                : isNew
                ? 'bg-blue-50/40 hover:bg-blue-50/70'
                : 'hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-2 mb-0.5">
              {isNew && (
                <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" aria-label="New" />
              )}
              <span className={`text-sm truncate ${isNew ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}>
                {senderName}
              </span>
              <StatusBadge status={t.status} />
              <span className="ml-auto text-xs text-gray-400 flex-shrink-0">
                {t.type === 'teaching' ? '🎓 Teaching' : '🕊️ Testimony'}
              </span>
            </div>
            {t.subject && (
              <p className="text-xs text-gray-600 truncate pl-4">{t.subject}</p>
            )}
            {personLabel && (
              <p className="text-xs text-gray-400 pl-4">→ {personLabel}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── People search/select for reassign ─────────────────────────────────────────

interface PersonSearchResult {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  program: string;
}

interface ReassignPanelProps {
  currentPersonId: number | null;
  onSelect: (personId: number | null) => void;
}

function ReassignPanel({ currentPersonId, onSelect }: ReassignPanelProps) {
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

// ── Detail view ──────────────────────────────────────────────────────────────

interface DetailProps {
  testimonyId: number;
  initialStatus: string;
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

  // Reassign/retag
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
      setTestimony(res.testimony);
      setAttachments(res.attachments ?? []);
      setComments(res.comments ?? []);
      setPerson(res.person);

      // Mark as read automatically when a 'new' testimony is opened
      if (initialStatus === 'new') {
        apiFetch(`/admin/testimonies/${testimonyId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'read' }),
        })
          .then(() => {
            setTestimony(prev => prev ? { ...prev, status: 'read' } : prev);
            onUpdateRef.current();
          })
          .catch(() => {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
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
      setComments(prev => [...prev, res.comment]);
      setCommentBody('');
    } finally {
      setSubmittingComment(false);
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
      setShowReply(false);
      setReplySuccess(true);
      setTestimony(prev => prev ? { ...prev, status: 'replied' } : prev);
      onUpdateRef.current();
    } finally {
      setSubmittingReply(false);
    }
  }

  async function patch(fields: Record<string, string | number | null>) {
    setPatching(true);
    try {
      const res = await apiFetch<{ ok: boolean; testimony: { status: string; type: string; person_id: number | null; program: string | null } }>(
        `/admin/testimonies/${testimonyId}`,
        { method: 'PATCH', body: JSON.stringify(fields) }
      );
      setTestimony(prev => prev ? { ...prev, ...res.testimony } : prev);
      onUpdateRef.current();
    } finally {
      setPatching(false);
    }
  }

  async function handleReassign(personId: number | null) {
    await patch({ person_id: personId });
    setShowReassign(false);
    // Reload to get updated person summary
    load();
  }

  if (loading) return <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Loading…</div>;
  if (error) return <div className="flex-1 flex items-center justify-center text-sm text-red-500">{error}</div>;
  if (!testimony) return null;

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{testimony.subject || '(No subject)'}</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {testimony.from_name
              ? <><strong>{testimony.from_name}</strong> &lt;{testimony.from_email}&gt;</>
              : testimony.from_email}
          </p>
          {testimony.received_at && (
            <p className="text-xs text-gray-400 mt-0.5">
              Received {new Date(testimony.received_at).toLocaleString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={testimony.status} />
          <span className="text-xs text-gray-400">
            {testimony.type === 'teaching' ? '🎓 Teaching' : '🕊️ Testimony'}
          </span>
        </div>
      </div>

      {/* Person match */}
      {person ? (
        <div className="rounded-lg border border-gray-200 p-3 bg-gray-50 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Matched person</p>
            <Link
              to={`/admin/people/${person.id}`}
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
          <p className="text-xs text-gray-500 italic">No person matched</p>
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
          <ReassignPanel
            currentPersonId={testimony.person_id}
            onSelect={handleReassign}
          />
        </div>
      )}

      {/* Controls: type + status */}
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
            <option value="testimony">🕊️ Testimony</option>
            <option value="teaching">🎓 Teaching</option>
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
            <option value="new">New</option>
            <option value="read">Read</option>
            <option value="replied">Replied</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {/* Body */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Message</p>
        {testimony.body_html ? (
          <div
            className="prose prose-sm max-w-none text-gray-800"
            /* eslint-disable-next-line react/no-danger */
            dangerouslySetInnerHTML={{ __html: testimony.body_html }}
          />
        ) : (
          <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">
            {testimony.body_text || '(Empty)'}
          </pre>
        )}
      </div>

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Attachments ({attachments.length})
          </p>
          <ul className="space-y-1.5">
            {attachments.map(att => (
              <li key={att.id} className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">📎</span>
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
                {att.content_type && (
                  <span className="text-xs text-gray-400">{att.content_type}</span>
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
          <p className="text-xs text-gray-400 italic">No comments yet.</p>
        )}
        {comments.map(c => (
          <div key={c.id} className="bg-gray-50 rounded-md px-3 py-2">
            <p className="text-xs text-gray-500 mb-0.5">
              {c.admin_name ?? 'Admin'} &middot;{' '}
              {new Date(c.created_at).toLocaleString()}
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

      {/* Reply */}
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
            <span className="text-xs text-green-600 font-medium">Reply sent ✓</span>
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Testimonies() {
  const { program } = useProgram();
  const theme = THEMES[program as 'mens' | 'women'] ?? THEMES.mens;

  const [viewMode, setViewMode] = useState<ViewMode>('program');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [testimonies, setTestimonies] = useState<TestimonyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>('read');
  const [listRefresh, setListRefresh] = useState(0);

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
      setTestimonies(res.testimonies ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [program, viewMode, filterType, filterStatus, listRefresh]);

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

  const filterBtnBase = 'px-3 py-1 text-xs rounded-md border transition-colors';

  function filterBtnClass(active: boolean) {
    return `${filterBtnBase} ${
      active
        ? 'border-transparent text-white'
        : 'border-gray-200 text-gray-600 hover:border-gray-300'
    }`;
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden rounded-xl shadow-sm border border-gray-200 bg-white">
      {/* ── Left column: filters + list ─────────────────────────── */}
      <div className="w-80 flex-shrink-0 border-r border-gray-100 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-100" style={{ background: theme.bg }}>
          <h1 className="text-base font-semibold text-gray-900">Testimonies & Teachings</h1>

          {/* View mode */}
          <div className="flex gap-1 mt-2">
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
                {ft === 'all' ? 'All types' : ft === 'testimony' ? '🕊️' : '🎓'}
              </button>
            ))}
          </div>

          {/* Status filter */}
          <div className="flex gap-1 mt-2 flex-wrap">
            {(['all', 'new', 'read', 'replied', 'archived'] as FilterStatus[]).map(fs => (
              <button
                key={fs}
                type="button"
                data-testid={`filter-status-${fs}`}
                onClick={() => setFilterStatus(fs)}
                className={filterBtnClass(filterStatus === fs)}
                style={filterStatus === fs ? { background: theme.primary } : {}}
              >
                {fs === 'all' ? 'All statuses' : fs}
              </button>
            ))}
          </div>
        </div>

        {/* List body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
            Loading…
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-sm text-red-400 p-4">
            {error}
          </div>
        ) : (
          <TestimonyList
            testimonies={testimonies}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
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
          Select a testimony to view details
        </div>
      )}
    </div>
  );
}
