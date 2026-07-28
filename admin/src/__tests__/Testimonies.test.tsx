// admin/src/__tests__/Testimonies.test.tsx -- RTL tests for Testimonies Kanban board
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProgramContext } from '../App';
import Testimonies, { statusToColumn, statusToWaiting, TESTIMONY_TOPICS } from '../pages/Testimonies';
import Nav from '../components/Nav';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../api', () => ({
  apiFetch: vi.fn(),
  // The year switcher loads encounters via this; keep it out of the apiFetch
  // call sequence the tests assert on.
  listEncounters: vi.fn().mockResolvedValue([]),
}));

import { apiFetch } from '../api';
const mockApiFetch = vi.mocked(apiFetch);

// ── Fixtures — new 3-draft sub-state statuses ─────────────────────────────────

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
  topic: null,
  received_at: null,
  created_at: '2026-07-20T10:00:00Z',
  attachment_count: 0,
  comment_count: 0,
};

const TESTIMONY_DRAFT1_AWAITING: import('../pages/Testimonies').TestimonyRow = {
  id: 2,
  program: 'mens',
  person_id: 11,
  first_name: 'Alice',
  last_name: 'Cooper',
  from_name: 'Alice Cooper',
  from_email: 'alice@example.com',
  subject: null,
  title: 'Opening teaching',
  status: 'draft_1_awaiting',
  type: 'teaching',
  topic: null,
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
  topic: null,
  received_at: '2026-07-21T09:00:00Z',
  created_at: '2026-07-21T09:00:00Z',
  attachment_count: 1,
  comment_count: 0,
};

const TESTIMONY_DRAFT2_AWAITING: import('../pages/Testimonies').TestimonyRow = {
  id: 4,
  program: 'mens',
  person_id: 13,
  first_name: 'Carol',
  last_name: 'Davis',
  from_name: 'Carol Davis',
  from_email: 'carol@example.com',
  subject: null,
  title: null,
  status: 'draft_2_awaiting',
  type: 'testimony',
  topic: null,
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
  topic: null,
  received_at: '2026-07-22T09:00:00Z',
  created_at: '2026-07-22T09:00:00Z',
  attachment_count: 1,
  comment_count: 1,
};

const TESTIMONY_DRAFT3_AWAITING: import('../pages/Testimonies').TestimonyRow = {
  id: 8,
  program: 'mens',
  person_id: 16,
  first_name: 'Eve',
  last_name: 'Stone',
  from_name: 'Eve Stone',
  from_email: 'eve@example.com',
  subject: null,
  title: null,
  status: 'draft_3_awaiting',
  type: 'testimony',
  topic: null,
  received_at: null,
  created_at: '2026-07-22T11:00:00Z',
  attachment_count: 0,
  comment_count: 0,
};

