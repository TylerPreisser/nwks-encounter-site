// admin/src/__tests__/PageDetails.test.tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ProgramContext } from '../App';
import PageDetails from '../pages/PageDetails';

// ── Helpers ────────────────────────────────────────────────────────────────────

type FetchStub = { status: number; body: unknown };

function mockFetchMap(map: Record<string, FetchStub>) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const stripped = url.split('?')[0];
    const match = map[stripped] ?? map['*'];
    if (!match) throw new Error(`Unmocked fetch: ${url}`);
    return new Response(JSON.stringify(match.body), {
      status: match.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

// Blocks use CLEAR human labels — NOT raw keys
const BLOCK_1 = {
  id: 10,
  program: 'mens',
  key: 'hero_tagline',
  label: 'Main tagline (top of the page)',
  value: 'An encounter that changes everything.',
  sort: 1,
  updated_at: '2024-01-01T00:00:00Z',
};

const BLOCK_2 = {
  id: 11,
  program: 'mens',
  key: 'event_invite_text',
  label: 'Invitation paragraph',
  value: 'Join us for a powerful weekend retreat.',
  sort: 2,
  updated_at: '2024-01-01T00:00:00Z',
};

const BLOCKS_RESPONSE = { ok: true, blocks: [BLOCK_1, BLOCK_2] };

function wrapper(program: 'mens' | 'women' = 'mens') {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
      <ProgramContext.Provider value={{ program, setProgram: vi.fn() }}>
        {children}
      </ProgramContext.Provider>
    </MemoryRouter>
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('PageDetails page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  // ── 1. Labels: human-readable, no raw keys ─────────────────────────────────

  it('shows loading state then renders block labels', async () => {
    mockFetchMap({ '/api/admin/page-content': { status: 200, body: BLOCKS_RESPONSE } });

    render(<PageDetails />, { wrapper: wrapper() });

    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Main tagline (top of the page)')).toBeInTheDocument();
      expect(screen.getByText('Invitation paragraph')).toBeInTheDocument();
    });
  });

  it('never shows raw key names like hero_tagline or event_invite_text', async () => {
    mockFetchMap({ '/api/admin/page-content': { status: 200, body: BLOCKS_RESPONSE } });

    render(<PageDetails />, { wrapper: wrapper() });

    await waitFor(() =>
      expect(screen.getByText('Main tagline (top of the page)')).toBeInTheDocument()
    );

    expect(screen.queryByText('hero_tagline')).not.toBeInTheDocument();
    expect(screen.queryByText('event_invite_text')).not.toBeInTheDocument();
  });

  it('renders block text values in the page mock-up', async () => {
    mockFetchMap({ '/api/admin/page-content': { status: 200, body: BLOCKS_RESPONSE } });

    render(<PageDetails />, { wrapper: wrapper() });

    await waitFor(() =>
      expect(screen.getByText('An encounter that changes everything.')).toBeInTheDocument()
    );
    expect(screen.getByText('Join us for a powerful weekend retreat.')).toBeInTheDocument();
  });

  // ── 2. Compact page-like layout ─────────────────────────────────────────────

  it('renders a page-mockup container', async () => {
    mockFetchMap({ '/api/admin/page-content': { status: 200, body: BLOCKS_RESPONSE } });

    render(<PageDetails />, { wrapper: wrapper() });

    await waitFor(() =>
      expect(screen.getByTestId('page-mockup')).toBeInTheDocument()
    );
  });

  it('does NOT render any big Save button per block', async () => {
    mockFetchMap({ '/api/admin/page-content': { status: 200, body: BLOCKS_RESPONSE } });

    render(<PageDetails />, { wrapper: wrapper() });

    await waitFor(() =>
      expect(screen.getByTestId('page-mockup')).toBeInTheDocument()
    );

    // No per-block save button should exist
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });

  // ── 3. Click-to-edit: clicking activates inline editing ───────────────────

  it('clicking a block display activates an editable textarea', async () => {
    mockFetchMap({ '/api/admin/page-content': { status: 200, body: BLOCKS_RESPONSE } });

    render(<PageDetails />, { wrapper: wrapper() });

    await waitFor(() =>
      expect(screen.getByTestId('block-display-10')).toBeInTheDocument()
    );

    // Before click: no textarea, just a display div
    expect(screen.queryByRole('textbox', { name: /edit main tagline/i })).not.toBeInTheDocument();

    // Click the block
    fireEvent.click(screen.getByTestId('block-display-10'));

    // After click: textarea appears
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /edit main tagline/i })).toBeInTheDocument()
    );
  });

  // ── 4. Auto-save on blur — PATCH, no explicit save button ─────────────────

  it('auto-saves on blur via PATCH without a Save button click', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(BLOCKS_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, block: { ...BLOCK_1, value: 'New tagline' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(BLOCKS_RESPONSE), { status: 200 }));

    render(<PageDetails />, { wrapper: wrapper() });

    await waitFor(() =>
      expect(screen.getByTestId('block-display-10')).toBeInTheDocument()
    );

    // Activate editing
    fireEvent.click(screen.getByTestId('block-display-10'));

    const textarea = await screen.findByRole('textbox', { name: /edit main tagline/i });

    // Change the value
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'New tagline' } });
    });

    // Blur triggers save
    await act(async () => {
      fireEvent.blur(textarea);
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const [patchUrl, patchInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(patchUrl).toMatch(/\/api\/admin\/page-content\/10/);
    expect(patchInit.method).toBe('PATCH');
    const body = JSON.parse(patchInit.body as string);
    expect(body.value).toBe('New tagline');
  });

  it('does NOT PATCH when value is unchanged after blur', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(BLOCKS_RESPONSE), { status: 200 }));

    render(<PageDetails />, { wrapper: wrapper() });

    await waitFor(() =>
      expect(screen.getByTestId('block-display-10')).toBeInTheDocument()
    );

    // Activate then immediately blur without changing value
    fireEvent.click(screen.getByTestId('block-display-10'));
    const textarea = await screen.findByRole('textbox', { name: /edit main tagline/i });

    await act(async () => {
      fireEvent.blur(textarea);
    });

    // Only the initial GET; no PATCH
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows "Saved" status indicator after successful auto-save', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(BLOCKS_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, block: BLOCK_1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(BLOCKS_RESPONSE), { status: 200 }));

    render(<PageDetails />, { wrapper: wrapper() });

    await waitFor(() =>
      expect(screen.getByTestId('block-display-10')).toBeInTheDocument()
    );

    fireEvent.click(screen.getByTestId('block-display-10'));
    const textarea = await screen.findByRole('textbox', { name: /edit main tagline/i });

    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Changed text' } });
      fireEvent.blur(textarea);
    });

    await waitFor(() =>
      expect(screen.getByRole('status', { name: /main tagline.*saved/i })).toBeInTheDocument()
    );
  });

  // ── 5. Empty / error states ─────────────────────────────────────────────────

  it('shows empty state when no blocks are returned', async () => {
    mockFetchMap({ '/api/admin/page-content': { status: 200, body: { ok: true, blocks: [] } } });

    render(<PageDetails />, { wrapper: wrapper() });

    await waitFor(() =>
      expect(screen.getByText(/no page content blocks/i)).toBeInTheDocument()
    );
  });

  it('shows error alert when API fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'DB error' }), { status: 500 }),
    );

    render(<PageDetails />, { wrapper: wrapper() });

    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument()
    );
  });

  // ── 6. Program context: refetch on toggle ──────────────────────────────────

  it('refetches when program context changes', async () => {
    const fetchMock = mockFetchMap({
      '/api/admin/page-content': { status: 200, body: BLOCKS_RESPONSE },
    });

    const { rerender } = render(
      <MemoryRouter>
        <ProgramContext.Provider value={{ program: 'mens', setProgram: vi.fn() }}>
          <PageDetails />
        </ProgramContext.Provider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender(
      <MemoryRouter>
        <ProgramContext.Provider value={{ program: 'women', setProgram: vi.fn() }}>
          <PageDetails />
        </ProgramContext.Provider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  // ── 7. Helper text mentions public-facing ─────────────────────────────────

  it('includes explanatory helper text about live site', async () => {
    mockFetchMap({ '/api/admin/page-content': { status: 200, body: BLOCKS_RESPONSE } });
    render(<PageDetails />, { wrapper: wrapper() });

    await waitFor(() =>
      expect(screen.getByText(/public-facing/i)).toBeInTheDocument()
    );
  });

  // ── 8. Block hint text is shown ────────────────────────────────────────────

  it('shows location hint text for each block', async () => {
    mockFetchMap({ '/api/admin/page-content': { status: 200, body: BLOCKS_RESPONSE } });

    render(<PageDetails />, { wrapper: wrapper() });

    await waitFor(() =>
      expect(screen.getByText(/large headline at the top of the page/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/invitation section below the hero/i)).toBeInTheDocument();
  });
});
