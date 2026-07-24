import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProgramContext } from '../App';
import PersonPage from '../pages/PersonPage';

const mockFetch = vi.fn();
global.fetch = mockFetch;

function personPayload(overrides = {}) {
  return {
    ok: true,
    person: {
      id: 42, first_name: 'Jane', last_name: 'Doe',
      email: 'jane@example.com', phone: '555-1234',
      church: 'First Baptist', city: 'Oakley', state: 'KS',
      times_attended: 3, times_served: 1,
      ...overrides,
    },
    badges: { times_attended: 3, times_served: 1, is_first_timer: false },
    history: [
      { id: 10, event_id: 1, role: 'attendee', year: 2024, title: "Men's 2024", created_at: '2024-08-01T00:00:00Z' },
    ],
    possible_duplicates: [],
  };
}

function wrapper() {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={['/admin/people/42']}>
      <ProgramContext.Provider value={{ program: 'mens', setProgram: vi.fn() }}>
        <Routes>
          <Route path="/admin/people/:id" element={<>{children}</>} />
        </Routes>
      </ProgramContext.Provider>
    </MemoryRouter>
  );
}

describe('PersonPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, json: async () => personPayload() });
  });

  it('renders person name', async () => {
    render(<PersonPage />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
  });

  it('shows attended badge with count', async () => {
    render(<PersonPage />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByText(/attended 3×/i)).toBeInTheDocument());
  });

  it('shows served badge with count', async () => {
    render(<PersonPage />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByText(/served 1×/i)).toBeInTheDocument());
  });

  it('does not show first-timer badge for returning attendee', async () => {
    render(<PersonPage />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.queryByText(/first[- ]timer/i)).not.toBeInTheDocument());
  });

  it('shows first-timer badge when is_first_timer is true', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...personPayload(),
        badges: { times_attended: 0, times_served: 0, is_first_timer: true },
      }),
    });
    render(<PersonPage />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByText(/first[- ]timer/i)).toBeInTheDocument());
  });

  it('shows registration history timeline', async () => {
    render(<PersonPage />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByText("Men's 2024")).toBeInTheDocument());
  });

  it('shows possible duplicates when present', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...personPayload(),
        possible_duplicates: [
          { id: 99, first_name: 'Jane', last_name: 'Doe', email: 'jane2@example.com' },
        ],
      }),
    });
    render(<PersonPage />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByText(/possible duplicate/i)).toBeInTheDocument());
  });

  it('shows loading state before data arrives', async () => {
    // Never resolve to keep loading state
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<PersonPage />, { wrapper: wrapper() });
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows error state when API call fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Not found' }),
      statusText: 'Not Found',
    });
    render(<PersonPage />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByText(/not found/i)).toBeInTheDocument());
  });

  it('clicking merge button opens merge dialog', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...personPayload(),
        possible_duplicates: [
          { id: 99, first_name: 'Jane', last_name: 'Doe', email: 'jane2@example.com' },
        ],
      }),
    });
    render(<PersonPage />, { wrapper: wrapper() });
    const mergeBtn = await screen.findByRole('button', { name: /merge into this/i });
    fireEvent.click(mergeBtn);
    expect(screen.getByText(/confirm merge/i)).toBeInTheDocument();
  });

  it('shows all-fields expand button for registrations with named field data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...personPayload(),
        history: [
          {
            id: 10, event_id: 1, role: 'attendee', year: 2024,
            title: "Men's 2024", created_at: '2024-08-01T00:00:00Z',
            shirt_size: 'L', dietary_health: 'None', questions: 'n/a',
            extra: '{}',
          },
        ],
      }),
    });
    render(<PersonPage />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByText("Men's 2024")).toBeInTheDocument());
    expect(screen.getByTestId('reg-expand-10')).toBeInTheDocument();
  });

  it('expands to show named and extra fields on click', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...personPayload(),
        history: [
          {
            id: 11, event_id: 1, role: 'attendee', year: 2025,
            title: "Men's 2025", created_at: '2025-08-01T00:00:00Z',
            shirt_size: 'M', dietary_health: 'Gluten free',
            extra: JSON.stringify({ zip: '67748', sandwich_preference: 'Ham' }),
          },
        ],
      }),
    });
    render(<PersonPage />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByTestId('reg-expand-11')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('reg-expand-11'));
    await waitFor(() => expect(screen.getByTestId('reg-fields-11')).toBeInTheDocument());
    expect(screen.getByText('M')).toBeInTheDocument();
    expect(screen.getByText('Gluten free')).toBeInTheDocument();
    expect(screen.getByText('67748')).toBeInTheDocument();
    expect(screen.getByText('Ham')).toBeInTheDocument();
  });

  it('calls merge endpoint with correct into_id and navigates', async () => {
    // First call: load person with duplicate
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...personPayload(),
        possible_duplicates: [
          { id: 99, first_name: 'Jane', last_name: 'Doe', email: 'jane2@example.com' },
        ],
      }),
    });
    // Second call: merge POST
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, person: { id: 42 } }),
    });
    // Third call: re-fetch on navigation (for the target person id 99)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => personPayload(),
    });

    render(
      <MemoryRouter initialEntries={['/admin/people/42']}>
        <ProgramContext.Provider value={{ program: 'mens', setProgram: vi.fn() }}>
          <Routes>
            <Route path="/admin/people/:id" element={<PersonPage />} />
          </Routes>
        </ProgramContext.Provider>
      </MemoryRouter>
    );

    const mergeBtn = await screen.findByRole('button', { name: /merge into this/i });
    fireEvent.click(mergeBtn);

    const confirmBtn = await screen.findByRole('button', { name: /^merge$/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      const calls = mockFetch.mock.calls;
      const mergeCall = calls.find(([url]: [string]) =>
        url.includes('/api/admin/people/42/merge')
      );
      expect(mergeCall).toBeDefined();
      const [, init] = mergeCall as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({ into_id: 99 });
    });
  });
});
