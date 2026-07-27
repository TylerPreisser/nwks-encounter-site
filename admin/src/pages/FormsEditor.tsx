// admin/src/pages/FormsEditor.tsx
// CMS admin — edit registration form fields for Attendee & Server roles.
// v2: collapsible rows, drag-to-reorder, auto-save (debounced), no help field.
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { apiFetch } from '@/api';
import { useProgram } from '@/App';
import { THEMES } from '@/theme';

// ── Types ──────────────────────────────────────────────────────────────────────

type FieldType = 'text' | 'textarea' | 'dropdown' | 'checkbox' | 'radio' | 'email' | 'phone';

interface FormField {
  id: number;
  program: string;
  role: string;
  name: string;
  label: string;
  type: FieldType;
  options: string | null; // JSON array string
  required: number;
  help: string | null;
  sort: number;
  active: number;
}

const FIELD_TYPES: FieldType[] = ['text', 'textarea', 'dropdown', 'checkbox', 'radio', 'email', 'phone'];
const OPTION_TYPES = new Set<FieldType>(['dropdown', 'checkbox', 'radio']);

function parseOptions(raw: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 64) || 'field';
}

// ── Grip icon ─────────────────────────────────────────────────────────────────

function GripIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="currentColor"
      className="text-gray-400"
    >
      <circle cx="5" cy="4" r="1.2" />
      <circle cx="5" cy="8" r="1.2" />
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="11" cy="4" r="1.2" />
      <circle cx="11" cy="8" r="1.2" />
      <circle cx="11" cy="12" r="1.2" />
    </svg>
  );
}

// ── Save status badge ─────────────────────────────────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  const map: Record<SaveStatus, { text: string; cls: string }> = {
    idle: { text: '', cls: '' },
    saving: { text: 'Saving…', cls: 'text-gray-400' },
    saved: { text: 'Saved', cls: 'text-green-600' },
    error: { text: 'Error saving', cls: 'text-red-500' },
  };
  const { text, cls } = map[status];
  return (
    <span className={`text-xs transition-opacity ${cls}`} aria-live="polite">
      {text}
    </span>
  );
}

// ── Collapsible field row ─────────────────────────────────────────────────────

interface CollapsibleRowProps {
  field: FormField;
  index: number;   // 0-based position in list (for "Question N" label)
  themeAccent: string;
  autoExpand?: boolean;   // expand on first render (for newly added fields)
  onPatch: (id: number, patch: Partial<Omit<FormField, 'id'>>) => Promise<void>;
  onDelete: (id: number) => void;
}

