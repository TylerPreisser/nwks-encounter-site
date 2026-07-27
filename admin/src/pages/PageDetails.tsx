// admin/src/pages/PageDetails.tsx
// CMS admin — edit the public website's page text blocks.
// Renders a compact page-mock-up: click any text block to edit it inline.
// Auto-saves on blur (debounced). No big per-block Save buttons.
import { useEffect, useState, useCallback, useRef } from 'react';
import { apiFetch } from '@/api';
import { useProgram } from '@/App';
import { THEMES } from '@/theme';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PageBlock {
  id: number;
  program: string;
  key: string;
  label: string;
  value: string;
  sort: number;
  updated_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Which keys look like page headings vs body paragraphs. */
function isHeadingKey(key: string): boolean {
  return key === 'hero_tagline';
}

/** One-line site-position hint per well-known key. */
const LOCATION_HINTS: Record<string, string> = {
  hero_tagline:      'Appears as the large headline at the top of the page',
  event_invite_text: 'Shown in the invitation section below the hero',
  what_is_encounter: 'Used in the "What is Encounter?" info block',
  contact_note:      'Shown near the footer / contact section',
};

function getHint(key: string): string {
  return LOCATION_HINTS[key] ?? 'Appears on the public-facing page';
}

// ── Sub-component: single inline-editable block ───────────────────────────────

interface InlineBlockProps {
  block: PageBlock;
  accent: string;
  primary: string;
  onSave: (id: number, value: string) => Promise<void>;
}

function InlineBlock({ block, accent, primary, onSave }: InlineBlockProps) {
  const [value, setValue] = useState(block.value);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHeading = isHeadingKey(block.key);

  // Keep local value in sync if parent reloads
  useEffect(() => { setValue(block.value); }, [block.value]);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  function handleActivate() {
    setEditing(true);
    // Focus after state + paint
    setTimeout(() => {
      textareaRef.current?.focus();
      autoResize();
    }, 0);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setValue(next);
    autoResize();

    // Debounced auto-save
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (next === block.value) return;
      setSaving(true);
      setSaveError(null);
      try {
        await onSave(block.id, next);
        setSavedAt(Date.now());
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setSaving(false);
      }
    }, 600);
  }

  async function handleBlur() {
    setEditing(false);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (value !== block.value) {
      setSaving(true);
      setSaveError(null);
      try {
        await onSave(block.id, value);
        setSavedAt(Date.now());
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setSaving(false);
      }
    }
  }

  const showSaved = savedAt !== null && !saving && !saveError;

  return (
    <div
      className="group relative"
      data-testid={`block-${block.id}`}
    >
      {/* Label + hint row */}
      <div className="flex items-baseline justify-between mb-1 gap-2">
        <span
          className="text-xs font-semibold tracking-wide uppercase"
          style={{ color: primary }}
          data-testid={`block-label-${block.id}`}
        >
          {block.label}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {saving && (
            <span className="text-xs text-gray-400 animate-pulse" aria-live="polite">
              Saving…
            </span>
          )}
          {showSaved && (
            <span
              className="text-xs font-medium"
              style={{ color: accent }}
              role="status"
              aria-label={`${block.label} saved`}
            >
              Saved
            </span>
          )}
          {saveError && (
            <span className="text-xs text-red-500" role="alert">{saveError}</span>
          )}
        </div>
      </div>

      {/* Editable text area — styled to look like the page */}
      <div
        className="relative cursor-text"
        onClick={!editing ? handleActivate : undefined}
        data-testid={`block-display-${block.id}`}
      >
        {editing ? (
          <textarea
            ref={textareaRef}
            aria-label={`Edit ${block.label}`}
            className={[
              'w-full resize-none overflow-hidden bg-transparent border-0 outline-none p-0 m-0',
              'focus:ring-0 rounded-none',
              isHeading
                ? 'text-2xl font-bold leading-snug'
                : 'text-sm leading-relaxed text-gray-700',
            ].join(' ')}
            style={{
              color: isHeading ? primary : undefined,
              borderBottom: `2px solid ${accent}`,
              minHeight: '1.5em',
            }}
            value={value}
            onChange={handleChange}
            onBlur={handleBlur}
            rows={1}
          />
        ) : (
          <div
            className={[
              'rounded px-0 py-0.5 transition-colors',
              'group-hover:bg-black/[0.03]',
              isHeading
                ? 'text-2xl font-bold leading-snug'
                : 'text-sm leading-relaxed text-gray-700',
            ].join(' ')}
            style={{ color: isHeading ? primary : undefined }}
            aria-label={`Click to edit: ${block.label}`}
          >
            {value || <span className="text-gray-300 italic">Empty — click to add text</span>}
          </div>
        )}

        {/* "Click to edit" nudge on hover */}
        {!editing && (
          <span
            className="absolute right-0 top-0 text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none select-none"
          >
            click to edit
          </span>
        )}
      </div>

      {/* Hint */}
      <p className="text-[11px] text-gray-400 mt-1">{getHint(block.key)}</p>
    </div>
  );
}

