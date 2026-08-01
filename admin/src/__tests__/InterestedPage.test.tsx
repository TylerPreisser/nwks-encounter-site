import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProgramContext } from '../App';
import InterestedPage from '../pages/InterestedPage';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const PAM = {
  id: 200, role: 'attendee', first_name: 'Pam', last_name: 'Beesly',
  email: 'pam@example.com', phone: '(785) 555-0200',
  status: 'waiting', notified_at: null,
  created_at: '2026-07-01T00:00:00Z',
  notified_year: null, notified_season: null,
};

const OSCAR = {
  id: 201, role: 'server', first_name: 'Oscar', last_name: 'Martinez',
  email: 'oscar@example.com', phone: '(785) 555-0201',
  status: 'notified', notified_at: '2026-07-10T00:00:00Z',
  created_at: '2026-06-02T00:00:00Z',
  notified_year: 2026, notified_season: 'fall',
};

/**
 * Routes every apiFetch by URL. Call order is unreliable here — the list
 * refetches after a remove — so nothing may depend on which call came first.
 */
function route(rows: unknown[] = [PAM, OSCAR]) {
  mockFetch.mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes('/admin/interest/') && u.includes('/remove')) {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    }
    if (u.includes('/admin/interest')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, rows, total: rows.length }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/interested']}>
      <ProgramContext.Provider value={{ program: 'mens', setProgram: vi.fn() }}>
        <Routes>
          <Route path="/interested" element={<InterestedPage />} />
        </Routes>
      </ProgramContext.Provider>
    </MemoryRouter>
  );
}

const interestListCalls = () =>
  mockFetch.mock.calls
    .map((c) => String(c[0]))
    .filter((u) => u.includes('/admin/interest') && !u.includes('/remove'));

describe('InterestedPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    route();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('titles itself Interested and shows the count', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: /Interested/i })).toBeTruthy();
    await waitFor(() => expect(screen.getByText('2')).toBeTruthy());
  });

  it('lists everyone waiting, with contact details and when they joined', async () => {
    renderPage();
    expect(await screen.findByText('Pam Beesly')).toBeTruthy();
    expect(screen.getByText('Oscar Martinez')).toBeTruthy();
    expect(screen.getByText('pam@example.com')).toBeTruthy();
    expect(screen.getByText('(785) 555-0200')).toBeTruthy();
    expect(screen.getByTestId('interest-row-200').textContent).toMatch(/Joined/);
  });

  it('badges each row with its role', async () => {
    renderPage();
    await screen.findByText('Pam Beesly');
    expect(screen.getByTestId('role-badge-200').textContent).toMatch(/attendee/i);
    expect(screen.getByTestId('role-badge-201').textContent).toMatch(/server/i);
  });

  it('names the encounter a notified person was invited to', async () => {
    renderPage();
    await screen.findByText('Oscar Martinez');
    expect(screen.getByTestId('status-badge-201').textContent).toBe('Invited to Fall 2026');
    // Someone never invited reads as waiting, not as a blank invitation.
    expect(screen.getByTestId('status-badge-200').textContent).toBe('Waiting');
  });

  it('asks the API for only the chosen role, and omits the param for All', async () => {
    renderPage();
    await screen.findByText('Pam Beesly');
    // "All" must not send role= at all — the API reads an absent param as every role.
    expect(interestListCalls().every((u) => !u.includes('role='))).toBe(true);

    fireEvent.change(screen.getByLabelText(/Role/i), { target: { value: 'server' } });
    await waitFor(() => {
      expect(interestListCalls().some((u) => u.includes('role=server'))).toBe(true);
    });

    fireEvent.change(screen.getByLabelText(/Role/i), { target: { value: 'attendee' } });
    await waitFor(() => {
      expect(interestListCalls().some((u) => u.includes('role=attendee'))).toBe(true);
    });
  });

  it('removes someone through the remove endpoint and refreshes the list', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await screen.findByText('Pam Beesly');
    const before = interestListCalls().length;

    fireEvent.click(screen.getByTestId('remove-200'));

    await waitFor(() => {
      expect(
        mockFetch.mock.calls.some((c) => String(c[0]).includes('/admin/interest/200/remove'))
      ).toBe(true);
    });
    const removeCall = mockFetch.mock.calls.find((c) =>
      String(c[0]).includes('/admin/interest/200/remove')
    );
    expect((removeCall?.[1] as RequestInit)?.method).toBe('POST');
    // The list is re-read afterwards rather than spliced client-side.
    await waitFor(() => expect(interestListCalls().length).toBeGreaterThan(before));
  });

  it('does not remove anyone when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    await screen.findByText('Pam Beesly');

    fireEvent.click(screen.getByTestId('remove-200'));

    await waitFor(() => {
      expect(
        mockFetch.mock.calls.some((c) => String(c[0]).includes('/remove'))
      ).toBe(false);
    });
  });

  it('explains an empty list rather than showing a bare table', async () => {
    route([]);
    renderPage();
    expect(await screen.findByText(/Nobody is waiting/i)).toBeTruthy();
    expect(screen.queryByTestId('interest-row-200')).toBeNull();
  });

  it('surfaces a load failure instead of looking like an empty list', async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 500, statusText: 'Server Error', json: async () => ({ error: 'boom' }) })
    );
    renderPage();
    expect(await screen.findByTestId('interest-error')).toBeTruthy();
  });
});
