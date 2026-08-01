import { allAnswers, encounterLabel, type RegistrationRow } from './registrationFields';

interface Props {
  reg: RegistrationRow;
  /** Controlled expansion. When true the answer grid is visible. */
  expanded: boolean;
  onToggle: () => void;
  /**
   * Draws attention to the registration the user clicked in from — the one
   * they came to read, as opposed to the rest of the person's history.
   */
  highlighted?: boolean;
}

/**
 * One registration, as a card: which encounter and role at a glance, and every
 * answer the person gave on the form when expanded — named columns plus every
 * custom question from the Forms editor.
 */
export default function RegistrationDetail({ reg, expanded, onToggle, highlighted = false }: Props) {
  const answers = allAnswers(reg);
  const hasDetails = answers.length > 0;

  return (
    <li
      data-testid={`reg-card-${reg.id}`}
      className="rounded-xl border shadow-sm overflow-hidden"
      style={{
        background: 'var(--color-surface)',
        borderColor: highlighted ? 'var(--color-primary)' : 'rgb(243 244 246)',
        borderWidth: highlighted ? 2 : 1,
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3 text-sm flex-wrap">
        <span className="font-medium text-gray-800">{encounterLabel(reg)}</span>
        <span
          className="text-xs px-2 py-0.5 rounded-full text-white"
          style={{ background: reg.role === 'server' ? 'var(--color-secondary)' : 'var(--color-accent)' }}
        >
          {reg.role}
        </span>
        {hasDetails && (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            data-testid={`reg-expand-${reg.id}`}
            className="ml-auto text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {expanded ? 'Hide fields ▲' : 'All fields ▼'}
          </button>
        )}
        {!hasDetails && <span className="ml-auto" />}
      </div>

      {expanded && (
        <div data-testid={`reg-fields-${reg.id}`} className="border-t border-gray-100 px-4 py-3">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
            {answers.map(([label, val]) => (
              <div key={label}>
                <dt className="text-gray-400 uppercase tracking-wide">{label}</dt>
                <dd className="font-medium text-gray-700 break-words">{val}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </li>
  );
}
