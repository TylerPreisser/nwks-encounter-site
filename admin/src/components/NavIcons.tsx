/**
 * NavIcons — minimal inline SVG line icons for the admin nav.
 * All icons inherit currentColor so they tint with the nav theme.
 * 20×20 viewBox, stroke-based, no fill.
 */

interface IconProps {
  className?: string;
}

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

/** Dashboard — four squares grid */
export function IconDashboard({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="2" y="2" width="7" height="7" rx="1" />
      <rect x="11" y="2" width="7" height="7" rx="1" />
      <rect x="2" y="11" width="7" height="7" rx="1" />
      <rect x="11" y="11" width="7" height="7" rx="1" />
    </svg>
  );
}

/** Registrations — clipboard with lines */
export function IconClipboard({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M7 3H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1h-2" />
      <rect x="7" y="2" width="6" height="3" rx="1" />
      <line x1="7" y1="9" x2="13" y2="9" />
      <line x1="7" y1="13" x2="11" y2="13" />
    </svg>
  );
}

/** Upcoming Encounter / Calendar */
export function IconCalendar({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="4" width="14" height="14" rx="1.5" />
      <line x1="7" y1="2" x2="7" y2="6" />
      <line x1="13" y1="2" x2="13" y2="6" />
      <line x1="3" y1="9" x2="17" y2="9" />
    </svg>
  );
}

/** Email — envelope */
export function IconMail({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="2" y="4" width="16" height="12" rx="1.5" />
      <polyline points="2,4 10,11 18,4" />
    </svg>
  );
}

/** Gallery — image frame with mountain */
export function IconImage({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="2" y="3" width="16" height="14" rx="1.5" />
      <circle cx="7" cy="8" r="1.5" />
      <polyline points="2,15 7,10 11,14 14,11 18,15" />
    </svg>
  );
}

/** Testimonies & Teachings — heart */
export function IconHeart({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M10 17s-7-4.35-7-9A4 4 0 0 1 10 5.7 4 4 0 0 1 17 8c0 4.65-7 9-7 9z" />
    </svg>
  );
}

/** Forms — clipboard with pencil edit mark */
export function IconForms({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M7 3H5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1h-2" />
      <rect x="7" y="2" width="6" height="3" rx="1" />
      <line x1="7" y1="9" x2="13" y2="9" />
      <path d="M7 13h3l3.5-3.5-3-3L7 10v3z" />
    </svg>
  );
}

/** Web Page Details — browser window with text lines */
export function IconPageDetails({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="2" y="3" width="16" height="14" rx="1.5" />
      <line x1="2" y1="8" x2="18" y2="8" />
      <line x1="6" y1="12" x2="14" y2="12" />
      <line x1="6" y1="15" x2="11" y2="15" />
    </svg>
  );
}
