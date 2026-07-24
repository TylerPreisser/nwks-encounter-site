/**
 * UpcomingEncounterTile.test.tsx
 *
 * Verifies the dashboard quick-edit panel for the upcoming encounter:
 *  - Loading state while fetching
 *  - Renders current event dates, title, launch locations
 *  - Shows create-prompt when no current event
 *  - Opens edit form inline; PATCHes on Save; reloads after save
 *  - Shows error on save failure
 *  - Fetch error surfaces as alert
 *  - Program-aware (re-fetches on program change)
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ProgramContext } from '../App';
import UpcomingEncounterTile from '../components/UpcomingEncounterTile';

vi.mock('../api', () => ({
  apiFetch: vi.fn(),
  setApiProgram: vi.fn(),
}));

import { apiFetch } from '../api';
const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

const MENS_EVENT = {
  id: 42,
  program: 'mens',
  year: 2025,
  title: "Men's Encounter 2025",
  start_date: '2025-09-05',
  end_date: '2025-09-07',
  launch_locations: '["Colby","Hays","Dodge City"]',
  attendee_registration_open: 1,
  server_registration_open: 1,
  is_current: 1,
};

const WOMEN_EVENT = {
  id: 43,
  program: 'women',
  year: 2025,
  title: "Women's Encounter 2025",
  start_date: '2025-10-10',
  end_date: '2025-10-12',
  launch_locations: '["Topeka","Wichita"]',
  attendee_registration_open: 1,
  server_registration_open: 1,
  is_current: 1,
};

function wrapper(program: 'mens' | 'women' = 'mens') {
  return ({ children }: { children: React.ReactNode }) => (
    <ProgramContext.Provider value={{ program, setProgram: vi.fn() }}>
      <MemoryRouter>
        {children}
      </MemoryRouter>
    </ProgramContext.Provider>
  );
}

describe('UpcomingEncounterTile', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Loading ──────────────────────────────────────────────────────────────

  it('shows loading state while events are fetching', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    render(<UpcomingEncounterTile />, { wrapper: wrapper() });
    expect(screen.getByText(/loading upcoming encounter/i)).toBeInTheDocument();
  });

  // ── Display ─────────────────────────────────────────────────────────────

  it('renders the current event title, dates, and locations', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, events: [MENS_EVENT] });
    render(<UpcomingEncounterTile />, { wrapper: wrapper('mens') });

    await waitFor(() =>
      expect(screen.getByText("Men's Encounter 2025")).toBeInTheDocument(),
    );
    expect(screen.getByText(/2025-09-05/)).toBeInTheDocument();
    expect(screen.getByText(/Colby/)).toBeInTheDocument();
    expect(screen.getByText(/Hays/)).toBeInTheDocument();
  });

  it('renders women event when program is women', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, events: [WOMEN_EVENT] });
    render(<UpcomingEncounterTile />, { wrapper: wrapper('women') });

    await waitFor(() =>
      expect(screen.getByText("Women's Encounter 2025")).toBeInTheDocument(),
    );
    expect(screen.getByText(/2025-10-10/)).toBeInTheDocument();
    expect(screen.getByText(/Topeka/)).toBeInTheDocument();
  });

  // ── No current event ─────────────────────────────────────────────────────

  it('shows create-prompt when no current event exists', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, events: [] });
    render(<UpcomingEncounterTile />, { wrapper: wrapper() });

    await waitFor(() =>
      expect(screen.getByText(/create the upcoming encounter/i)).toBeInTheDocument(),
    );
    // Should also show a link to /events
    const link = screen.getByRole('link', { name: /create the upcoming encounter/i });
    expect(link).toBeInTheDocument();
  });

  it('shows create-prompt when no event has is_current=1', async () => {
    const notCurrent = { ...MENS_EVENT, is_current: 0 };
    mockApiFetch.mockResolvedValue({ ok: true, events: [notCurrent] });
    render(<UpcomingEncounterTile />, { wrapper: wrapper() });

    await waitFor(() =>
      expect(screen.getByText(/create the upcoming encounter/i)).toBeInTheDocument(),
    );
  });

  // ── Fetch error ──────────────────────────────────────────────────────────

  it('surfaces a fetch error', async () => {
    mockApiFetch.mockRejectedValue(new Error('DB unavailable'));
    render(<UpcomingEncounterTile />, { wrapper: wrapper() });

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('DB unavailable'),
    );
  });

  // ── Edit form ────────────────────────────────────────────────────────────

  it('opens the edit form when Edit is clicked', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, events: [MENS_EVENT] });
    render(<UpcomingEncounterTile />, { wrapper: wrapper() });

    await waitFor(() => screen.getByRole('button', { name: /edit/i }));
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));

    expect(screen.getByRole('form', { name: /edit upcoming encounter/i })).toBeInTheDocument();
  });

  it('pre-fills the edit form with current event values', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, events: [MENS_EVENT] });
    render(<UpcomingEncounterTile />, { wrapper: wrapper() });

    await waitFor(() => screen.getByRole('button', { name: /edit/i }));
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));

    expect((screen.getByLabelText(/title/i) as HTMLInputElement).value).toBe("Men's Encounter 2025");
    expect((screen.getByLabelText(/start date/i) as HTMLInputElement).value).toBe('2025-09-05');
    expect((screen.getByLabelText(/end date/i) as HTMLInputElement).value).toBe('2025-09-07');
    expect((screen.getByLabelText(/launch locations/i) as HTMLInputElement).value).toBe('Colby, Hays, Dodge City');
  });

  it('closes the edit form on Cancel', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, events: [MENS_EVENT] });
    render(<UpcomingEncounterTile />, { wrapper: wrapper() });

    await waitFor(() => screen.getByRole('button', { name: /edit/i }));
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByRole('form', { name: /edit upcoming encounter/i })).not.toBeInTheDocument();
    // Back to display view
    expect(screen.getByText("Men's Encounter 2025")).toBeInTheDocument();
  });

  it('PATCHes /admin/events/:id on Save and reloads', async () => {
    const updatedEvent = { ...MENS_EVENT, start_date: '2025-09-10', end_date: '2025-09-12' };

    mockApiFetch
      .mockResolvedValueOnce({ ok: true, events: [MENS_EVENT] })     // initial load
      .mockResolvedValueOnce({ ok: true, event: updatedEvent })        // PATCH
      .mockResolvedValueOnce({ ok: true, events: [updatedEvent] });   // reload

    render(<UpcomingEncounterTile />, { wrapper: wrapper() });
    await waitFor(() => screen.getByRole('button', { name: /edit/i }));
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));

    const startInput = screen.getByLabelText(/start date/i);
    await userEvent.clear(startInput);
    await userEvent.type(startInput, '2025-09-10');

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(3));

    // Verify PATCH was called with correct args
    const patchCall = mockApiFetch.mock.calls[1] as [string, { method: string; body: string }];
    expect(patchCall[0]).toMatch(/\/admin\/events\/42/);
    expect(patchCall[1].method).toBe('PATCH');

    const body = JSON.parse(patchCall[1].body);
    expect(body.start_date).toBe('2025-09-10');

    // After save, tile returns to display view
    await waitFor(() =>
      expect(screen.queryByRole('form', { name: /edit upcoming encounter/i })).not.toBeInTheDocument(),
    );
  });

  it('shows save error when PATCH fails', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, events: [MENS_EVENT] })
      .mockRejectedValueOnce(new Error('Save failed'));

    render(<UpcomingEncounterTile />, { wrapper: wrapper() });
    await waitFor(() => screen.getByRole('button', { name: /edit/i }));
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Save failed'),
    );
    // Form stays open
    expect(screen.getByRole('form', { name: /edit upcoming encounter/i })).toBeInTheDocument();
  });

  // ── Program switch ────────────────────────────────────────────────────────

  it('re-fetches events when program context changes', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, events: [MENS_EVENT] })
      .mockResolvedValueOnce({ ok: true, events: [WOMEN_EVENT] });

    const setProgram = vi.fn();
    const { rerender } = render(
      <ProgramContext.Provider value={{ program: 'mens', setProgram }}>
        <MemoryRouter>
          <UpcomingEncounterTile />
        </MemoryRouter>
      </ProgramContext.Provider>,
    );

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));

    rerender(
      <ProgramContext.Provider value={{ program: 'women', setProgram }}>
        <MemoryRouter>
          <UpcomingEncounterTile />
        </MemoryRouter>
      </ProgramContext.Provider>,
    );

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByText("Women's Encounter 2025")).toBeInTheDocument(),
    );
  });
});
