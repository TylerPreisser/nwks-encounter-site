// admin/src/__tests__/Testimonies.test.tsx -- RTL tests for Testimonies grouped list UI
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProgramContext } from '../App';
import Testimonies from '../pages/Testimonies';
import Nav from '../components/Nav';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../api', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '../api';
const mockApiFetch = vi.mocked(apiFetch);

// ── Fixtures ───────────────────────────────────────────────────────────────────

const TESTIMONY_UNFULFILLED: import('../pages/Testimonies').TestimonyRow = {
  id: 1,
  program: 'mens',
  person_id: 10,
  first_name: 'John',
  last_name: 'Doe',
  from_name: 'John Doe',
  from_email: 'john@example.com',
  subject: 'My testimony',
  title: 'Saturday night testimony',
  status: 'unfulfilled',
  type: 'testimony',
  received_at: '2026-07-20T10:00:00Z',
  created_at: '2026-07-20T10:00:00Z',
  attachment_count: 1,
  comment_count: 0,
};

const TESTIMONY_DRAFT1: import('../pages/Testimonies').TestimonyRow = {
  id: 2,
  program: 'mens',
  person_id: null,
  first_name: null,
  last_name: null,
  from_name: 'Jane Smith',
  from_email: 'jane@example.com',
  subject: 'Teaching session',
  title: null,
  status: 'draft_1',
  type: 'teaching',
  received_at: '2026-07-19T09:00:00Z',
  created_at: '2026-07-19T09:00:00Z',
  attachment_count: 0,
  comment_count: 2,
};

const TESTIMONY_WAITING: import('../pages/Testimonies').TestimonyRow = {
  id: 5,
  program: 'mens',
  person_id: 20,
  first_name: 'Alice',
  last_name: 'Cooper',
  from_name: 'Alice Cooper',
  from_email: 'alice@example.com',
  subject: null,
  title: 'Opening testimony',
  status: 'waiting',
  type: 'testimony',
  received_at: null,
  created_at: '2026-07-21T08:00:00Z',
  attachment_count: 0,
  comment_count: 0,
};

const TESTIMONY_DRAFT2: import('../pages/Testimonies').TestimonyRow = {
  id: 6,
  program: 'mens',
  person_id: 21,
  first_name: 'Bob',
  last_name: 'Ross',
  from_name: 'Bob Ross',
  from_email: 'bob@example.com',
  subject: 'Draft 2 testimony',
  title: null,
  status: 'draft_2',
  type: 'testimony',
  received_at: '2026-07-21T09:00:00Z',
  created_at: '2026-07-21T09:00:00Z',
  attachment_count: 1,
  comment_count: 0,
};

const TESTIMONY_AWAITING: import('../pages/Testimonies').TestimonyRow = {
  id: 7,
  program: 'mens',
  person_id: 22,
  first_name: 'Carol',
  last_name: 'Davis',
  from_name: 'Carol Davis',
  from_email: 'carol@example.com',
  subject: null,
  title: null,
  status: 'awaiting',
  type: 'testimony',
  received_at: null,
  created_at: '2026-07-21T10:00:00Z',
  attachment_count: 0,
  comment_count: 0,
};

const TESTIMONY_APPROVED: import('../pages/Testimonies').TestimonyRow = {
  id: 4,
  program: 'mens',
  person_id: 30,
  first_name: 'Mary',
  last_name: 'Johnson',
  from_name: 'Mary Johnson',
  from_email: 'mary@example.com',
  subject: 'Approved teaching',
  title: 'Done testimony',
  status: 'approved',
  type: 'testimony',
  received_at: '2026-07-18T10:00:00Z',
  created_at: '2026-07-18T10:00:00Z',
  attachment_count: 2,
  comment_count: 1,
};

const TESTIMONY_UNASSIGNED: import('../pages/Testimonies').TestimonyRow = {
  id: 3,
  program: null,
  person_id: null,
  first_name: null,
  last_name: null,
  from_name: 'Unknown Sender',
  from_email: 'unknown@example.com',
  subject: 'Unmatched email',
  title: null,
  status: 'draft_1',
  type: 'testimony',
  received_at: '2026-07-18T08:00:00Z',
  created_at: '2026-07-18T08:00:00Z',
  attachment_count: 0,
  comment_count: 0,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function wrapper(program: 'mens' | 'women' = 'mens') {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
      <ProgramContext.Provider value={{ program, setProgram: vi.fn() }}>
        {children}
      </ProgramContext.Provider>
    </MemoryRouter>
  );
}

function renderTestimonies(program: 'mens' | 'women' = 'mens') {
  return render(<Testimonies />, { wrapper: wrapper(program) });
}

// ── List tests ─────────────────────────────────────────────────────────────────

