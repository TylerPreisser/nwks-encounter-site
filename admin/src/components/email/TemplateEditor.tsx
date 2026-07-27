import { useState, useEffect, useMemo } from 'react';
import { useProgram } from '@/App';
import { RichTextEditor, resolveTokensForPreview, htmlToText } from './RichTextEditor';

interface Template {
  id: number; program: string; key: string; name: string;
  subject: string; body_html: string; body_text: string;
  variables: string; updated_at: string;
}

// The branded olive header/footer are locked; only the message region between
// these markers is edited. Everything outside stays exactly on-brand.
const MARK_START = '<!--EDITABLE_START-->';
const MARK_END = '<!--EDITABLE_END-->';

interface Split { before: string; editable: string; after: string; hasMarkers: boolean; }

/** Split a full-document template into locked wrapper + editable message. */
function splitTemplate(bodyHtml: string): Split {
  const s = bodyHtml.indexOf(MARK_START);
  const e = bodyHtml.indexOf(MARK_END);
  if (s === -1 || e === -1 || e < s) {
    // No markers (custom/legacy template) — edit the whole thing.
    return { before: '', editable: bodyHtml, after: '', hasMarkers: false };
  }
  return {
    before: bodyHtml.slice(0, s + MARK_START.length),
    editable: bodyHtml.slice(s + MARK_START.length, e).trim(),
    after: bodyHtml.slice(e),
    hasMarkers: true,
  };
}

/** Re-insert the edited message into the locked wrapper. */
function reassemble(split: Split, editable: string): string {
  if (!split.hasMarkers) return editable;
  return `${split.before}\n${editable}\n${split.after}`;
}

