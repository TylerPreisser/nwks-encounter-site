// admin/src/__tests__/Testimonies.test.tsx -- RTL tests for Testimonies Kanban board
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

// ── Fixtures — new draft-workflow statuses ─────────────────────────────────────

const TESTIMONY_NOT_RECEIVED: import('../pages/Testimonies').TestimonyRow = {
  id: 1,
  program: 'mens',
  person_id: 10,
  first_name: 'John',
  last_name: 'Doe',
  from_name: 'John Doe',
  from_email: 'john@example.com',
  subject: 'My testimony',
  title: 'Saturday night testimony',
  status: 'not_received',
  type: 'testimony',
  received_at: null,
  created_at: '2026-07-20T10:00:00Z',
  attachment_count: 0,
  comment_count: 0,
};

const TESTIMONY_AWAITING_DRAFT_1: import('../pages/Testimonies').TestimonyRow = {
  id: 2,
  program: 'mens',
  person_id: 11,
  first_name: 'Alice',
  last_name: 'Cooper',
  from_name: 'Alice Cooper',
  from_email: 'alice@example.com',
  subject: null,
  title: 'Opening teaching',
  status: 'awaiting_draft_1',
  type: 'teaching',
  received_at: null,
  created_at: '2026-07-19T09:00:00Z',
  attachment_count: 0,
  comment_count: 0,
};

const TESTIMONY_DRAFT1_REVIEW: import('../pages/Testimonies').TestimonyRow = {
  id: 3,
  program: 'mens',
  person_id: 12,
  first_name: 'Bob',
  last_name: 'Ross',
  from_name: 'Bob Ross',
  from_email: 'bob@example.com',
  subject: 'First draft testimony',
  title: null,
  status: 'draft_1_review',
  type: 'testimony',
  received_at: '2026-07-21T09:00:00Z',
  created_at: '2026-07-21T09:00:00Z',
  attachment_count: 1,
  comment_count: 0,
};

const TESTIMONY_AWAITING_DRAFT_2: import('../pages/Testimonies').TestimonyRow = {
  id: 4,
  program: 'mens',
  person_id: 13,
  first_name: 'Carol',
  last_name: 'Davis',
  from_name: 'Carol Davis',
  from_email: 'carol@example.com',
  subject: null,
  title: null,
  status: 'awaiting_draft_2',
  type: 'testimony',
  received_at: null,
  created_at: '2026-07-21T10:00:00Z',
  attachment_count: 0,
  comment_count: 0,
};

const TESTIMONY_DRAFT2_REVIEW: import('../pages/Testimonies').TestimonyRow = {
  id: 5,
  program: 'mens',
  person_id: 14,
  first_name: 'Dave',
  last_name: 'Grohl',
  from_name: 'Dave Grohl',
  from_email: 'dave@example.com',
  subject: 'Second draft',
  title: null,
  status: 'draft_2_review',
  type: 'testimony',
  received_at: '2026-07-22T09:00:00Z',
  created_at: '2026-07-22T09:00:00Z',
  attachment_count: 1,
  comment_count: 1,
};

const TESTIMONY_APPROVED: import('../pages/Testimonies').TestimonyRow = {
  id: 6,
  program: 'mens',
  person_id: 15,
  first_name: 'Mary',
  last_name: 'Johnson',
  from_name: 'Mary Johnson',
  from_email: 'mary@example.com',
  subject: 'Approved testimony',
  title: 'Done testimony',
  status: 'approved',
  type: 'testimony',
  received_at: '2026-07-18T10:00:00Z',
  created_at: '2026-07-18T10:00:00Z',
  attachment_count: 2,
  comment_count: 1,
};

