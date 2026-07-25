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
import RegistrationsPage from './pages/RegistrationsPage';
import PersonPage from './pages/PersonPage';
import Events from './pages/Events';
import { EmailPage } from './pages/Email';
import Assistant from './pages/Assistant';
import Gallery from './pages/Gallery';
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
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--color-bg, #F5F3EC)' }}
      >
        <span className="text-sm" style={{ color: '#78716c' }}>Loading…</span>
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

        {/* Protected — AuthGuard verifies session, AppShell provides layout */}
        <Route element={<AuthGuard />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<DashboardPage />} />
            <Route
              path="/registrations"
              element={<RegistrationsPage />}
            />
            <Route
              path="/people/:id"
              element={<PersonPage />}
            />
            <Route path="/events" element={<Events />} />
            <Route path="/email" element={<EmailPage />} />
            {/* Assistant route disabled — component preserved for re-activation */}
            <Route path="/assistant" element={<Navigate to="/" replace />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/testimonies" element={<Testimonies />} />
            <Route path="/forms" element={<FormsEditor />} />
            <Route path="/page-details" element={<PageDetails />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
