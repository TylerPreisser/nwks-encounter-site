import { useState, FormEvent, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/api';
import EncounterLogos from '@/components/EncounterLogos';
import TwoFactorChallenge, { type TwoFactorMethods } from '@/components/TwoFactorChallenge';

/**
 * Login is the one admin screen that renders BEFORE a program has been picked,
 * so the men's olive / women's cranberry tint has nothing to say here — all it
 * does is leak whichever program the last person happened to use. This screen
 * therefore owns a deliberate neutral palette instead: near-black page, white
 * card, greys for everything else, and colour reserved for the error alert.
 *
 * Note these are *re-pointed* theme variables, not fallbacks. applyTheme() sets
 * --color-primary and friends on <html>, so `var(--color-primary, #fallback)`
 * would still resolve to the program colour — the fallback never fires.
 * Redefining the variables on the login shell overrides them for this subtree
 * only; the rest of the admin keeps its per-program branding.
 */
const INK = '#111113';          // near-black — headings and the primary button
const INK_HOVER = '#2A2A2E';
const TEXT = '#3F3F46';         // labels / body — 10.8:1 on white
const MUTED = '#52525B';        // secondary copy — 7.5:1 on white (AA at any size)
const LINE = '#E4E4E7';         // hairlines and the emoji chip's edge
const FIELD_BORDER = '#D4D4D8';
const CARD = '#FFFFFF';
const PAGE = '#0B0B0C';

// "Neutral" is about the brand tint, not about killing semantic colour — a
// failed login still has to read as a failure at a glance. The usual tinted
// pink panel is avoided deliberately: on a screen whose whole point is "no
// pink, no green", a pink rectangle is the first thing the eye lands on. So the
// alert keeps a neutral surface and carries its meaning in a red rule and red
// text (8.1:1 on that surface — legible, not decorative).
const ALERT_BG = '#FAFAF9';
const ALERT_ACCENT = '#B42318';
const ALERT_TEXT = '#8C1D18';

/** React's CSSProperties rejects custom properties; widen it where we set them. */
type StyleWithVars = CSSProperties & Record<`--${string}`, string>;

const shellStyle: StyleWithVars = {
  // Override the program theme for this subtree (see the note above).
  '--color-primary': INK,
  '--color-secondary': MUTED,
  '--color-accent': INK_HOVER,
  '--color-bg': PAGE,
  '--color-surface': CARD,
  // Login-local tokens. TwoFactorChallenge renders inside this shell and reads
  // them, so the second-factor step can't drift away from the first.
  '--login-ink': INK,
  '--login-text': TEXT,
  '--login-muted': MUTED,
  '--login-line': LINE,
  '--login-field-border': FIELD_BORDER,
  '--login-alert-bg': ALERT_BG,
  '--login-alert-accent': ALERT_ACCENT,
  '--login-alert-text': ALERT_TEXT,
  // Flat black reads as "screen off". A wide, completely hue-free radial lift
  // gives the card something to sit on while staying strictly greyscale.
  background: `radial-gradient(120% 90% at 50% 0%, #1D1D20 0%, ${PAGE} 62%)`,
  backgroundColor: PAGE,
};

/**
 * Scoped to `.nwks-login`, so nothing here can reach the branded rest of the
 * admin. Lives in the component (rather than index.css) because index.css is
 * shared with every themed screen. Focus and hover need real CSS — an inline
 * style cannot express either.
 */
const LOGIN_CSS = `
.nwks-login .nwks-login-field {
  color: ${INK};
  background: ${CARD};
  transition: border-color .15s ease, box-shadow .15s ease;
}
.nwks-login .nwks-login-field::placeholder { color: #A1A1AA; }
/* Visible focus without a hue. Replaces Tailwind's focus:ring-2, whose default
   ring colour is blue. The first shadow doubles the 1px border into a crisp ink
   outline (a border-width change here would shift the layout); the second is the
   soft halo that makes it obvious across the card. */
.nwks-login .nwks-login-field:focus {
  outline: none;
  border-color: ${INK};
  box-shadow: 0 0 0 1px ${INK}, 0 0 0 4px rgba(17, 17, 19, .17);
}
/* Chrome paints autofilled inputs pale blue/yellow — that would put colour back
   on the screen the moment a password manager fires. */
.nwks-login .nwks-login-field:-webkit-autofill,
.nwks-login .nwks-login-field:-webkit-autofill:focus {
  -webkit-text-fill-color: ${INK};
  box-shadow: 0 0 0 1000px ${CARD} inset;
}
.nwks-login .nwks-login-btn {
  color: ${CARD};
  transition: filter .15s ease, opacity .15s ease;
}
/* The buttons carry their background inline (so they survive a render outside
   this stylesheet), and inline wins over a rule — hence lifting the hover state
   with a filter rather than restating background-color. On ${INK} this lands
   almost exactly on ${INK_HOVER}. */
.nwks-login .nwks-login-btn:hover:not(:disabled) { filter: brightness(2.4); }
.nwks-login .nwks-login-btn:focus-visible {
  outline: 2px solid ${INK};
  outline-offset: 2px;
}
.nwks-login .nwks-login-link {
  color: ${MUTED};
  text-decoration: underline;
  text-underline-offset: 2px;
}
.nwks-login .nwks-login-link:hover { color: ${INK}; }
.nwks-login .nwks-login-link:focus-visible {
  outline: 2px solid ${INK};
  outline-offset: 2px;
  border-radius: 2px;
}
/* Checkboxes default to the browser's accent (blue on most platforms). */
.nwks-login input[type="checkbox"] { accent-color: ${INK}; }
`;

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Set when the password was right but a second factor is still owed. Until
  // this clears there is no session — the password alone gets you nowhere.
  const [methods, setMethods] = useState<TwoFactorMethods | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ two_factor_required?: boolean; methods?: TwoFactorMethods }>(
        '/auth/login',
        { method: 'POST', body: JSON.stringify({ email, password }) }
      );
      if (res.two_factor_required && res.methods) {
        setMethods(res.methods);
        return;
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="nwks-login min-h-screen flex items-center justify-center px-5 py-12"
      style={shellStyle}
    >
      <style>{LOGIN_CSS}</style>

      <div
        className="w-full max-w-sm rounded-2xl p-8"
        style={{
          background: CARD,
          // Two layers: a deep drop shadow to lift the card off the near-black
          // page, and a 1px light edge so it doesn't dissolve into the vignette.
          boxShadow: '0 30px 60px -25px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,.07)',
        }}
      >
        {/* Brand header.

            Both Encounter logos sit here and NOWHERE else in the admin: this is
            the only screen where no program has been chosen yet, so showing the
            men's and women's marks together is accurate. Every screen past the
            login is scoped to one program by the sidebar toggle, where a second
            program's logo would just be wrong. */}
        <div className="text-center">
          <div className="flex justify-center">
            <EncounterLogos />
          </div>
          <h1
            className="mt-4 text-2xl font-bold tracking-tight"
            style={{ color: INK, fontFamily: 'Georgia, serif' }}
          >
            NWKS Encounter
          </h1>
          {/* Small, spaced caps: reads as a subtitle to the serif name rather
              than competing with it, which is the job a tint used to do. */}
          <p
            className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: MUTED }}
          >
            Admin Panel
          </p>
        </div>

        <hr className="my-7 h-px border-0" style={{ background: LINE }} />

        {/* Inline error alert */}
        {error && (
          <div
            role="alert"
            className="mb-5 rounded-lg px-4 py-3 text-sm"
            style={{
              background: ALERT_BG,
              border: `1px solid ${LINE}`,
              borderLeft: `3px solid ${ALERT_ACCENT}`,
              color: ALERT_TEXT,
            }}
          >
            {error}
          </div>
        )}

        {methods ? (
          <TwoFactorChallenge
            methods={methods}
            onSuccess={() => navigate('/', { replace: true })}
          />
        ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium mb-1.5"
              style={{ color: TEXT }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="nwks-login-field w-full rounded-lg border px-3 py-2.5 text-sm"
              style={{ borderColor: FIELD_BORDER }}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium mb-1.5"
              style={{ color: TEXT }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="nwks-login-field w-full rounded-lg border px-3 py-2.5 text-sm"
              style={{ borderColor: FIELD_BORDER }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="nwks-login-btn w-full rounded-lg py-2.5 text-sm font-semibold"
            style={{
              background: INK,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        )}
      </div>
    </div>
  );
}
