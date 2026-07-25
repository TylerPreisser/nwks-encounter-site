// admin/src/pages/FormsEditor.tsx
// CMS admin — edit registration form fields for Attendee & Server roles.
import { useEffect, useState, useCallback } from 'react';
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

// ── Sub-component: editable field row ─────────────────────────────────────────

interface FieldRowProps {
  field: FormField;
  isFirst: boolean;
  isLast: boolean;
  themeAccent: string;
  onPatch: (id: number, patch: Partial<Omit<FormField, 'id'>>) => Promise<void>;
  onDelete: (id: number) => void;
  onMoveUp: (id: number) => void;
  onMoveDown: (id: number) => void;
}

function FieldRow({ field, isFirst, isLast, themeAccent, onPatch, onDelete, onMoveUp, onMoveDown }: FieldRowProps) {
  const [label, setLabel] = useState(field.label);
  const [type, setType] = useState<FieldType>(field.type as FieldType);
  const [options, setOptions] = useState<string[]>(parseOptions(field.options));
  const [newOption, setNewOption] = useState('');
  const [required, setRequired] = useState(field.required === 1);
  const [help, setHelp] = useState(field.help ?? '');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // track if field comes from server
  const isEmailConfirm = field.name === 'email_confirm';

  function markDirty() { setDirty(true); }

  async function save() {
    if (!label.trim()) return;
    setSaving(true);
    await onPatch(field.id, {
      label: label.trim(),
      type,
      options: OPTION_TYPES.has(type) ? options : null,
      required: required ? 1 : 0,
      help: help.trim() || null,
    });
    setSaving(false);
    setDirty(false);
  }

  function addOption() {
    const val = newOption.trim();
    if (!val || options.includes(val)) return;
    const next = [...options, val];
    setOptions(next);
    setNewOption('');
    setDirty(true);
  }

  function removeOption(opt: string) {
    setOptions(options.filter((o) => o !== opt));
    setDirty(true);
  }

  const showOptions = OPTION_TYPES.has(type);

  return (
    <div
      className="rounded-lg border border-gray-200 bg-white p-4 mb-3 shadow-sm"
      data-testid={`field-row-${field.id}`}
    >
      {isEmailConfirm && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2">
          Note: <strong>email_confirm</strong> is a client-side confirmation field only — it is not stored.
        </p>
      )}

      {/* Label + type row */}
      <div className="flex flex-wrap gap-3 items-start mb-3">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-semibold text-gray-500 mb-1">
            Question / Label
          </label>
          <input
            aria-label={`Label for ${field.name}`}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1"
            style={{ '--tw-ring-color': themeAccent } as React.CSSProperties}
            value={label}
            onChange={(e) => { setLabel(e.target.value); markDirty(); }}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Type</label>
          <select
            aria-label={`Type for ${field.name}`}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
            value={type}
            onChange={(e) => { setType(e.target.value as FieldType); markDirty(); }}
          >
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              aria-label={`Required for ${field.name}`}
              checked={required}
              onChange={(e) => { setRequired(e.target.checked); markDirty(); }}
              className="w-4 h-4"
            />
            Required
          </label>
        </div>
      </div>

      {/* Options (for dropdown/checkbox/radio) */}
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

      {/* Help text */}
      <div className="mb-3">
        <label className="block text-xs font-semibold text-gray-500 mb-1">
          Help text <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <input
          aria-label={`Help text for ${field.name}`}
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
          value={help}
          onChange={(e) => { setHelp(e.target.value); markDirty(); }}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="px-3 py-1.5 text-xs rounded font-semibold text-white transition-opacity disabled:opacity-40"
          style={{ background: themeAccent }}
          aria-label={`Save ${field.name}`}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>

        <div className="flex gap-1 ml-auto">
          <button
            type="button"
            onClick={() => onMoveUp(field.id)}
            disabled={isFirst}
            aria-label={`Move ${field.name} up`}
            className="px-2 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMoveDown(field.id)}
            disabled={isLast}
            aria-label={`Move ${field.name} down`}
            className="px-2 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-30"
          >
            ↓
          </button>
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
    </div>
  );
}

// ── Sub-component: Add Field form ──────────────────────────────────────────────

interface AddFieldFormProps {
  role: 'attendee' | 'server';
  themeAccent: string;
  onAdd: (role: 'attendee' | 'server', label: string, type: FieldType) => Promise<void>;
}

