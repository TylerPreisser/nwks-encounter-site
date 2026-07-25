// admin/src/pages/PageDetails.tsx
// CMS admin — edit the public website's page text blocks.
import { useEffect, useState, useCallback } from 'react';
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

// ── Sub-component: single editable block ──────────────────────────────────────

interface BlockEditorProps {
  block: PageBlock;
  themeAccent: string;
  themePrimary: string;
  onSave: (id: number, value: string) => Promise<void>;
}

function BlockEditor({ block, themeAccent, themePrimary, onSave }: BlockEditorProps) {
  const [value, setValue] = useState(block.value);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = value !== block.value;

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await onSave(block.id, value);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      data-testid={`block-${block.id}`}
    >
      <h3 className="text-sm font-bold mb-2" style={{ color: themePrimary }}>
        {block.label}
      </h3>
      <textarea
        aria-label={`Edit ${block.label}`}
        rows={4}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1"
        style={{ '--tw-ring-color': themeAccent } as React.CSSProperties}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="flex items-center gap-3 mt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="px-3 py-1.5 text-xs rounded font-semibold text-white transition-opacity disabled:opacity-40"
          style={{ background: themeAccent }}
          aria-label={`Save ${block.label}`}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && (
          <span className="text-xs text-green-600 font-medium" role="status">
            Saved
          </span>
        )}
        {error && (
          <span role="alert" className="text-xs text-red-600">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PageDetails() {
  const { program } = useProgram();
  const theme = THEMES[program];

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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: theme.primary }}>
          Web Page Details
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          These text blocks appear on the public-facing{' '}
          {program === 'mens' ? "Men's" : "Women's"} Encounter website.
          Edit and save each block to update the live site.
        </p>
      </div>

      {loading && (
        <p className="text-sm text-gray-400 animate-pulse">Loading page content…</p>
      )}

      {error && (
        <p role="alert" className="text-red-600 text-sm mb-4">{error}</p>
      )}

      {!loading && !error && blocks.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-400">
          No page content blocks found for this program.
        </div>
      )}

      {!loading && !error && blocks.length > 0 && (
        <div className="flex flex-col gap-4">
          {blocks.map((block) => (
            <BlockEditor
              key={block.id}
              block={block}
              themeAccent={theme.accent}
              themePrimary={theme.primary}
              onSave={handleSave}
            />
          ))}
        </div>
      )}
    </div>
  );
}
