import { Outlet, useNavigate } from 'react-router-dom';
import { apiFetch } from '@/api';
import { useProgram } from '@/App';
import { THEMES } from '@/theme';
import ProgramToggle from './ProgramToggle';
import Nav from './Nav';

/**
 * AppShell — authenticated layout wrapper.
 *
 * - Renders a themed sidebar (primary color = program-specific).
 * - Top: program logo (men's or women's) + "NWKS Encounter" label.
 * - ProgramToggle: switching program re-themes the entire shell via CSS
 *   variables and switches the logo.
 * - Sidebar Nav: Dashboard, Registrations, Upcoming Encounter, etc.
 * - Main: <Outlet /> for page content.
 */
import DesktopOnlyNotice from './DesktopOnlyNotice';
import { useEffect as useRoleEffect, useState as useRoleState } from 'react';
import { apiFetch as roleFetch } from '@/api';

export default function AppShell() {
  // The Team tab is super-admin only. The server enforces this on every team
  // endpoint regardless; this just avoids showing a link that would 403.
  const [isSuperAdmin, setIsSuperAdmin] = useRoleState(false);
  useRoleEffect(() => {
    roleFetch<{ user?: { role?: string } }>('/auth/me')
      .then((d) => setIsSuperAdmin(d.user?.role === 'super_admin'))
      .catch(() => setIsSuperAdmin(false));
  }, []);

  const navigate = useNavigate();
  const { program } = useProgram();
  const theme = THEMES[program];

  async function handleLogout() {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
    navigate('/login', { replace: true });
  }

  return (
    <>
      <DesktopOnlyNotice />
      <div
      data-program={program}
      className="min-h-screen flex"
      style={{ background: 'var(--color-bg, #F5F3EC)' }}
    >
      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside
        className="w-56 flex-shrink-0 flex flex-col shadow-lg"
        style={{ background: theme.primary }}
      >
        {/* Logo + program toggle */}
        <div className="p-4 border-b border-white/10 flex flex-col items-center gap-3">
          {/* Program logo */}
          <img
            src={theme.logoSrc}
            alt={theme.logoAlt}
            data-testid="program-logo"
            data-program-logo={program}
            className="w-16 h-16 rounded-full object-cover shadow-md border-2 border-white/20"
          />
          <p className="text-white/70 text-[10px] font-semibold uppercase tracking-widest">
            NWKS Encounter
          </p>
          <ProgramToggle />
        </div>

        {/* Navigation links */}
        <Nav superAdmin={isSuperAdmin} />

        {/* Sign out */}
        <div className="p-4 border-t border-white/10">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full text-left text-xs text-white/60 hover:text-white/90 transition-colors duration-150"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────── */}
      <main className="flex-1 overflow-auto p-6" style={{ background: 'var(--color-bg, #F5F3EC)' }}>
        <Outlet />
      </main>
    </div>
      </>
  );
}
