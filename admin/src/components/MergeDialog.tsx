interface Person { id: number; first_name: string; last_name: string; email?: string | null }

interface Props {
  source: Person;
  target: Person;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}

export default function MergeDialog({ source, target, onConfirm, onCancel, loading }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl shadow-2xl p-6" style={{ background: 'var(--color-surface)' }}>
        <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--color-primary)' }}>
          Confirm Merge
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          <strong>{source.first_name} {source.last_name}</strong> will be merged into{' '}
          <strong>{target.first_name} {target.last_name}</strong>. All registrations will move to
          the target record and the source will be archived. This cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm border border-gray-200 text-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: 'var(--color-primary)' }}
          >
            {loading ? 'Merging…' : 'Merge'}
          </button>
        </div>
      </div>
    </div>
  );
}
