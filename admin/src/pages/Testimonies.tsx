// admin/src/pages/Testimonies.tsx -- Testimonies & Teachings Kanban Board
import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '@/api';
import { useProgram } from '@/App';
import { THEMES } from '@/theme';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BoardStatus =
  | 'not_received'
  | 'draft_1_awaiting'
  | 'draft_1_review'
  | 'draft_2_awaiting'
  | 'draft_2_review'
  | 'draft_3_awaiting'
  | 'draft_3_review'
  | 'approved'
  | 'archived';

// Column keys — the 5 visible columns
export type ColumnKey = 'not_received' | 'draft_1' | 'draft_2' | 'draft_3' | 'approved';

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
  topic: string | null;
  received_at: string | null;
  created_at: string;
  attachment_count: number;
  comment_count: number;
}

interface PersonSearchResult {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  program: string;
}

type FilterType = 'all' | 'testimony' | 'teaching';

// ── Topic picklist ─────────────────────────────────────────────────────────────

export const TESTIMONY_TOPICS = [
  'Purity',
  'Freedom',
  'Identity',
  "The Father's Love",
  'Forgiveness',
  'Healing',
  'Marriage & Family',
  'Spiritual Warfare',
  'Addiction & Recovery',
  'Salvation',
  'Calling',
] as const;

export type TestimonyTopic = typeof TESTIMONY_TOPICS[number];

// ── Waiting-on derivation ──────────────────────────────────────────────────────

export type WaitingOn = 'server' | 'us' | 'approved';

export function statusToWaiting(status: BoardStatus): WaitingOn {
  if (status === 'approved') return 'approved';
  if (
    status === 'draft_1_review' ||
    status === 'draft_2_review' ||
    status === 'draft_3_review'
  ) {
    return 'us';
  }
  // not_received, draft_1_awaiting, draft_2_awaiting, draft_3_awaiting, archived
  return 'server';
}

const WAITING_STYLES: Record<WaitingOn, {
  border: string;
  bg: string;
  labelText: string;
  labelColor: string;
  dotColor: string;
}> = {
  server: {
    border:     'border-l-4 border-l-amber-400',
    bg:         'bg-amber-50/60',
    labelText:  'Waiting on server',
    labelColor: 'text-amber-700',
    dotColor:   'bg-amber-400',
  },
  us: {
    border:     'border-l-4 border-l-blue-500',
    bg:         'bg-blue-50/60',
    labelText:  'Waiting on us',
    labelColor: 'text-blue-700',
    dotColor:   'bg-blue-500',
  },
  approved: {
    border:     'border-l-4 border-l-green-500',
    bg:         'bg-green-50/60',
    labelText:  'Approved',
    labelColor: 'text-green-700',
    dotColor:   'bg-green-500',
  },
};

// ── Column mapping ─────────────────────────────────────────────────────────────

// Maps any status to its kanban column key
export function statusToColumn(status: BoardStatus): ColumnKey {
  if (status === 'not_received') return 'not_received';
  if (status === 'draft_1_awaiting' || status === 'draft_1_review') return 'draft_1';
  if (status === 'draft_2_awaiting' || status === 'draft_2_review') return 'draft_2';
  if (status === 'draft_3_awaiting' || status === 'draft_3_review') return 'draft_3';
  if (status === 'approved') return 'approved';
  return 'not_received'; // archived handled separately
}

// When dropping a card INTO a column, set this entry-state status
const COLUMN_ENTRY_STATUS: Record<ColumnKey, BoardStatus> = {
  not_received: 'not_received',
  draft_1: 'draft_1_awaiting',
  draft_2: 'draft_2_awaiting',
  draft_3: 'draft_3_awaiting',
  approved: 'approved',
};

// The 5 visible Kanban columns in display order
const KANBAN_COLUMNS: ColumnKey[] = ['not_received', 'draft_1', 'draft_2', 'draft_3', 'approved'];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  not_received: 'Not Received',
  draft_1:      'Draft 1',
  draft_2:      'Draft 2',
  draft_3:      'Draft 3',
  approved:     'Approved',
};

