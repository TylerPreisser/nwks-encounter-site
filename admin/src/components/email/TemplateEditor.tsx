import { useState, useEffect } from 'react';
import { useProgram } from '@/App';
import { RichTextEditor } from './RichTextEditor';

interface Template {
  id: number; program: string; key: string; name: string;
  subject: string; body_html: string; body_text: string;
  variables: string; updated_at: string;
}

export function TemplateEditor() {
  const { program } = useProgram();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [form, setForm] = useState({ name: '', subject: '', body_html: '', body_text: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/admin/templates?program=${program}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const list: Template[] = d.templates ?? [];
        setTemplates(list);
        // Auto-select the first template on mount / program change
        if (list.length > 0) {
          selectTemplate(list[0]);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program]);

  function selectTemplate(t: Template) {
    setSelected(t);
    setForm({ name: t.name, subject: t.subject, body_html: t.body_html, body_text: t.body_text });
    setSaved(false);
    setError('');
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(
        `/api/admin/templates/${selected.id}?program=${program}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        }
      );
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'save failed');
      setTemplates(prev => prev.map(t => t.id === selected.id ? { ...t, ...form } : t));
      setSelected(prev => prev ? { ...prev, ...form } : prev);
      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'unknown error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-4 gap-4">
      <aside className="col-span-1 border-r border-gray-200 pr-4">
        <h3 className="font-semibold text-gray-700 mb-2 text-sm uppercase tracking-wide">Templates</h3>
        <ul className="space-y-1">
          {templates.map(t => (
            <li key={t.id}>
              <button
                onClick={() => selectTemplate(t)}
                className={`w-full text-left px-2 py-1 rounded text-sm ${
                  selected?.id === t.id ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-gray-100'
                }`}
              >
                {t.name}
                <span className="block text-xs text-gray-400">{t.program} · {t.key}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="col-span-3 space-y-4">
        {!selected && (
          <p className="text-gray-400 text-sm mt-8">Select a template to edit.</p>
        )}
        {selected && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Body</label>
              <RichTextEditor
                value={form.body_html}
                onChange={(html, text) => setForm(f => ({ ...f, body_html: html, body_text: text }))}
                label="Template body"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Template'}
              </button>
              {saved && <span className="text-green-600 text-sm">Saved.</span>}
              {error && <span className="text-red-600 text-sm">{error}</span>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
