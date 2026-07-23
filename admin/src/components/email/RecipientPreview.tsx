interface Recipient { first_name: string; last_name: string; email: string; }

interface Props {
  count: number;
  sample: Recipient[];
  loading: boolean;
}

export function RecipientPreview({ count, sample, loading }: Props) {
  if (loading) return <p className="text-sm text-gray-400 italic">Loading preview…</p>;
  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-2">
        {count} recipient{count !== 1 ? 's' : ''} match this segment
      </p>
      {sample.length > 0 && (
        <ul className="space-y-0.5 text-gray-600">
          {sample.map((r, i) => (
            <li key={i}>{r.first_name} {r.last_name} &lt;{r.email}&gt;</li>
          ))}
          {count > sample.length && (
            <li className="text-gray-400">…and {count - sample.length} more</li>
          )}
        </ul>
      )}
      {count === 0 && <p className="text-gray-400">No recipients match these filters.</p>}
    </div>
  );
}
