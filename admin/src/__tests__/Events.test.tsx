import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ProgramContext } from '../App';
import Events from '../pages/Events';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FetchResponse = { status: number; body: unknown };

/** Maps stripped-path keys (no query string) to stubs; "*" is the catch-all. */
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

const NO_PREVIEW = {
  ok: true, current: null, registered_count: 0, board_count: 0,
  interest_count: 0, ended: true, suggested_year: 2027, suggested_season: 'spring',
};

/**
 * Routes fetches by path + method, and lets the events list change after a
 * write. The page issues its events fetch and its rollover/preview fetch
 * concurrently, so chaining mockResolvedValueOnce by call order is unreliable —
 * whichever settles first consumes the wrong stub.
 */
function routeEvents(opts: { events: unknown[]; afterWrite?: unknown[]; writeStatus?: number; writeBody?: unknown }) {
  let listed = opts.events;
  return vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const path = url.split('?')[0];
    const method = (init?.method ?? 'GET').toUpperCase();

    if (path.endsWith('/rollover/preview')) {
      return new Response(JSON.stringify(NO_PREVIEW), { status: 200 });
    }

    if (method === 'GET') {
      return new Response(JSON.stringify({ ok: true, events: listed }), { status: 200 });
    }

    // Any write flips the list to its post-write state.
    if (opts.afterWrite) listed = opts.afterWrite;
    return new Response(
      JSON.stringify(opts.writeBody ?? { ok: true }),
      { status: opts.writeStatus ?? 200 },
    );
  });
}

const SAMPLE_EVENT = {
  id: 1,
  program: 'mens',
  year: 2026,
  season: 'fall',
  display_name: 'Fall 2026',
  title: "Men's Encounter 2026",
  start_date: '2026-08-06',
  end_date: '2026-08-08',
  launch_locations: '["Colby","Hays"]',
  attendee_registration_open: 1,
  server_registration_open: 1,
  is_current: 1,
};

/** A finished encounter, for the history disclosure and the picker. */
const PAST_EVENT = {
  id: 9,
  program: 'mens',
  year: 2025,
  season: 'spring',
  display_name: 'Spring 2025',
  title: "Men's Encounter 2025",
  start_date: '2025-03-07',
  end_date: '2025-03-09',
  launch_locations: '["Norton"]',
  attendee_registration_open: 0,
  server_registration_open: 0,
  is_current: 0,
};

function wrapper(program: 'mens' | 'women' = 'mens') {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
      <ProgramContext.Provider value={{ program, setProgram: vi.fn() }}>
        {children}
      </ProgramContext.Provider>
    </MemoryRouter>
  );
}

/** The panel's encounter name — an <h2>, distinct from the picker's option. */
const panelName = (name: string) => screen.getByRole('heading', { name });

/**
 * Finds the fetch call whose URL matches, rather than assuming a fixed index.
 * The page issues a rollover/preview fetch alongside the events list, so a
 * positional lookup silently grabs the wrong call.
 */
