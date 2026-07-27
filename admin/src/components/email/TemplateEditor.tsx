import { useState, useEffect, useRef, useCallback } from 'react';
import { useProgram } from '@/App';
import { imageFileToDataUrl, FIELD_TOKENS } from './RichTextEditor';

interface Template {
  id: number; program: string; key: string; name: string;
  subject: string; body_html: string; body_text: string;
  variables: string; updated_at: string;
}

// The branded olive header/footer are locked; only the message region between
// these markers is edited — directly on the live email.
const MARK_START = '<!--EDITABLE_START-->';
const MARK_END = '<!--EDITABLE_END-->';
interface Split { before: string; editable: string; after: string; hasMarkers: boolean; }

function splitTemplate(bodyHtml: string): Split {
  const s = bodyHtml.indexOf(MARK_START);
  const e = bodyHtml.indexOf(MARK_END);
  if (s === -1 || e === -1 || e < s) return { before: '', editable: bodyHtml, after: '', hasMarkers: false };
  return {
    before: bodyHtml.slice(0, s + MARK_START.length),
    editable: bodyHtml.slice(s + MARK_START.length, e).trim(),
    after: bodyHtml.slice(e),
    hasMarkers: true,
  };
}
function reassemble(split: Split, editable: string): string {
  if (!split.hasMarkers) return editable;
  return `${split.before}\n${editable}\n${split.after}`;
}

// Body background of each program's email (the <body> tag is stripped when we
// inject the HTML into a div, so we set it on the frame instead).
const EMAIL_BG: Record<'mens' | 'women', string> = { mens: '#f2efe6', women: '#fdf5f7' };
const AUTOMATED_KEYS = new Set(['confirmation']);

