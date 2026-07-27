// admin/src/pages/PageDetails.tsx
// Web Page Details — a full inline editor of the ACTUAL public page.
// The whole page is one JSON document (same shape src/js/worlds.js renders); the
// office edits every bit of text right in place, and "Publish" (PUT
// /api/admin/page-document) saves it. Lists (What to Bring, etc.) add a new
// bulleted item on Enter, matching the public formatting.
import { useEffect, useState, useRef, useCallback } from 'react';
import { apiFetch } from '@/api';
import { useProgram } from '@/App';
import { THEMES } from '@/theme';

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

// ── Per-program palette (mirrors the real page's look) ───────────────────────
interface Palette { bg: string; text: string; head: string; accent: string; rule: string; }
const PALETTES: Record<'mens' | 'women', Palette> = {
  mens:  { bg: '#3D4127', text: '#F0EBDC', head: '#FFFFFF', accent: '#E6C12F', rule: 'rgba(240,235,220,0.18)' },
  women: { bg: '#FFFFFF', text: '#2B2B2B', head: '#6B2740', accent: '#C4849A', rule: 'rgba(107,39,64,0.15)' },
};

// ── Auto-growing text (paragraphs / tagline / cost / verse) ──────────────────
function AutoText({ value, onChange, style, ariaLabel, placeholder }: {
  value: string; onChange: (v: string) => void; style?: React.CSSProperties;
  ariaLabel: string; placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref} aria-label={ariaLabel} value={value} placeholder={placeholder} rows={1}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-transparent resize-none outline-none border-0 focus:ring-0 rounded px-1 -mx-1 hover:bg-black/[0.06] focus:bg-black/[0.10] transition-colors"
      style={style}
    />
  );
}

// ── Single-line editable text (titles, dates, list items) ────────────────────
function Line({ value, onChange, style, ariaLabel, inputRef, onKeyDown, placeholder }: {
  value: string; onChange: (v: string) => void; style?: React.CSSProperties; ariaLabel: string;
  inputRef?: (el: HTMLInputElement | null) => void; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void; placeholder?: string;
}) {
  return (
    <input
      ref={inputRef} aria-label={ariaLabel} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown}
      className="w-full bg-transparent outline-none border-0 focus:ring-0 rounded px-1 -mx-1 hover:bg-black/[0.06] focus:bg-black/[0.10] transition-colors"
      style={style}
    />
  );
}

// ── Bulleted list editor (What to Bring, section lists) ──────────────────────
function ListEditor({ items, onChange, palette }: {
  items: string[]; onChange: (next: string[]) => void; palette: Palette;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const update = (i: number, v: string) => { const n = [...items]; n[i] = v; onChange(n); };
  const addAfter = (i: number) => {
    const n = [...items]; n.splice(i + 1, 0, ''); onChange(n);
    setTimeout(() => refs.current[i + 1]?.focus(), 0);
  };
  const removeAt = (i: number) => {
    if (items.length <= 1) { update(i, ''); return; }
    const n = items.filter((_, j) => j !== i); onChange(n);
    setTimeout(() => refs.current[Math.max(0, i - 1)]?.focus(), 0);
  };
  return (
    <ul className="space-y-1.5 mt-2">
      {items.map((it, i) => (
        <li key={i} className="group flex items-start gap-2.5">
          <span className="mt-2 shrink-0" aria-hidden="true"
            style={{ width: 6, height: 6, background: palette.accent, display: 'inline-block' }} />
          <Line
            value={it} ariaLabel={`List item ${i + 1}`}
            inputRef={(el) => { refs.current[i] = el; }}
            style={{ color: palette.text, lineHeight: 1.6 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addAfter(i); }
              else if (e.key === 'Backspace' && it === '') { e.preventDefault(); removeAt(i); }
            }}
          />
          <button
            type="button" aria-label={`Remove item ${i + 1}`} onClick={() => removeAt(i)}
            className="opacity-0 group-hover:opacity-100 text-xs px-1 shrink-0 transition-opacity"
            style={{ color: palette.accent }}
          >×</button>
        </li>
      ))}
      <li>
        <button
          type="button" onClick={() => addAfter(items.length - 1)}
          className="text-xs mt-1 px-2 py-0.5 rounded border border-dashed"
          style={{ color: palette.accent, borderColor: palette.rule }}
        >+ Add item (or press Enter)</button>
      </li>
    </ul>
  );
}