const TESTIMONY_DRAFT3_REVIEW: import('../pages/Testimonies').TestimonyRow = {
  id: 9,
  program: 'mens',
  person_id: 17,
  first_name: 'Frank',
  last_name: 'Ocean',
  from_name: 'Frank Ocean',
  from_email: 'frank@example.com',
  subject: 'Third draft',
  title: null,
  status: 'draft_3_review',
  type: 'testimony',
  topic: null,
  received_at: '2026-07-23T09:00:00Z',
  created_at: '2026-07-23T09:00:00Z',
  attachment_count: 1,
  comment_count: 0,
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
  topic: 'Healing',
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
  topic: null,
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

// ── statusToColumn helper ──────────────────────────────────────────────────────

describe('statusToColumn helper', () => {
  it('maps not_received to not_received', () => {
    expect(statusToColumn('not_received')).toBe('not_received');
  });
  it('maps draft_1_awaiting and draft_1_review to draft_1', () => {
    expect(statusToColumn('draft_1_awaiting')).toBe('draft_1');
    expect(statusToColumn('draft_1_review')).toBe('draft_1');
  });
  it('maps draft_2_awaiting and draft_2_review to draft_2', () => {
    expect(statusToColumn('draft_2_awaiting')).toBe('draft_2');
    expect(statusToColumn('draft_2_review')).toBe('draft_2');
  });
  it('maps draft_3_awaiting and draft_3_review to draft_3', () => {
    expect(statusToColumn('draft_3_awaiting')).toBe('draft_3');
    expect(statusToColumn('draft_3_review')).toBe('draft_3');
  });
  it('maps approved to approved', () => {
    expect(statusToColumn('approved')).toBe('approved');
  });
});

// ── Kanban board layout ────────────────────────────────────────────────────────

describe('Testimonies Kanban — columns', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('shows loading state initially', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderTestimonies();
    expect(screen.getAllByText(/loading/i).length).toBeGreaterThan(0);
  });

  it('renders FIVE kanban columns: Not Received, Draft 1, Draft 2, Draft 3, Approved', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      testimonies: [
        TESTIMONY_NOT_RECEIVED,
        TESTIMONY_DRAFT1_AWAITING,
        TESTIMONY_DRAFT1_REVIEW,
        TESTIMONY_DRAFT2_AWAITING,
        TESTIMONY_DRAFT2_REVIEW,
        TESTIMONY_DRAFT3_AWAITING,
        TESTIMONY_DRAFT3_REVIEW,
        TESTIMONY_APPROVED,
      ],
    });
    renderTestimonies();
    await waitFor(() => {
      expect(screen.getByTestId('kanban-column-not_received')).toBeInTheDocument();
      expect(screen.getByTestId('kanban-column-draft_1')).toBeInTheDocument();
      expect(screen.getByTestId('kanban-column-draft_2')).toBeInTheDocument();
      expect(screen.getByTestId('kanban-column-draft_3')).toBeInTheDocument();
      expect(screen.getByTestId('kanban-column-approved')).toBeInTheDocument();
    });
    // Verify column labels appear (using testid to avoid ambiguity with sr-only filter buttons)
    await waitFor(() => {
      const notRecCol = screen.getByTestId('kanban-column-not_received');
      expect(notRecCol.textContent).toContain('Not Received');
      const d1Col = screen.getByTestId('kanban-column-draft_1');
      expect(d1Col.textContent).toContain('Draft 1');
      const d2Col = screen.getByTestId('kanban-column-draft_2');
      expect(d2Col.textContent).toContain('Draft 2');
      const d3Col = screen.getByTestId('kanban-column-draft_3');
      expect(d3Col.textContent).toContain('Draft 3');
      const approvedCol = screen.getByTestId('kanban-column-approved');
      expect(approvedCol.textContent).toContain('Approved');
    });
  });

  it('groups both draft_1_awaiting and draft_1_review cards into the Draft 1 column', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      testimonies: [TESTIMONY_DRAFT1_AWAITING, TESTIMONY_DRAFT1_REVIEW],
    });
    renderTestimonies();
    await waitFor(() => {
      const draft1Col = screen.getByTestId('kanban-column-draft_1');
      expect(draft1Col).toContainElement(screen.getByTestId('testimony-row-2'));
      expect(draft1Col).toContainElement(screen.getByTestId('testimony-row-3'));
    });
  });

  it('groups both draft_2_awaiting and draft_2_review cards into the Draft 2 column', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      testimonies: [TESTIMONY_DRAFT2_AWAITING, TESTIMONY_DRAFT2_REVIEW],
    });
    renderTestimonies();
    await waitFor(() => {
      const draft2Col = screen.getByTestId('kanban-column-draft_2');
      expect(draft2Col).toContainElement(screen.getByTestId('testimony-row-4'));
      expect(draft2Col).toContainElement(screen.getByTestId('testimony-row-5'));
    });
  });

  it('groups both draft_3_awaiting and draft_3_review cards into the Draft 3 column', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      testimonies: [TESTIMONY_DRAFT3_AWAITING, TESTIMONY_DRAFT3_REVIEW],
    });
    renderTestimonies();
    await waitFor(() => {
      const draft3Col = screen.getByTestId('kanban-column-draft_3');
      expect(draft3Col).toContainElement(screen.getByTestId('testimony-row-8'));
      expect(draft3Col).toContainElement(screen.getByTestId('testimony-row-9'));
    });
  });

  it('shows NOT_RECEIVED card in not_received column', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_NOT_RECEIVED] });
    renderTestimonies();
    await waitFor(() => {
      const col = screen.getByTestId('kanban-column-not_received');
      expect(col).toContainElement(screen.getByTestId('testimony-row-1'));
    });
  });

  it('shows APPROVED card in approved column', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_APPROVED] });
    renderTestimonies();
    await waitFor(() => {
      const col = screen.getByTestId('kanban-column-approved');
      expect(col).toContainElement(screen.getByTestId('testimony-row-6'));
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
      const col = screen.getByTestId('kanban-column-not_received');
      // The count badge should be "2" inside the not_received column header
      expect(col.textContent).toContain('2');
    });
  });

  it('Draft 1 column shows count of 2 when it has both draft_1_awaiting and draft_1_review items', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      testimonies: [TESTIMONY_DRAFT1_AWAITING, TESTIMONY_DRAFT1_REVIEW],
    });
    renderTestimonies();
    await waitFor(() => {
      const col = screen.getByTestId('kanban-column-draft_1');
      expect(col.textContent).toContain('2');
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
      testimonies: [TESTIMONY_NOT_RECEIVED, TESTIMONY_DRAFT1_AWAITING],
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

  it('does NOT show "View ↗" link when item has no submission', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      testimonies: [TESTIMONY_DRAFT2_AWAITING], // attachment_count: 0, subject: null
    });
    renderTestimonies();
    await waitFor(() => screen.getByTestId('testimony-row-4'));
    expect(screen.queryByText(/view ↗/i)).not.toBeInTheDocument();
  });

  it('does NOT render "— awaiting —" text on any card', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      testimonies: [
        TESTIMONY_DRAFT1_AWAITING, // no submission
        TESTIMONY_DRAFT2_AWAITING, // no submission
        TESTIMONY_DRAFT3_AWAITING, // no submission
        TESTIMONY_NOT_RECEIVED,    // no submission
      ],
    });
    renderTestimonies();
    await waitFor(() => screen.getByTestId('testimony-row-1'));
    // Cards should have NO "— awaiting —" placeholder text rendered
    expect(screen.queryByText(/— awaiting —/i)).not.toBeInTheDocument();
    // Confirm none of the visible card bodies (non-sr-only) show a dash-awaiting-dash pattern
    const board = screen.getByTestId('kanban-board');
    expect(board.textContent).not.toContain('— awaiting —');
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

