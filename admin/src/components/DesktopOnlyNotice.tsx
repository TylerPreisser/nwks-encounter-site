/**
 * The admin panel is a DESKTOP TOOL. Operator decision, not an oversight.
 *
 * The work done here — reading rosters, editing encounters, composing emails,
 * managing the team — is desk work, and the shell is built around a permanent
 * 224px sidebar. On a phone that leaves ~166px of content: buttons wrap to three
 * lines and tables get clipped. Rather than ship a cramped half-experience and
 * let someone discover it mid-task, small screens get told plainly.
 *
 * Deliberately NOT a hard block: the public site is the phone-facing surface,
 * but if an admin genuinely needs to check something from a phone they can
 * continue anyway. A dead end would be worse than a warning.
 */
import { useState } from 'react';

const BREAKPOINT = 900;

export default function DesktopOnlyNotice() {
  const [dismissed, setDismissed] = useState(false);
  const narrow = typeof window !== 'undefined' && window.innerWidth < BREAKPOINT;

  if (!narrow || dismissed) return null;

  return (
    <div
      role="dialog"
      aria-label="Desktop recommended"
      data-testid="desktop-only-notice"
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(11,11,12,.92)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 text-center"
        style={{ background: '#FFFFFF', boxShadow: '0 30px 60px -25px rgba(0,0,0,.85)' }}
      >
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-2xl"
          style={{ background: '#F4F4F5' }}
          aria-hidden="true"
        >
          🖥️
        </div>
        <h2 className="text-lg font-bold" style={{ color: '#18181B', fontFamily: 'Georgia, serif' }}>
          Best on a computer
        </h2>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: '#52525B' }}>
          The NWKS admin panel is built for a laptop or desktop. Rosters, the encounter
          controls and the email editor need the room.
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="mt-5 w-full rounded-lg py-2.5 text-sm font-semibold text-white"
          style={{ background: '#18181B' }}
        >
          Continue anyway
        </button>
      </div>
    </div>
  );
}
