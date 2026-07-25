import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { apiFetch } from '@/api';
import {
  IconDashboard,
  IconClipboard,
  IconCalendar,
  IconMail,
  IconImage,
  IconHeart,
  IconForms,
  IconPageDetails,
} from './NavIcons';

type IconComponent = React.ComponentType<{ className?: string }>;

interface NavItem {
  to: string;
  label: string;
  Icon: IconComponent;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/',              label: 'Dashboard',               Icon: IconDashboard   },
  { to: '/registrations', label: 'Registrations',           Icon: IconClipboard   },
  { to: '/events',        label: 'Upcoming Encounter',      Icon: IconCalendar    },
  { to: '/email',         label: 'Email',                   Icon: IconMail        },
  { to: '/gallery',       label: 'Gallery',                 Icon: IconImage       },
  { to: '/testimonies',   label: 'Testimonies & Teachings', Icon: IconHeart       },
  { to: '/forms',         label: 'Forms',                   Icon: IconForms       },
  { to: '/page-details',  label: 'Web Page Details',        Icon: IconPageDetails },
];

interface ExtraNavItem {
  to: string;
  label: string;
  icon?: string;
  Icon?: IconComponent;
}

interface NavProps {
  /** Additional links injected by later phases. */
  extraItems?: ExtraNavItem[];
}

export default function Nav({ extraItems = [] }: NavProps) {
  const location = useLocation();
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
      {NAV_ITEMS.map(({ to, label, Icon }) => {
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
            <Icon className="flex-shrink-0 opacity-80" />
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
      {extraItems.map(({ to, label, icon, Icon: ExtraIcon }) => {
        const active = location.pathname.startsWith(to);
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
            {ExtraIcon
              ? <ExtraIcon className="flex-shrink-0 opacity-80" />
              : icon
                ? <span aria-hidden="true">{icon}</span>
                : null}
            <span className="flex-1">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