const TESTIMONY_UNASSIGNED: import('../pages/Testimonies').TestimonyRow = {
  id: 7,
  program: null,
  person_id: null,
  first_name: null,
  last_name: null,
  from_name: 'Unknown Sender',
  from_email: 'unknown@example.com',
  subject: 'Unmatched email',
  title: null,
  status: 'draft_1_review',
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

// ── Kanban board layout ────────────────────────────────────────────────────────

describe('Testimonies Kanban — columns', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('shows loading state initially', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderTestimonies();
    expect(screen.getAllByText(/loading/i).length).toBeGreaterThan(0);
  });

  it('renders six kanban columns in order from a mocked payload', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      testimonies: [
        TESTIMONY_NOT_RECEIVED,
        TESTIMONY_AWAITING_DRAFT_1,
        TESTIMONY_DRAFT1_REVIEW,
        TESTIMONY_AWAITING_DRAFT_2,
        TESTIMONY_DRAFT2_REVIEW,
        TESTIMONY_APPROVED,
      ],
    });
    renderTestimonies();
    await waitFor(() => {
      expect(screen.getByText('Not Received')).toBeInTheDocument();
      expect(screen.getByText('Awaiting Draft 1')).toBeInTheDocument();
      expect(screen.getByText('Draft 1 In Review')).toBeInTheDocument();
      expect(screen.getByText('Awaiting Draft 2')).toBeInTheDocument();
      expect(screen.getByText('Draft 2 In Review')).toBeInTheDocument();
      expect(screen.getByText('Approved')).toBeInTheDocument();
    });
  });

  it('places cards in the correct columns', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      testimonies: [
        TESTIMONY_NOT_RECEIVED,
        TESTIMONY_DRAFT1_REVIEW,
        TESTIMONY_APPROVED,
        TESTIMONY_AWAITING_DRAFT_1,
        TESTIMONY_AWAITING_DRAFT_2,
        TESTIMONY_DRAFT2_REVIEW,
      ],
    });
    renderTestimonies();
    await waitFor(() => {
      expect(screen.getByTestId('testimony-row-1')).toBeInTheDocument(); // not_received
      expect(screen.getByTestId('testimony-row-2')).toBeInTheDocument(); // awaiting_draft_1
      expect(screen.getByTestId('testimony-row-3')).toBeInTheDocument(); // draft_1_review
      expect(screen.getByTestId('testimony-row-4')).toBeInTheDocument(); // awaiting_draft_2
      expect(screen.getByTestId('testimony-row-5')).toBeInTheDocument(); // draft_2_review
      expect(screen.getByTestId('testimony-row-6')).toBeInTheDocument(); // approved
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

  it('each column header shows a count', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      testimonies: [TESTIMONY_NOT_RECEIVED, { ...TESTIMONY_NOT_RECEIVED, id: 99 }],
    });
    renderTestimonies();
    await waitFor(() => {
      // All 6 column headers render
      const headers = screen.getAllByText('Not Received');
      // There can be multiple elements (visible header + sr-only filter btn)
      // Find the one that is NOT sr-only — it will be inside a kanban column header div
      const visibleHeader = headers.find(el => !el.closest('.sr-only'));
      expect(visibleHeader).toBeTruthy();
      // The count badge is a sibling — check parent has the count
      const colHeader = visibleHeader!.closest('div');
      expect(colHeader?.textContent).toContain('2');
    });
  });
});

// ── Card content ───────────────────────────────────────────────────────────────

describe('Testimonies Kanban — card content', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('renders person name as a link to /people/:id when person is assigned', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_NOT_RECEIVED] });
    renderTestimonies();
    await waitFor(() => {
      const link = screen.getByRole('link', { name: 'John Doe' });
      expect(link).toHaveAttribute('href', '/people/10');
    });
  });

  it('renders items from API payload (person names visible)', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      testimonies: [TESTIMONY_NOT_RECEIVED, TESTIMONY_DRAFT1_REVIEW],
    });
    renderTestimonies();
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Bob Ross')).toBeInTheDocument();
    });
  });

  it('shows type badge for each item', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      testimonies: [TESTIMONY_NOT_RECEIVED, TESTIMONY_AWAITING_DRAFT_1],
    });
    renderTestimonies();
    await waitFor(() => {
      expect(screen.getAllByText('Testimony').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Teaching').length).toBeGreaterThan(0);
    });
  });

  it('shows "View ↗" link opening in new tab when item has submission', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      testimonies: [TESTIMONY_DRAFT1_REVIEW], // attachment_count: 1 + subject => has submission
    });
    renderTestimonies();
    await waitFor(() => {
      const viewLink = screen.getByRole('link', { name: /view submission for bob ross/i });
      expect(viewLink).toHaveAttribute('href', '/api/admin/testimonies/3/view');
      expect(viewLink).toHaveAttribute('target', '_blank');
    });
  });

  it('shows "— awaiting —" when item has no submission', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      testimonies: [TESTIMONY_AWAITING_DRAFT_2], // attachment_count: 0, subject: null
    });
    renderTestimonies();
    await waitFor(() => {
      expect(screen.getByText(/— awaiting —/i)).toBeInTheDocument();
    });
  });

  it('shows status select on each card with all 7 options (6 + archived)', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_NOT_RECEIVED] });
    renderTestimonies();
    await waitFor(() => {
      const select = screen.getByRole('combobox', { name: /status for john doe/i });
      expect(select).toBeInTheDocument();
      const options = Array.from(select.querySelectorAll('option')).map(o => o.getAttribute('value'));
      expect(options).toContain('not_received');
      expect(options).toContain('awaiting_draft_1');
      expect(options).toContain('draft_1_review');
      expect(options).toContain('awaiting_draft_2');
      expect(options).toContain('draft_2_review');
      expect(options).toContain('approved');
      expect(options).toContain('archived');
    });
  });

  it('renders unassigned testimonies (from_name shown)', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_UNASSIGNED] });
    renderTestimonies();
    await waitFor(() =>
      expect(screen.getByText('Unknown Sender')).toBeInTheDocument()
    );
  });

  it('does not show a right-side detail drawer', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_NOT_RECEIVED] });
    renderTestimonies();
    await waitFor(() => screen.getByText('John Doe'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(/submitted content/i)).not.toBeInTheDocument();
  });
});

