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
 * - Top-left: ProgramToggle — switching program re-themes the entire shell
 *   via CSS variables (set by applyTheme in AuthGuard) and updates the
 *   ProgramContext so all apiFetch calls carry the correct ?program= param.
 * - Sidebar Nav: Dashboard, Registrations (more links added by later phases).
 * - Main: <Outlet /> for page content.
 */
export default function AppShell() {
  const navigate = useNavigate();
  const { program } = useProgram();
  const theme = THEMES[program];

  async function handleLogout() {
    await apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
    navigate('/admin/login', { replace: true });
  }

  return (
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
        {/* Program toggle at top-left */}
        <div className="p-4 border-b border-white/10">
          <p className="text-white/50 text-[10px] font-semibold uppercase tracking-widest mb-2">
            Program
          </p>
          <ProgramToggle />
        </div>

        {/* Navigation links */}
        <Nav />

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
  );
}
