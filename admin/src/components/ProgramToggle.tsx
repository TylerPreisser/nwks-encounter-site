import { useProgram } from '@/App';
import { THEMES, type Program } from '@/theme';

const OPTIONS: { value: Program; label: string }[] = [
  { value: 'mens',   label: "Men's" },
  { value: 'womens', label: "Women's" },
];

export default function ProgramToggle() {
  const { program, setProgram } = useProgram();

  return (
    <div
      role="group"
      aria-label="Program selector"
      className="flex rounded-lg overflow-hidden border border-white/20 shadow-inner text-xs font-semibold select-none"
    >
      {OPTIONS.map(({ value, label }) => {
        const active = program === value;
        const theme = THEMES[value];
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            data-testid={`program-btn-${value}`}
            onClick={() => setProgram(value)}
            className="px-3 py-1.5 transition-colors duration-150 flex items-center gap-1"
            style={{
              background: active ? theme.primary : 'transparent',
              color: active ? '#fff' : theme.primary,
            }}
          >
            <span aria-hidden="true">{theme.emoji}</span>
            {label}
          </button>
        );
      })}
    </div>
  );
}