// ── Page editor ──────────────────────────────────────────────────────────────
export default function PageDetails() {
  const { program } = useProgram();
  const theme = THEMES[program];
  const palette = PALETTES[program];

  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setDirty(false); setPublishedAt(null);
    apiFetch<{ ok: boolean; doc: Doc | null }>('/admin/page-document')
      .then((res) => { if (!cancelled) setDoc(res.doc ?? null); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [program]);

  // Immutable edit: clone the whole (small) doc, mutate, mark dirty.
  const mutate = useCallback((fn: (d: Doc) => void) => {
    setDoc((prev) => { if (!prev) return prev; const next = structuredClone(prev); fn(next); return next; });
    setDirty(true);
  }, []);

  async function publish() {
    if (!doc) return;
    setPublishing(true); setError(null);
    try {
      const res = await apiFetch<{ ok: boolean; updated_at: string }>('/admin/page-document', {
        method: 'PUT', body: JSON.stringify({ doc }),
      });
      setDirty(false);
      setPublishedAt(res.updated_at);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  }

  if (loading) return <p className="text-sm text-gray-400 animate-pulse">Loading page…</p>;
  if (error && !doc) return <p role="alert" className="text-red-600 text-sm">{error}</p>;
  if (!doc) return <p className="text-sm text-gray-400">No page content yet for this program.</p>;

  const programLabel = program === 'mens' ? "Men's" : "Women's";
  const heading = (t: string, extra?: React.CSSProperties): React.CSSProperties => ({
    color: palette.head, fontWeight: 700, ...extra,
  });

  return (
    <div className="max-w-3xl mx-auto pb-24">
      {/* Sticky toolbar with Publish */}
      <div className="sticky top-0 z-20 -mx-6 px-6 py-3 mb-5 bg-white/90 backdrop-blur border-b flex items-center gap-3">
        <div>
          <h1 className="text-lg font-bold" style={{ color: theme.primary }}>Web Page Details</h1>
          <p className="text-xs text-gray-500">
            Editing the live {programLabel} Encounter page — click any text to change it.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {error && <span className="text-red-600 text-xs" role="alert">{error}</span>}
          {publishedAt && !dirty && <span className="text-green-600 text-xs">Published ✓</span>}
          {dirty && <span className="text-amber-600 text-xs">Unsaved changes</span>}
          <button
            type="button" onClick={publish} disabled={publishing || !dirty}
            data-testid="publish-btn"
            className="px-5 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
            style={{ background: theme.primary }}
          >
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>

      {/* The page, rendered as it looks — fully editable */}
      <div
        className="rounded-2xl overflow-hidden shadow-sm border"
        style={{ background: palette.bg, borderColor: palette.rule }}
        data-testid="page-editor"
      >
        {/* Hero */}
        <div className="px-8 pt-9 pb-7 text-center" style={{ borderBottom: `1px solid ${palette.rule}` }}>
          <img
            src={theme.logoSrc} alt="" width={84} height={84}
            className="mx-auto mb-4 rounded-full object-cover"
            style={{ border: `2px solid ${palette.accent}` }}
          />
          <Line
            value={doc.eventName} ariaLabel="Event name"
            onChange={(v) => mutate((d) => { d.eventName = v; })}
            style={{ ...heading(''), fontSize: '1.6rem', textAlign: 'center' }}
          />
          {doc.tagline !== undefined && (
            <AutoText
              value={doc.tagline ?? ''} ariaLabel="Tagline"
              onChange={(v) => mutate((d) => { d.tagline = v; })}
              style={{ color: palette.accent, fontStyle: 'italic', textAlign: 'center', marginTop: 6 }}
            />
          )}
          <Line
            value={doc.dates} ariaLabel="Dates"
            onChange={(v) => mutate((d) => { d.dates = v; })}
            style={{ color: palette.text, textAlign: 'center', marginTop: 6, letterSpacing: '0.02em' }}
          />
        </div>

        <div className="px-8 py-6 space-y-8" style={{ color: palette.text }}>
          {/* Sections */}
          {doc.sections.map((section, si) => (
            <section key={si} data-testid={`section-${si}`} className="group/section">
              <div className="flex items-center gap-2">
                <Line
                  value={section.title} ariaLabel={`Section ${si + 1} title`}
                  onChange={(v) => mutate((d) => { d.sections[si].title = v; })}
                  style={heading('', { fontSize: '1.2rem' })}
                />
                <button
                  type="button" aria-label={`Remove section ${si + 1}`}
                  onClick={() => mutate((d) => { d.sections.splice(si, 1); })}
                  className="opacity-0 group-hover/section:opacity-100 text-xs px-1 transition-opacity"
                  style={{ color: palette.accent }}
                >Remove section</button>
              </div>
              <div className="mt-2 space-y-3">
                {section.blocks.map((block, bi) => {
                  if (isList(block)) {
                    return <ListEditor key={bi} items={block.list} palette={palette}
                      onChange={(next) => mutate((d) => { (d.sections[si].blocks[bi] as ListBlock).list = next; })} />;
                  }
                  if (isLink(block)) {
                    return (
                      <div key={bi} className="text-sm">
                        <Line value={block.link.label} ariaLabel="Link label"
                          onChange={(v) => mutate((d) => { (d.sections[si].blocks[bi] as LinkBlock).link.label = v; })}
                          style={{ color: palette.accent, fontWeight: 600 }} />
                        <Line value={block.link.href} ariaLabel="Link URL"
                          onChange={(v) => mutate((d) => { (d.sections[si].blocks[bi] as LinkBlock).link.href = v; })}
                          style={{ color: palette.text, opacity: 0.7, fontSize: '0.8rem' }} />
                      </div>
                    );
                  }
                  return <AutoText key={bi} value={block} ariaLabel={`Paragraph ${bi + 1}`}
                    onChange={(v) => mutate((d) => { d.sections[si].blocks[bi] = v; })}
                    style={{ color: palette.text, lineHeight: 1.7 }} />;
                })}
                <button
                  type="button"
                  onClick={() => mutate((d) => { d.sections[si].blocks.push(''); })}
                  className="text-xs px-2 py-0.5 rounded border border-dashed"
                  style={{ color: palette.accent, borderColor: palette.rule }}
                >+ Add paragraph</button>
              </div>
            </section>
          ))}

          <button
            type="button"
            onClick={() => mutate((d) => { d.sections.push({ title: 'New section', blocks: [''] }); })}
            className="text-xs px-3 py-1 rounded border border-dashed"
            style={{ color: palette.accent, borderColor: palette.rule }}
          >+ Add section</button>

          {/* Cost */}
          {doc.cost !== undefined && (
            <section style={{ borderTop: `1px solid ${palette.rule}`, paddingTop: 20 }}>
              <h2 style={heading('', { fontSize: '1.2rem', marginBottom: 6 })}>Cost</h2>
              <AutoText value={doc.cost} ariaLabel="Cost"
                onChange={(v) => mutate((d) => { d.cost = v; })}
                style={{ color: palette.text, lineHeight: 1.7 }} />
            </section>
          )}

          {/* What to Bring */}
          {doc.bring !== undefined && (
            <section style={{ borderTop: `1px solid ${palette.rule}`, paddingTop: 20 }}>
              <h2 style={heading('', { fontSize: '1.2rem' })}>What to Bring</h2>
              <ListEditor items={doc.bring} palette={palette}
                onChange={(next) => mutate((d) => { d.bring = next; })} />
            </section>
          )}

          {/* Contacts */}
          {doc.contacts !== undefined && (
            <section style={{ borderTop: `1px solid ${palette.rule}`, paddingTop: 20 }}>
              <h2 style={heading('', { fontSize: '1.2rem', marginBottom: 8 })}>Contacts</h2>
              <ul className="space-y-2.5">
                {doc.contacts.map((c, ci) => (
                  <li key={ci} className="group flex flex-wrap items-center gap-x-4 gap-y-1">
                    <Line value={c.name} ariaLabel={`Contact ${ci + 1} name`}
                      onChange={(v) => mutate((d) => { d.contacts![ci].name = v; })}
                      style={{ color: palette.text, fontWeight: 600, flex: '1 1 140px' }} />
                    <Line value={c.phone ?? ''} ariaLabel={`Contact ${ci + 1} phone`} placeholder="phone"
                      onChange={(v) => mutate((d) => { d.contacts![ci].phone = v; })}
                      style={{ color: palette.accent, flex: '0 1 130px', fontSize: '0.85rem' }} />
                    <Line value={c.email ?? ''} ariaLabel={`Contact ${ci + 1} email`} placeholder="email"
                      onChange={(v) => mutate((d) => { d.contacts![ci].email = v; })}
                      style={{ color: palette.accent, flex: '1 1 170px', fontSize: '0.85rem' }} />
                    <button type="button" aria-label={`Remove contact ${ci + 1}`}
                      onClick={() => mutate((d) => { d.contacts!.splice(ci, 1); })}
                      className="opacity-0 group-hover:opacity-100 text-xs transition-opacity"
                      style={{ color: palette.accent }}>×</button>
                  </li>
                ))}
              </ul>
              <button type="button"
                onClick={() => mutate((d) => { (d.contacts ??= []).push({ name: '', phone: '', email: '' }); })}
                className="text-xs mt-2 px-2 py-0.5 rounded border border-dashed"
                style={{ color: palette.accent, borderColor: palette.rule }}>+ Add contact</button>
            </section>
          )}

          {/* Register CTA label (the public button visitors use) */}
          {doc.register && doc.register.length > 0 && (
            <section style={{ borderTop: `1px solid ${palette.rule}`, paddingTop: 20 }}>
              <h2 style={heading('', { fontSize: '1rem', marginBottom: 6 })}>Register button</h2>
              <p className="text-xs mb-2" style={{ color: palette.text, opacity: 0.6 }}>
                This is the button visitors tap to register. Edit its wording or link.
              </p>
              <Line value={doc.register[0].label} ariaLabel="Register button label"
                onChange={(v) => mutate((d) => { d.register![0].label = v; })}
                style={{ color: palette.accent, fontWeight: 700 }} />
              <Line value={doc.register[0].href} ariaLabel="Register button link"
                onChange={(v) => mutate((d) => { d.register![0].href = v; })}
                style={{ color: palette.text, opacity: 0.7, fontSize: '0.8rem' }} />
            </section>
          )}

          {/* Verse */}
          {doc.verse !== undefined && (
            <section style={{ borderTop: `1px solid ${palette.rule}`, paddingTop: 20 }}>
              <AutoText value={doc.verse} ariaLabel="Verse"
                onChange={(v) => mutate((d) => { d.verse = v; })}
                style={{ color: palette.text, fontStyle: 'italic', textAlign: 'center' }} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
