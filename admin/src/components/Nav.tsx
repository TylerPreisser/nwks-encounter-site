import { Link, useLocation } from 'react-router-dom';

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/admin/',              label: 'Dashboard',     icon: '📊' },
  { to: '/admin/registrations', label: 'Registrations', icon: '📋' },
  { to: '/admin/events',        label: 'Events',        icon: '📅' },
  { to: '/admin/email',         label: 'Email',         icon: '✉️' },
  { to: '/admin/assistant',     label: 'Assistant',     icon: '🤖' },
  { to: '/admin/gallery',       label: 'Gallery',       icon: '🖼️' },
];

interface NavProps {
  /** Additional links injected by later phases. */
  extraItems?: NavItem[];
}

export default function Nav({ extraItems = [] }: NavProps) {
  const location = useLocation();
  const items = [...NAV_ITEMS, ...extraItems];

  return (
    <nav aria-label="Main navigation" className="flex-1 py-4 space-y-0.5 px-2">
      {items.map(({ to, label, icon }) => {
        const active =
          to === '/admin/'
            ? location.pathname === '/admin/' || location.pathname === '/admin'
            : location.pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            aria-current={active ? 'page' : undefined}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150"
            style={{
              background: active ? 'rgba(255,255,255,0.18)' : 'transparent',
              color: '#fff',
            }}
          >
            <span aria-hidden="true">{icon}</span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
