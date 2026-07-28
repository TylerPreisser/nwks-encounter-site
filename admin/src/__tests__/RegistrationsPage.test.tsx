import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProgramContext } from '../App';
import RegistrationsPage from '../pages/RegistrationsPage';

// Keep apiFetch/apiFetchRaw real (they drive the assertions via global.fetch),
// but stub the year switcher's encounter load so it doesn't add a fetch call.
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  listEncounters: vi.fn().mockResolvedValue([]),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock');
global.URL.revokeObjectURL = vi.fn();

function wrapper(program: 'mens' | 'women' = 'mens') {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
      <ProgramContext.Provider value={{ program, setProgram: vi.fn() }}>
        {children}
      </ProgramContext.Provider>
    </MemoryRouter>
  );
}

describe('RegistrationsPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, rows: [], total: 0, page: 1, per_page: 50 }),
      blob: async () => new Blob(['header\nrow1'], { type: 'text/csv' }),
      headers: { get: () => 'text/csv' },
    });
  });

  it('renders search input and role filter', async () => {
    render(<RegistrationsPage />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument());
    expect(screen.getByRole('combobox', { name: /role/i })).toBeInTheDocument();
  });

  it('renders Export CSV button', async () => {
    render(<RegistrationsPage />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument());
  });

  it('shows "No registrations found" when list is empty', async () => {
    render(<RegistrationsPage />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByText(/no registrations/i)).toBeInTheDocument());
  });

  it('renders rows when data is returned', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        rows: [
          { id: 1, first_name: 'Alice', last_name: 'Smith', email: 'a@test.com', role: 'attendee', launch_location: 'Colby', shirt_size: 'M', created_at: '2026-07-01T00:00:00Z' },
        ],
        total: 1, page: 1, per_page: 50,
      }),
      headers: { get: () => null },
    });
    render(<RegistrationsPage />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    expect(screen.getByText('Smith')).toBeInTheDocument();
  });

  it('re-fetches when program context changes', async () => {
    const { rerender } = render(
      <MemoryRouter>
        <ProgramContext.Provider value={{ program: 'mens', setProgram: vi.fn() }}>
          <RegistrationsPage />
        </ProgramContext.Provider>
      </MemoryRouter>
    );
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    rerender(
      <MemoryRouter>
        <ProgramContext.Provider value={{ program: 'women', setProgram: vi.fn() }}>
          <RegistrationsPage />
        </ProgramContext.Provider>
      </MemoryRouter>
    );
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });
});
