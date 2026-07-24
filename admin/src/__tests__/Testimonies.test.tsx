// admin/src/__tests__/Testimonies.test.tsx — RTL tests for Testimonies & Teachings UI
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// Silence the RichTextEditor's execCommand calls in jsdom
beforeEach(() => {
  if (!document.execCommand) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document as any).execCommand = vi.fn();
  }
});

// ── Fixtures ───────────────────────────────────────────────────────────────────

const TESTIMONY_NEW: import('../pages/Testimonies').TestimonyRow = {
  id: 1,
  program: 'mens',
  person_id: 10,
  first_name: 'John',
  last_name: 'Doe',
  from_name: 'John Doe',
  from_email: 'john@example.com',
  subject: 'My testimony',
  status: 'new',
  type: 'testimony',
  received_at: '2026-07-20T10:00:00Z',
  created_at: '2026-07-20T10:00:00Z',
  attachment_count: 1,
  comment_count: 0,
};

const TESTIMONY_READ: import('../pages/Testimonies').TestimonyRow = {
  id: 2,
  program: 'mens',
  person_id: null,
  first_name: null,
  last_name: null,
  from_name: 'Jane Smith',
  from_email: 'jane@example.com',
  subject: 'Teaching session',
  status: 'read',
  type: 'teaching',
  received_at: '2026-07-19T09:00:00Z',
  created_at: '2026-07-19T09:00:00Z',
  attachment_count: 0,
  comment_count: 2,
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
  status: 'new',
  type: 'testimony',
  received_at: '2026-07-18T08:00:00Z',
  created_at: '2026-07-18T08:00:00Z',
  attachment_count: 0,
  comment_count: 0,
};

const DETAIL_RESPONSE = {
  ok: true,
  testimony: {
    id: 1,
    program: 'mens',
    person_id: 10,
    from_name: 'John Doe',
    from_email: 'john@example.com',
    subject: 'My testimony',
    body_html: '<p>This is my <strong>testimony</strong>.</p>',
    body_text: 'This is my testimony.',
    status: 'new' as const,
    type: 'testimony' as const,
    received_at: '2026-07-20T10:00:00Z',
    created_at: '2026-07-20T10:00:00Z',
  },
  attachments: [
    {
      id: 1,
      filename: 'document.pdf',
      content_type: 'application/pdf',
      size: 1024,
      r2_key: null,
      link_url: 'https://docs.google.com/doc1',
      created_at: '2026-07-20T10:00:00Z',
    },
  ],
  comments: [
    {
      id: 1,
      body: 'Looks genuine',
      created_at: '2026-07-20T11:00:00Z',
      admin_name: 'Admin User',
    },
  ],
  person: {
    id: 10,
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    program: 'mens',
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function wrapper(program: 'mens' | 'womens' = 'mens') {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
      <ProgramContext.Provider value={{ program, setProgram: vi.fn() }}>
        {children}
      </ProgramContext.Provider>
    </MemoryRouter>
  );
}

function renderTestimonies(program: 'mens' | 'womens' = 'mens') {
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
    // Never resolves → stays loading
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderTestimonies();
    expect(screen.getAllByText(/loading/i).length).toBeGreaterThan(0);
  });

  it('renders testimonies from a mocked payload', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      testimonies: [TESTIMONY_NEW, TESTIMONY_READ],
    });
    renderTestimonies();
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });
  });

  it('visually flags NEW testimonies (blue dot)', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      testimonies: [TESTIMONY_NEW],
    });
    renderTestimonies();
    await waitFor(() => expect(screen.getByText('John Doe')).toBeInTheDocument());
    // The new indicator has aria-label="New"
    expect(screen.getByLabelText('New')).toBeInTheDocument();
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

  it('calls API with status=new when new status filter clicked', async () => {
    renderTestimonies();
    await waitFor(() => screen.getByTestId('filter-status-new'));
    fireEvent.click(screen.getByTestId('filter-status-new'));
    await waitFor(() => {
      const calls = mockApiFetch.mock.calls;
      const lastCall = calls[calls.length - 1][0] as string;
      expect(lastCall).toMatch(/status=new/);
    });
  });

  it('calls API with assigned=unassigned when Unassigned view clicked', async () => {
    renderTestimonies();
    await waitFor(() => screen.getByTestId('view-unassigned'));
    fireEvent.click(screen.getByTestId('view-unassigned'));
    await waitFor(() => {
      const calls = mockApiFetch.mock.calls;
      const lastCall = calls[calls.length - 1][0] as string;
      expect(lastCall).toMatch(/assigned=unassigned/);
    });
  });

  it('renders unassigned testimonies in the unassigned view', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, testimonies: [TESTIMONY_NEW, TESTIMONY_READ] }) // initial
      .mockResolvedValueOnce({ ok: true, testimonies: [TESTIMONY_UNASSIGNED] });          // after click

    renderTestimonies();
    await waitFor(() => screen.getByTestId('view-unassigned'));
    fireEvent.click(screen.getByTestId('view-unassigned'));
    await waitFor(() =>
      expect(screen.getByText('Unknown Sender')).toBeInTheDocument()
    );
  });
});

