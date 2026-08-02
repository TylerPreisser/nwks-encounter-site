import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProgramContext } from '../App';
import PersonPage from '../pages/PersonPage';
import PersonTestimonies from '../components/PersonTestimonies';

const mockFetch = vi.fn();
global.fetch = mockFetch;

function testimony(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    type: 'testimony',
    title: null,
    topic: null,
    subject: 'What God did at the lake',
    status: 'draft_1_review',
    body_text: 'I was set free on Saturday morning.',
    body_html: null,
    from_email: 'jane@example.com',
    from_name: 'Jane Doe',
    match_confidence: 'email',
    received_at: '2026-07-04T15:00:00.000Z',
    created_at: '2026-07-04T15:00:00.000Z',
    attachments: [],
    ...overrides,
  };
}

function personPayload(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    person: {
      id: 42, first_name: 'Jane', last_name: 'Doe',
      email: 'jane@example.com', phone: null, church: null, city: null, state: null,
      times_attended: 1, times_served: 2,
    },
    badges: { times_attended: 1, times_served: 2, is_first_timer: false },
    history: [],
    possible_duplicates: [],
    testimonies: [],
    ...overrides,
  };
}

function wrapper() {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={['/people/42']}>
      <ProgramContext.Provider value={{ program: 'mens', setProgram: vi.fn() }}>
        <Routes>
          <Route path="/people/:id" element={<>{children}</>} />
        </Routes>
      </ProgramContext.Provider>
    </MemoryRouter>
  );
}

// ---------------------------------------------------------------------------
// The section as it appears on a real profile
// ---------------------------------------------------------------------------

describe('PersonPage — testimonies section', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('shows a testimony that was emailed in by this person', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => personPayload({ testimonies: [testimony()] }),
    });
    render(<PersonPage />, { wrapper: wrapper() });

    await waitFor(() =>
      expect(screen.getByText('What God did at the lake')).toBeInTheDocument(),
    );
    expect(screen.getByText(/I was set free on Saturday morning/)).toBeInTheDocument();
    // Arrival date, rendered in the admin's locale
    expect(screen.getByTestId('testimony-received-7')).toHaveTextContent('2026');
  });

  it('renders nothing at all when the person has no testimonies', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => personPayload() });
    render(<PersonPage />, { wrapper: wrapper() });

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    expect(screen.queryByTestId('person-testimonies')).not.toBeInTheDocument();
  });

  it('survives an older API response that has no testimonies field', async () => {
    const legacy = personPayload();
    delete (legacy as Record<string, unknown>).testimonies;
    mockFetch.mockResolvedValue({ ok: true, json: async () => legacy });
    render(<PersonPage />, { wrapper: wrapper() });

    await waitFor(() => expect(screen.getByText('Jane Doe')).toBeInTheDocument());
    expect(screen.queryByTestId('person-testimonies')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// The component in isolation
// ---------------------------------------------------------------------------

function renderList(items: ReturnType<typeof testimony>[]) {
  return render(
    <MemoryRouter>
      <PersonTestimonies testimonies={items as never} />
    </MemoryRouter>,
  );
}

describe('PersonTestimonies', () => {
  it('labels a teaching as a teaching', () => {
    renderList([testimony({ id: 8, type: 'teaching', subject: 'On forgiveness' })]);
    expect(screen.getByTestId('testimony-type-8')).toHaveTextContent(/teaching/i);
  });

  it('falls back to the title when the email had no subject', () => {
    renderList([testimony({ subject: null, title: 'Untitled submission' })]);
    expect(screen.getByText('Untitled submission')).toBeInTheDocument();
  });

  it('says so plainly when nothing has arrived yet', () => {
    renderList([testimony({ body_text: null, body_html: null, status: 'not_received' })]);
    expect(screen.getByTestId('testimony-empty-7')).toHaveTextContent(/nothing has arrived/i);
  });

  it('renders a link attachment as a real link', () => {
    renderList([testimony({
      attachments: [{
        id: 1, filename: 'my-story', content_type: null, size: null,
        link_url: 'https://docs.example.com/my-story', available: true,
      }],
    })]);
    const link = screen.getByRole('link', { name: /my-story/ });
    expect(link).toHaveAttribute('href', 'https://docs.example.com/my-story');
  });

  it('shows an unstorable file as text, never as a link', () => {
    renderList([testimony({
      attachments: [{
        id: 2, filename: 'testimony.pdf', content_type: 'application/pdf',
        size: 84210, link_url: null, available: false,
      }],
    })]);
    expect(screen.getByText('testimony.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /testimony\.pdf/ })).not.toBeInTheDocument();
    // The honest reason, not a dead link
    expect(screen.getByTestId('attachment-unavailable-2'))
      .toHaveTextContent(/file itself was not saved/i);
  });

  it('shows the file size so an admin knows what to ask the sender to resend', () => {
    renderList([testimony({
      attachments: [{
        id: 3, filename: 'testimony.docx', content_type: null,
        size: 84210, link_url: null, available: false,
      }],
    })]);
    expect(screen.getByTestId('attachment-3')).toHaveTextContent(/82(\.\d)? KB/);
  });

  it('renders HTML-only email bodies as plain text rather than injecting markup', () => {
    renderList([testimony({
      body_text: null,
      body_html: '<p>Freedom on <b>Saturday</b>.</p><script>alert(1)</script>',
    })]);
    const body = screen.getByTestId('testimony-body-7');
    expect(body).toHaveTextContent('Freedom on Saturday.');
    expect(body.querySelector('b')).toBeNull();
    expect(body.querySelector('script')).toBeNull();
  });

  it('links out to the full submission view', () => {
    renderList([testimony()]);
    expect(screen.getByRole('link', { name: /open full submission/i }))
      .toHaveAttribute('href', expect.stringContaining('/api/admin/testimonies/7/view'));
  });

  it('collapses a long body behind a show-more toggle', () => {
    renderList([testimony({ body_text: 'x'.repeat(1200) })]);
    const toggle = screen.getByRole('button', { name: /show more/i });
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /show less/i })).toBeInTheDocument();
  });
});
