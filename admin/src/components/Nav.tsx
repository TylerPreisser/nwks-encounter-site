import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { apiFetch } from '@/api';

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/',              label: 'Dashboard',               icon: '📊' },
  { to: '/registrations', label: 'Registrations',           icon: '📋' },
  { to: '/events',        label: 'Events',                  icon: '📅' },
  { to: '/email',         label: 'Email',                   icon: '✉️' },
  { to: '/gallery',       label: 'Gallery',                 icon: '🖼️' },
  { to: '/testimonies',   label: 'Testimonies & Teachings', icon: '🕊️' },
];

interface NavProps {
  /** Additional links injected by later phases. */
  extraItems?: NavItem[];
}

export default function Nav({ extraItems = [] }: NavProps) {
  const location = useLocation();
  const items = [...NAV_ITEMS, ...extraItems];
  const [newCount, setNewCount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;

    function fetchCount() {
      apiFetch<{ ok: boolean; program_new: number; unassigned_new: number }>(
        '/admin/testimonies/new-count'
      )
        .then(res => {
          if (!cancelled) {
            setNewCount((res.program_new ?? 0) + (res.unassigned_new ?? 0));
          }
        })
        .catch(() => {});
    }

    fetchCount();
    const interval = setInterval(fetchCount, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <nav aria-label="Main navigation" className="flex-1 py-4 space-y-0.5 px-2">
      {items.map(({ to, label, icon }) => {
        const active =
          to === '/'
            ? location.pathname === '/' || location.pathname === ''
            : location.pathname.startsWith(to);
        const isTestimonies = to === '/testimonies';
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
            <span className="flex-1">{label}</span>
            {isTestimonies && newCount > 0 && (
              <span
                data-testid="testimonies-badge"
                aria-label={`${newCount} new`}
                className="inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full text-[10px] font-bold bg-red-500 text-white"
              >
                {newCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
