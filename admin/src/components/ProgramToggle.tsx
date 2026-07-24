import { useProgram } from '@/App';
import { THEMES, type Program } from '@/theme';

const OPTIONS: { value: Program; label: string }[] = [
  { value: 'mens',   label: "Men's" },
  { value: 'womens', label: "Women's" },
];

/**
 * ProgramToggle — sliding pill toggle between Men's and Women's.
 *
 * The sliding highlight animates between segments:
 *   • Men's active  → soft olive-green (#C9D4A3) background on the pill
 *   • Women's active → soft rose-pink (#F2C4D0) background on the pill
 *
 * Accessible: role="group", aria-pressed per button, keyboard-operable.
 */
export default function ProgramToggle() {
  const { program, setProgram } = useProgram();

  // Soft tint colors for the active pill (lighter than brand primaries)
  const ACTIVE_BG: Record<Program, string> = {
    mens:   '#C9D4A3',  // light olive-green
    womens: '#F2C4D0',  // light rose-pink
  };
  const ACTIVE_TEXT: Record<Program, string> = {
    mens:   '#3D4A1A',  // dark olive for contrast
    womens: '#6B2740',  // dark rose for contrast
  };

  const pillOffset = program === 'womens' ? '50%' : '0%';

  return (
    <div
      role="group"
      aria-label="Program selector"
      className="relative flex rounded-xl overflow-hidden select-none"
      style={{
        background: 'rgba(0,0,0,0.25)',
        padding: '3px',
        width: '100%',
      }}
    >
      {/* Sliding highlight pill */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '3px',
          bottom: '3px',
          left: `calc(${pillOffset} + 3px)`,
          width: 'calc(50% - 3px)',
          background: ACTIVE_BG[program],
          borderRadius: '8px',
          transition: 'left 220ms cubic-bezier(0.4,0,0.2,1), background 220ms ease',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

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
            style={{
              position: 'relative',
              zIndex: 1,
              flex: 1,
              padding: '5px 8px',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.01em',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: active ? ACTIVE_TEXT[value] : 'rgba(255,255,255,0.65)',
              cursor: 'pointer',
              transition: 'color 220ms ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              outline: 'none',
            }}
            onFocus={(e) => {
              e.currentTarget.style.outline = '2px solid rgba(255,255,255,0.7)';
              e.currentTarget.style.outlineOffset = '-2px';
            }}
            onBlur={(e) => {
              e.currentTarget.style.outline = 'none';
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
