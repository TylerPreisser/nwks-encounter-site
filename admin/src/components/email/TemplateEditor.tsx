import { useState, useEffect, useRef, useCallback } from 'react';
import { useProgram } from '@/App';
import { imageFileToDataUrl, FIELD_TOKENS, tokenizeToChips, chipsToTokens } from './RichTextEditor';

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
const LAUNCH_LOCATIONS = ['Colby', 'Gove', 'Hays', 'Hoxie', 'Norton', 'Plainville', 'Sterling', 'WaKeeney'];

interface Segment { role?: 'attendee' | 'server' | ''; launch_location?: string; launch_locations?: string[]; person_ids?: number[]; }
interface Campaign {
  id: number; subject: string; status: string; recipient_count: number;
  created_at: string; sent_at: string | null;
}

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

  // Send + history
  const [sendMode, setSendMode] = useState<'group' | 'individual'>('group');
  const [role, setRole] = useState<'' | 'attendee' | 'server'>('');
  const [launchSel, setLaunchSel] = useState<string[]>([]);
  const [personQuery, setPersonQuery] = useState('');
  const [personResults, setPersonResults] = useState<Array<{ person_id: number; name: string; email: string; role: string }>>([]);
  const [selectedPerson, setSelectedPerson] = useState<{ person_id: number; name: string; email: string } | null>(null);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState('');
  const [history, setHistory] = useState<Campaign[]>([]);
  const savedRangeRef = useRef<Range | null>(null);

  function buildSegment(): Segment {
    if (sendMode === 'individual') return { person_ids: selectedPerson ? [selectedPerson.person_id] : [-1] };
    return { role: role || undefined, launch_locations: launchSel.length ? launchSel : undefined };
  }

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
    // Merge fields like {{first_name}} render as friendly, non-editable pills
    // (e.g. "First name") so the office never sees raw {{code}}. Converted back
    // to tokens on read.
    const editableChips = tokenizeToChips(sp.editable);
    frame.innerHTML = sp.hasMarkers
      ? `${sp.before}<div data-pe-msg>${editableChips}</div>${sp.after}`
      : `<div data-pe-msg>${editableChips}</div>`;
    const msg = frame.querySelector('[data-pe-msg]') as HTMLElement | null;
    msgRef.current = msg;
    if (!msg) return;
    msg.setAttribute('contenteditable', 'true');
    msg.style.outline = 'none';
    const onInput = () => { messageRef.current = chipsToTokens(msg.innerHTML); setDirty(true); setSaved(false); };
    // Remember where the caret is so toolbar inserts land there, not at the start.
    const capture = () => {
      const s = window.getSelection();
      if (s && s.rangeCount > 0 && msg.contains(s.anchorNode)) savedRangeRef.current = s.getRangeAt(0).cloneRange();
    };
    msg.addEventListener('input', onInput);
    msg.addEventListener('keyup', capture);
    msg.addEventListener('mouseup', capture);
    msg.addEventListener('blur', capture);
    return () => {
      msg.removeEventListener('input', onInput);
      msg.removeEventListener('keyup', capture);
      msg.removeEventListener('mouseup', capture);
      msg.removeEventListener('blur', capture);
    };
  }, [selected?.id]);

  function restoreRange() {
    const el = msgRef.current; if (!el) return;
    el.focus();
    const r = savedRangeRef.current;
    if (r && el.contains(r.commonAncestorContainer)) {
      const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r);
    }
  }
  function sync() { if (msgRef.current) messageRef.current = chipsToTokens(msgRef.current.innerHTML); setDirty(true); setSaved(false); }
  function exec(cmd: string, val?: string) { restoreRange(); document.execCommand(cmd, false, val); sync(); }
  function insertToken(tok: string) { restoreRange(); document.execCommand('insertHTML', false, tokenizeToChips(tok) + '&#8203;'); sync(); }
  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files; if (!files) return;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      const dataUrl = await imageFileToDataUrl(f);
      if (!dataUrl) continue;
      restoreRange();
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

  // Live recipient count as the selection changes.
  useEffect(() => {
    let off = false;
    if (sendMode === 'individual') { setRecipientCount(selectedPerson ? 1 : 0); return; }
    fetch(`/api/admin/campaigns/preview?program=${program}`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ segment: buildSegment() }),
    }).then((r) => r.json()).then((d) => { if (!off) setRecipientCount(typeof d.recipient_count === 'number' ? d.recipient_count : null); })
      .catch(() => { if (!off) setRecipientCount(null); });
    return () => { off = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program, sendMode, role, launchSel, selectedPerson]);

  // Search registrants for an individual send (debounced).
  useEffect(() => {
    if (sendMode !== 'individual') return;
    const q = personQuery.trim();
    if (q.length < 2) { setPersonResults([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/admin/registrations?program=${program}&q=${encodeURIComponent(q)}`, { credentials: 'include' })
        .then((r) => r.json()).then((d) => {
          const rows: any[] = Array.isArray(d.rows) ? d.rows : [];
          const seen = new Set<number>(); const out: Array<{ person_id: number; name: string; email: string; role: string }> = [];
          for (const row of rows) {
            const pid = row.person_id; if (!pid || seen.has(pid) || !row.email) continue; seen.add(pid);
            out.push({ person_id: pid, name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(), email: row.email, role: row.role });
          }
          setPersonResults(out.slice(0, 8));
        }).catch(() => setPersonResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [sendMode, personQuery, program]);

  const loadHistory = useCallback(() => {
    fetch(`/api/admin/campaigns?program=${program}`, { credentials: 'include' })
      .then((r) => r.json()).then((d) => setHistory(Array.isArray(d.campaigns) ? d.campaigns : [])).catch(() => {});
  }, [program]);
  useEffect(loadHistory, [program]);

  async function sendNow() {
    if (!selected) return;
    if (sendMode === 'individual' && !selectedPerson) { setSendMsg('Pick a person first.'); return; }
    setSending(true); setSendMsg('');
    try {
      const seg = buildSegment();
      const draft = await fetch(`/api/admin/campaigns?program=${program}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body_html: currentBodyHtml(), body_text: currentBodyText(), segment: seg }),
      }).then((r) => r.json());
      if (!draft.ok || !draft.campaign?.id) throw new Error(draft.error ?? 'could not create the send');
      const sent = await fetch(`/api/admin/campaigns/${draft.campaign.id}/send?program=${program}`, {
        method: 'POST', credentials: 'include',
      }).then((r) => r.json());
      if (!sent.ok) throw new Error(sent.error ?? 'send failed');
      setSendMsg(`Sent to ${sent.sent ?? recipientCount ?? ''} recipient(s).`);
      loadHistory();
    } catch (e) { setSendMsg(e instanceof Error ? e.message : 'send failed'); }
    finally { setSending(false); }
  }

  async function useAsTemplate(id: number) {
    try {
      const d = await fetch(`/api/admin/campaigns/${id}?program=${program}`, { credentials: 'include' }).then((r) => r.json());
      const camp = d.campaign; if (!camp) return;
      const res = await fetch(`/api/admin/templates?program=${program}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${camp.subject || 'Saved email'} (from history)`, subject: camp.subject, body_html: camp.body_html, body_text: camp.body_text ?? '', variables: ['first_name'] }),
      }).then((r) => r.json());
      if (res.ok && res.template) { setTemplates((prev) => [...prev, res.template]); selectTemplate(res.template); }
    } catch { /* ignore */ }
  }

  const isGeneral = selected?.key === 'general';
  const isAutomated = selected ? AUTOMATED_KEYS.has(selected.key) : false;
  const automated = templates.filter((t) => AUTOMATED_KEYS.has(t.key));
  const manual = templates.filter((t) => !AUTOMATED_KEYS.has(t.key));

  const renderItem = (t: Template) => {
    const active = selected?.id === t.id;
    return (
      <li key={t.id}>
        <button onClick={() => selectTemplate(t)}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${active ? '' : 'text-gray-700 hover:bg-black/[0.04]'}`}
          style={active ? { background: 'var(--color-primary)', color: '#fff' } : undefined}>
          <span className="flex-1 truncate">{t.name}</span>
          {AUTOMATED_KEYS.has(t.key) && (
            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={active ? { background: 'rgba(255,255,255,0.25)' } : { background: '#f1f1f4', color: '#9ca3af' }}>Auto</span>
          )}
        </button>
      </li>
    );
  };

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Template library — clean, sectioned sidebar */}
      <aside className="col-span-3 border-r border-gray-100 pr-4">
        <nav className="space-y-6 sticky top-2">
          <div>
            <h3 className="px-3 mb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Templates</h3>
            <ul className="space-y-0.5">{manual.map(renderItem)}</ul>
          </div>
          {automated.length > 0 && (
            <div>
              <h3 className="px-3 mb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Automated</h3>
              <ul className="space-y-0.5">{automated.map(renderItem)}</ul>
            </div>
          )}
          <div>
            <h3 className="px-3 mb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Sent history</h3>
            {history.length === 0 ? (
              <p className="px-3 py-1 text-xs text-gray-400">Nothing sent yet.</p>
            ) : (
              <ul className="space-y-0.5">
                {history.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => useAsTemplate(c.id)} title="Reuse as a new template"
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-black/[0.04] transition-colors">
                      <span className="block truncate text-sm text-gray-700">{c.subject || '(no subject)'}</span>
                      <span className="block text-[11px] text-gray-400">
                        {new Date(c.created_at).toLocaleDateString()} · {c.recipient_count} sent
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </nav>
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

            {/* ── Send this email (professional panel) ────────────────── */}
            {!isAutomated && (
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 mt-3">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-800">Send this email</h3>
                  <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
                    {(['group', 'individual'] as const).map((m) => (
                      <button key={m} onClick={() => setSendMode(m)}
                        className="px-3 py-1.5 transition-colors"
                        style={sendMode === m ? { background: 'var(--color-primary)', color: '#fff' } : { color: '#6b7280' }}>
                        {m === 'group' ? 'A group' : 'One person'}
                      </button>
                    ))}
                  </div>
                </div>

                {sendMode === 'group' ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Who</label>
                      <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-sm" role="group" aria-label="Recipient role">
                        {[{ v: '', l: 'Everyone' }, { v: 'attendee', l: 'Attendees' }, { v: 'server', l: 'Servers' }].map((o) => (
                          <button key={o.v} onClick={() => setRole(o.v as typeof role)}
                            className="px-4 py-1.5 transition-colors border-r border-gray-200 last:border-r-0"
                            style={role === o.v ? { background: 'var(--color-primary)', color: '#fff' } : { color: '#374151' }}>
                            {o.l}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">
                        Launch points <span className="text-gray-400 font-normal">— pick any, or leave empty for all</span>
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {LAUNCH_LOCATIONS.map((l) => {
                          const on = launchSel.includes(l);
                          return (
                            <button key={l} aria-pressed={on}
                              onClick={() => setLaunchSel((s) => on ? s.filter((x) => x !== l) : [...s, l])}
                              className="px-3 py-1.5 rounded-full text-sm border transition-colors"
                              style={on ? { background: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' } : { color: '#4b5563', borderColor: '#e5e7eb' }}>
                              {l}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-gray-500">Find a person</label>
                    {selectedPerson ? (
                      <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                        <span className="font-medium text-gray-800">{selectedPerson.name}</span>
                        <span className="text-gray-400">{selectedPerson.email}</span>
                        <button onClick={() => { setSelectedPerson(null); setPersonQuery(''); }} className="ml-auto text-xs text-gray-400 hover:text-gray-600">Change</button>
                      </div>
                    ) : (
                      <>
                        <input value={personQuery} onChange={(e) => setPersonQuery(e.target.value)} aria-label="Search person"
                          placeholder="Search by name or email…" className="w-full border rounded-lg px-3 py-2 text-sm" />
                        {personResults.length > 0 && (
                          <ul className="border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-52 overflow-auto">
                            {personResults.map((p) => (
                              <li key={p.person_id}>
                                <button onClick={() => { setSelectedPerson({ person_id: p.person_id, name: p.name, email: p.email }); setPersonResults([]); }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                                  <span className="font-medium text-gray-800">{p.name || '(no name)'}</span>
                                  <span className="text-gray-400"> · {p.email}</span>
                                  <span className="text-[11px] text-gray-400"> ({p.role})</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-3 mt-5 pt-4 border-t border-gray-100">
                  <div className="text-sm text-gray-600">
                    Sends to <span className="font-semibold text-gray-900">{recipientCount ?? '—'}</span> {recipientCount === 1 ? 'person' : 'people'}
                  </div>
                  <button onClick={sendNow} disabled={sending || !recipientCount}
                    className="ml-auto px-5 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50" style={{ background: 'var(--color-primary)' }}>
                    {sending ? 'Sending…' : 'Send now'}
                  </button>
                  {sendMsg && <span className="text-sm text-gray-600">{sendMsg}</span>}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