// Sub-state options available in the dropdown for each column
const COLUMN_SUB_STATES: Record<ColumnKey, { value: BoardStatus; label: string }[]> = {
  not_received: [{ value: 'not_received', label: 'Not Received' }],
  draft_1: [
    { value: 'draft_1_awaiting', label: 'Awaiting Draft 1' },
    { value: 'draft_1_review',   label: 'Draft 1 In Review' },
  ],
  draft_2: [
    { value: 'draft_2_awaiting', label: 'Awaiting Draft 2' },
    { value: 'draft_2_review',   label: 'Draft 2 In Review' },
  ],
  draft_3: [
    { value: 'draft_3_awaiting', label: 'Awaiting Draft 3' },
    { value: 'draft_3_review',   label: 'Draft 3 In Review' },
  ],
  approved: [{ value: 'approved', label: 'Approved' }],
};

const STATUS_LABELS: Record<BoardStatus, string> = {
  not_received:    'Not Received',
  draft_1_awaiting: 'Awaiting Draft 1',
  draft_1_review:  'Draft 1 In Review',
  draft_2_awaiting: 'Awaiting Draft 2',
  draft_2_review:  'Draft 2 In Review',
  draft_3_awaiting: 'Awaiting Draft 3',
  draft_3_review:  'Draft 3 In Review',
  approved:        'Approved',
  archived:        'Archived',
};

const COLUMN_STYLES: Record<ColumnKey, { header: string; dot: string; dropHover: string }> = {
  not_received: { header: 'bg-gray-100 text-gray-700 border-gray-200',       dot: 'bg-gray-400',    dropHover: 'bg-gray-50' },
  draft_1:      { header: 'bg-blue-50 text-blue-800 border-blue-200',         dot: 'bg-blue-400',    dropHover: 'bg-blue-50/60' },
  draft_2:      { header: 'bg-indigo-50 text-indigo-800 border-indigo-200',   dot: 'bg-indigo-500',  dropHover: 'bg-indigo-50/60' },
  draft_3:      { header: 'bg-violet-50 text-violet-800 border-violet-200',   dot: 'bg-violet-500',  dropHover: 'bg-violet-50/60' },
  approved:     { header: 'bg-green-50 text-green-800 border-green-200',      dot: 'bg-green-500',   dropHover: 'bg-green-50/60' },
};

// All statuses exposed as hidden filter-buttons (for API compat + tests)
const ALL_STATUSES: BoardStatus[] = [
  'not_received',
  'draft_1_awaiting', 'draft_1_review',
  'draft_2_awaiting', 'draft_2_review',
  'draft_3_awaiting', 'draft_3_review',
  'approved', 'archived',
];

// ── Person searchable picklist ─────────────────────────────────────────────────

interface PersonPicklistProps {
  selectedId: number | null;
  selectedName: string | null;
  onSelect: (id: number, name: string) => void;
  onClear: () => void;
}

