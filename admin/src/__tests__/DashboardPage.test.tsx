import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProgramContext } from '../App';
import DashboardPage from '../pages/DashboardPage';

// Mock apiFetch so tests never hit the network
vi.mock('../api', () => ({
  apiFetch: vi.fn(),
  setApiProgram: vi.fn(),
}));

import { apiFetch } from '../api';
const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

// ── Fixed stats payload ──────────────────────────────────────────────────────

const MENS_STATS = {
  attendee_count: 42,
  server_count: 8,
  first_timers: 12,
  email_sent_count: 35,
  by_launch_location: [
    { location: 'North Campus', count: 20 },
    { location: 'South Campus', count: 22 },
  ],
  by_shirt_size: [
    { size: 'M', count: 15 },
    { size: 'L', count: 18 },
    { size: 'XL', count: 9 },
  ],
  recent_registrations: [
    { id: 1, first_name: 'Alice', last_name: 'Smith', role: 'attendee', created_at: '2025-08-01T12:00:00Z' },
    { id: 2, first_name: 'Bob',   last_name: 'Jones', role: 'server',   created_at: '2025-08-02T09:30:00Z' },
  ],
  upcoming_event: {
    title: 'Men\'s Encounter 2025',
    start_date: '2025-09-05',
    end_date: '2025-09-07',
  },
};

const WOMENS_STATS = {
  attendee_count: 55,
  server_count: 10,
  first_timers: 5,
  email_sent_count: 48,
  by_launch_location: [
    { location: 'East Wing', count: 30 },
    { location: 'West Wing', count: 25 },
  ],
  by_shirt_size: [
    { size: 'S', count: 20 },
    { size: 'M', count: 25 },
  ],
  recent_registrations: [
    { id: 3, first_name: 'Carol', last_name: 'White', role: 'attendee', created_at: '2025-08-03T08:00:00Z' },
  ],
  upcoming_event: {
    title: "Women's Encounter 2025",
    start_date: '2025-10-10',
    end_date: '2025-10-12',
  },
};

// Stub event list returned by the UpcomingEncounterTile (GET /admin/events)
const MENS_EVENTS_RESPONSE = {
  ok: true,
  events: [{
    id: 10,
    program: 'mens',
    year: 2025,
    title: "Men's Encounter 2025",
    start_date: '2025-09-05',
    end_date: '2025-09-07',
    launch_locations: '["Colby","Hays"]',
    attendee_registration_open: 1,
    server_registration_open: 1,
    is_current: 1,
  }],
};

const WOMENS_EVENTS_RESPONSE = {
  ok: true,
  events: [{
    id: 11,
    program: 'women',
    year: 2025,
    title: "Women's Encounter 2025",
    start_date: '2025-10-10',
    end_date: '2025-10-12',
    launch_locations: '["Topeka"]',
    attendee_registration_open: 1,
    server_registration_open: 1,
    is_current: 1,
  }],
};

const EMPTY_EVENTS_RESPONSE = { ok: true, events: [] };

// ── Helper: render DashboardPage with a given program ────────────────────────

function renderDashboard(program: 'mens' | 'women' = 'mens', setProgram = vi.fn()) {
  return render(
    <ProgramContext.Provider value={{ program, setProgram }}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </ProgramContext.Provider>,
  );
}

/**
 * Mock apiFetch to dispatch to dashboard vs events based on URL path.
 * DashboardPage calls '/admin/dashboard'; UpcomingEncounterTile calls '/admin/events'.
 */