// ── Card sub-state dropdown ────────────────────────────────────────────────────

describe('Testimonies Kanban — card sub-state dropdown', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('Draft 1 column card shows only Awaiting Draft 1 and Draft 1 In Review options', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_DRAFT1_AWAITING] });
    renderTestimonies();
    await waitFor(() => screen.getByTestId('testimony-row-2'));
    const select = screen.getByRole('combobox', { name: /status for alice cooper/i });
    const options = Array.from(select.querySelectorAll('option')).map(o => o.getAttribute('value'));
    expect(options).toEqual(['draft_1_awaiting', 'draft_1_review']);
    // Should NOT have options from other columns
    expect(options).not.toContain('not_received');
    expect(options).not.toContain('draft_2_awaiting');
    expect(options).not.toContain('approved');
  });

  it('Draft 2 column card shows only Awaiting Draft 2 and Draft 2 In Review options', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_DRAFT2_REVIEW] });
    renderTestimonies();
    await waitFor(() => screen.getByTestId('testimony-row-5'));
    const select = screen.getByRole('combobox', { name: /status for dave grohl/i });
    const options = Array.from(select.querySelectorAll('option')).map(o => o.getAttribute('value'));
    expect(options).toEqual(['draft_2_awaiting', 'draft_2_review']);
  });

  it('Draft 3 column card shows only Awaiting Draft 3 and Draft 3 In Review options', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_DRAFT3_AWAITING] });
    renderTestimonies();
    await waitFor(() => screen.getByTestId('testimony-row-8'));
    const select = screen.getByRole('combobox', { name: /status for eve stone/i });
    const options = Array.from(select.querySelectorAll('option')).map(o => o.getAttribute('value'));
    expect(options).toEqual(['draft_3_awaiting', 'draft_3_review']);
  });

  it('Not Received column card shows only Not Received option', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_NOT_RECEIVED] });
    renderTestimonies();
    await waitFor(() => screen.getByTestId('testimony-row-1'));
    const select = screen.getByRole('combobox', { name: /status for john doe/i });
    const options = Array.from(select.querySelectorAll('option')).map(o => o.getAttribute('value'));
    expect(options).toEqual(['not_received']);
  });

  it('Approved column card shows only Approved option', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_APPROVED] });
    renderTestimonies();
    await waitFor(() => screen.getByTestId('testimony-row-6'));
    const select = screen.getByRole('combobox', { name: /status for mary johnson/i });
    const options = Array.from(select.querySelectorAll('option')).map(o => o.getAttribute('value'));
    expect(options).toEqual(['approved']);
  });

  it('changing sub-state dropdown in Draft 1 column PATCHes within the same column (draft_1_awaiting -> draft_1_review)', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, testimonies: [TESTIMONY_DRAFT1_AWAITING] })
      .mockResolvedValue({ ok: true, testimony: { id: 2, status: 'draft_1_review', type: 'teaching', title: 'Opening teaching', person_id: 11, program: 'mens' } });

    renderTestimonies();
    await waitFor(() => screen.getByTestId('testimony-row-2'));

    const select = screen.getByRole('combobox', { name: /status for alice cooper/i });
    fireEvent.change(select, { target: { value: 'draft_1_review' } });

    await waitFor(() => {
      const patchCall = mockApiFetch.mock.calls.find(
        c =>
          typeof c[0] === 'string' &&
          c[0] === '/admin/testimonies/2' &&
          (c[1] as RequestInit)?.method === 'PATCH'
      );
      expect(patchCall).toBeDefined();
      const body = JSON.parse((patchCall![1] as RequestInit).body as string);
      expect(body.status).toBe('draft_1_review');
    });
  });

  it('card stays in Draft 1 column after sub-state change (draft_1_awaiting -> draft_1_review)', async () => {
    // After changing from draft_1_awaiting to draft_1_review, card should remain in draft_1 column
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, testimonies: [TESTIMONY_DRAFT1_AWAITING] })
      .mockResolvedValue({ ok: true, testimony: { id: 2, status: 'draft_1_review', type: 'teaching', title: null, person_id: 11, program: 'mens' } });

    renderTestimonies();
    await waitFor(() => screen.getByTestId('testimony-row-2'));

    const select = screen.getByRole('combobox', { name: /status for alice cooper/i });
    fireEvent.change(select, { target: { value: 'draft_1_review' } });

    await waitFor(() => {
      // Card 2 should still be in the draft_1 column after sub-state change
      const draft1Col = screen.getByTestId('kanban-column-draft_1');
      expect(draft1Col).toContainElement(screen.getByTestId('testimony-row-2'));
    });
  });
});

