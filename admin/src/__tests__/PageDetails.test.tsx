// admin/src/__tests__/PageDetails.test.tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

const BLOCK_1 = {
  id: 10,
  program: 'mens',
  key: 'hero_title',
  label: 'Hero Title',
  value: 'Welcome to the Encounter',
  sort: 1,
  updated_at: '2024-01-01T00:00:00Z',
};

const BLOCK_2 = {
  id: 11,
  program: 'mens',
  key: 'about_body',
  label: 'About Text',
  value: 'A transformative weekend experience.',
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
  });

  it('shows loading state then renders blocks', async () => {
    mockFetchMap({ '/api/admin/page-content': { status: 200, body: BLOCKS_RESPONSE } });

    render(<PageDetails />, { wrapper: wrapper() });

    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Hero Title')).toBeInTheDocument();
      expect(screen.getByText('About Text')).toBeInTheDocument();
    });
  });

  it('renders textarea with current block value', async () => {
    mockFetchMap({ '/api/admin/page-content': { status: 200, body: BLOCKS_RESPONSE } });

    render(<PageDetails />, { wrapper: wrapper() });

    await waitFor(() =>
      expect(screen.getByDisplayValue('Welcome to the Encounter')).toBeInTheDocument()
    );
    expect(screen.getByDisplayValue('A transformative weekend experience.')).toBeInTheDocument();
  });

  it('PATCHes page-content when Save is clicked', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(BLOCKS_RESPONSE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, block: { ...BLOCK_1, value: 'Updated Title' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(BLOCKS_RESPONSE), { status: 200 }));

    render(<PageDetails />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByDisplayValue('Welcome to the Encounter')).toBeInTheDocument());

    const textarea = screen.getByRole('textbox', { name: /edit hero title/i });
    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'Updated Title');

    fireEvent.click(screen.getByRole('button', { name: /save hero title/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const [patchUrl, patchInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(patchUrl).toMatch(/\/api\/admin\/page-content\/10/);
    expect(patchInit.method).toBe('PATCH');
    const body = JSON.parse(patchInit.body as string);
    expect(body.value).toBe('Updated Title');
  });

  it('Save button is disabled when no change is made', async () => {
    mockFetchMap({ '/api/admin/page-content': { status: 200, body: BLOCKS_RESPONSE } });

    render(<PageDetails />, { wrapper: wrapper() });
    await waitFor(() => expect(screen.getByDisplayValue('Welcome to the Encounter')).toBeInTheDocument());

    const saveBtn = screen.getByRole('button', { name: /save hero title/i });
    expect(saveBtn).toBeDisabled();
  });

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

  it('includes explanatory helper text about live site', async () => {
    mockFetchMap({ '/api/admin/page-content': { status: 200, body: BLOCKS_RESPONSE } });
    render(<PageDetails />, { wrapper: wrapper() });

    await waitFor(() =>
      expect(screen.getByText(/public-facing/i)).toBeInTheDocument()
    );
  });
});