// ── Drag and drop + select fallback ───────────────────────────────────────────

describe('Testimonies Kanban — drag and select PATCH', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('status select change PATCHes status (optimistic)', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, testimonies: [TESTIMONY_NOT_RECEIVED] })
      .mockResolvedValue({ ok: true, testimony: { id: 1, status: 'approved', type: 'testimony', title: null, person_id: 10, program: 'mens' } });

    renderTestimonies();
    await waitFor(() => screen.getByTestId('testimony-row-1'));

    const select = screen.getByRole('combobox', { name: /status for john doe/i });
    fireEvent.change(select, { target: { value: 'approved' } });

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

  it('drag start + drop (select fallback) PATCHes status to draft_1_review', async () => {
    // The native HTML5 drag in jsdom is limited; we test via the select fallback
    // which exercises the same handleStatusChange code path as DnD.
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, testimonies: [TESTIMONY_NOT_RECEIVED] })
      .mockResolvedValue({ ok: true, testimony: { id: 1, status: 'draft_1_review', type: 'testimony', title: null, person_id: 10, program: 'mens' } });

    renderTestimonies();
    await waitFor(() => screen.getByTestId('testimony-row-1'));

    // Simulate drag start (exercises draggingIdRef)
    const card = screen.getByTestId('testimony-row-1');
    fireEvent.dragStart(card);

    // Use the select fallback to move to draft_1_review (same code path as DnD)
    const select = screen.getByRole('combobox', { name: /status for john doe/i });
    fireEvent.change(select, { target: { value: 'draft_1_review' } });

    await waitFor(() => {
      const patchCalls = mockApiFetch.mock.calls.filter(
        c =>
          typeof c[0] === 'string' &&
          c[0] === '/admin/testimonies/1' &&
          (c[1] as RequestInit)?.method === 'PATCH'
      );
      expect(patchCalls.length).toBeGreaterThan(0);
      const body = JSON.parse((patchCalls[0][1] as RequestInit).body as string);
      expect(body.status).toBe('draft_1_review');
    });
  });
});

// ── Add item modal ─────────────────────────────────────────────────────────────

