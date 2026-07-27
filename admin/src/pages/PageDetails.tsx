// admin/src/pages/PageDetails.tsx
// Web Page Details — inline editor that renders EXACTLY like the real public page
// (see page-editor.css, copied from worlds.css). Every text element is the real
// styled element made contentEditable, so what you edit is what visitors see.
// Publish (PUT /api/admin/page-document) saves the whole page document.
import { useEffect, useRef, useState, useCallback } from 'react';
import { apiFetch } from '@/api';
import { useProgram } from '@/App';
import { THEMES } from '@/theme';
import './page-editor.css';

// ── Doc shape (mirrors src/content/*.js) ─────────────────────────────────────
interface LinkBlock { link: { label: string; href: string } }
interface ListBlock { list: string[] }
type Block = string | ListBlock | LinkBlock;
interface Section { id?: string; title: string; blocks: Block[] }
interface Contact { name: string; phone?: string; email?: string }
interface Doc {
  eventName: string; dates: string; tagline?: string; logo?: string;
  sections: Section[]; cost?: string; bring?: string[];
  contacts?: Contact[]; register?: Array<{ label: string; href: string }>; verse?: string;
}
const isList = (b: Block): b is ListBlock => typeof b === 'object' && b !== null && 'list' in b;
const isLink = (b: Block): b is LinkBlock => typeof b === 'object' && b !== null && 'link' in b;

// ── Editable: a real element made contentEditable, cursor-safe ────────────────
// Text is written to the DOM imperatively on mount only, so re-renders never
// reset the caret. Edits flow out via onText; structural changes remount the
// whole body (keyed by a version) so every field re-reads correct text.
function Editable({ tag = 'div', text, onText, className, ariaLabel, ph, singleLine = true, onEnter, onEmptyBackspace, focusOnMount }: {
  tag?: string; text: string; onText: (v: string) => void; className?: string;
  ariaLabel: string; ph?: string; singleLine?: boolean;
  onEnter?: () => void; onEmptyBackspace?: () => void; focusOnMount?: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (el.textContent !== text) el.textContent = text;
    if (focusOnMount) {
      el.focus();
      const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
      const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r);
    }
    // mount only — depending on `text` would clobber the caret while typing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const Tag = tag as any;
  return (
    <Tag
      ref={ref} className={className} contentEditable suppressContentEditableWarning
      role="textbox" aria-label={ariaLabel} data-ph={ph}
      onInput={(e: React.FormEvent<HTMLElement>) => onText((e.currentTarget.textContent ?? '').replace(/\n/g, ' ').trimStart())}
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === 'Enter' && (singleLine || onEnter)) { e.preventDefault(); onEnter?.(); }
        else if (e.key === 'Backspace' && onEmptyBackspace && (e.currentTarget.textContent ?? '') === '') {
          e.preventDefault(); onEmptyBackspace();
        }
      }}
    />
  );
}