// ── Responsive layout ──────────────────────────────────────────────────────────

describe('Testimonies Kanban — responsive layout', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('renders the kanban board container with data-testid="kanban-board"', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_NOT_RECEIVED] });
    renderTestimonies();
    await waitFor(() => {
      expect(screen.getByTestId('kanban-board')).toBeInTheDocument();
    });
  });

  it('kanban-board has the "kanban-board" CSS class for responsive targeting', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_NOT_RECEIVED] });
    renderTestimonies();
    await waitFor(() => {
      const board = screen.getByTestId('kanban-board');
      expect(board.classList.contains('kanban-board')).toBe(true);
    });
  });

  it('each column has the "kanban-column" CSS class for responsive targeting', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_NOT_RECEIVED] });
    renderTestimonies();
    await waitFor(() => {
      const col = screen.getByTestId('kanban-column-not_received');
      expect(col.classList.contains('kanban-column')).toBe(true);
    });
  });

  it('exactly 5 kanban columns rendered', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [] });
    renderTestimonies();
    // Board renders even when empty (shows "No testimonies found" before board)
    // Let's test with at least 1 item
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_NOT_RECEIVED] });
    renderTestimonies();
    await waitFor(() => {
      const cols = screen.getAllByTestId(/^kanban-column-/);
      expect(cols.length).toBe(5);
    });
  });
});

// ── Drag and drop + select fallback ───────────────────────────────────────────