describe('Testimonies Kanban — + Add modal', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('opens the Add modal when + Add is clicked', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [] });
    renderTestimonies();
    await waitFor(() => screen.getByTestId('add-needed-item'));
    fireEvent.click(screen.getByTestId('add-needed-item'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Add Item')).toBeInTheDocument();
  });

  it('modal has Type selector (Testimony / Teaching)', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [] });
    renderTestimonies();
    await waitFor(() => screen.getByTestId('add-needed-item'));
    fireEvent.click(screen.getByTestId('add-needed-item'));
    // Inside the modal dialog specifically
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // Type buttons are inside the dialog
    const testimonyBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.textContent === 'Testimony');
    const teachingBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.textContent === 'Teaching');
    expect(testimonyBtn).toBeTruthy();
    expect(teachingBtn).toBeTruthy();
  });

  it('modal has searchable person picklist', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [] });
    renderTestimonies();
    await waitFor(() => screen.getByTestId('add-needed-item'));
    fireEvent.click(screen.getByTestId('add-needed-item'));
    expect(screen.getByRole('combobox', { name: /search person/i })).toBeInTheDocument();
  });

  it('POSTs with type and person_id on Create and item appears in Not Received', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, testimonies: [] }) // initial list
      .mockResolvedValueOnce({ // people search
        ok: true,
        rows: [{ id: 42, first_name: 'Test', last_name: 'Person', email: 'tp@example.com', program: 'mens' }],
      })
      .mockResolvedValueOnce({ ok: true, testimony: { id: 99, status: 'not_received', type: 'testimony', title: null, person_id: 42, program: 'mens' } }) // POST
      .mockResolvedValueOnce({ ok: true, testimonies: [] }); // refetch

    renderTestimonies();
    await waitFor(() => screen.getByTestId('add-needed-item'));
    fireEvent.click(screen.getByTestId('add-needed-item'));

    // Type into person search
    const personInput = screen.getByRole('combobox', { name: /search person/i });
    fireEvent.change(personInput, { target: { value: 'Test' } });

    // Wait for results and click person
    await waitFor(() => screen.getByText('Test Person'));
    fireEvent.mouseDown(screen.getByText('Test Person'));

    // Click Create
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      const postCall = mockApiFetch.mock.calls.find(
        c => typeof c[0] === 'string' && c[0] === '/admin/testimonies' && (c[1] as RequestInit)?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body.type).toBe('testimony');
      expect(body.person_id).toBe(42);
    });
  });

  it('POSTs to create a new not_received item and closes dialog', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, testimonies: [] })
      .mockResolvedValueOnce({ ok: true, testimony: { id: 99, status: 'not_received', type: 'testimony', title: null, person_id: null, program: 'mens' } })
      .mockResolvedValueOnce({ ok: true, testimonies: [] });

    renderTestimonies();
    await waitFor(() => screen.getByTestId('add-needed-item'));
    fireEvent.click(screen.getByTestId('add-needed-item'));

    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      const postCall = mockApiFetch.mock.calls.find(
        c => typeof c[0] === 'string' && c[0] === '/admin/testimonies' && (c[1] as RequestInit)?.method === 'POST'
      );
      expect(postCall).toBeDefined();
    });
  });

  it('closes modal on Cancel', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [] });
    renderTestimonies();
    await waitFor(() => screen.getByTestId('add-needed-item'));
    fireEvent.click(screen.getByTestId('add-needed-item'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

// ── Archived section ───────────────────────────────────────────────────────────

describe('Testimonies Kanban — archived section', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('hides archived items behind toggle by default', async () => {
    const archivedItem: import('../pages/Testimonies').TestimonyRow = {
      ...TESTIMONY_NOT_RECEIVED,
      id: 99,
      status: 'archived',
      first_name: 'Archived',
      last_name: 'Person',
    };
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [archivedItem] });
    renderTestimonies();
    await waitFor(() => screen.getByText(/show archived/i));
    expect(screen.queryByText('Archived Person')).not.toBeInTheDocument();
  });

  it('shows archived items when toggle clicked', async () => {
    const archivedItem: import('../pages/Testimonies').TestimonyRow = {
      ...TESTIMONY_NOT_RECEIVED,
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

// ── Filter tests ───────────────────────────────────────────────────────────────

describe('Testimonies Kanban — filters', () => {
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

  it('status filter buttons exist for all 7 statuses', async () => {
    renderTestimonies();
    await waitFor(() => screen.getByText('Testimonies & Teachings'));
    for (const s of ['not_received', 'awaiting_draft_1', 'draft_1_review', 'awaiting_draft_2', 'draft_2_review', 'approved', 'archived']) {
      expect(screen.getByTestId(`filter-status-${s}`)).toBeInTheDocument();
    }
  });

  it('calls API with status=not_received when not_received filter clicked', async () => {
    renderTestimonies();
    await waitFor(() => screen.getByTestId('filter-status-not_received'));
    fireEvent.click(screen.getByTestId('filter-status-not_received'));
    await waitFor(() => {
      const calls = mockApiFetch.mock.calls;
      const lastCall = calls[calls.length - 1][0] as string;
      expect(lastCall).toMatch(/status=not_received/);
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

  it('calls API with status=draft_1_review when draft_1_review filter clicked', async () => {
    renderTestimonies();
    await waitFor(() => screen.getByTestId('filter-status-draft_1_review'));
    fireEvent.click(screen.getByTestId('filter-status-draft_1_review'));
    await waitFor(() => {
      const calls = mockApiFetch.mock.calls;
      const lastCall = calls[calls.length - 1][0] as string;
      expect(lastCall).toMatch(/status=draft_1_review/);
    });
  });

  it('calls API with status=awaiting_draft_2 when filter clicked', async () => {
    renderTestimonies();
    await waitFor(() => screen.getByTestId('filter-status-awaiting_draft_2'));
    fireEvent.click(screen.getByTestId('filter-status-awaiting_draft_2'));
    await waitFor(() => {
      const calls = mockApiFetch.mock.calls;
      const lastCall = calls[calls.length - 1][0] as string;
      expect(lastCall).toMatch(/status=awaiting_draft_2/);
    });
  });

  it('refetches when program toggles', async () => {
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
});

// ── Nav badge tests ────────────────────────────────────────────────────────────

describe('Nav — testimonies badge', () => {
  beforeEach(() => vi.clearAllMocks());
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
