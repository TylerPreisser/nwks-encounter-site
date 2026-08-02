import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProgramContext } from '../App';
import DashboardPage from '../pages/DashboardPage';

vi.mock('../api', () => ({
  apiFetch: vi.fn(),
  setApiProgram: vi.fn(),
}));

import { apiFetch } from '../api';
const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

const STATS = {
  attendee_count: 1,
  server_count: 1,
  first_timers: 0,
  email_sent_count: 0,
  // Deliberately absurd: the tile must NOT read this duplicate counter.
  inbox_count: 99,
  by_launch_location: [],
  by_shirt_size: [],
  recent_registrations: [],
  upcoming_event: null,
};

const EVENTS = { ok: true, events: [] };

/** Routes each path the dashboard tree calls; `counts` may be a rejection. */
function mockApis(counts: unknown) {
  mockApiFetch.mockImplementation((path: string) => {
    if (path === '/admin/dashboard') return Promise.resolve({ ok: true, stats: STATS });
    if (path === '/admin/events') return Promise.resolve(EVENTS);
    if (path === '/admin/testimonies/new-count') {
      return counts instanceof Error ? Promise.reject(counts) : Promise.resolve(counts);
    }
    return Promise.reject(new Error(`Unmocked path: ${path}`));
  });
}

function renderDashboard() {
  return render(
    <ProgramContext.Provider value={{ program: 'mens', setProgram: vi.fn() }}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </ProgramContext.Provider>,
  );
}

describe('DashboardPage — testimony arrivals notification', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('counts program + unassigned items from the shared new-count endpoint', async () => {
    mockApis({ ok: true, program_new: 3, unassigned_new: 2 });
    renderDashboard();

    await waitFor(() =>
      expect(screen.getByTestId('testimony-alert-count')).toHaveTextContent('5'),
    );
  });

  it('does not fall back to the dashboard payload duplicate counter', async () => {
    mockApis({ ok: true, program_new: 0, unassigned_new: 0 });
    renderDashboard();

    await waitFor(() =>
      expect(screen.getByTestId('testimony-alert')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('testimony-alert')).not.toHaveTextContent('99');
  });

  it('says all caught up when nothing needs attention', async () => {
    mockApis({ ok: true, program_new: 0, unassigned_new: 0 });
    renderDashboard();

    await waitFor(() =>
      expect(screen.getByTestId('testimony-alert')).toHaveTextContent(/all caught up/i),
    );
  });

  it('links through to the testimonies board', async () => {
    mockApis({ ok: true, program_new: 1, unassigned_new: 0 });
    renderDashboard();

    await waitFor(() =>
      expect(screen.getByTestId('testimony-alert')).toHaveAttribute('href', '/testimonies'),
    );
  });

  it('admits it when the count cannot be loaded instead of showing a silent zero', async () => {
    mockApis(new Error('Network error'));
    renderDashboard();

    await waitFor(() =>
      expect(screen.getByTestId('testimony-alert')).toHaveTextContent(/couldn.t load/i),
    );
    expect(screen.queryByTestId('testimony-alert-count')).not.toBeInTheDocument();
  });
});