describe('Testimonies Kanban — drag and select PATCH', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('status select change PATCHes status (optimistic)', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, testimonies: [TESTIMONY_DRAFT1_AWAITING] })
      .mockResolvedValue({ ok: true, testimony: { id: 2, status: 'draft_1_review', type: 'teaching', title: null, person_id: 11, program: 'mens' } });

    renderTestimonies();
    await waitFor(() => screen.getByTestId('testimony-row-2'));

    const select = screen.getByRole('combobox', { name: /status for alice cooper/i });
    fireEvent.change(select, { target: { value: 'draft_1_review' } });

    await waitFor(() => {
      const patchCall = mockApiFetch.mock.calls.find(
        c =>
          typeof c[0] === 'string' &&
          c[0] === '/admin/testimonies/2' &&
          (c[1] as RequestInit)?.method === 'PATCH'
      );
      expect(patchCall).toBeDefined();
      const body = JSON.parse((patchCall![1] as RequestInit).body as string);
      expect(body.status).toBe('draft_1_review');
    });
  });

  it('drag start + drop onto a column sets the entry sub-state', async () => {
    // A card in Draft 1 dragged to Draft 2 column should set status=draft_2_awaiting
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, testimonies: [TESTIMONY_DRAFT1_REVIEW] })
      .mockResolvedValue({ ok: true, testimony: { id: 3, status: 'draft_2_awaiting', type: 'testimony', title: null, person_id: 12, program: 'mens' } });

    renderTestimonies();
    await waitFor(() => screen.getByTestId('testimony-row-3'));

    // Simulate drag start on the card
    const card = screen.getByTestId('testimony-row-3');
    fireEvent.dragStart(card);

    // Simulate drop on Draft 2 column
    const draft2Col = screen.getByTestId('kanban-column-draft_2');
    fireEvent.dragOver(draft2Col);
    fireEvent.drop(draft2Col);

    await waitFor(() => {
      const patchCalls = mockApiFetch.mock.calls.filter(
        c =>
          typeof c[0] === 'string' &&
          c[0] === '/admin/testimonies/3' &&
          (c[1] as RequestInit)?.method === 'PATCH'
      );
      expect(patchCalls.length).toBeGreaterThan(0);
      const body = JSON.parse((patchCalls[0][1] as RequestInit).body as string);
      // Dropping in Draft 2 column should set draft_2_awaiting (entry status for draft_2)
      expect(body.status).toBe('draft_2_awaiting');
    });
  });

  it('drag to Not Received column sets status=not_received', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, testimonies: [TESTIMONY_DRAFT1_REVIEW] })
      .mockResolvedValue({ ok: true, testimony: { id: 3, status: 'not_received', type: 'testimony', title: null, person_id: 12, program: 'mens' } });

    renderTestimonies();
    await waitFor(() => screen.getByTestId('testimony-row-3'));

    const card = screen.getByTestId('testimony-row-3');
    fireEvent.dragStart(card);

    const notReceivedCol = screen.getByTestId('kanban-column-not_received');
    fireEvent.dragOver(notReceivedCol);
    fireEvent.drop(notReceivedCol);

    await waitFor(() => {
      const patchCalls = mockApiFetch.mock.calls.filter(
        c =>
          typeof c[0] === 'string' &&
          c[0] === '/admin/testimonies/3' &&
          (c[1] as RequestInit)?.method === 'PATCH'
      );
      expect(patchCalls.length).toBeGreaterThan(0);
      const body = JSON.parse((patchCalls[0][1] as RequestInit).body as string);
      expect(body.status).toBe('not_received');
    });
  });

  it('drag to Approved column sets status=approved', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, testimonies: [TESTIMONY_DRAFT3_REVIEW] })
      .mockResolvedValue({ ok: true, testimony: { id: 9, status: 'approved', type: 'testimony', title: null, person_id: 17, program: 'mens' } });

    renderTestimonies();
    await waitFor(() => screen.getByTestId('testimony-row-9'));

    const card = screen.getByTestId('testimony-row-9');
    fireEvent.dragStart(card);

    const approvedCol = screen.getByTestId('kanban-column-approved');
    fireEvent.dragOver(approvedCol);
    fireEvent.drop(approvedCol);

    await waitFor(() => {
      const patchCalls = mockApiFetch.mock.calls.filter(
        c =>
          typeof c[0] === 'string' &&
          c[0] === '/admin/testimonies/9' &&
          (c[1] as RequestInit)?.method === 'PATCH'
      );
      expect(patchCalls.length).toBeGreaterThan(0);
      const body = JSON.parse((patchCalls[0][1] as RequestInit).body as string);
      expect(body.status).toBe('approved');
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
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
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

    const personInput = screen.getByRole('combobox', { name: /search person/i });
    fireEvent.change(personInput, { target: { value: 'Test' } });

    await waitFor(() => screen.getByText('Test Person'));
    fireEvent.mouseDown(screen.getByText('Test Person'));

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

  it('status filter buttons exist for all new 9 statuses', async () => {
    renderTestimonies();
    await waitFor(() => screen.getByText('Testimonies & Teachings'));
    const expectedStatuses = [
      'not_received',
      'draft_1_awaiting', 'draft_1_review',
      'draft_2_awaiting', 'draft_2_review',
      'draft_3_awaiting', 'draft_3_review',
      'approved', 'archived',
    ];
    for (const s of expectedStatuses) {
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

  it('calls API with status=draft_2_awaiting when filter clicked', async () => {
    renderTestimonies();
    await waitFor(() => screen.getByTestId('filter-status-draft_2_awaiting'));
    fireEvent.click(screen.getByTestId('filter-status-draft_2_awaiting'));
    await waitFor(() => {
      const calls = mockApiFetch.mock.calls;
      const lastCall = calls[calls.length - 1][0] as string;
      expect(lastCall).toMatch(/status=draft_2_awaiting/);
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

// ── statusToWaiting helper ────────────────────────────────────────────────────

describe('statusToWaiting helper', () => {
  it('maps not_received -> server', () => {
    expect(statusToWaiting('not_received')).toBe('server');
  });
  it('maps draft_1_awaiting -> server', () => {
    expect(statusToWaiting('draft_1_awaiting')).toBe('server');
  });
  it('maps draft_2_awaiting -> server', () => {
    expect(statusToWaiting('draft_2_awaiting')).toBe('server');
  });
  it('maps draft_3_awaiting -> server', () => {
    expect(statusToWaiting('draft_3_awaiting')).toBe('server');
  });
  it('maps draft_1_review -> us', () => {
    expect(statusToWaiting('draft_1_review')).toBe('us');
  });
  it('maps draft_2_review -> us', () => {
    expect(statusToWaiting('draft_2_review')).toBe('us');
  });
  it('maps draft_3_review -> us', () => {
    expect(statusToWaiting('draft_3_review')).toBe('us');
  });
  it('maps approved -> approved', () => {
    expect(statusToWaiting('approved')).toBe('approved');
  });
});

// ── Waiting-on color + label on cards ─────────────────────────────────────────

describe('Testimonies Kanban — waiting-on color + label', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('card with not_received status has data-waiting="server"', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_NOT_RECEIVED] });
    renderTestimonies();
    await waitFor(() => {
      const card = screen.getByTestId('testimony-row-1');
      expect(card).toHaveAttribute('data-waiting', 'server');
    });
  });

  it('card with draft_1_awaiting has data-waiting="server" and color dot', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_DRAFT1_AWAITING] });
    renderTestimonies();
    await waitFor(() => {
      const card = screen.getByTestId('testimony-row-2');
      expect(card).toHaveAttribute('data-waiting', 'server');
      expect(screen.getByTestId('waiting-label-2')).toBeInTheDocument();
    });
  });

  it('card with draft_2_awaiting has data-waiting="server"', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_DRAFT2_AWAITING] });
    renderTestimonies();
    await waitFor(() => {
      const card = screen.getByTestId('testimony-row-4');
      expect(card).toHaveAttribute('data-waiting', 'server');
    });
  });

  it('card with draft_3_awaiting has data-waiting="server"', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_DRAFT3_AWAITING] });
    renderTestimonies();
    await waitFor(() => {
      const card = screen.getByTestId('testimony-row-8');
      expect(card).toHaveAttribute('data-waiting', 'server');
    });
  });

  it('card with draft_1_review has data-waiting="us" and color dot', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_DRAFT1_REVIEW] });
    renderTestimonies();
    await waitFor(() => {
      const card = screen.getByTestId('testimony-row-3');
      expect(card).toHaveAttribute('data-waiting', 'us');
      expect(screen.getByTestId('waiting-label-3')).toBeInTheDocument();
    });
  });

  it('card with draft_2_review has data-waiting="us"', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_DRAFT2_REVIEW] });
    renderTestimonies();
    await waitFor(() => {
      const card = screen.getByTestId('testimony-row-5');
      expect(card).toHaveAttribute('data-waiting', 'us');
    });
  });

  it('card with draft_3_review has data-waiting="us"', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_DRAFT3_REVIEW] });
    renderTestimonies();
    await waitFor(() => {
      const card = screen.getByTestId('testimony-row-9');
      expect(card).toHaveAttribute('data-waiting', 'us');
    });
  });

  it('card with approved status has data-waiting="approved" and color dot', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_APPROVED] });
    renderTestimonies();
    await waitFor(() => {
      const card = screen.getByTestId('testimony-row-6');
      expect(card).toHaveAttribute('data-waiting', 'approved');
      expect(screen.getByTestId('waiting-label-6')).toBeInTheDocument();
    });
  });
});