// ── Live public site — URL config per program ──────────────────────────────────

/** The actual public "worlds" site we designed (separate Pages project). */
const PUBLIC_SITE_ORIGIN = 'https://nwks-encounter-site.pages.dev';

interface SiteLinks { worldUrl: string; registerUrl: string; label: string; }

function siteLinksFor(program: string): SiteLinks {
  if (program === 'women') {
    return {
      worldUrl: `${PUBLIC_SITE_ORIGIN}/?door=women`,
      registerUrl: '/register/womens-attendee.html',
      label: "Women's",
    };
  }
  return {
    worldUrl: `${PUBLIC_SITE_ORIGIN}/?door=men`,
    registerUrl: '/register/mens-attendee.html',
    label: "Men's",
  };
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PageDetails() {
  const { program } = useProgram();
  const theme = THEMES[program];
  const links = siteLinksFor(program);

  const [blocks, setBlocks] = useState<PageBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ ok: boolean; blocks: PageBlock[] }>('/admin/page-content');
      setBlocks(res.blocks ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load page content');
    } finally {
      setLoading(false);
    }
  }, [program]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(id: number, value: string) {
    await apiFetch<{ ok: boolean }>(`/admin/page-content/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ value }),
    });
    await load();
  }

  const programLabel = program === 'mens' ? "Men's" : "Women's";

  return (
    <div className="max-w-3xl mx-auto">
      {/* Page header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold" style={{ color: theme.primary }}>
          Web Page Details
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          This is your live public {programLabel} Encounter website. Preview it below,
          register an attendee, or scroll down to edit the page text.
        </p>
      </div>

      {/* ── Live public site preview + register ─────────────────── */}
      <div
        className="rounded-2xl border shadow-sm overflow-hidden mb-8"
        style={{ borderColor: `${theme.accent}40` }}
        data-testid="live-site-preview"
      >
        <div
          className="flex items-center gap-3 px-4 py-2.5 border-b"
          style={{ background: theme.primary, borderColor: `${theme.accent}40` }}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-white/20 inline-block" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/20 inline-block" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/20 inline-block" />
          <span className="ml-2 text-xs font-medium tracking-wide text-white/70 truncate">
            {links.worldUrl.replace(/^https?:\/\//, '')}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <a
              href={links.worldUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-white/80 hover:text-white underline underline-offset-2"
            >
              Open site ↗
            </a>
            <a
              href={links.registerUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="register-attendee-link"
              className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{ background: theme.secondary, color: '#fff' }}
            >
              Register as attendee →
            </a>
          </div>
        </div>
        <iframe
          title={`Live ${programLabel} Encounter site`}
          data-testid="live-site-frame"
          src={links.worldUrl}
          className="w-full bg-white"
          style={{ height: 520, border: 0 }}
          loading="lazy"
        />
      </div>

      <div className="mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: theme.primary }}>
          Edit the page text
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Click any text block below to edit it. Changes save automatically.
        </p>
      </div>

      {loading && (
        <p className="text-sm text-gray-400 animate-pulse" aria-live="polite">
          Loading page content…
        </p>
      )}

      {error && (
        <p role="alert" className="text-red-600 text-sm mb-4">{error}</p>
      )}

      {!loading && !error && blocks.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-400">
          No page content blocks found for this program.
        </div>
      )}

      {/* Page mock-up card */}
      {!loading && !error && blocks.length > 0 && (
        <div
          className="rounded-2xl border shadow-sm overflow-hidden"
          style={{ borderColor: `${theme.accent}40`, background: theme.bg }}
          data-testid="page-mockup"
        >
          {/* Simulated browser chrome bar */}
          <div
            className="flex items-center gap-1.5 px-4 py-2.5 border-b"
            style={{
              background: theme.primary,
              borderColor: `${theme.accent}40`,
            }}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-white/20 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-white/20 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-white/20 inline-block" />
            <span
              className="ml-3 text-xs font-medium tracking-wide opacity-60"
              style={{ color: '#fff' }}
            >
              {theme.label} — Public Page
            </span>
          </div>

          {/* Page content sections */}
          <div className="p-6 flex flex-col gap-6">
            {blocks.map((block) => (
              <InlineBlock
                key={block.id}
                block={block}
                accent={theme.accent}
                primary={theme.primary}
                onSave={handleSave}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