export function TemplateEditor() {
  const { program } = useProgram();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState('');

  const frameRef = useRef<HTMLDivElement>(null);
  const msgRef = useRef<HTMLElement | null>(null);
  const splitRef = useRef<Split>({ before: '', editable: '', after: '', hasMarkers: false });
  const messageRef = useRef<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  const loadTemplates = useCallback(() => {
    fetch(`/api/admin/templates?program=${program}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        const list: Template[] = d.templates ?? [];
        setTemplates(list);
        const general = list.find((t) => t.key === 'general') ?? list[0];
        if (general) selectTemplate(general); else setSelected(null);
      })
      .catch(() => setError('Could not load templates.'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program]);
  useEffect(loadTemplates, [program]);

  function selectTemplate(t: Template) {
    setSelected(t); setName(t.name); setSubject(t.subject);
    setSaved(false); setError(''); setSaveAsOpen(false); setDirty(false);
  }

  // Render the branded email into the frame; make ONLY the message region editable.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !selected) return;
    const sp = splitTemplate(selected.body_html);
    splitRef.current = sp;
    messageRef.current = sp.editable;
    frame.innerHTML = sp.hasMarkers
      ? `${sp.before}<div data-pe-msg>${sp.editable}</div>${sp.after}`
      : `<div data-pe-msg>${sp.editable}</div>`;
    const msg = frame.querySelector('[data-pe-msg]') as HTMLElement | null;
    msgRef.current = msg;
    if (!msg) return;
    msg.setAttribute('contenteditable', 'true');
    msg.style.outline = 'none';
    const onInput = () => { messageRef.current = msg.innerHTML; setDirty(true); setSaved(false); };
    msg.addEventListener('input', onInput);
    return () => msg.removeEventListener('input', onInput);
  }, [selected?.id]);

  function sync() { if (msgRef.current) messageRef.current = msgRef.current.innerHTML; setDirty(true); setSaved(false); }
  function exec(cmd: string, val?: string) { msgRef.current?.focus(); document.execCommand(cmd, false, val); sync(); }
  function insertToken(tok: string) { msgRef.current?.focus(); document.execCommand('insertText', false, tok); sync(); }
  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files; if (!files) return;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      const dataUrl = await imageFileToDataUrl(f);
      if (!dataUrl) continue;
      msgRef.current?.focus();
      document.execCommand('insertHTML', false,
        `<img src="${dataUrl}" alt="" width="520" style="max-width:100%;height:auto;border-radius:6px;display:block;margin:12px 0;" />`);
      sync();
    }
    e.target.value = '';
  }

  function currentBodyHtml(): string { return reassemble(splitRef.current, messageRef.current); }
  function currentBodyText(): string {
    const tmp = document.createElement('div');
    tmp.innerHTML = messageRef.current;
    return (tmp.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
  }

  async function save() {
    if (!selected) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      const res = await fetch(`/api/admin/templates/${selected.id}?program=${program}`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, subject, body_html: currentBodyHtml(), body_text: currentBodyText() }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'save failed');
      setTemplates((prev) => prev.map((t) => (t.id === selected.id ? data.template : t)));
      setSelected(data.template); setDirty(false); setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'unknown error');
    } finally { setSaving(false); }
  }

  async function saveAsNew() {
    const newName = saveAsName.trim();
    if (!newName) { setError('Give the new template a name.'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/admin/templates?program=${program}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, subject, body_html: currentBodyHtml(), body_text: currentBodyText(), variables: ['first_name'] }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'save failed');
      setTemplates((prev) => [...prev, data.template]);
      selectTemplate(data.template);
      setSaveAsOpen(false); setSaveAsName(''); setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'unknown error');
    } finally { setSaving(false); }
  }

  async function deleteSelected() {
    if (!selected || selected.key === 'general' || AUTOMATED_KEYS.has(selected.key)) return;
    if (!confirm(`Delete the template “${selected.name}”? This cannot be undone.`)) return;
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/admin/templates/${selected.id}?program=${program}`, { method: 'DELETE', credentials: 'include' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? 'delete failed');
      const remaining = templates.filter((t) => t.id !== selected.id);
      setTemplates(remaining);
      const g = remaining.find((t) => t.key === 'general') ?? remaining[0] ?? null;
      if (g) selectTemplate(g); else setSelected(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'unknown error');
    } finally { setSaving(false); }
  }

  const isGeneral = selected?.key === 'general';
  const isAutomated = selected ? AUTOMATED_KEYS.has(selected.key) : false;
  const automated = templates.filter((t) => AUTOMATED_KEYS.has(t.key));
  const manual = templates.filter((t) => !AUTOMATED_KEYS.has(t.key));

  const renderItem = (t: Template) => (
    <li key={t.id}>
      <button onClick={() => selectTemplate(t)}
        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selected?.id === t.id ? 'font-semibold' : 'hover:bg-gray-100'}`}
        style={selected?.id === t.id ? { background: 'var(--color-primary)', color: '#fff' } : undefined}>
        {t.name}
        {t.key === 'general' && <span className="block text-[11px] opacity-70">Start here — your general template</span>}
        {AUTOMATED_KEYS.has(t.key) && <span className="block text-[11px] opacity-70">Sent automatically on registration</span>}
      </button>
    </li>
  );

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Template library */}
      <aside className="col-span-3 space-y-5">
        {automated.length > 0 && (
          <div>
            <h3 className="font-semibold text-gray-500 mb-2 text-xs uppercase tracking-wide flex items-center gap-1.5">
              <span aria-hidden="true">⚙️</span> Automated emails
            </h3>
            <ul className="space-y-1">{automated.map(renderItem)}</ul>
          </div>
        )}
        <div>
          <h3 className="font-semibold text-gray-500 mb-2 text-xs uppercase tracking-wide">Your templates</h3>
          <ul className="space-y-1">{manual.map(renderItem)}</ul>
        </div>
      </aside>

      {/* Live email editor */}
      <section className="col-span-9 space-y-3">
        {!selected && <p className="text-gray-400 text-sm mt-8">No template selected.</p>}
        {selected && (
          <>
            {isAutomated && (
              <div className="text-xs rounded-lg px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800">
                This email is sent <strong>automatically</strong> when someone registers. Edit it right on the preview below.
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Template name</label>
                <input className="w-full border rounded px-3 py-2 text-sm" value={name} aria-label="Template name"
                  onChange={(e) => { setName(e.target.value); setDirty(true); }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Subject line</label>
                <input className="w-full border rounded px-3 py-2 text-sm" value={subject} aria-label="Subject line"
                  onChange={(e) => { setSubject(e.target.value); setDirty(true); }} />
              </div>
            </div>

            {/* Floating format toolbar — operates on the live message region */}
            <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border border-gray-200 rounded-t-lg bg-gray-50 text-sm">
              <button type="button" title="Bold" aria-label="Bold" className="px-2 py-1 rounded hover:bg-gray-200 font-bold"
                onMouseDown={(e) => { e.preventDefault(); exec('bold'); }}>B</button>
              <button type="button" title="Italic" aria-label="Italic" className="px-2 py-1 rounded hover:bg-gray-200 italic"
                onMouseDown={(e) => { e.preventDefault(); exec('italic'); }}>I</button>
              <span className="w-px h-5 bg-gray-300 mx-0.5" />
              <button type="button" title="Insert photo" aria-label="Insert photo" className="px-2 py-1 rounded hover:bg-gray-200"
                onMouseDown={(e) => { e.preventDefault(); fileRef.current?.click(); }}>📷 Photo</button>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" aria-label="Upload photo" data-testid="photo-input" onChange={onPhoto} />
              <span className="w-px h-5 bg-gray-300 mx-0.5" />
              <select aria-label="Insert field" defaultValue="" className="text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => { if (e.target.value) { insertToken(e.target.value); e.target.value = ''; } }}>
                <option value="">Insert field…</option>
                {FIELD_TOKENS.map((f) => <option key={f.token} value={f.token}>{f.label}</option>)}
              </select>
              <span className="ml-auto text-[11px] text-gray-400 pr-1">Click the message below and type — the green header &amp; footer stay branded.</span>
            </div>

            {/* The actual branded email — message region is editable in place */}
            <div
              ref={frameRef} data-testid="live-email"
              className="border border-gray-200 border-t-0 rounded-b-lg overflow-auto"
              style={{ background: EMAIL_BG[program], maxHeight: 620 }}
            />

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button onClick={save} disabled={saving} className="px-4 py-2 text-white text-sm rounded-lg disabled:opacity-50" style={{ background: 'var(--color-primary)' }}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button onClick={() => { setSaveAsOpen((v) => !v); setSaveAsName(isGeneral || isAutomated ? '' : `${name} copy`); }}
                disabled={saving} className="px-4 py-2 text-sm rounded-lg border disabled:opacity-50"
                style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>Save as new template</button>
              {selected && !isGeneral && !isAutomated && (
                <button onClick={deleteSelected} disabled={saving} className="px-3 py-2 text-sm rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50">Delete</button>
              )}
              {saved && <span className="text-green-600 text-sm">Saved.</span>}
              {dirty && !saved && <span className="text-amber-600 text-sm">Unsaved changes</span>}
              {error && <span className="text-red-600 text-sm">{error}</span>}
            </div>

            {saveAsOpen && (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <input autoFocus className="flex-1 border rounded px-3 py-2 text-sm" placeholder="New template name…" aria-label="New template name"
                  value={saveAsName} onChange={(e) => setSaveAsName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void saveAsNew(); }} />
                <button onClick={saveAsNew} disabled={saving} className="px-3 py-2 text-white text-sm rounded-lg disabled:opacity-50" style={{ background: 'var(--color-primary)' }}>Create</button>
                <button onClick={() => setSaveAsOpen(false)} className="px-3 py-2 text-sm rounded-lg text-gray-500 hover:bg-gray-100">Cancel</button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