function callMatching(
  mock: { mock: { calls: unknown[][] } },
  re: RegExp,
  method?: string,
): [string, RequestInit] {
  const hit = (mock.mock.calls as [string, RequestInit][]).find(
    ([url, init]) =>
      re.test(String(url)) &&
      !String(url).includes('rollover/preview') &&
      (method === undefined || (init?.method ?? 'GET').toUpperCase() === method),
  );
  if (!hit) throw new Error(`no ${method ?? 'any'} fetch call matching ${re}`);
  return hit;
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
    expect(screen.queryByTestId('encounter-panel')).not.toBeInTheDocument();
  });

  it('titles the page "Upcoming Encounter", matching the nav', async () => {
    mockFetchMap({
      '/api/admin/events': { status: 200, body: { ok: true, events: [SAMPLE_EVENT] } },
    });
    render(<Events />, { wrapper: wrapper() });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/upcoming encounter/i);
    await waitFor(() => expect(screen.getByTestId('encounter-panel')).toBeInTheDocument());
  });

  it('renders the selected encounter in the control panel, not a table', async () => {
    mockFetchMap({
      '/api/admin/events': {
        status: 200,
        body: { ok: true, events: [SAMPLE_EVENT] },
      },
    });
    render(<Events />, { wrapper: wrapper() });
    await waitFor(() => expect(panelName('Fall 2026')).toBeInTheDocument());

    const panel = screen.getByTestId('encounter-panel');
    expect(within(panel).getByText("Men's Encounter 2026")).toBeInTheDocument();
    expect(within(panel).getByText(/2026-08-06/)).toBeInTheDocument();
    expect(within(panel).getByText(/Colby/)).toBeInTheDocument();
    expect(within(panel).getByTestId('current-badge')).toHaveTextContent('✓ Current');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
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
      id: 2, program: 'mens', year: 2027, season: 'spring', display_name: 'Spring 2027', title: null, start_date: null,
      end_date: null, launch_locations: '[]',
      attendee_registration_open: 1, server_registration_open: 1, is_current: 0,
    };

    const fetchMock = routeEvents({
      events: [],
      afterWrite: [newEvent],
      writeStatus: 201,
      writeBody: { ok: true, event: newEvent },
    });

    render(<Events />, { wrapper: wrapper() });
    await waitFor(() => screen.getByText(/no events yet/i));

    fireEvent.click(screen.getByRole('button', { name: /new event/i }));
    const yearInput = screen.getByLabelText(/year/i);
    await userEvent.clear(yearInput);
    await userEvent.type(yearInput, '2027');
    fireEvent.click(screen.getByRole('button', { name: /create event/i }));

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3));

    // Check that POST was called with the right URL and method
    const [postUrl, postInit] = callMatching(fetchMock, /\/api\/admin\/events\?/, 'POST');
    expect(postUrl).toMatch(/\/api\/admin\/events/);
    expect(postInit.method).toBe('POST');
    const posted = JSON.parse(postInit.body as string);
    expect(posted.year).toBe(2027);

    // The refreshed list should now be showing in the panel, named by season
    await waitFor(() => expect(panelName('Spring 2027')).toBeInTheDocument());
  });

  it('shows a form-level error when API returns an error on create', async () => {
    routeEvents({
      events: [],
      writeStatus: 409,
      writeBody: { ok: false, error: 'An encounter already exists for Fall 2026' },
    });

    render(<Events />, { wrapper: wrapper() });
    await waitFor(() => screen.getByText(/no events yet/i));
    fireEvent.click(screen.getByRole('button', { name: /new event/i }));
    fireEvent.click(screen.getByRole('button', { name: /create event/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/already exists/i),
    );
  });

  it('opens the edit form pre-filled when the panel Edit is clicked', async () => {
    mockFetchMap({
      '/api/admin/events': { status: 200, body: { ok: true, events: [SAMPLE_EVENT] } },
    });
    render(<Events />, { wrapper: wrapper() });
    await waitFor(() => panelName('Fall 2026'));
    fireEvent.click(screen.getByRole('button', { name: /edit Fall 2026/i }));

    expect(screen.getByRole('form', { name: /edit event/i })).toBeInTheDocument();
    // title should be pre-filled
    expect((screen.getByLabelText(/title/i) as HTMLInputElement).value).toBe("Men's Encounter 2026");
  });

  it('PATCHes when editing an existing event and refreshes', async () => {
    const updatedEvent = { ...SAMPLE_EVENT, title: 'Updated Title', is_current: 1 };

    const fetchMock = routeEvents({
      events: [SAMPLE_EVENT],
      afterWrite: [updatedEvent],
      writeBody: { ok: true, event: updatedEvent },
    });

    render(<Events />, { wrapper: wrapper() });
    await waitFor(() => panelName('Fall 2026'));
    fireEvent.click(screen.getByRole('button', { name: /edit Fall 2026/i }));

    const titleInput = screen.getByLabelText(/title/i);
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Updated Title');
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3));
    const [patchUrl, patchInit] = callMatching(fetchMock, /\/api\/admin\/events\/1\?/, 'PATCH');
    expect(patchUrl).toMatch(/\/api\/admin\/events\/1/);
    expect(patchInit.method).toBe('PATCH');

    await waitFor(() => expect(screen.getByText('Updated Title')).toBeInTheDocument());
  });

  it('Make Current button calls set-current endpoint and shows badge', async () => {
    const notCurrentEvent = { ...SAMPLE_EVENT, is_current: 0 };
    const nowCurrentEvent = { ...SAMPLE_EVENT, is_current: 1 };

    const fetchMock = routeEvents({
      events: [notCurrentEvent],
      afterWrite: [nowCurrentEvent],
      writeBody: { ok: true, event: nowCurrentEvent },
    });

    render(<Events />, { wrapper: wrapper() });
    await waitFor(() => screen.getByRole('button', { name: /make Fall 2026 current/i }));
    fireEvent.click(screen.getByRole('button', { name: /make Fall 2026 current/i }));

    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3));
    const [setCurrentUrl, setCurrentInit] = callMatching(fetchMock, /set-current/, 'POST');
    expect(setCurrentUrl).toMatch(/\/api\/admin\/events\/1\/set-current/);
    expect(setCurrentInit.method).toBe('POST');

    await waitFor(() => expect(screen.getByTestId('current-badge')).toHaveTextContent('✓ Current'));
  });

  it('launch locations are displayed', async () => {
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
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2)); // events + rollover/preview

    rerender(
      <MemoryRouter>
        <ProgramContext.Provider value={{ program: 'women', setProgram: vi.fn() }}>
          <Events />
        </ProgramContext.Provider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4)); // both programs
  });

  // ── Encounter picker ──────────────────────────────────────────────────────

  it('the picker lists every encounter and switching one changes the panel', async () => {
    mockFetchMap({
      '/api/admin/events': {
        status: 200,
        body: { ok: true, events: [SAMPLE_EVENT, PAST_EVENT] },
      },
    });
    render(<Events />, { wrapper: wrapper() });
    await waitFor(() => expect(panelName('Fall 2026')).toBeInTheDocument());

    const picker = screen.getByLabelText('Encounter');
    // Current leads, and is marked so the operator knows which one is live.
    expect(within(picker).getByRole('option', { name: /Fall 2026 \(current\)/ })).toBeInTheDocument();
    expect(within(picker).getByRole('option', { name: 'Spring 2025' })).toBeInTheDocument();

    fireEvent.change(picker, { target: { value: String(PAST_EVENT.id) } });

    expect(panelName('Spring 2025')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Fall 2026' })).not.toBeInTheDocument();
    // Editing acts on what's shown, not on whatever is current.
    expect(screen.getByRole('button', { name: /edit Spring 2025/i })).toBeInTheDocument();
  });

  // ── Past encounters disclosure ────────────────────────────────────────────

  it('hides past encounters behind a button and lists only the non-current ones', async () => {
    mockFetchMap({
      '/api/admin/events': {
        status: 200,
        body: { ok: true, events: [SAMPLE_EVENT, PAST_EVENT] },
      },
    });
    render(<Events />, { wrapper: wrapper() });
    await waitFor(() => expect(panelName('Fall 2026')).toBeInTheDocument());

    expect(screen.queryByTestId('past-encounters-list')).not.toBeInTheDocument();

    const toggle = screen.getByTestId('toggle-past-encounters');
    expect(toggle).toHaveTextContent(/show past encounters \(1\)/i);
    fireEvent.click(toggle);

    const list = screen.getByTestId('past-encounters-list');
    expect(within(list).getByRole('button', { name: /view Spring 2025/i })).toBeInTheDocument();
    expect(within(list).queryByText('Fall 2026')).not.toBeInTheDocument();
  });

  it('picking a past encounter from the list loads it into the panel', async () => {
    mockFetchMap({
      '/api/admin/events': {
        status: 200,
        body: { ok: true, events: [SAMPLE_EVENT, PAST_EVENT] },
      },
    });
    render(<Events />, { wrapper: wrapper() });
    await waitFor(() => expect(panelName('Fall 2026')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('toggle-past-encounters'));
    fireEvent.click(screen.getByRole('button', { name: /view Spring 2025/i }));

    expect(panelName('Spring 2025')).toBeInTheDocument();
    // …and it can be promoted from right there.
    expect(screen.getByRole('button', { name: /make Spring 2025 current/i })).toBeInTheDocument();
  });

  it('shows no past-encounters disclosure when the current one is the only encounter', async () => {
    mockFetchMap({
      '/api/admin/events': { status: 200, body: { ok: true, events: [SAMPLE_EVENT] } },
    });
    render(<Events />, { wrapper: wrapper() });
    await waitFor(() => expect(panelName('Fall 2026')).toBeInTheDocument());
    expect(screen.queryByTestId('toggle-past-encounters')).not.toBeInTheDocument();
  });

  // ── Enrollment + rollover stay reachable ──────────────────────────────────

  it('shows live enrollment controls for the current encounter only', async () => {
    mockFetchMap({
      '/api/admin/events': {
        status: 200,
        body: { ok: true, events: [SAMPLE_EVENT, PAST_EVENT] },
      },
      '/api/admin/events/rollover/preview': { status: 200, body: NO_PREVIEW },
    });
    render(<Events />, { wrapper: wrapper() });
    await waitFor(() => expect(panelName('Fall 2026')).toBeInTheDocument());

    expect(screen.getByTestId('toggle-attendee-enrollment')).toBeInTheDocument();
    expect(screen.getByTestId('toggle-server-enrollment')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Encounter'), { target: { value: String(PAST_EVENT.id) } });

    // A finished encounter takes no sign-ups — state, not levers.
    expect(screen.queryByTestId('toggle-attendee-enrollment')).not.toBeInTheDocument();
    expect(screen.getByTestId('panel-enrollment-readonly')).toHaveTextContent(/attendees closed/i);
  });

  it('Start Next Encounter still opens the rollover dialog', async () => {
    routeEvents({ events: [SAMPLE_EVENT] });
    render(<Events />, { wrapper: wrapper() });
    await waitFor(() => expect(panelName('Fall 2026')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /start next encounter/i }));
    await waitFor(() =>
      expect(screen.getByRole('form', { name: /start next encounter/i })).toBeInTheDocument(),
    );
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
    render(<Events />, { wrapper: wrapper('women') });
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
    await waitFor(() => panelName('Fall 2026'));
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
    await waitFor(() => panelName('Fall 2026'));
    expect(screen.queryByRole('alert', { name: /needs-next-event/i })).not.toBeInTheDocument();
  });
});
