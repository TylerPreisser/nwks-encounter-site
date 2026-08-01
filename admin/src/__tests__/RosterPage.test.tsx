import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProgramContext } from '../App';
import RosterPage from '../pages/RosterPage';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const ENCOUNTERS = [
  { id: 3, year: 2027, season: 'spring', display_name: 'Spring 2027', is_current: 1 },
  { id: 1, year: 2026, season: 'fall', display_name: 'Fall 2026', is_current: 0 },
];

const JIM = {
  id: 100, person_id: 10, first_name: 'Jim', last_name: 'Halpert',
  email: 'jim@example.com', phone: '(785) 555-0100', role: 'attendee',
  launch_location: 'Colby', shirt_size: 'XL', dietary_health: 'Peanut allergy',
  times_attended: 3, times_served: 0, is_first_timer: 0,
  created_at: '2026-07-01T00:00:00Z',
};

const DWIGHT = {
  id: 101, person_id: 11, first_name: 'Dwight', last_name: 'Schrute',
  email: 'dwight@example.com', phone: '(785) 555-0111', role: 'attendee',
  launch_location: 'Hays', shirt_size: 'L', dietary_health: '',
  times_attended: 1, times_served: 0, is_first_timer: 1,
  created_at: '2026-07-02T00:00:00Z',
};

/** Routes every apiFetch by URL so ordering between calls doesn't matter. */
function route(rows = [JIM, DWIGHT]) {
  mockFetch.mockImplementation((url: string) => {
    if (String(url).includes('/admin/events')) {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, events: ENCOUNTERS }) });
    }
    if (String(url).includes('/admin/registrations')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, rows, total: rows.length, page: 1, per_page: 50 }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
  });
}

function renderRoster(role: 'attendee' | 'server' = 'attendee') {
  return render(
    <MemoryRouter initialEntries={['/attendees']}>
      <ProgramContext.Provider value={{ program: 'mens', setProgram: vi.fn() }}>
        <Routes>
          <Route path="/attendees" element={<RosterPage role={role} />} />
          <Route path="/people/:id" element={<div>PERSON PAGE</div>} />
        </Routes>
      </ProgramContext.Provider>
    </MemoryRouter>
  );
}

describe('RosterPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    route();
  });

  it('titles itself Attendees and shows the count', async () => {
    renderRoster('attendee');
    expect(await screen.findByRole('heading', { name: /Attendees/i })).toBeTruthy();
    await waitFor(() => expect(screen.getByText('2')).toBeTruthy());
  });

  it('titles itself Servers when role=server', async () => {
    renderRoster('server');
    expect(await screen.findByRole('heading', { name: /Servers/i })).toBeTruthy();
  });

  it('requests only its own role', async () => {
    renderRoster('server');
    await waitFor(() => {
      const calls = mockFetch.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('/admin/registrations') && u.includes('role=server'))).toBe(true);
    });
  });

  it('lists every registrant by name', async () => {
    renderRoster();
    expect(await screen.findByText('Jim Halpert')).toBeTruthy();
    expect(screen.getByText('Dwight Schrute')).toBeTruthy();
  });

  it('shows contact details and location on each row', async () => {
    renderRoster();
    await screen.findByText('Jim Halpert');
    expect(screen.getByText('jim@example.com')).toBeTruthy();
    expect(screen.getByText('(785) 555-0100')).toBeTruthy();
    expect(screen.getByText('Colby')).toBeTruthy();
    expect(screen.getByText(/XL/)).toBeTruthy();
  });

  it('flags a first-timer and marks a returning attendee', async () => {
    renderRoster();
    await screen.findByText('Dwight Schrute');
    expect(screen.getByTestId('badge-101').textContent).toMatch(/first/i);
    expect(screen.getByTestId('badge-100').textContent).toMatch(/3/);
  });

  it('surfaces a dietary/health note, and only where there is one', async () => {
    renderRoster();
    await screen.findByText('Jim Halpert');
    expect(screen.getByTestId('dietary-100')).toBeTruthy();
    expect(screen.queryByTestId('dietary-101')).toBeNull();
  });

  it('links each row into the person page, deep-linking that registration', async () => {
    renderRoster();
    await screen.findByText('Jim Halpert');
    const link = screen.getByTestId('roster-row-100') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toContain('/people/10');
    expect(link.getAttribute('href')).toContain('reg=100');
    expect(link.getAttribute('href')).toContain('from=');
  });

  it('labels the encounter dropdown by season, not bare year', async () => {
    renderRoster();
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Fall 2026/ })).toBeTruthy();
      expect(screen.getByRole('option', { name: /Spring 2027/ })).toBeTruthy();
    });
  });

  it('shows an empty state rather than a bare table', async () => {
    route([]);
    renderRoster();
    expect(await screen.findByText(/No attendees/i)).toBeTruthy();
  });

  it('searches by name', async () => {
    renderRoster();
    await screen.findByText('Jim Halpert');
    fireEvent.change(screen.getByPlaceholderText(/Search/i), { target: { value: 'halpert' } });
    await waitFor(() => {
      const calls = mockFetch.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('q=halpert'))).toBe(true);
    });
  });
});
