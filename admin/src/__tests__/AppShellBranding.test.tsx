/**
 * AppShellBranding.test.tsx
 *
 * Verifies the branding requirements:
 *  1. Program logo image renders in the shell (src differs by program)
 *  2. Nav uses SVG icons — no emoji characters in nav links
 *  3. Theme tokens switch by program
 *  4. Nav label says "Upcoming Encounter" (not "Events")
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProgramContext } from '../App';
import AppShell from '../components/AppShell';
import Nav from '../components/Nav';
import { THEMES } from '../theme';

// Stable mock for apiFetch — used by Nav (testimonies/new-count) and AppShell
vi.mock('../api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true, program_new: 0, unassigned_new: 0 }),
  setApiProgram: vi.fn(),
}));

// AppShell renders <Outlet/> from react-router — stub it
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    Outlet: () => <div data-testid="outlet">content</div>,
    useNavigate: () => vi.fn(),
  };
});

// Re-import the mocked apiFetch so we can reset it per-test
import { apiFetch } from '../api';
const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

function wrapAppShell(program: 'mens' | 'women') {
  return ({ children }: { children: React.ReactNode }) => (
    <ProgramContext.Provider value={{ program, setProgram: vi.fn() }}>
      <MemoryRouter initialEntries={['/']}>
        {children}
      </MemoryRouter>
    </ProgramContext.Provider>
  );
}

describe('AppShell branding', () => {
  beforeEach(() => {
    // Restore a working resolved value after each test's restoreAllMocks
    mockApiFetch.mockResolvedValue({ ok: true, program_new: 0, unassigned_new: 0 });
  });

  it('renders program-logo img for mens', () => {
    render(<AppShell />, { wrapper: wrapAppShell('mens') });
    const logo = screen.getByTestId('program-logo') as HTMLImageElement;
    expect(logo).toBeInTheDocument();
    expect(logo.getAttribute('data-program-logo')).toBe('mens');
    expect(logo.src).toBeTruthy();
  });

  it('renders program-logo img for women', () => {
    render(<AppShell />, { wrapper: wrapAppShell('women') });
    const logo = screen.getByTestId('program-logo') as HTMLImageElement;
    expect(logo).toBeInTheDocument();
    expect(logo.getAttribute('data-program-logo')).toBe('women');
  });

  it('mens and women logos have different src values', () => {
    const { unmount } = render(<AppShell />, { wrapper: wrapAppShell('mens') });
    const mensSrc = (screen.getByTestId('program-logo') as HTMLImageElement).src;
    unmount();

    render(<AppShell />, { wrapper: wrapAppShell('women') });
    const womensSrc = (screen.getByTestId('program-logo') as HTMLImageElement).src;

    expect(mensSrc).not.toBe(womensSrc);
  });

  it('mens theme has deep-olive primary and gold secondary', () => {
    expect(THEMES.mens.primary.toLowerCase()).toBe('#3d4127');
    expect(THEMES.mens.secondary.toLowerCase()).toBe('#b8972a');
  });

  it('women theme has deep-plum primary and rose secondary', () => {
    expect(THEMES.women.primary.toLowerCase()).toBe('#6b2740');
    expect(THEMES.women.secondary.toLowerCase()).toBe('#a0536a');
  });
});

describe('Nav — SVG icons, no emoji', () => {
  beforeEach(() => {
    mockApiFetch.mockResolvedValue({ ok: true, program_new: 0, unassigned_new: 0 });
  });

  function renderNav(program: 'mens' | 'women' = 'mens') {
    return render(
      <ProgramContext.Provider value={{ program, setProgram: vi.fn() }}>
        <MemoryRouter initialEntries={['/']}>
          <Nav />
        </MemoryRouter>
      </ProgramContext.Provider>,
    );
  }

  it('renders SVG elements inside nav links', () => {
    const { container } = renderNav();
    const nav = container.querySelector('nav');
    expect(nav).not.toBeNull();
    const svgs = nav!.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(6); // one per nav item
  });

  it('contains no emoji characters in nav link text', () => {
    const { container } = renderNav();
    const nav = container.querySelector('nav')!;
    // Emoji regex: detects common emoji ranges
    const emojiRegex = /[\u{1F300}-\u{1FFFF}\u{2600}-\u{27FF}]/u;
    expect(emojiRegex.test(nav.textContent ?? '')).toBe(false);
  });

  it('nav shows "Upcoming Encounter" label (not "Events")', () => {
    renderNav();
    expect(screen.getByText('Upcoming Encounter')).toBeInTheDocument();
    expect(screen.queryByText(/^Events$/)).not.toBeInTheDocument();
  });

  it('nav shows Dashboard, Registrations, Email, Testimonies', () => {
    renderNav();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Registrations')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Testimonies & Teachings')).toBeInTheDocument();
  });

  it('nav no longer shows the removed Gallery tab', () => {
    renderNav();
    expect(screen.queryByText('Gallery')).not.toBeInTheDocument();
  });
});
