interface Props {
  label: string;
  value: number | string;
  sub?: string;
}

export default function StatCard({ label, value, sub }: Props) {
  return (
    <div
      className="rounded-2xl p-5 shadow-sm border border-white/50"
      style={{ background: 'var(--color-surface)' }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-2 text-3xl font-bold" style={{ color: 'var(--color-primary)' }}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}