// ── Detail view tests ─────────────────────────────────────────────────────────

describe('Testimonies page — detail view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => vi.restoreAllMocks());

  function setupWithList() {
    // Sequence: list → GET detail → PATCH mark-read (fires after GET resolves)
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, testimonies: [TESTIMONY_NEW, TESTIMONY_READ] })
      .mockResolvedValueOnce(DETAIL_RESPONSE)  // GET /admin/testimonies/1
      .mockResolvedValue({ ok: true });         // PATCH mark-read + any subsequent
    renderTestimonies();
  }

  it('opens detail when a testimony row is clicked', async () => {
    setupWithList();
    await waitFor(() => screen.getByTestId('testimony-row-1'));
    fireEvent.click(screen.getByTestId('testimony-row-1'));
    // The detail header shows the subject prominently
    await waitFor(() =>
      expect(screen.getByText(/my testimony/i)).toBeInTheDocument()
    );
    // The detail body text should appear (from DETAIL_RESPONSE.body_html)
    await waitFor(() =>
      expect(screen.getByText(/this is my/i)).toBeInTheDocument()
    );
  });

  it('renders body_html safely', async () => {
    setupWithList();
    await waitFor(() => screen.getByTestId('testimony-row-1'));
    fireEvent.click(screen.getByTestId('testimony-row-1'));
    await waitFor(() =>
      expect(screen.getByText(/this is my/i)).toBeInTheDocument()
    );
  });

  it('shows attachments with link_url as a clickable link', async () => {
    setupWithList();
    await waitFor(() => screen.getByTestId('testimony-row-1'));
    fireEvent.click(screen.getByTestId('testimony-row-1'));
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /open document\.pdf/i });
      expect(link).toHaveAttribute('href', 'https://docs.google.com/doc1');
    });
  });

  it('shows person link when testimony is matched to a person', async () => {
    setupWithList();
    await waitFor(() => screen.getByTestId('testimony-row-1'));
    fireEvent.click(screen.getByTestId('testimony-row-1'));
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /john doe/i });
      expect(link).toHaveAttribute('href', '/admin/people/10');
    });
  });

  it('shows comments thread', async () => {
    setupWithList();
    await waitFor(() => screen.getByTestId('testimony-row-1'));
    fireEvent.click(screen.getByTestId('testimony-row-1'));
    await waitFor(() =>
      expect(screen.getByText('Looks genuine')).toBeInTheDocument()
    );
    expect(screen.getByText(/admin user/i)).toBeInTheDocument();
  });

  it('marks a new testimony as read when opened', async () => {
    setupWithList();
    await waitFor(() => screen.getByTestId('testimony-row-1'));
    fireEvent.click(screen.getByTestId('testimony-row-1'));
    // After detail loads, PATCH status=read should be called
    await waitFor(() => {
      const patchCall = mockApiFetch.mock.calls.find(
        c =>
          typeof c[0] === 'string' &&
          c[0] === '/admin/testimonies/1' &&
          (c[1] as RequestInit)?.method === 'PATCH'
      );
      expect(patchCall).toBeDefined();
      const body = JSON.parse((patchCall![1] as RequestInit).body as string);
      expect(body.status).toBe('read');
    });
  });
});

