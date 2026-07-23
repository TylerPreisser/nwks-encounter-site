import { useEffect, useState, useCallback } from 'react';
import { apiFetch, apiFetchRaw } from '@/api';
import { useProgram } from '@/App';
import RegistrationTable, { type RegistrationRow } from '@/components/RegistrationTable';

export default function RegistrationsPage() {
  const { program } = useProgram();
  const [rows, setRows] = useState<RegistrationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (q) params.set('q', q);
      if (role) params.set('role', role);
      const res = await apiFetch<{ ok: boolean; rows: RegistrationRow[]; total: number }>(
        `/admin/registrations?${params}`
      );
      setRows(res.rows);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [program, page, q, role]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (role) params.set('role', role);
      const res = await apiFetchRaw(`/admin/registrations/export.csv?${params}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'registrations.csv';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const perPage = 50;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
          Registrations
          <span className="ml-2 text-base font-normal text-gray-400">({total})</span>
        </h1>

        <button
          onClick={handleExport}
          disabled={exporting}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
          style={{ background: 'var(--color-secondary)' }}
        >
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="search"
          placeholder="Search name or email…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2"
        />
        <label htmlFor="role-filter" className="sr-only">Role</label>
        <select
          id="role-filter"
          aria-label="Role"
          value={role}
          onChange={(e) => { setRole(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2"
        >
          <option value="">All roles</option>
          <option value="attendee">Attendee</option>
          <option value="server">Server</option>
        </select>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm animate-pulse">Loading…</p>
      ) : (
        <RegistrationTable rows={rows} />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
