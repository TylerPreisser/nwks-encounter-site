export type Program = 'mens' | 'womens';

export interface ThemeTokens {
  primary: string;
  secondary: string;
  bg: string;
  surface: string;
  accent: string;
  label: string;
  emoji: string;
}

export const THEMES: Record<Program, ThemeTokens> = {
  mens: {
    primary:   '#6B7645',
    secondary: '#B8972A',
    bg:        '#F5F3EC',
    surface:   '#FFFFFF',
    accent:    '#8A9A50',
    label:     "Men's Encounter",
    emoji:     '⛺',
  },
  womens: {
    primary:   '#A0536A',
    secondary: '#D4748C',
    bg:        '#FDF5F7',
    surface:   '#FFFFFF',
    accent:    '#C4849A',
    label:     "Women's Encounter",
    emoji:     '🌸',
  },
};

/** Apply theme tokens as CSS custom properties on <html>. */
export function applyTheme(program: Program): void {
  const t = THEMES[program];
  const root = document.documentElement;
  root.style.setProperty('--color-primary',   t.primary);
  root.style.setProperty('--color-secondary', t.secondary);
  root.style.setProperty('--color-bg',        t.bg);
  root.style.setProperty('--color-surface',   t.surface);
  root.style.setProperty('--color-accent',    t.accent);
  root.dataset.program = program;
}

/** Convenience accessor — returns the theme tokens for a given program. */
export function themeFor(program: Program): ThemeTokens {
  return THEMES[program];
}