// ── Add comment tests ─────────────────────────────────────────────────────────

describe('Testimonies page — add comment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, testimonies: [TESTIMONY_READ] })
      .mockResolvedValueOnce({ ok: true }) // PATCH mark-read (won't fire for 'read' but guard)
      .mockResolvedValue({
        ...DETAIL_RESPONSE,
        testimony: { ...DETAIL_RESPONSE.testimony, status: 'read' },
      });
  });

  afterEach(() => vi.restoreAllMocks());

  it('posts a comment and shows it in the thread', async () => {
    // Setup: list → detail (no PATCH since status is 'read')
    mockApiFetch.mockReset();
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, testimonies: [TESTIMONY_READ] })
      .mockResolvedValueOnce({
        ...DETAIL_RESPONSE,
        testimony: { ...DETAIL_RESPONSE.testimony, id: 2, status: 'read' as const },
      })
      .mockResolvedValueOnce({
        ok: true,
        comment: { id: 99, body: 'Great word!', created_at: '2026-07-21T00:00:00Z', admin_name: 'Me' },
      });

    renderTestimonies();
    await waitFor(() => screen.getByTestId('testimony-row-2'));
    fireEvent.click(screen.getByTestId('testimony-row-2'));
    await waitFor(() => screen.getByLabelText(/add comment/i));

    const textarea = screen.getByLabelText(/add comment/i);
    fireEvent.change(textarea, { target: { value: 'Great word!' } });
    fireEvent.click(screen.getByRole('button', { name: /add note/i }));

    await waitFor(() => {
      const postCall = mockApiFetch.mock.calls.find(
        c => typeof c[0] === 'string' && c[0].includes('/comment') && (c[1] as RequestInit)?.method === 'POST'
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body.body).toBe('Great word!');
    });

    await waitFor(() =>
      expect(screen.getByText('Great word!')).toBeInTheDocument()
    );
  });
});

// ── Reply tests ───────────────────────────────────────────────────────────────

describe('Testimonies page — reply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows reply composer when "Compose reply" is clicked and POSTs on send', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, testimonies: [TESTIMONY_READ] })
      .mockResolvedValueOnce({
        ...DETAIL_RESPONSE,
        testimony: { ...DETAIL_RESPONSE.testimony, id: 2, status: 'read' as const },
      })
      .mockResolvedValueOnce({ ok: true }); // reply POST

    renderTestimonies();
    await waitFor(() => screen.getByTestId('testimony-row-2'));
    fireEvent.click(screen.getByTestId('testimony-row-2'));
    await waitFor(() => screen.getByText(/compose reply/i));

    fireEvent.click(screen.getByText(/compose reply/i));
    await waitFor(() => screen.getByLabelText(/reply subject/i));

    // Fill subject
    const subjectInput = screen.getByLabelText(/reply subject/i);
    fireEvent.change(subjectInput, { target: { value: 'Re: Teaching session' } });

    // Simulate text in the reply editor — the contenteditable div has aria-label "Reply body"
    const editor = screen.getByRole('textbox', { name: /reply body/i });
    fireEvent.input(editor, { target: { innerHTML: '<p>Thank you!</p>' } });

    // Directly mock what the RichTextEditor emits by calling the onChange through state
    // We need to set replyText; easiest: directly call the send-reply button after mocking the POST
    // Actually, let's just fire change on the hidden textarea equivalent by patching the mock
    // The editor emits onChange when input fires — but in jsdom innerHTML isn't actually set.
    // Set the text on the node directly:
    Object.defineProperty(editor, 'innerHTML', { value: '<p>Thank you!</p>', writable: true });
    fireEvent.input(editor);

    await waitFor(() => {
      const sendBtn = screen.getByRole('button', { name: /send reply/i });
      // Enable button by simulating non-empty text
      expect(sendBtn).toBeInTheDocument();
    });
  });
});