function CollapsibleRow({ field, index, themeAccent, autoExpand, onPatch, onDelete }: CollapsibleRowProps) {
  const [expanded, setExpanded] = useState(autoExpand ?? false);
  const [label, setLabel] = useState(field.label);
  const [type, setType] = useState<FieldType>(field.type as FieldType);
  const [options, setOptions] = useState<string[]>(parseOptions(field.options));
  const [newOption, setNewOption] = useState('');
  const [required, setRequired] = useState(field.required === 1);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isEmailConfirm = field.name === 'email_confirm';

  // Initialise editing state from props ONCE per field identity. We intentionally
  // do NOT re-sync on every field.* change: the row's local state is authoritative
  // while the user edits, and re-syncing from an async save response would clobber
  // whatever they've typed since. A genuinely different field (new id in this slot)
  // still re-initialises correctly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setLabel(field.label);
    setType(field.type as FieldType);
    setOptions(parseOptions(field.options));
    setRequired(field.required === 1);
  }, [field.id]);

  const doPatch = useCallback(async (patch: Partial<Omit<FormField, 'id'>>) => {
    setSaveStatus('saving');
    try {
      await onPatch(field.id, patch);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('error');
    }
  }, [field.id, onPatch]);

  function scheduleAutosave(patch: Partial<Omit<FormField, 'id'>>) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void doPatch(patch);
    }, 600);
  }

  function handleLabelChange(val: string) {
    setLabel(val);
    scheduleAutosave({ label: val.trim() || field.label, type, options: OPTION_TYPES.has(type) ? options : null, required: required ? 1 : 0 });
  }

  function handleTypeChange(val: FieldType) {
    setType(val);
    scheduleAutosave({ label, type: val, options: OPTION_TYPES.has(val) ? options : null, required: required ? 1 : 0 });
  }

  function handleRequiredChange(val: boolean) {
    setRequired(val);
    scheduleAutosave({ label, type, options: OPTION_TYPES.has(type) ? options : null, required: val ? 1 : 0 });
  }

  function addOption() {
    const val = newOption.trim();
    if (!val || options.includes(val)) return;
    const next = [...options, val];
    setOptions(next);
    setNewOption('');
    scheduleAutosave({ label, type, options: next, required: required ? 1 : 0 });
  }

  function removeOption(opt: string) {
    const next = options.filter((o) => o !== opt);
    setOptions(next);
    scheduleAutosave({ label, type, options: next, required: required ? 1 : 0 });
  }

  const showOptions = OPTION_TYPES.has(type);
  const questionLabel = `Question ${index + 1}`;
  const preview = field.label ? ` · ${field.label}` : '';

  // dnd-kit sortable hook — must be called unconditionally
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? 'transform 200ms ease',
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`field-row-${field.id}`}
      className={`rounded-lg border bg-white mb-2 shadow-sm transition-shadow ${isDragging ? 'shadow-lg border-gray-300' : 'border-gray-200'}`}
    >
      {/* Collapsed header row */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        aria-expanded={expanded}
        aria-label={`${questionLabel} expand`}
      >
        {/* Drag handle — stop click from toggling expand */}
        <span
          {...attributes}
          {...listeners}
          aria-label={`Drag handle for ${questionLabel}`}
          onClick={(e) => e.stopPropagation()}
          className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 transition-colors shrink-0 touch-none"
        >
          <GripIcon />
        </span>

        <span className="text-sm font-semibold text-gray-700 shrink-0">{questionLabel}</span>
        <span className="text-xs text-gray-400 truncate flex-1">{preview}</span>

        <SaveBadge status={saveStatus} />

        {/* Chevron */}
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          className={`text-gray-400 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="2,5 7,10 12,5" />
        </svg>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100 pt-3">
          {isEmailConfirm && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-3">
              Note: <strong>email_confirm</strong> is a client-side confirmation field only — it is not stored.
            </p>
          )}

          {/* Label */}
          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              Label <span className="font-normal text-gray-400">(the question wording)</span>
            </label>
            <input
              aria-label={`Label for ${field.name}`}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1"
              style={{ '--tw-ring-color': themeAccent } as React.CSSProperties}
              value={label}
              onChange={(e) => handleLabelChange(e.target.value)}
            />
          </div>

          {/* Type + Required */}
          <div className="flex gap-3 items-center mb-3 flex-wrap">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Type</label>
              <select
                aria-label={`Type for ${field.name}`}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
                value={type}
                onChange={(e) => handleTypeChange(e.target.value as FieldType)}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-0.5">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  aria-label={`Required for ${field.name}`}
                  checked={required}
                  onChange={(e) => handleRequiredChange(e.target.checked)}
                  className="w-4 h-4"
                />
                Required
              </label>
            </div>
          </div>

          {/* Options — only for dropdown/checkbox/radio */}
          {showOptions && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-gray-500 mb-1">Options</p>
              <div className="flex flex-wrap gap-1 mb-2">
                {options.map((opt) => (
                  <span
                    key={opt}
                    className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs rounded px-2 py-0.5"
                  >
                    {opt}
                    <button
                      type="button"
                      aria-label={`Remove option ${opt}`}
                      onClick={() => removeOption(opt)}
                      className="text-gray-400 hover:text-red-500 transition-colors ml-0.5 leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  aria-label={`New option for ${field.name}`}
                  className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                  placeholder="Add option…"
                  value={newOption}
                  onChange={(e) => setNewOption(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
                />
                <button
                  type="button"
                  onClick={addOption}
                  className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {/* Delete */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => onDelete(field.id)}
              aria-label={`Delete ${field.name}`}
              className="px-2 py-1 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Role column ────────────────────────────────────────────────────────────────

interface RoleColumnProps {
  title: string;
  role: 'attendee' | 'server';
  fields: FormField[];
  themeAccent: string;
  newlyAddedId: number | null;
  onPatch: (id: number, patch: Partial<Omit<FormField, 'id'>>) => Promise<void>;
  onDelete: (id: number) => void;
  onReorder: (role: 'attendee' | 'server', orderedIds: number[]) => Promise<void>;
  onAdd: (role: 'attendee' | 'server') => Promise<void>;
}

function RoleColumn({ title, role, fields, themeAccent, newlyAddedId, onPatch, onDelete, onReorder, onAdd }: RoleColumnProps) {
  const [adding, setAdding] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = fields.findIndex((f) => f.id === active.id);
    const newIdx = fields.findIndex((f) => f.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(fields, oldIdx, newIdx);
    await onReorder(role, reordered.map((f) => f.id));
  }

  async function handleAdd() {
    setAdding(true);
    try {
      await onAdd(role);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="flex-1 min-w-[300px]">
      <h2 className="text-base font-bold mb-3" style={{ color: '#1f1f1f' }}>{title}</h2>

      {fields.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-400 mb-3">
          No fields yet. Add one below.
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          {fields.map((field, idx) => (
            <CollapsibleRow
              key={field.id}
              field={field}
              index={idx}
              themeAccent={themeAccent}
              autoExpand={field.id === newlyAddedId}
              onPatch={onPatch}
              onDelete={onDelete}
            />
          ))}
        </SortableContext>
      </DndContext>

      <button
        type="button"
        onClick={handleAdd}
        disabled={adding}
        className="mt-3 w-full py-2 text-sm rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        aria-label={`Add ${role} question`}
      >
        {adding ? 'Adding…' : '+ Add question'}
      </button>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function FormsEditor() {
  const { program } = useProgram();
  const theme = THEMES[program];

  const [attendeeFields, setAttendeeFields] = useState<FormField[]>([]);
  const [serverFields, setServerFields] = useState<FormField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [newlyAddedId, setNewlyAddedId] = useState<number | null>(null);

  // load() has two modes:
  //   - full (default): shows the loading spinner — used for the initial load and
  //     when switching program. This unmounts the field list, which is fine here.
  //   - silent: refetches in the background WITHOUT flipping `loading`, so the
  //     field rows are reconciled by key and keep their expanded/focus state.
  //     Used after add/delete/reorder so the page never "reloads" under the user.
  const load = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{
        ok: boolean;
        fields: { attendee: FormField[]; server: FormField[] };
      }>('/admin/form-fields');
      setAttendeeFields(res.fields.attendee ?? []);
      setServerFields(res.fields.server ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fields');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [program]);

  useEffect(() => { void load(); }, [load]);

  // Merge a saved patch into local state in place (no refetch). Normalises the
  // `options` array back to the JSON string the FormField shape uses so the
  // collapsed-row preview stays in sync without ever remounting the editor.
  function mergePatch(list: FormField[], id: number, patch: Partial<Omit<FormField, 'id'>>): FormField[] {
    return list.map((f) => {
      if (f.id !== id) return f;
      const merged = { ...f, ...patch } as FormField;
      const rawOptions = (patch as { options?: unknown }).options;
      if (rawOptions !== undefined) {
        merged.options = rawOptions == null ? null : JSON.stringify(rawOptions);
      }
      return merged;
    });
  }

  // Autosave path — the one the user hits constantly. It must NOT refetch or
  // toggle loading; that was collapsing every open question mid-edit.
  async function handlePatch(id: number, patch: Partial<Omit<FormField, 'id'>>) {
    await apiFetch<{ ok: boolean }>(`/admin/form-fields/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    setAttendeeFields((prev) => mergePatch(prev, id, patch));
    setServerFields((prev) => mergePatch(prev, id, patch));
  }

  function handleDelete(id: number) {
    setDeleteTarget(id);
  }

  async function confirmDelete() {
    if (deleteTarget == null) return;
    await apiFetch<{ ok: boolean }>(`/admin/form-fields/${deleteTarget}`, { method: 'DELETE' });
    setDeleteTarget(null);
    await load({ silent: true });
  }

  async function handleReorder(role: 'attendee' | 'server', orderedIds: number[]) {
    await apiFetch<{ ok: boolean }>('/admin/form-fields/reorder', {
      method: 'POST',
      body: JSON.stringify({ role, ordered_ids: orderedIds }),
    });
    await load({ silent: true });
  }

  async function handleAdd(role: 'attendee' | 'server') {
    const label = 'New question';
    const name = slugify(label) + '_' + Date.now();
    const res = await apiFetch<{ ok: boolean; field?: FormField }>('/admin/form-fields', {
      method: 'POST',
      body: JSON.stringify({ role, name, label, type: 'text' }),
    });
    if (res.field?.id) {
      setNewlyAddedId(res.field.id);
      setTimeout(() => setNewlyAddedId(null), 100);
    }
    await load({ silent: true });
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: theme.primary }}>
          Registration Forms
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Edit the questions that appear on the {program === 'mens' ? "Men's" : "Women's"} registration forms.
          Changes save automatically.
        </p>
      </div>

      {loading && (
        <p className="text-sm text-gray-400 animate-pulse">Loading fields…</p>
      )}

      {error && (
        <p role="alert" className="text-red-600 text-sm mb-4">{error}</p>
      )}

      {!loading && !error && (
        <div className="flex gap-6 flex-wrap lg:flex-nowrap">
          <RoleColumn
            title="Attendee Form"
            role="attendee"
            fields={attendeeFields}
            themeAccent={theme.accent}
            newlyAddedId={newlyAddedId}
            onPatch={handlePatch}
            onDelete={handleDelete}
            onReorder={handleReorder}
            onAdd={handleAdd}
          />
          <RoleColumn
            title="Server Form"
            role="server"
            fields={serverFields}
            themeAccent={theme.accent}
            newlyAddedId={newlyAddedId}
            onPatch={handlePatch}
            onDelete={handleDelete}
            onReorder={handleReorder}
            onAdd={handleAdd}
          />
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget != null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        >
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-800 mb-2">Delete this field?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will permanently remove the field from the form. Previously submitted data is not affected.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-3 py-1.5 text-sm rounded font-semibold text-white bg-red-600 hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