function mockBothApis(
  dashboardResolve: unknown,
  eventsResolve: unknown = MENS_EVENTS_RESPONSE,
) {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === '/admin/dashboard') {
      return dashboardResolve instanceof Promise
        ? dashboardResolve
        : Promise.resolve(dashboardResolve);
    }
    if (path === '/admin/events') {
      return eventsResolve instanceof Promise
        ? eventsResolve
        : Promise.resolve(eventsResolve);
    }
    return Promise.reject(new Error(`Unmocked path: ${path}`));
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DashboardPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a loading state while the API call is in flight', () => {
    // Both APIs never resolve — stays in flight
    mockBothApis(new Promise(() => {}), new Promise(() => {}));
    renderDashboard();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders stat numbers from the payload', async () => {
    mockBothApis({ ok: true, stats: MENS_STATS });
    renderDashboard();

    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument());
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('35')).toBeInTheDocument();
  });

  it('renders the stat card labels', async () => {
    mockBothApis({ ok: true, stats: MENS_STATS });
    renderDashboard();

    await waitFor(() => expect(screen.getByText(/attendees/i)).toBeInTheDocument());
    expect(screen.getByText(/servers/i)).toBeInTheDocument();
    expect(screen.getByText(/first-timers/i)).toBeInTheDocument();
    expect(screen.getByText(/emails sent/i)).toBeInTheDocument();
  });

  it('renders the event title from the payload', async () => {
    mockBothApis({ ok: true, stats: MENS_STATS });
    renderDashboard();

    await waitFor(() =>
      expect(screen.getAllByText(/Men's Encounter 2025/i).length).toBeGreaterThan(0),
    );
  });

  it('shows launch-location breakdown', async () => {
    mockBothApis({ ok: true, stats: MENS_STATS });
    renderDashboard();

    await waitFor(() => expect(screen.getByText('North Campus')).toBeInTheDocument());
    expect(screen.getByText('South Campus')).toBeInTheDocument();
  });

  it('shows shirt-size breakdown as pills', async () => {
    mockBothApis({ ok: true, stats: MENS_STATS });
    renderDashboard();

    await waitFor(() => expect(screen.getByText('M: 15')).toBeInTheDocument());
    expect(screen.getByText('L: 18')).toBeInTheDocument();
    expect(screen.getByText('XL: 9')).toBeInTheDocument();
  });

  it('shows recent registrations', async () => {
    mockBothApis({ ok: true, stats: MENS_STATS });
    renderDashboard();

    await waitFor(() => expect(screen.getByText(/Alice Smith/i)).toBeInTheDocument());
    expect(screen.getByText(/Bob Jones/i)).toBeInTheDocument();
  });

  it('shows an error message when the API call fails', async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/admin/dashboard') return Promise.reject(new Error('Network error'));
      return Promise.resolve(MENS_EVENTS_RESPONSE);
    });
    renderDashboard();

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Network error'),
    );
  });

  it('refetches when the program changes, and renders the new data', async () => {
    // Use path-based routing to avoid ordering issues between dashboard and tile effects
    let program: 'mens' | 'women' = 'mens';
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/admin/dashboard') {
        return Promise.resolve(
          program === 'mens' ? { ok: true, stats: MENS_STATS } : { ok: true, stats: WOMENS_STATS },
        );
      }
      if (path === '/admin/events') {
        return Promise.resolve(
          program === 'mens' ? MENS_EVENTS_RESPONSE : WOMENS_EVENTS_RESPONSE,
        );
      }
      return Promise.reject(new Error(`Unmocked: ${path}`));
    });

    const setProgram = vi.fn();
    const { rerender } = renderDashboard('mens', setProgram);

    // Wait for initial mens data
    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument());

    // Switch to womens
    program = 'women';
    rerender(
      <ProgramContext.Provider value={{ program: 'women', setProgram }}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </ProgramContext.Provider>,
    );

    // Should now show womens data
    await waitFor(() => expect(screen.getByText('55')).toBeInTheDocument());
    expect(screen.getAllByText(/Women's Encounter 2025/i).length).toBeGreaterThan(0);
  });

  it('shows loading state again while switching programs', async () => {
    // Path-based rather than call-ordered: the page fetches dashboard stats,
    // the encounter tile's events, and the testimony count, and their effects
    // don't fire in a guaranteed order.
    let program: 'mens' | 'women' = 'mens';
    mockApiFetch.mockImplementation((path: string) => {
      if (program === 'women') return new Promise(() => {}); // stays in flight
      if (path === '/admin/dashboard') return Promise.resolve({ ok: true, stats: MENS_STATS });
      if (path === '/admin/events') return Promise.resolve(MENS_EVENTS_RESPONSE);
      return Promise.resolve({ ok: true, program_new: 0, unassigned_new: 0 });
    });

    const { rerender } = renderDashboard('mens');
    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument());

    program = 'women';
    await act(async () => {
      rerender(
        <ProgramContext.Provider value={{ program: 'women', setProgram: vi.fn() }}>
          <MemoryRouter>
            <DashboardPage />
          </MemoryRouter>
        </ProgramContext.Provider>,
      );
    });

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows Dashboard as heading when there is no upcoming event', async () => {
    const noEvent = { ...MENS_STATS, upcoming_event: null };
    mockBothApis({ ok: true, stats: noEvent }, EMPTY_EVENTS_RESPONSE);
    renderDashboard();

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Dashboard'),
    );
  });

  it('hides location section when by_launch_location is empty', async () => {
    const noLoc = { ...MENS_STATS, by_launch_location: [] };
    mockBothApis({ ok: true, stats: noLoc });
    renderDashboard();

    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument());
    expect(screen.queryByText('By Launch Location')).not.toBeInTheDocument();
  });

  it('hides shirt-size section when by_shirt_size is empty', async () => {
    const noShirt = { ...MENS_STATS, by_shirt_size: [] };
    mockBothApis({ ok: true, stats: noShirt });
    renderDashboard();

    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument());
    expect(screen.queryByText('Shirt Sizes')).not.toBeInTheDocument();
  });
});