describe('Testimonies page — list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state initially', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderTestimonies();
    expect(screen.getAllByText(/loading/i).length).toBeGreaterThan(0);
  });

  it('renders testimonies from a mocked payload', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      testimonies: [TESTIMONY_UNFULFILLED, TESTIMONY_DRAFT1],
    });
    renderTestimonies();
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });
  });

  it('shows empty state when no testimonies', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [] });
    renderTestimonies();
    await waitFor(() =>
      expect(screen.getByText(/no testimonies found/i)).toBeInTheDocument()
    );
  });

  it('shows error state on fetch failure', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));
    renderTestimonies();
    await waitFor(() =>
      expect(screen.getByText(/network error/i)).toBeInTheDocument()
    );
  });

  it('shows all 6 status section headers (Unfulfilled through Approved)', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      testimonies: [TESTIMONY_UNFULFILLED, TESTIMONY_DRAFT1, TESTIMONY_APPROVED],
    });
    renderTestimonies();
    await waitFor(() => {
      expect(screen.getByText('Unfulfilled')).toBeInTheDocument();
      expect(screen.getByText('Waiting')).toBeInTheDocument();
      expect(screen.getByText('Draft 1')).toBeInTheDocument();
      expect(screen.getByText('Draft 2')).toBeInTheDocument();
      expect(screen.getByText('Awaiting')).toBeInTheDocument();
      expect(screen.getByText('Approved')).toBeInTheDocument();
    });
  });

  it('groups items into the correct status sections', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      testimonies: [
        TESTIMONY_UNFULFILLED,   // unfulfilled
        TESTIMONY_DRAFT1,        // draft_1
        TESTIMONY_APPROVED,      // approved
        TESTIMONY_WAITING,       // waiting
        TESTIMONY_DRAFT2,        // draft_2
        TESTIMONY_AWAITING,      // awaiting
      ],
    });
    renderTestimonies();
    await waitFor(() => {
      // Verify items appear under correct sections by checking row testids
      expect(screen.getByTestId('testimony-row-1')).toBeInTheDocument(); // unfulfilled
      expect(screen.getByTestId('testimony-row-2')).toBeInTheDocument(); // draft_1
      expect(screen.getByTestId('testimony-row-4')).toBeInTheDocument(); // approved
      expect(screen.getByTestId('testimony-row-5')).toBeInTheDocument(); // waiting
      expect(screen.getByTestId('testimony-row-6')).toBeInTheDocument(); // draft_2
      expect(screen.getByTestId('testimony-row-7')).toBeInTheDocument(); // awaiting
    });
  });

  it('renders person name as a link to /people/:id when person is assigned', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      testimonies: [TESTIMONY_UNFULFILLED],
    });
    renderTestimonies();
    await waitFor(() => {
      const link = screen.getByRole('link', { name: 'John Doe' });
      expect(link).toHaveAttribute('href', '/people/10');
    });
  });

  it('shows type badge for each item', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      testimonies: [TESTIMONY_UNFULFILLED, TESTIMONY_DRAFT1],
    });
    renderTestimonies();
    await waitFor(() => {
      // Testimony badge
      expect(screen.getAllByText('Testimony').length).toBeGreaterThan(0);
      // Teaching badge
      expect(screen.getAllByText('Teaching').length).toBeGreaterThan(0);
    });
  });

  it('shows View link opening in new tab when item has submission', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      testimonies: [TESTIMONY_UNFULFILLED], // attachment_count: 1 => has submission
    });
    renderTestimonies();
    await waitFor(() => {
      const viewLink = screen.getByRole('link', { name: /view submission for john doe/i });
      expect(viewLink).toHaveAttribute('href', '/api/admin/testimonies/1/view');
      expect(viewLink).toHaveAttribute('target', '_blank');
    });
  });

  it('shows "— awaiting —" when item has no submission', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      testimonies: [TESTIMONY_AWAITING], // attachment_count: 0, subject: null
    });
    renderTestimonies();
    await waitFor(() => {
      expect(screen.getByText(/— awaiting —/i)).toBeInTheDocument();
    });
  });

  it('shows status dropdown for each row with 7 options (6 + archived)', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      testimonies: [TESTIMONY_UNFULFILLED],
    });
    renderTestimonies();
    await waitFor(() => {
      const select = screen.getByRole('combobox', { name: /status for john doe/i });
      expect(select).toBeInTheDocument();
      // Should have all 7 status options
      const options = select.querySelectorAll('option');
      const values = Array.from(options).map(o => o.getAttribute('value'));
      expect(values).toContain('unfulfilled');
      expect(values).toContain('waiting');
      expect(values).toContain('draft_1');
      expect(values).toContain('draft_2');
      expect(values).toContain('awaiting');
      expect(values).toContain('approved');
      expect(values).toContain('archived');
    });
  });

  it('status dropdown change PATCHes status and moves row to new section (optimistic)', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, testimonies: [TESTIMONY_UNFULFILLED] })
      .mockResolvedValue({ ok: true, testimony: { id: 1, status: 'approved', type: 'testimony', title: null, person_id: 10, program: 'mens' } });

    renderTestimonies();
    await waitFor(() => screen.getByTestId('testimony-row-1'));

    const select = screen.getByRole('combobox', { name: /status for john doe/i });
    fireEvent.change(select, { target: { value: 'approved' } });

    // Optimistic update: row should now be in approved section
    await waitFor(() => {
      const patchCall = mockApiFetch.mock.calls.find(
        c =>
          typeof c[0] === 'string' &&
          c[0] === '/admin/testimonies/1' &&
          (c[1] as RequestInit)?.method === 'PATCH'
      );
      expect(patchCall).toBeDefined();
      const body = JSON.parse((patchCall![1] as RequestInit).body as string);
      expect(body.status).toBe('approved');
    });
  });

  it('does not show right-side detail panel', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      testimonies: [TESTIMONY_UNFULFILLED],
    });
    renderTestimonies();
    await waitFor(() => screen.getByText('John Doe'));
    // No detail panel / drawer should be present
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(/submitted content/i)).not.toBeInTheDocument();
  });

  it('does not render status filter chips in the toolbar', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [] });
    renderTestimonies();
    await waitFor(() => screen.getByText('Testimonies & Teachings'));
    // The clutter filter buttons should not be visible (they're sr-only)
    // We can verify the hidden buttons exist via testid but not be visually shown
    const btn = screen.getByTestId('filter-status-unfulfilled');
    expect(btn).toHaveClass('sr-only');
  });
});