// ── Topic picklist + badge ─────────────────────────────────────────────────────

describe('Testimonies Kanban — topic', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('TESTIMONY_TOPICS exports at least 11 entries', () => {
    expect(TESTIMONY_TOPICS.length).toBeGreaterThanOrEqual(11);
    expect(TESTIMONY_TOPICS).toContain('Purity');
    expect(TESTIMONY_TOPICS).toContain('Freedom');
    expect(TESTIMONY_TOPICS).toContain('Spiritual Warfare');
  });

  it('Add modal has a Topic select with picklist options', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [] });
    renderTestimonies();
    await waitFor(() => screen.getByTestId('add-needed-item'));
    fireEvent.click(screen.getByTestId('add-needed-item'));
    const topicSelect = screen.getByRole('combobox', { name: /topic/i });
    expect(topicSelect).toBeInTheDocument();
    // Should include Purity, Freedom, Spiritual Warfare options
    const options = Array.from(topicSelect.querySelectorAll('option')).map(o => o.textContent);
    expect(options).toContain('Purity');
    expect(options).toContain('Freedom');
    expect(options).toContain('Spiritual Warfare');
  });

  it('POSTs with topic when selected in Add modal', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, testimonies: [] })
      .mockResolvedValueOnce({ ok: true, testimony: { id: 99, status: 'not_received', type: 'testimony', topic: 'Purity', person_id: null, program: 'mens' } })
      .mockResolvedValueOnce({ ok: true, testimonies: [] });

    renderTestimonies();
    await waitFor(() => screen.getByTestId('add-needed-item'));
    fireEvent.click(screen.getByTestId('add-needed-item'));

    const topicSelect = screen.getByRole('combobox', { name: /topic/i });
    fireEvent.change(topicSelect, { target: { value: 'Purity' } });

    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));

    await waitFor(() => {
      const postCall = mockApiFetch.mock.calls.find(
        c => typeof c[0] === 'string' && c[0] === '/admin/testimonies' && (c[1] as RequestInit)?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body.topic).toBe('Purity');
    });
  });

  it('shows topic badge on card when topic is set', async () => {
    const itemWithTopic: import('../pages/Testimonies').TestimonyRow = {
      ...TESTIMONY_NOT_RECEIVED,
      id: 50,
      topic: 'Freedom',
    };
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [itemWithTopic] });
    renderTestimonies();
    await waitFor(() => {
      expect(screen.getByTestId('topic-badge-50')).toHaveTextContent('Freedom');
    });
  });

  it('does NOT show topic badge when topic is null', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_NOT_RECEIVED] }); // topic: null
    renderTestimonies();
    await waitFor(() => screen.getByTestId('testimony-row-1'));
    expect(screen.queryByTestId('topic-badge-1')).not.toBeInTheDocument();
  });

  it('shows Healing topic badge on approved card fixture', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, testimonies: [TESTIMONY_APPROVED] }); // topic: 'Healing'
    renderTestimonies();
    await waitFor(() => {
      expect(screen.getByTestId('topic-badge-6')).toHaveTextContent('Healing');
    });
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
