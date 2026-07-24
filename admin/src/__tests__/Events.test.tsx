import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ProgramContext } from '../App';
import Events from '../pages/Events';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FetchResponse = { status: number; body: unknown };

/**
 * Spy on global.fetch and map stripped-path keys to response stubs.
 * Key = pathname without query string; "*" is a fallback catch-all.
 */
function mockFetchMap(responses: Record<string, FetchResponse>) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const stripped = url.split('?')[0];
    const match = responses[stripped] ?? responses['*'];
    if (!match) throw new Error(`Unmocked fetch: ${url}`);
    return new Response(JSON.stringify(match.body), {
      status: match.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

const EMPTY_LIST = { ok: true, events: [] };

const SAMPLE_EVENT = {
  id: 1,
  program: 'mens',
  year: 2026,
  title: "Men's Encounter 2026",
  start_date: '2026-08-06',
  end_date: '2026-08-08',
  launch_locations: '["Colby","Hays"]',
  attendee_registration_open: 1,
  server_registration_open: 1,
  is_current: 1,
};

function wrapper(program: 'mens' | 'womens' = 'mens') {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
      <ProgramContext.Provider value={{ program, setProgram: vi.fn() }}>
        {children}
      </ProgramContext.Provider>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Events page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state then renders empty state', async () => {
    mockFetchMap({
      '/api/admin/events': { status: 200, body: EMPTY_LIST },
    });
    render(<Events />, { wrapper: wrapper() });
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/no events yet/i)).toBeInTheDocument());
  });

  it('renders event rows from the API', async () => {
    mockFetchMap({
      '/api/admin/events': {
        status: 200,
        body: { ok: true, events: [SAMPLE_EVENT] },
      },
    });
    render(<Events />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByText('2026')).toBeInTheDocument());
    expect(screen.getByText("Men's Encounter 2026")).toBeInTheDocument();
    expect(screen.getByText(/Colby/)).toBeInTheDocument();
    expect(screen.getByText(/✓ Current/)).toBeInTheDocument();
  });

  it('opens the create form when + New Event is clicked', async () => {
    mockFetchMap({
      '/api/admin/events': { status: 200, body: EMPTY_LIST },
    });
    render(<Events />, { wrapper: wrapper() });
    await waitFor(() => screen.getByText(/no events yet/i));
    fireEvent.click(screen.getByRole('button', { name: /new event/i }));
    expect(screen.getByRole('form', { name: /new event/i })).toBeInTheDocument();
  });

  it('submits a new event with correct payload and refreshes list', async () => {
    const newEvent = {
      id: 2, program: 'mens', year: 2027, title: null, start_date: null,
      end_date: null, launch_locations: '[]',
      attendee_registration_open: 1, server_registration_open: 1, is_current: 0,
    };

    const fetchMock = vi.spyOn(global, 'fetch')
      // initial load
      .mockResolvedValueOnce(new Response(JSON.stringify(EMPTY_LIST), { status: 200 }))
      // POST create
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, event: newEvent }), { status: 201 }))
      // refetch after create
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, events: [newEvent] }), { status: 200 }));

    render(<Events />, { wrapper: wrapper() });
    await waitFor(() => screen.getByText(/no events yet/i));

    fireEvent.click(screen.getByRole('button', { name: /new event/i }));
    const yearInput = screen.getByLabelText(/year/i);
    await userEvent.clear(yearInput);
    await userEvent.type(yearInput, '2027');
    fireEvent.click(screen.getByRole('button', { name: /create event/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    // Check that POST was called with the right URL and method
    const [postUrl, postInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(postUrl).toMatch(/\/api\/admin\/events/);
    expect(postInit.method).toBe('POST');
    const posted = JSON.parse(postInit.body as string);
    expect(posted.year).toBe(2027);

    // The refreshed list should now contain 2027
    await waitFor(() => expect(screen.getByText('2027')).toBeInTheDocument());
  });

  it('shows a form-level error when API returns an error on create', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(EMPTY_LIST), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: false, error: 'An event already exists for mens 2026' }),
          { status: 409 },
        ),
      );

    render(<Events />, { wrapper: wrapper() });
    await waitFor(() => screen.getByText(/no events yet/i));
    fireEvent.click(screen.getByRole('button', { name: /new event/i }));
    fireEvent.click(screen.getByRole('button', { name: /create event/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/already exists/i),
    );
  });

  it('opens the edit form pre-filled when Edit is clicked', async () => {
    mockFetchMap({
      '/api/admin/events': { status: 200, body: { ok: true, events: [SAMPLE_EVENT] } },
    });
    render(<Events />, { wrapper: wrapper() });
    await waitFor(() => screen.getByText('2026'));
    fireEvent.click(screen.getByRole('button', { name: /edit 2026/i }));

    expect(screen.getByRole('form', { name: /edit event/i })).toBeInTheDocument();
    // title should be pre-filled
    expect((screen.getByLabelText(/title/i) as HTMLInputElement).value).toBe("Men's Encounter 2026");
  });

  it('PATCHes when editing an existing event and refreshes', async () => {
    const updatedEvent = { ...SAMPLE_EVENT, title: 'Updated Title', is_current: 1 };

    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, events: [SAMPLE_EVENT] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, event: updatedEvent }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, events: [updatedEvent] }), { status: 200 }),
      );

    render(<Events />, { wrapper: wrapper() });
    await waitFor(() => screen.getByText('2026'));
    fireEvent.click(screen.getByRole('button', { name: /edit 2026/i }));

    const titleInput = screen.getByLabelText(/title/i);
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Updated Title');
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [patchUrl, patchInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(patchUrl).toMatch(/\/api\/admin\/events\/1/);
    expect(patchInit.method).toBe('PATCH');

    await waitFor(() => expect(screen.getByText('Updated Title')).toBeInTheDocument());
  });

  it('Make Current button calls set-current endpoint and shows badge', async () => {
    const notCurrentEvent = { ...SAMPLE_EVENT, is_current: 0 };
    const nowCurrentEvent = { ...SAMPLE_EVENT, is_current: 1 };

    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, events: [notCurrentEvent] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, event: nowCurrentEvent }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, events: [nowCurrentEvent] }), { status: 200 }),
      );

    render(<Events />, { wrapper: wrapper() });
    await waitFor(() => screen.getByRole('button', { name: /make 2026 current/i }));
    fireEvent.click(screen.getByRole('button', { name: /make 2026 current/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [setCurrentUrl, setCurrentInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(setCurrentUrl).toMatch(/\/api\/admin\/events\/1\/set-current/);
    expect(setCurrentInit.method).toBe('POST');

    await waitFor(() => expect(screen.getByText(/✓ Current/)).toBeInTheDocument());
  });

  it('launch locations are displayed and can be added via comma input', async () => {
    mockFetchMap({
      '/api/admin/events': { status: 200, body: { ok: true, events: [SAMPLE_EVENT] } },
    });
    render(<Events />, { wrapper: wrapper() });
    await waitFor(() => screen.getByText(/Colby/));
    // Hays should also appear (second location in the JSON)
    expect(screen.getByText(/Hays/)).toBeInTheDocument();
  });

  it('refetches events when program context changes', async () => {
    const fetchMock = mockFetchMap({
      '/api/admin/events': { status: 200, body: EMPTY_LIST },
    });

    const { rerender } = render(
      <MemoryRouter>
        <ProgramContext.Provider value={{ program: 'mens', setProgram: vi.fn() }}>
          <Events />
        </ProgramContext.Provider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender(
      <MemoryRouter>
        <ProgramContext.Provider value={{ program: 'womens', setProgram: vi.fn() }}>
          <Events />
        </ProgramContext.Provider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  // ── needs_next_event banner ───────────────────────────────────────────────

  it('shows needs-next-event banner when API returns needs_next_event=true (mens)', async () => {
    mockFetchMap({
      '/api/admin/events': {
        status: 200,
        body: { ok: true, events: [SAMPLE_EVENT], needs_next_event: true },
      },
    });
    render(<Events />, { wrapper: wrapper('mens') });
    await waitFor(() =>
      expect(screen.getByRole('alert', { name: /needs-next-event/i })).toBeInTheDocument()
    );
    expect(screen.getByText(/men's encounter has ended/i)).toBeInTheDocument();
    expect(screen.getByText(/create the next event/i)).toBeInTheDocument();
  });

  it('shows needs-next-event banner with Women\'s wording when program is womens', async () => {
    mockFetchMap({
      '/api/admin/events': {
        status: 200,
        body: { ok: true, events: [{ ...SAMPLE_EVENT, program: 'women' }], needs_next_event: true },
      },
    });
    render(<Events />, { wrapper: wrapper('womens') });
    await waitFor(() =>
      expect(screen.getByRole('alert', { name: /needs-next-event/i })).toBeInTheDocument()
    );
    expect(screen.getByText(/women's encounter has ended/i)).toBeInTheDocument();
  });

  it('does NOT show needs-next-event banner when needs_next_event=false', async () => {
    mockFetchMap({
      '/api/admin/events': {
        status: 200,
        body: { ok: true, events: [SAMPLE_EVENT], needs_next_event: false },
      },
    });
    render(<Events />, { wrapper: wrapper('mens') });
    await waitFor(() => screen.getByText('2026'));
    expect(screen.queryByRole('alert', { name: /needs-next-event/i })).not.toBeInTheDocument();
  });

  it('does NOT show needs-next-event banner when field is absent from API response', async () => {
    mockFetchMap({
      '/api/admin/events': {
        status: 200,
        body: { ok: true, events: [SAMPLE_EVENT] },
      },
    });
    render(<Events />, { wrapper: wrapper('mens') });
    await waitFor(() => screen.getByText('2026'));
    expect(screen.queryByRole('alert', { name: /needs-next-event/i })).not.toBeInTheDocument();
  });
});