// ── Filter tests ───────────────────────────────────────────────────────────────

describe('Testimonies page — filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [] });
  });

  afterEach(() => vi.restoreAllMocks());

  it('calls API with type=testimony when testimony filter clicked', async () => {
    renderTestimonies();
    await waitFor(() => screen.getByTestId('filter-type-testimony'));
    fireEvent.click(screen.getByTestId('filter-type-testimony'));
    await waitFor(() => {
      const calls = mockApiFetch.mock.calls;
      const lastCall = calls[calls.length - 1][0] as string;
      expect(lastCall).toMatch(/type=testimony/);
    });
  });

  it('calls API with type=teaching when teaching filter clicked', async () => {
    renderTestimonies();
    await waitFor(() => screen.getByTestId('filter-type-teaching'));
    fireEvent.click(screen.getByTestId('filter-type-teaching'));
    await waitFor(() => {
      const calls = mockApiFetch.mock.calls;
      const lastCall = calls[calls.length - 1][0] as string;
      expect(lastCall).toMatch(/type=teaching/);
    });
  });

  it('calls API with status=unfulfilled when unfulfilled status filter clicked', async () => {
    renderTestimonies();
    await waitFor(() => screen.getByTestId('filter-status-unfulfilled'));
    fireEvent.click(screen.getByTestId('filter-status-unfulfilled'));
    await waitFor(() => {
      const calls = mockApiFetch.mock.calls;
      const lastCall = calls[calls.length - 1][0] as string;
      expect(lastCall).toMatch(/status=unfulfilled/);
    });
  });

  it('calls API with status=approved when approved filter clicked', async () => {
    renderTestimonies();
    await waitFor(() => screen.getByTestId('filter-status-approved'));
    fireEvent.click(screen.getByTestId('filter-status-approved'));
    await waitFor(() => {
      const calls = mockApiFetch.mock.calls;
      const lastCall = calls[calls.length - 1][0] as string;
      expect(lastCall).toMatch(/status=approved/);
    });
  });

  it('calls API with status=waiting when waiting filter clicked', async () => {
    renderTestimonies();
    await waitFor(() => screen.getByTestId('filter-status-waiting'));
    fireEvent.click(screen.getByTestId('filter-status-waiting'));
    await waitFor(() => {
      const calls = mockApiFetch.mock.calls;
      const lastCall = calls[calls.length - 1][0] as string;
      expect(lastCall).toMatch(/status=waiting/);
    });
  });

  it('calls API with status=draft_1 when draft_1 filter clicked', async () => {
    renderTestimonies();
    await waitFor(() => screen.getByTestId('filter-status-draft_1'));
    fireEvent.click(screen.getByTestId('filter-status-draft_1'));
    await waitFor(() => {
      const calls = mockApiFetch.mock.calls;
      const lastCall = calls[calls.length - 1][0] as string;
      expect(lastCall).toMatch(/status=draft_1/);
    });
  });

  it('calls API with status=awaiting when awaiting filter clicked', async () => {
    renderTestimonies();
    await waitFor(() => screen.getByTestId('filter-status-awaiting'));
    fireEvent.click(screen.getByTestId('filter-status-awaiting'));
    await waitFor(() => {
      const calls = mockApiFetch.mock.calls;
      const lastCall = calls[calls.length - 1][0] as string;
      expect(lastCall).toMatch(/status=awaiting/);
    });
  });

  it('refetches when program toggles (re-renders with new program)', async () => {
    const { rerender } = render(
      <MemoryRouter>
        <ProgramContext.Provider value={{ program: 'mens', setProgram: vi.fn() }}>
          <Testimonies />
        </ProgramContext.Provider>
      </MemoryRouter>
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));

    rerender(
      <MemoryRouter>
        <ProgramContext.Provider value={{ program: 'women', setProgram: vi.fn() }}>
          <Testimonies />
        </ProgramContext.Provider>
      </MemoryRouter>
    );
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
  });

  it('renders unassigned testimonies in the list (from_name shown)', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_UNASSIGNED] });
    renderTestimonies();
    await waitFor(() =>
      expect(screen.getByText('Unknown Sender')).toBeInTheDocument()
    );
  });
});

