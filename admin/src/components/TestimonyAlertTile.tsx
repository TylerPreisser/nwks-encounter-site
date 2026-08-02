import { Link } from 'react-router-dom';

/**
 * Dashboard notification for testimonies/teachings that need attention —
 * anything emailed in and not yet approved or archived.
 *
 * The number comes from GET /api/admin/testimonies/new-count, the same endpoint
 * that drives the nav badge, so the two are always the same number.
 */

interface Props {
  /** null while loading, 'error' when the count could not be fetched. */
  count: number | null | 'error';
}

export default function TestimonyAlertTile({ count }: Props) {
  const failed = count === 'error';
  const loading = count === null;
  const n = typeof count === 'number' ? count : 0;
  const active = typeof count === 'number' && n > 0;

  const message = failed
    ? 'Couldn’t load the count — open the board to check'
    : loading
      ? 'Checking…'
      : n > 0
        ? `${n} ${n === 1 ? 'submission needs' : 'submissions need'} attention`
        : 'All caught up — nothing waiting';

  return (
    <Link
      to="/testimonies"
      data-testid="testimony-alert"
      aria-label={
        failed
          ? 'Testimonies and teachings: count unavailable'
          : `Testimonies and teachings: ${n} needing attention`
      }
      className="flex items-center gap-4 rounded-2xl border px-5 py-4 shadow-sm transition-colors"
      style={{
        background: active ? 'var(--color-primary)' : 'var(--color-surface)',
        borderColor: active ? 'var(--color-primary)' : failed ? '#fcd34d' : '#e5e7eb',
        color: active ? '#fff' : '#374151',
      }}
    >
      <span className="text-2xl" aria-hidden="true">{failed ? '⚠️' : '📬'}</span>
      <div className="flex-1">
        <div className="text-sm font-semibold">Testimonies &amp; Teachings</div>
        <div className="text-xs opacity-80">{message}</div>
      </div>
      {typeof count === 'number' && (
        <span
          data-testid="testimony-alert-count"
          className="inline-flex items-center justify-center min-w-[2rem] h-8 px-2 rounded-full text-sm font-bold"
          style={{
            background: active ? 'rgba(255,255,255,0.22)' : '#f3f4f6',
            color: active ? '#fff' : '#6b7280',
          }}
        >
          {n}
        </span>
      )}
    </Link>
  );
}