function AddFieldForm({ role, themeAccent, onAdd }: AddFieldFormProps) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<FieldType>('text');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onAdd(role, label.trim(), type);
      setLabel('');
      setType('text');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add field');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={`Add ${role} field`}
      className="mt-4 border-t border-dashed border-gray-200 pt-4"
    >
      <p className="text-xs font-semibold text-gray-500 mb-2">Add a field</p>
      <div className="flex gap-2 flex-wrap">
        <input
          aria-label={`New ${role} field label`}
          className="flex-1 min-w-[150px] border border-gray-300 rounded px-2 py-1.5 text-sm"
          placeholder="Question / label…"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
        />
        <select
          aria-label={`New ${role} field type`}
          className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
          value={type}
          onChange={(e) => setType(e.target.value as FieldType)}
        >
          {FIELD_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={saving || !label.trim()}
          className="px-3 py-1.5 text-xs rounded font-semibold text-white transition-opacity disabled:opacity-40"
          style={{ background: themeAccent }}
        >
          {saving ? 'Adding…' : '+ Add Field'}
        </button>
      </div>
      {error && <p role="alert" className="text-red-600 text-xs mt-1">{error}</p>}
    </form>
  );
}

// ── Sub-component: Role column ─────────────────────────────────────────────────

interface RoleColumnProps {
  title: string;
  role: 'attendee' | 'server';
  fields: FormField[];
  themeAccent: string;
  onPatch: (id: number, patch: Partial<Omit<FormField, 'id'>>) => Promise<void>;
  onDelete: (id: number) => void;
  onReorder: (role: 'attendee' | 'server', orderedIds: number[]) => Promise<void>;
  onAdd: (role: 'attendee' | 'server', label: string, type: FieldType) => Promise<void>;
}

function RoleColumn({ title, role, fields, themeAccent, onPatch, onDelete, onReorder, onAdd }: RoleColumnProps) {
  async function moveUp(id: number) {
    const idx = fields.findIndex((f) => f.id === id);
    if (idx <= 0) return;
    const next = [...fields];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    await onReorder(role, next.map((f) => f.id));
  }

  async function moveDown(id: number) {
    const idx = fields.findIndex((f) => f.id === id);
    if (idx < 0 || idx >= fields.length - 1) return;
    const next = [...fields];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    await onReorder(role, next.map((f) => f.id));
  }

  return (
    <div className="flex-1 min-w-[300px]">
      <h2 className="text-base font-bold mb-3" style={{ color: '#1f1f1f' }}>{title}</h2>

      {fields.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-400 mb-3">
          No fields yet. Add one below.
        </div>
      )}

      {fields.map((field, idx) => (
        <FieldRow
          key={field.id}
          field={field}
          isFirst={idx === 0}
          isLast={idx === fields.length - 1}
          themeAccent={themeAccent}
          onPatch={onPatch}
          onDelete={onDelete}
          onMoveUp={moveUp}
          onMoveDown={moveDown}
        />
      ))}

      <AddFieldForm role={role} themeAccent={themeAccent} onAdd={onAdd} />
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

  const load = useCallback(async () => {
    setLoading(true);
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
      setLoading(false);
    }
  }, [program]);

  useEffect(() => { load(); }, [load]);

  async function handlePatch(id: number, patch: Partial<Omit<FormField, 'id'>>) {
    const body: Record<string, unknown> = {};
    if ('label' in patch) body.label = patch.label;
    if ('type' in patch) body.type = patch.type;
    if ('options' in patch) body.options = patch.options != null ? parseOptions(patch.options as string | null ?? null) : null;
    if ('required' in patch) body.required = patch.required;
    if ('help' in patch) body.help = patch.help;
    if ('sort' in patch) body.sort = patch.sort;

    // For options, we want to pass the array directly (not re-parse)
    const finalBody = { ...patch };
    // patch.options is already null or the new array was set by FieldRow directly
    await apiFetch<{ ok: boolean }>(`/admin/form-fields/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(finalBody),
    });
    await load();
  }

  function handleDelete(id: number) {
    setDeleteTarget(id);
  }

  async function confirmDelete() {
    if (deleteTarget == null) return;
    await apiFetch<{ ok: boolean }>(`/admin/form-fields/${deleteTarget}`, { method: 'DELETE' });
    setDeleteTarget(null);
    await load();
  }

  async function handleReorder(role: 'attendee' | 'server', orderedIds: number[]) {
    await apiFetch<{ ok: boolean }>('/admin/form-fields/reorder', {
      method: 'POST',
      body: JSON.stringify({ role, ordered_ids: orderedIds }),
    });
    await load();
  }

  async function handleAdd(role: 'attendee' | 'server', label: string, type: FieldType) {
    const name = slugify(label);
    await apiFetch<{ ok: boolean }>('/admin/form-fields', {
      method: 'POST',
      body: JSON.stringify({ role, name, label, type }),
    });
    await load();
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: theme.primary }}>
          Registration Forms
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Edit the questions that appear on the {program === 'mens' ? "Men's" : "Women's"} registration forms.
          Changes take effect immediately on the public site.
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
