interface Props {
  timesAttended: number;
  timesServed: number;
  isFirstTimer: boolean;
}

export default function PersonBadges({ timesAttended, timesServed, isFirstTimer }: Props) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      <span
        className="px-3 py-1 rounded-full text-xs font-semibold text-white"
        style={{ background: 'var(--color-primary)' }}
      >
        Attended {timesAttended}×
      </span>
      <span
        className="px-3 py-1 rounded-full text-xs font-semibold text-white"
        style={{ background: 'var(--color-secondary)' }}
      >
        Served {timesServed}×
      </span>
      {isFirstTimer && (
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 border border-yellow-200">
          ✨ First-timer
        </span>
      )}
    </div>
  );
}