export default function PageDetails() {
  const { program } = useProgram();
  const theme = THEMES[program];
  const door = program === 'mens' ? 'men' : 'women';

  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [ver, setVer] = useState(0);         // bump = remount page (structural / undo / redo)
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  // Undo/redo history. docRef is the authoritative current doc (all mutations go
  // through edit/struct/undo/redo/load), so we never call setState inside an updater.
  const docRef = useRef<Doc | null>(null);
  const past = useRef<Doc[]>([]);
  const future = useRef<Doc[]>([]);
  const lastSnap = useRef(0);
  const [, forceHist] = useState(0);

  useEffect(() => {
    let off = false;
    setLoading(true); setError(null); setDirty(false); setPublished(false);
    apiFetch<{ ok: boolean; doc: Doc | null }>('/admin/page-document')
      .then((r) => {
        if (off) return;
        docRef.current = r.doc ?? null; past.current = []; future.current = [];
        setDoc(r.doc ?? null); setVer((v) => v + 1);
      })
      .catch((e: Error) => { if (!off) setError(e.message); })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [program]);

  // Snapshot the pre-edit doc onto the undo stack. Rapid typing coalesces into
  // one undo step (>600ms gap); structural edits always push their own step.
  const snapshot = useCallback((prev: Doc, force: boolean) => {
    const now = Date.now();
    if (force || now - lastSnap.current > 600) {
      past.current.push(structuredClone(prev));
      if (past.current.length > 200) past.current.shift();
      future.current = [];
      lastSnap.current = now;
      forceHist((n) => n + 1);
    }
  }, []);

  // Text edit — no remount (caret-safe).
  const edit = useCallback((fn: (d: Doc) => void) => {
    const prev = docRef.current; if (!prev) return;
    snapshot(prev, false);
    const n = structuredClone(prev); fn(n); docRef.current = n;
    setDoc(n); setDirty(true); setPublished(false);
  }, [snapshot]);
  // Structural edit — remounts the page; optionally focuses a field afterwards.
  const struct = useCallback((fn: (d: Doc) => void, focus?: string) => {
    const prev = docRef.current; if (!prev) return;
    snapshot(prev, true);
    const n = structuredClone(prev); fn(n); docRef.current = n;
    setDoc(n); setDirty(true); setPublished(false); setVer((v) => v + 1); setFocusKey(focus ?? null);
  }, [snapshot]);

  const undo = useCallback(() => {
    if (!past.current.length || !docRef.current) return;
    future.current.push(structuredClone(docRef.current));
    const prev = past.current.pop()!; docRef.current = prev;
    setDoc(prev); setVer((v) => v + 1); setFocusKey(null); setDirty(true); setPublished(false);
    forceHist((n) => n + 1);
  }, []);
  const redo = useCallback(() => {
    if (!future.current.length || !docRef.current) return;
    past.current.push(structuredClone(docRef.current));
    const next = future.current.pop()!; docRef.current = next;
    setDoc(next); setVer((v) => v + 1); setFocusKey(null); setDirty(true); setPublished(false);
    forceHist((n) => n + 1);
  }, []);

  // Cmd/Ctrl+Z = undo, Cmd+Shift+Z / Ctrl+Y = redo (overrides per-field native undo).
  const onKeyDownRoot = useCallback((e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    if (e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  }, [undo, redo]);

  async function publish() {
    if (!doc) return;
    setPublishing(true); setError(null);
    try {
      await apiFetch('/admin/page-document', { method: 'PUT', body: JSON.stringify({ doc }) });
      setDirty(false); setPublished(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed');
    } finally { setPublishing(false); }
  }

  if (loading) return <p className="text-sm text-gray-400 animate-pulse">Loading page…</p>;
  if (error && !doc) return <p role="alert" className="text-red-600 text-sm">{error}</p>;
  if (!doc) return <p className="text-sm text-gray-400">No page content yet for this program.</p>;

  const programLabel = program === 'mens' ? "Men's" : "Women's";
  const fk = (k: string) => (focusKey === k);

  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;

  return (
    <div className="pe-root max-w-4xl mx-auto pb-24" onKeyDown={onKeyDownRoot}>
      {/* Toolbar */}
      <div className="sticky top-0 z-20 -mx-6 px-6 py-3 mb-5 bg-white/95 backdrop-blur border-b flex items-center gap-3">
        <div>
          <h1 className="text-lg font-bold" style={{ color: theme.primary }}>Web Page Details</h1>
          <p className="text-xs text-gray-500">This is your live {programLabel} Encounter page — click any text to change it.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={undo} disabled={!canUndo} data-testid="undo-btn" title="Undo (⌘Z)"
            aria-label="Undo" className="px-2.5 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40">↶ Undo</button>
          <button type="button" onClick={redo} disabled={!canRedo} data-testid="redo-btn" title="Redo (⇧⌘Z)"
            aria-label="Redo" className="px-2.5 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40">↷ Redo</button>
          <span className="w-px h-6 bg-gray-200 mx-1" />
          {error && <span className="text-red-600 text-xs" role="alert">{error}</span>}
          {published && !dirty && <span className="text-green-600 text-xs">Published ✓</span>}
          {dirty && <span className="text-amber-600 text-xs">Unsaved changes</span>}
          <button
            type="button" onClick={publish} disabled={publishing || !dirty} data-testid="publish-btn"
            className="px-5 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
            style={{ background: theme.primary }}
          >{publishing ? 'Publishing…' : 'Publish'}</button>
        </div>
      </div>

      {/* The page — rendered with the real site styles (keyed by ver → undo/structural remount) */}
      <div className={`pe-page pe-page--${door}`} data-testid="page-editor" key={ver}>
        {/* Hero */}
        <div className="pe-hero">
          <div className="pe-logo" style={{ backgroundImage: `url(${theme.logoSrc})` }} role="img" aria-label={`${programLabel} Encounter logo`} />
          <Editable tag="h1" className="pe-title" text={doc.eventName} ariaLabel="Event name"
            onText={(v) => edit((d) => { d.eventName = v; })} />
          {doc.tagline !== undefined && (
            <Editable tag="p" className="pe-tagline" text={doc.tagline ?? ''} ariaLabel="Tagline" ph="Tagline…"
              onText={(v) => edit((d) => { d.tagline = v; })} />
          )}
          <Editable tag="p" className="pe-dates" text={doc.dates} ariaLabel="Dates"
            onText={(v) => edit((d) => { d.dates = v; })} />
          {doc.register && doc.register.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <Editable tag="span" className="pe-cta" text={doc.register[0].label} ariaLabel="Register button label"
                onText={(v) => edit((d) => { d.register![0].label = v; })} />
              <button type="button" className="pe-add" onClick={() => setLinkOpen((o) => !o)}>
                {linkOpen ? 'Hide link' : '🔗 Edit button link'}
              </button>
              {linkOpen && (
                <input
                  type="text" aria-label="Register button link" value={doc.register[0].href}
                  onChange={(e) => edit((d) => { d.register![0].href = e.target.value; })}
                  placeholder="https://…"
                  style={{ width: 'min(420px, 90%)', fontSize: 12, padding: '6px 10px', borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.92)',
                    color: '#222', fontFamily: 'system-ui, sans-serif' }}
                />
              )}
            </div>
          )}
        </div>

        {/* Body (page is keyed by ver → structural/undo remount correct text everywhere) */}
        <div className="pe-body">
          {doc.sections.map((section, si) => (
            <section className="pe-section pe-row" data-testid={`section-${si}`} key={si}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <Editable tag="h2" className="pe-h2" text={section.title} ariaLabel={`Section ${si + 1} title`}
                  focusOnMount={fk(`sec-title-${si}`)}
                  onText={(v) => edit((d) => { d.sections[si].title = v; })} />
                <button type="button" className="pe-del" aria-label={`Remove section ${si + 1}`}
                  onClick={() => struct((d) => { d.sections.splice(si, 1); })}>Remove</button>
              </div>
              {section.blocks.map((block, bi) => {
                if (isList(block)) {
                  return (
                    <ListBlockEditor key={bi} items={block.list}
                      focusKey={focusKey} keyBase={`sec${si}-list${bi}`}
                      onAdd={(i) => struct((d) => { (d.sections[si].blocks[bi] as ListBlock).list.splice(i + 1, 0, ''); }, `sec${si}-list${bi}-${i + 1}`)}
                      onRemove={(i) => struct((d) => { (d.sections[si].blocks[bi] as ListBlock).list.splice(i, 1); }, `sec${si}-list${bi}-${Math.max(0, i - 1)}`)}
                      onText={(i, v) => edit((d) => { (d.sections[si].blocks[bi] as ListBlock).list[i] = v; })} />
                  );
                }
                if (isLink(block)) {
                  return (
                    <Editable key={bi} tag="p" className="pe-p" text={block.link.label} ariaLabel="Link label"
                      onText={(v) => edit((d) => { (d.sections[si].blocks[bi] as LinkBlock).link.label = v; })} />
                  );
                }
                return (
                  <Editable key={bi} tag="p" className="pe-p" text={block} ariaLabel={`Paragraph ${bi + 1}`} ph="Paragraph…"
                    focusOnMount={fk(`sec${si}-p${bi}`)}
                    onText={(v) => edit((d) => { d.sections[si].blocks[bi] = v; })} />
                );
              })}
              <button type="button" className="pe-add" style={{ marginTop: 8 }}
                onClick={() => struct((d) => { d.sections[si].blocks.push(''); }, `sec${si}-p${section.blocks.length}`)}>+ Add paragraph</button>
            </section>
          ))}

          <div style={{ padding: '12px 0' }}>
            <button type="button" className="pe-add"
              onClick={() => struct((d) => { d.sections.push({ title: 'New section', blocks: [''] }); }, `sec-title-${doc.sections.length}`)}>+ Add section</button>
          </div>

          {doc.cost !== undefined && (
            <section className="pe-section">
              <h2 className="pe-h2">Cost</h2>
              <Editable tag="p" className="pe-p" text={doc.cost} ariaLabel="Cost"
                onText={(v) => edit((d) => { d.cost = v; })} />
            </section>
          )}

          {doc.bring !== undefined && (
            <section className="pe-section">
              <h2 className="pe-h2">What to Bring</h2>
              <ListBlockEditor items={doc.bring} focusKey={focusKey} keyBase="bring"
                onAdd={(i) => struct((d) => { d.bring!.splice(i + 1, 0, ''); }, `bring-${i + 1}`)}
                onRemove={(i) => struct((d) => { d.bring!.splice(i, 1); }, `bring-${Math.max(0, i - 1)}`)}
                onText={(i, v) => edit((d) => { d.bring![i] = v; })} />
            </section>
          )}

          {doc.contacts !== undefined && (
            <section className="pe-section">
              <h2 className="pe-h2">Contacts</h2>
              <ul className="pe-contacts">
                {doc.contacts.map((c, ci) => (
                  <li className="pe-contact pe-row" key={ci}>
                    <Editable tag="span" className="pe-contact-name" text={c.name} ariaLabel={`Contact ${ci + 1} name`}
                      focusOnMount={fk(`contact-${ci}`)}
                      onText={(v) => edit((d) => { d.contacts![ci].name = v; })} />
                    <Editable tag="span" className="pe-contact-link" text={c.phone ?? ''} ariaLabel={`Contact ${ci + 1} phone`} ph="phone"
                      onText={(v) => edit((d) => { d.contacts![ci].phone = v; })} />
                    <Editable tag="span" className="pe-contact-link" text={c.email ?? ''} ariaLabel={`Contact ${ci + 1} email`} ph="email"
                      onText={(v) => edit((d) => { d.contacts![ci].email = v; })} />
                    <button type="button" className="pe-del" aria-label={`Remove contact ${ci + 1}`}
                      onClick={() => struct((d) => { d.contacts!.splice(ci, 1); })}>×</button>
                  </li>
                ))}
              </ul>
              <button type="button" className="pe-add" style={{ marginTop: 10 }}
                onClick={() => struct((d) => { (d.contacts ??= []).push({ name: '', phone: '', email: '' }); }, `contact-${(doc.contacts?.length ?? 0)}`)}>+ Add contact</button>
            </section>
          )}

          {doc.verse !== undefined && (
            <section className="pe-section">
              <Editable tag="p" className="pe-verse" text={doc.verse} ariaLabel="Verse"
                onText={(v) => edit((d) => { d.verse = v; })} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Bulleted list editor (What to Bring, section lists) ──────────────────────
function ListBlockEditor({ items, onText, onAdd, onRemove, keyBase, focusKey }: {
  items: string[]; onText: (i: number, v: string) => void;
  onAdd: (i: number) => void; onRemove: (i: number) => void; keyBase: string; focusKey: string | null;
}) {
  return (
    <ul className="pe-list">
      {items.map((it, i) => (
        <li className="pe-li pe-row" key={i}>
          <span className="pe-li-bullet" aria-hidden="true" />
          <Editable tag="span" className="pe-li-text" text={it} ariaLabel={`List item ${i + 1}`} ph="New item…"
            focusOnMount={focusKey === `${keyBase}-${i}`}
            onEnter={() => onAdd(i)} onEmptyBackspace={() => onRemove(i)}
            onText={(v) => onText(i, v)} />
          <button type="button" className="pe-del" aria-label={`Remove item ${i + 1}`} onClick={() => onRemove(i)}>×</button>
        </li>
      ))}
      <li className="pe-li" style={{ listStyle: 'none', paddingLeft: 0 }}>
        <button type="button" className="pe-add" onClick={() => onAdd(items.length - 1)}>+ Add item (or press Enter)</button>
      </li>
    </ul>
  );
}
