import mensLogoSrc from '@/assets/mens-logo.jpg';
import womensLogoSrc from '@/assets/womens-logo.jpg';

/**
 * EncounterLogos — the Men's + Women's lockup for the Upcoming Encounter page.
 *
 * WHY both marks here: every other admin surface is single-program — the shell
 * shows only the *active* program's logo. This page is where the encounters for
 * BOTH programs are managed, so the header says so up front instead of implying
 * the currently-themed program owns the page.
 *
 * WHY composed in markup rather than one pre-combined image file: the two marks
 * stay sharp at any pixel density, neither logo has to be re-exported into a
 * combined raster when it changes, and the divider can pick up the live theme
 * colour (`--color-secondary`) — which a flat image could never do.
 *
 * Imports the assets directly rather than reading `THEMES[program].logoSrc`
 * because this lockup is deliberately program-independent, and importing
 * `@/theme` would drag `App.tsx` into the module graph of what is otherwise a
 * pure presentational component.
 */

/**
 * Both marks are square-ish circular badges, so one dimension drives both axes.
 * clamp() rather than Tailwind breakpoints because the admin content column is
 * narrow (the shell keeps a fixed 14rem sidebar), so viewport breakpoints lie
 * about how much room this header actually has. Floor of 2.5rem keeps the
 * lettering inside each badge legible on a phone; ceiling of 4rem stops the
 * lockup from overpowering the page title on a desktop.
 */
const LOGO_SIZE = 'clamp(2.5rem, 9vw, 4rem)';

/** Hairline ring — without it the women's mark (black on white) bleeds into the
 *  white surface behind it and reads as floating text rather than a logo. */
// Fallbacks are deliberately NEUTRAL, not brand colours. A var() fallback only
// fires when the variable is undefined — i.e. on a screen with no program theme,
// which is exactly where a program's olive or cranberry would be wrong. The
// login screen is that screen.
const RING = '2px solid color-mix(in srgb, var(--color-primary, #52525B) 22%, transparent)';

export default function EncounterLogos({ className = '' }: { className?: string }) {
  return (
    <div
      data-testid="encounter-logos"
      className={`inline-flex items-center rounded-full shadow-sm ${className}`}
      style={{
        gap: 'clamp(0.5rem, 1.5vw, 0.875rem)',
        padding: 'clamp(0.25rem, 1vw, 0.5rem)',
        background: 'var(--color-surface, #FFFFFF)',
        border: '1px solid color-mix(in srgb, var(--color-accent, #D4D4D8) 30%, transparent)',
      }}
    >
      <img
        src={mensLogoSrc}
        alt="NWKS Men's Encounter"
        data-program-logo="mens"
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: LOGO_SIZE, height: LOGO_SIZE, border: RING }}
      />

      {/* Decorative rule, not content — screen readers get the two alt texts and
          nothing in between. alignSelf:stretch makes it track the logo height,
          so it stays proportional as the clamp above scales the marks. */}
      <span
        aria-hidden="true"
        data-testid="encounter-logos-divider"
        style={{
          width: '1px',
          alignSelf: 'stretch',
          background:
            'linear-gradient(to bottom, transparent, var(--color-secondary, #A1A1AA), transparent)',
        }}
      />

      <img
        src={womensLogoSrc}
        alt="NWKS Women's Encounter"
        data-program-logo="women"
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: LOGO_SIZE, height: LOGO_SIZE, border: RING }}
      />
    </div>
  );
}
