import { useEffect, useState } from 'react';
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from 'react-router-dom';
import { createContext, useContext } from 'react';
import { apiFetch, setApiProgram } from './api';
import { applyTheme, type Program } from './theme';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import RosterPage from './pages/RosterPage';
import InterestedPage from './pages/InterestedPage';
import SecurityPage from './pages/SecurityPage';
import DuoCallback from './pages/DuoCallback';
import PersonPage from './pages/PersonPage';
import Events from './pages/Events';
import { EmailPage } from './pages/Email';
import Assistant from './pages/Assistant';
import Testimonies from './pages/Testimonies';
import AppShell from './components/AppShell';
import FormsEditor from './pages/FormsEditor';
import PageDetails from './pages/PageDetails';

/* ── Auth types ─────────────────────────────────────────────────── */
interface AuthUser {
  id: number;
  email: string;
  name: string | null;
  role: string;
}

/* ── Program context ─────────────────────────────────────────────── */
interface ProgramCtx {
  program: Program;
  setProgram: (p: Program) => void;
}

export const ProgramContext = createContext<ProgramCtx>({
  program: 'mens',
  setProgram: () => {},
});

export const useProgram = () => useContext(ProgramContext);

/* ── Auth guard ──────────────────────────────────────────────────── */
function AuthGuard() {
  const [status, setStatus] = useState<'loading' | 'ok' | 'unauth'>('loading');
  const [program, setProgramState] = useState<Program>(
    (localStorage.getItem('nwks_program') ?? 'mens') as Program,
  );

  useEffect(() => {
    apiFetch<{ ok: boolean; user?: AuthUser }>('/auth/me')
      .then(() => setStatus('ok'))
      .catch(() => setStatus('unauth'));
  }, []);

  function setProgram(p: Program) {
    setProgramState(p);
    setApiProgram(p);
    applyTheme(p);
    localStorage.setItem('nwks_program', p);
  }

  if (status === 'loading') {
    // Neutral, not themed. This screen renders BEFORE we know whether the
    // session is valid, so it may be followed by the login card — and the login
    // card is deliberately brand-free (no program has been chosen yet). Using
    // var(--color-bg) here flashed the last program's cream/green for a beat
    // before the black login screen appeared.
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: '#0B0B0C' }}
      >
        <span className="text-sm" style={{ color: '#A1A1AA' }}>Loading…</span>
      </div>
    );
  }

  if (status === 'unauth') return <Navigate to="/login" replace />;

  return (
    <ProgramContext.Provider value={{ program, setProgram }}>
      <Outlet />
    </ProgramContext.Provider>
  );
}

/* ── App shell ───────────────────────────────────────────────────── */
export default function App() {
  return (
    <HashRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/duo-callback" element={<DuoCallback />} />

        {/* Protected — AuthGuard verifies session, AppShell provides layout */}
        <Route element={<AuthGuard />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/attendees" element={<RosterPage role="attendee" />} />
            <Route path="/servers" element={<RosterPage role="server" />} />
            <Route path="/interested" element={<InterestedPage />} />
            {/* Old combined list — anything still linking here lands on Attendees. */}
            <Route path="/registrations" element={<Navigate to="/attendees" replace />} />
            <Route
              path="/people/:id"
              element={<PersonPage />}
            />
            <Route path="/events" element={<Events />} />
            <Route path="/email" element={<EmailPage />} />
            {/* Assistant route disabled — component preserved for re-activation */}
            <Route path="/assistant" element={<Navigate to="/" replace />} />
            {/* Gallery removed — photos now live directly inside emails */}
            <Route path="/gallery" element={<Navigate to="/" replace />} />
            <Route path="/testimonies" element={<Testimonies />} />
            <Route path="/forms" element={<FormsEditor />} />
            <Route path="/page-details" element={<PageDetails />} />
            <Route path="/security" element={<SecurityPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