export function TemplateEditor() {
  const { program } = useProgram();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [split, setSplit] = useState<Split>({ before: '', editable: '', after: '', hasMarkers: false });
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [editable, setEditable] = useState('');   // inner message HTML (with {{tokens}})
  const [editableText, setEditableText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');

  useEffect(() => {
    fetch(`/api/admin/templates?program=${program}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const list: Template[] = d.templates ?? [];
        setTemplates(list);
        const general = list.find(t => t.key === 'general') ?? list[0];
        if (general) selectTemplate(general);
        else setSelected(null);
      })
      .catch(() => setError('Could not load templates.'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program]);

  function selectTemplate(t: Template) {
    const sp = splitTemplate(t.body_html);
    setSelected(t);
    setSplit(sp);
    setName(t.name);
    setSubject(t.subject);
    setEditable(sp.editable);
    setEditableText(htmlToText(sp.editable));
    setSaved(false);
    setError('');
    setSaveAsOpen(false);
  }

  function currentBodyHtml(): string {
    return reassemble(split, editable);
  }

  async function save() {
    if (!selected) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      const res = await fetch(`/api/admin/templates/${selected.id}?program=${program}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, subject, body_html: currentBodyHtml(), body_text: editableText }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'save failed');
      const updated: Template = data.template;
      setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t));
      setSelected(updated);
      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'unknown error');
    } finally {
      setSaving(false);
    }
  }

  async function saveAsNew() {
    const newName = saveAsName.trim();
    if (!newName) { setError('Give the new template a name.'); return; }
    setSaving(true); setError(''); setSaved(false);
    try {
      const res = await fetch(`/api/admin/templates?program=${program}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, subject, body_html: currentBodyHtml(), body_text: editableText, variables: ['first_name'] }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'save failed');
      const created: Template = data.template;
      setTemplates(prev => [...prev, created]);
      selectTemplate(created);
      setSaveAsOpen(false);
      setSaveAsName('');
      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'unknown error');
    } finally {
      setSaving(false);
    }
  }

  async function deleteSelected() {
    if (!selected || selected.key === 'general') return;
    if (!confirm(`Delete the template “${selected.name}”? This cannot be undone.`)) return;
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/admin/templates/${selected.id}?program=${program}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'delete failed');
      const remaining = templates.filter(t => t.id !== selected.id);
      setTemplates(remaining);
      const general = remaining.find(t => t.key === 'general') ?? remaining[0] ?? null;
      if (general) selectTemplate(general); else setSelected(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'unknown error');
    } finally {
      setSaving(false);
    }
  }

  // Full-branded live preview (tokens resolved to sample values).
  const previewDoc = useMemo(
    () => reassemble(split, resolveTokensForPreview(editable)),
    [split, editable],
  );

  const isGeneral = selected?.key === 'general';

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* ── Template library ─────────────────────────────────────── */}
      <aside className="col-span-3">
        <h3 className="font-semibold text-gray-700 mb-2 text-xs uppercase tracking-wide">Your templates</h3>
        <ul className="space-y-1">
          {templates.map(t => (
            <li key={t.id}>
              <button
                onClick={() => selectTemplate(t)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  selected?.id === t.id ? 'font-semibold' : 'hover:bg-gray-100'
                }`}
                style={selected?.id === t.id
                  ? { background: 'var(--color-primary)', color: '#fff' }
                  : undefined}
              >
                {t.name}
                {t.key === 'general' && (
                  <span className="block text-[11px] opacity-70">General template</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* ── Editor ────────────────────────────────────────────────── */}
      <section className="col-span-5 space-y-4">
        {!selected && <p className="text-gray-400 text-sm mt-8">No template selected.</p>}
        {selected && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Template name</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={name}
                onChange={e => setName(e.target.value)}
                aria-label="Template name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Subject line</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                aria-label="Subject line"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">
                Message <span className="font-normal text-gray-400">— top, middle &amp; bottom. Drop or paste photos right in.</span>
              </label>
              <RichTextEditor
                value={editable}
                onChange={(html, text) => { setEditable(html); setEditableText(text); }}
                label="Email message body"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                The green header &amp; footer are locked to keep every email on-brand.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 text-white text-sm rounded-lg disabled:opacity-50"
                style={{ background: 'var(--color-primary)' }}
              >
                {saving ? 'Saving…' : isGeneral ? 'Save changes' : 'Save changes'}
              </button>
              <button
                onClick={() => { setSaveAsOpen(v => !v); setSaveAsName(isGeneral ? '' : `${name} copy`); }}
                disabled={saving}
                className="px-4 py-2 text-sm rounded-lg border disabled:opacity-50"
                style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
              >
                Save as new template
              </button>
              {selected && !isGeneral && (
                <button
                  onClick={deleteSelected}
                  disabled={saving}
                  className="px-3 py-2 text-sm rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Delete
                </button>
              )}
              {saved && <span className="text-green-600 text-sm">Saved.</span>}
              {error && <span className="text-red-600 text-sm">{error}</span>}
            </div>

            {saveAsOpen && (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <input
                  autoFocus
                  className="flex-1 border rounded px-3 py-2 text-sm"
                  placeholder="New template name…"
                  aria-label="New template name"
                  value={saveAsName}
                  onChange={e => setSaveAsName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void saveAsNew(); }}
                />
                <button
                  onClick={saveAsNew}
                  disabled={saving}
                  className="px-3 py-2 text-white text-sm rounded-lg disabled:opacity-50"
                  style={{ background: 'var(--color-primary)' }}
                >
                  Create
                </button>
                <button
                  onClick={() => setSaveAsOpen(false)}
                  className="px-3 py-2 text-sm rounded-lg text-gray-500 hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Full-email preview ────────────────────────────────────── */}
      <section className="col-span-4">
        <h3 className="font-semibold text-gray-700 mb-2 text-xs uppercase tracking-wide">Live preview</h3>
        <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm bg-white">
          <iframe
            title="Email preview"
            data-testid="template-preview"
            srcDoc={previewDoc}
            className="w-full"
            style={{ height: 560, border: 0 }}
          />
        </div>
      </section>
    </div>
  );
}