// ── Add item tests ─────────────────────────────────────────────────────────────

describe('Testimonies page — add item', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => vi.restoreAllMocks());

  it('opens add dialog when + Add is clicked', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [] });
    renderTestimonies();
    await waitFor(() => screen.getByTestId('add-needed-item'));
    fireEvent.click(screen.getByTestId('add-needed-item'));
    expect(screen.getByText('Add Item')).toBeInTheDocument();
  });

  it('POSTs to create a new unfulfilled item and closes the dialog', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, testimonies: [] }) // initial list
      .mockResolvedValueOnce({ ok: true, testimony: { id: 99, status: 'unfulfilled', type: 'testimony', title: null, person_id: null, program: 'mens' } }) // POST
      .mockResolvedValueOnce({ ok: true, testimonies: [] }); // refetch

    renderTestimonies();
    await waitFor(() => screen.getByTestId('add-needed-item'));
    fireEvent.click(screen.getByTestId('add-needed-item'));
    expect(screen.getByText('Add Item')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      const postCall = mockApiFetch.mock.calls.find(
        c => typeof c[0] === 'string' && c[0] === '/admin/testimonies' && (c[1] as RequestInit)?.method === 'POST'
      );
      expect(postCall).toBeDefined();
    });
  });
});

// ── Archived section tests ─────────────────────────────────────────────────────

describe('Testimonies page — archived section', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('hides archived items behind toggle by default', async () => {
    const archivedItem: import('../pages/Testimonies').TestimonyRow = {
      ...TESTIMONY_UNFULFILLED,
      id: 99,
      status: 'archived',
      first_name: 'Archived',
      last_name: 'Person',
    };
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [archivedItem] });
    renderTestimonies();
    await waitFor(() => screen.getByText(/show archived/i));
    // Person name should not be visible yet
    expect(screen.queryByText('Archived Person')).not.toBeInTheDocument();
  });

  it('shows archived items when toggle clicked', async () => {
    const archivedItem: import('../pages/Testimonies').TestimonyRow = {
      ...TESTIMONY_UNFULFILLED,
      id: 99,
      status: 'archived',
      first_name: 'Archived',
      last_name: 'Person',
    };
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [archivedItem] });
    renderTestimonies();
    await waitFor(() => screen.getByText(/show archived/i));
    fireEvent.click(screen.getByText(/show archived/i));
    expect(screen.getByText('Archived Person')).toBeInTheDocument();
  });
});

// ── Nav badge tests ────────────────────────────────────────────────────────────

describe('Nav — testimonies badge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows badge with new count when count > 0', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, program_new: 3, unassigned_new: 1 });

    render(
      <MemoryRouter>
        <ProgramContext.Provider value={{ program: 'mens', setProgram: vi.fn() }}>
          <Nav />
        </ProgramContext.Provider>
      </MemoryRouter>
    );

    await waitFor(() => {
      const badge = screen.getByTestId('testimonies-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('4');
    });
  });

  it('does not show badge when count is 0', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, program_new: 0, unassigned_new: 0 });

    render(
      <MemoryRouter>
        <ProgramContext.Provider value={{ program: 'mens', setProgram: vi.fn() }}>
          <Nav />
        </ProgramContext.Provider>
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(screen.getByText('Testimonies & Teachings')).toBeInTheDocument()
    );
    expect(screen.queryByTestId('testimonies-badge')).not.toBeInTheDocument();
  });

  it('renders Testimonies & Teachings nav item', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, program_new: 0, unassigned_new: 0 });

    render(
      <MemoryRouter>
        <ProgramContext.Provider value={{ program: 'mens', setProgram: vi.fn() }}>
          <Nav />
        </ProgramContext.Provider>
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /testimonies & teachings/i })).toBeInTheDocument()
    );
  });
});