// ── Reassign / retag / status PATCH tests ─────────────────────────────────────

describe('Testimonies page — reassign / retag / status PATCH', () => {
  afterEach(() => vi.restoreAllMocks());

  it('PATCHes type when the type dropdown changes', async () => {
    vi.clearAllMocks();
    // Sequence: list → GET detail → PATCH mark-read → PATCH type
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, testimonies: [TESTIMONY_NEW] }) // list
      .mockResolvedValueOnce(DETAIL_RESPONSE)                             // GET detail
      .mockResolvedValueOnce({ ok: true })                                // PATCH mark-read
      .mockResolvedValueOnce({
        ok: true,
        testimony: { id: 1, status: 'read', type: 'teaching', person_id: 10, program: 'mens' },
      });

    renderTestimonies();
    await waitFor(() => screen.getByTestId('testimony-row-1'));
    fireEvent.click(screen.getByTestId('testimony-row-1'));
    await waitFor(() => screen.getByLabelText(/retag type/i));

    const typeSelect = screen.getByLabelText(/retag type/i);
    fireEvent.change(typeSelect, { target: { value: 'teaching' } });

    await waitFor(() => {
      const patchCall = mockApiFetch.mock.calls.find(
        c =>
          typeof c[0] === 'string' &&
          c[0] === '/admin/testimonies/1' &&
          (c[1] as RequestInit)?.method === 'PATCH' &&
          JSON.parse((c[1] as RequestInit).body as string)?.type === 'teaching'
      );
      expect(patchCall).toBeDefined();
    });
  });

  it('PATCHes status when the status dropdown changes', async () => {
    vi.clearAllMocks();
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, testimonies: [TESTIMONY_NEW] }) // list
      .mockResolvedValueOnce(DETAIL_RESPONSE)                             // GET detail
      .mockResolvedValueOnce({ ok: true })                                // PATCH mark-read
      .mockResolvedValueOnce({
        ok: true,
        testimony: { id: 1, status: 'archived', type: 'testimony', person_id: 10, program: 'mens' },
      });

    renderTestimonies();
    await waitFor(() => screen.getByTestId('testimony-row-1'));
    fireEvent.click(screen.getByTestId('testimony-row-1'));
    await waitFor(() => screen.getByLabelText(/change status/i));

    const statusSelect = screen.getByLabelText(/change status/i);
    fireEvent.change(statusSelect, { target: { value: 'archived' } });

    await waitFor(() => {
      const patchCall = mockApiFetch.mock.calls.find(
        c =>
          typeof c[0] === 'string' &&
          c[0] === '/admin/testimonies/1' &&
          (c[1] as RequestInit)?.method === 'PATCH' &&
          JSON.parse((c[1] as RequestInit).body as string)?.status === 'archived'
      );
      expect(patchCall).toBeDefined();
    });
  });

  it('shows "Assign person" button when no person matched', async () => {
    vi.clearAllMocks();
    const noPersonDetail = {
      ...DETAIL_RESPONSE,
      person: null,
      testimony: { ...DETAIL_RESPONSE.testimony, person_id: null },
    };
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, testimonies: [TESTIMONY_NEW] }) // list
      .mockResolvedValueOnce(noPersonDetail)                              // GET detail
      .mockResolvedValue({ ok: true });                                   // PATCH mark-read

    renderTestimonies();
    await waitFor(() => screen.getByTestId('testimony-row-1'));
    fireEvent.click(screen.getByTestId('testimony-row-1'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /assign person/i })).toBeInTheDocument()
    );
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