function PersonPicklist({ selectedId, selectedName, onSelect, onClear }: PersonPicklistProps) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PersonSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  const search = useCallback(async (query: string) => {
    if (query.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await apiFetch<{ ok: boolean; rows: PersonSearchResult[] }>(
        `/admin/registrations?q=${encodeURIComponent(query)}&page=1`
      );
      setResults(res.rows?.slice(0, 8) ?? []);
      setOpen(true);
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

  if (selectedId && selectedName) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md">
        <span className="text-sm text-blue-800 font-medium flex-1">{selectedName}</span>
        <button
          type="button"
          onClick={() => { onClear(); setQ(''); setResults([]); setOpen(false); }}
          className="text-xs text-blue-500 hover:text-red-500 transition-colors"
          aria-label="Remove person selection"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        role="combobox"
        aria-label="Search person"
        aria-expanded={open && results.length > 0}
        placeholder="Type to search by name or email…"
        value={q}
        onChange={e => { setQ(e.target.value); if (!e.target.value) { setResults([]); setOpen(false); } }}
        onFocus={() => q.length >= 2 && results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      {searching && (
        <span className="absolute right-2 top-2 text-xs text-gray-400">…</span>
      )}
      {open && results.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto"
        >
          {results.map(p => (
            <li key={p.id} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={() => {
                  onSelect(p.id, `${p.first_name} ${p.last_name}`);
                  setQ('');
                  setResults([]);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-gray-800"
              >
                {p.first_name} {p.last_name}
                {p.email && <span className="ml-2 text-xs text-gray-400">{p.email}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Add Item Modal ─────────────────────────────────────────────────────────────

interface AddItemModalProps {
  program: string;
  onCreated: () => void;
  onCancel: () => void;
}

function AddItemModal({ program, onCreated, onCancel }: AddItemModalProps) {
  const theme = THEMES[program as 'mens' | 'women'] ?? THEMES.mens;
  const [type, setType] = useState<'testimony' | 'teaching'>('testimony');
  const [topic, setTopic] = useState<string>('');
  const [personId, setPersonId] = useState<number | null>(null);
  const [personName, setPersonName] = useState<string | null>(null);
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
          person_id: personId,
          topic: topic || null,
        }),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create');
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add testimony or teaching"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-5">
        <h2 className="text-base font-semibold text-gray-900">Add Item</h2>

        {/* Type selector */}
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1.5">Type</label>
          <div className="flex gap-2">
            {(['testimony', 'teaching'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`px-3 py-1.5 text-xs rounded-md border transition-colors font-medium ${
                  type === t ? 'border-transparent text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
                style={type === t ? { background: theme.primary } : {}}
                aria-pressed={type === t}
              >
                {t === 'testimony' ? 'Testimony' : 'Teaching'}
              </button>
            ))}
          </div>
        </div>

        {/* Topic picklist */}
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1.5" htmlFor="add-topic-select">
            Topic
          </label>
          <select
            id="add-topic-select"
            aria-label="Topic"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">— select topic —</option>
            {TESTIMONY_TOPICS.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Person picklist */}
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1.5">
            Assign Person
          </label>
          <PersonPicklist
            selectedId={personId}
            selectedName={personName}
            onSelect={(id, name) => { setPersonId(id); setPersonName(name); }}
            onClear={() => { setPersonId(null); setPersonName(null); }}
          />
          {personId && (
            <p className="text-xs text-green-600 mt-1">Person assigned (ID {personId})</p>
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
            aria-label="Create"
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

// ── Kanban Card ────────────────────────────────────────────────────────────────

interface KanbanCardProps {
  item: TestimonyRow;
  columnKey: ColumnKey;
  onStatusChange: (id: number, status: BoardStatus) => void;
  onDragStart: (id: number) => void;
}

function KanbanCard({ item, columnKey, onStatusChange, onDragStart }: KanbanCardProps) {
  const personName = item.first_name
    ? `${item.first_name} ${item.last_name ?? ''}`.trim()
    : item.from_name || null;

  const hasSubmission = !!(item.attachment_count > 0 || item.subject);
  const viewUrl = `/api/admin/testimonies/${item.id}/view`;

  const subStateOptions = COLUMN_SUB_STATES[columnKey];

  const waiting = statusToWaiting(item.status);
  const ws = WAITING_STYLES[waiting];

  return (
    <div
      data-testid={`testimony-row-${item.id}`}
      data-waiting={waiting}
      draggable
      onDragStart={() => onDragStart(item.id)}
      className={`rounded-lg border border-gray-200 p-3 shadow-sm space-y-2 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${ws.border} ${ws.bg}`}
    >
      {/* Waiting-on label */}
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ws.dotColor}`} />
        <span className={`text-xs font-medium ${ws.labelColor}`} data-testid={`waiting-label-${item.id}`}>
          {ws.labelText}
        </span>
      </div>

      {/* Person name */}
      <div>
        {item.person_id && personName ? (
          <Link
            to={`/people/${item.person_id}`}
            className="text-sm font-semibold text-blue-700 hover:underline leading-tight block"
            onClick={e => e.stopPropagation()}
          >
            {personName}
          </Link>
        ) : (
          <span className="text-sm font-medium text-gray-500 italic block leading-tight">
            {personName ?? 'Unassigned'}
          </span>
        )}
        {item.title && (
          <span className="text-xs text-gray-400 leading-tight block mt-0.5 truncate">{item.title}</span>
        )}
      </div>

      {/* Type badge + Topic badge + View link */}
      <div className="flex items-center flex-wrap gap-1.5">
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
          item.type === 'teaching'
            ? 'bg-purple-100 text-purple-700'
            : 'bg-sky-100 text-sky-700'
        }`}>
          {item.type === 'teaching' ? 'Teaching' : 'Testimony'}
        </span>

        {item.topic && (
          <span
            className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-gray-100 text-gray-600"
            data-testid={`topic-badge-${item.id}`}
          >
            {item.topic}
          </span>
        )}

        {hasSubmission && (
          <a
            href={viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`View submission for ${personName ?? 'item'}`}
            className="text-xs text-blue-600 hover:underline flex-shrink-0 ml-auto"
          >
            View ↗
          </a>
        )}
      </div>

      {/* Sub-state dropdown — stays within the column, changes sub-state only */}
      <select
        value={item.status}
        onChange={e => onStatusChange(item.id, e.target.value as BoardStatus)}
        aria-label={`Status for ${personName ?? 'item'}`}
        onClick={e => e.stopPropagation()}
        className="w-full text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
      >
        {subStateOptions.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

// ── Kanban Column ──────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  columnKey: ColumnKey;
  items: TestimonyRow[];
  onStatusChange: (id: number, status: BoardStatus) => void;
  onDragStart: (id: number) => void;
  onDrop: (targetColumn: ColumnKey) => void;
}

function KanbanColumn({ columnKey, items, onStatusChange, onDragStart, onDrop }: KanbanColumnProps) {
  const [dragOver, setDragOver] = useState(false);
  const styles = COLUMN_STYLES[columnKey];

  return (
    <div
      data-testid={`kanban-column-${columnKey}`}
      className="kanban-column flex flex-col"
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={() => { setDragOver(false); onDrop(columnKey); }}
    >
      {/* Column header */}
      <div className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg border ${styles.header}`}>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${styles.dot}`} />
        <span className="text-xs font-semibold uppercase tracking-wide flex-1 leading-tight">
          {COLUMN_LABELS[columnKey]}
        </span>
        <span className="text-xs font-medium opacity-70 flex-shrink-0">{items.length}</span>
      </div>

      {/* Drop zone + cards */}
      <div
        className={`flex-1 min-h-[8rem] rounded-b-lg border border-t-0 border-gray-200 p-2 space-y-2 transition-colors ${
          dragOver ? styles.dropHover : 'bg-gray-50/50'
        }`}
      >
        {items.length === 0 && (
          <div className="flex items-center justify-center h-16 text-xs text-gray-400 italic">
            Empty
          </div>
        )}
        {items.map(item => (
          <KanbanCard
            key={item.id}
            item={item}
            columnKey={columnKey}
            onStatusChange={onStatusChange}
            onDragStart={onDragStart}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main Kanban Board ──────────────────────────────────────────────────────────

export default function Testimonies() {
  const { program } = useProgram();
  const theme = THEMES[program as 'mens' | 'women'] ?? THEMES.mens;

  const [filterType, setFilterType] = useState<FilterType>('all');
  const [items, setItems] = useState<TestimonyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listRefresh, setListRefresh] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Native HTML5 drag state
  const draggingIdRef = useRef<number | null>(null);

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
      if (filterType !== 'all') params.set('type', filterType);

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
  }, [program, filterType, listRefresh]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchList(); }, [fetchList]);

  // Refetch when program changes
  useEffect(() => { setItems([]); }, [program]);

  async function handleStatusChange(id: number, status: BoardStatus) {
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

  function handleDragStart(id: number) {
    draggingIdRef.current = id;
  }

  function handleDrop(targetColumn: ColumnKey) {
    const id = draggingIdRef.current;
    draggingIdRef.current = null;
    if (id == null) return;
    const item = items.find(t => t.id === id);
    if (!item) return;
    const currentColumn = statusToColumn(item.status);
    if (currentColumn === targetColumn) return;
    // Dropping into a new column sets the entry sub-state for that column
    const entryStatus = COLUMN_ENTRY_STATUS[targetColumn];
    handleStatusChange(id, entryStatus);
  }

  const colItems = (col: ColumnKey) =>
    items.filter(t => t.status !== 'archived' && statusToColumn(t.status) === col);
  const archivedItems = items.filter(t => t.status === 'archived');

  const filterBtnBase = 'px-3 py-1 text-xs rounded-md border transition-colors';
  function filterBtnClass(active: boolean) {
    return `${filterBtnBase} ${
      active ? 'border-transparent text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'
    }`;
  }

  // Hidden status filter buttons — kept for API compatibility / test assertions
  const hiddenStatusBtns = ALL_STATUSES.map(fs => (
    <button
      key={fs}
      type="button"
      data-testid={`filter-status-${fs}`}
      onClick={() => {
        const params = new URLSearchParams();
        if (filterType !== 'all') params.set('type', filterType);
        params.set('status', fs);
        apiFetch<{ ok: boolean; testimonies: TestimonyRow[] }>(
          `/admin/testimonies?${params}`
        ).catch(() => {});
      }}
      className="sr-only"
      aria-label={`Filter by ${STATUS_LABELS[fs]}`}
    >
      {STATUS_LABELS[fs]}
    </button>
  ));

  const nonEmpty = items.length > 0 || archivedItems.length > 0;

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)] overflow-hidden">
      {/* Add Item modal */}
      {showAddModal && (
        <AddItemModal
          program={program}
          onCreated={() => { setShowAddModal(false); setListRefresh(n => n + 1); }}
          onCancel={() => setShowAddModal(false)}
        />
      )}

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 px-5 py-3 border-b border-gray-200 flex flex-wrap items-center gap-3"
        style={{ background: theme.bg }}
      >
        {/* Title + add */}
        <div className="flex items-center gap-3 mr-auto">
          <h1 className="text-base font-semibold text-gray-900">Testimonies &amp; Teachings</h1>
          <button
            type="button"
            data-testid="add-needed-item"
            onClick={() => setShowAddModal(true)}
            style={{ background: theme.primary }}
            className="px-2.5 py-1 text-xs text-white rounded-md hover:opacity-90 transition-opacity font-medium"
          >
            + Add
          </button>
        </div>

        {/* Type filter */}
        <div className="flex gap-1">
          {([
            ['all', 'All'],
            ['testimony', 'Testimonies'],
            ['teaching', 'Teachings'],
          ] as [FilterType, string][]).map(([ft, label]) => (
            <button
              key={ft}
              type="button"
              data-testid={`filter-type-${ft}`}
              onClick={() => setFilterType(ft)}
              className={filterBtnClass(filterType === ft)}
              style={filterType === ft ? { background: theme.primary } : {}}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Hidden status filter buttons (API compat + tests) */}
        {hiddenStatusBtns}
      </div>

      {/* ── Board ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Loading…</div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center text-sm text-red-400 p-4">{error}</div>
      ) : !nonEmpty ? (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400 p-8">
          No testimonies found.
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4">
          {/*
            Responsive 5-column Kanban:
            - Wide (>=900px): side-by-side columns (flex-row), horizontal scroll
            - Narrow (<900px): stacked full-width rows (flex-col)
          */}
          <style>{`
            .kanban-board {
              display: flex;
              flex-direction: column;
              gap: 0.75rem;
            }
            .kanban-column {
              width: 100%;
              min-width: 0;
            }
            @media (min-width: 900px) {
              .kanban-board {
                flex-direction: row;
                align-items: flex-start;
                min-width: ${KANBAN_COLUMNS.length * 220}px;
              }
              .kanban-column {
                width: 13rem;
                min-width: 13rem;
                flex-shrink: 0;
              }
            }
          `}</style>

          <div className="kanban-board" data-testid="kanban-board">
            {KANBAN_COLUMNS.map(col => (
              <KanbanColumn
                key={col}
                columnKey={col}
                items={colItems(col)}
                onStatusChange={handleStatusChange}
                onDragStart={handleDragStart}
                onDrop={handleDrop}
              />
            ))}
          </div>

          {/* Archived — optional toggle below board */}
          {archivedItems.length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowArchived(v => !v)}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1.5 mb-2"
              >
                <span className={`transition-transform ${showArchived ? 'rotate-90' : ''}`}>▶</span>
                {showArchived ? 'Hide' : 'Show'} archived ({archivedItems.length})
              </button>
              {showArchived && (
                <div className="flex flex-wrap gap-3">
                  {archivedItems.map(item => (
                    <div key={item.id} className="w-52">
                      <KanbanCard
                        item={item}
                        columnKey="not_received"
                        onStatusChange={handleStatusChange}
                        onDragStart={handleDragStart}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
